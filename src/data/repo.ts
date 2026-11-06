/**
 * Satu-satunya pintu ke penyimpanan. Tampilan tidak memanggil Dexie langsung,
 * jadi saat pindah ke server nanti cukup file ini yang diganti ke panggilan API.
 * Setiap fungsi tenan menerima Ctx dan selalu menyaring berdasarkan ctx.tenantId.
 */
import { computeTotals, dayKey, expectedCash, monthKey, pad2, summarize } from '../domain/calc'
import {
  backupSchema,
  mallBackupSchema,
  productSchema,
  rekapSchema,
  tenantSchema,
  type Backup,
  type Discount,
  type Held,
  type MallBackup,
  type PaymentMethod,
  type Product,
  type Rekap,
  type Role,
  type Sale,
  type SaleItem,
  type Settings,
  type Shift,
  type Tenant,
  type User,
} from '../domain/schemas'
import { ALL_TABLES, db } from './db'

export interface Ctx {
  tenantId: string
  userId: string
  userName: string
  role: Role
}

export class UserError extends Error {}

export const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

// ---------- PIN ----------

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 100_000 },
    key,
    256,
  )
  return hex(bits)
}

export async function makeUser(tenantId: string, name: string, role: Role, pin: string): Promise<User> {
  assertPin(pin)
  const salt = newId()
  return { id: newId(), tenantId, name, role, salt, pinHash: await hashPin(pin, salt) }
}

function assertPin(pin: string) {
  if (!/^\d{4,6}$/.test(pin)) throw new UserError('PIN harus 4 sampai 6 angka')
}

const failures = new Map<string, { count: number; until: number }>()
const MAX_TRIES = 5
const LOCK_MS = 30_000

/** Membatasi tebakan PIN selama aplikasi terbuka. Ini penghalang ringan, bukan keamanan server. */
export async function login(userId: string, pin: string): Promise<Ctx> {
  const f = failures.get(userId)
  if (f && f.until > Date.now()) {
    throw new UserError(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((f.until - Date.now()) / 1000)} detik.`)
  }
  const user = await db.users.get(userId)
  if (!user || (await hashPin(pin, user.salt)) !== user.pinHash) {
    const count = (f && f.until === 0 ? f.count : 0) + 1
    failures.set(userId, { count: count >= MAX_TRIES ? 0 : count, until: count >= MAX_TRIES ? Date.now() + LOCK_MS : 0 })
    throw new UserError('PIN salah.')
  }
  if (user.tenantId !== 'mall') {
    const tenant = await db.tenants.get(user.tenantId)
    if (!tenant?.active) throw new UserError('Tenan ini sedang dinonaktifkan oleh pengelola mall.')
  }
  failures.delete(userId)
  const ctx: Ctx = { tenantId: user.tenantId, userId: user.id, userName: user.name, role: user.role }
  await log(ctx, 'Masuk', `${user.name} masuk`)
  return ctx
}

async function log(ctx: Ctx, action: string, detail: string) {
  await db.audit.add({ id: newId(), tenantId: ctx.tenantId, action, detail, by: ctx.userName, at: now() })
}

function requireRole(ctx: Ctx, ...roles: Role[]) {
  if (!roles.includes(ctx.role)) throw new UserError('Akun ini tidak punya akses untuk tindakan tersebut.')
}

// ---------- Penyiapan perangkat ----------

export const isDeviceEmpty = async () => (await db.users.count()) === 0
export const hasMallAccount = async () => (await db.users.where('tenantId').equals('mall').count()) > 0

/** Akun pengelola hanya bisa dibuat di perangkat kosong, supaya tidak bisa dipakai mengambil alih data tenan. */
export async function setupMall(pin: string): Promise<Ctx> {
  const user = await makeUser('mall', 'Pengelola mall', 'mall', pin)
  await db.transaction('rw', db.users, async () => {
    if ((await db.users.count()) > 0) throw new UserError('Perangkat ini sudah disiapkan.')
    await db.users.add(user)
  })
  const ctx: Ctx = { tenantId: 'mall', userId: user.id, userName: user.name, role: 'mall' }
  await log(ctx, 'Siapkan perangkat', 'Perangkat pengelola mall')
  return ctx
}

/** File penyiapan hanya berisi profil, akun, dan pengaturan tenan, tanpa produk atau transaksi. */
export async function exportTenantSetup(ctx: Ctx, tenantId: string): Promise<Backup> {
  requireRole(ctx, 'mall')
  const tenant = await db.tenants.get(tenantId)
  if (!tenant) throw new UserError('Tenan tidak ditemukan.')
  const setup: Backup = {
    kind: 'backup-tenan',
    version: 1,
    exportedAt: now(),
    tenant,
    users: await db.users.where('tenantId').equals(tenantId).toArray(),
    products: [],
    sales: [],
    shifts: [],
    stockMoves: [],
    audit: [],
    held: [],
    settings: (await db.settings.get(tenantId)) ?? defaultSettings(tenantId),
  }
  await log(ctx, 'Buat file penyiapan', tenant.name)
  return setup
}

/** Memasang tenan baru dari file. Tenan yang sudah ada ditolak agar datanya tidak bisa ditimpa tanpa login. */
export async function addTenantFromFile(backup: Backup): Promise<Tenant> {
  const id = backup.tenant.id
  await db.transaction('rw', [db.tenants, db.users, db.products, db.sales, db.shifts, db.stockMoves, db.audit, db.held, db.settings], async () => {
    const taken = await db.tenants.toArray()
    if (taken.some((t) => t.id === id)) throw new UserError(`${backup.tenant.name} sudah ada di perangkat ini.`)
    const unit = backup.tenant.unit.toLowerCase()
    if (taken.some((t) => t.unit.toLowerCase() === unit)) throw new UserError(`Unit ${backup.tenant.unit} sudah terisi di perangkat ini.`)
    await db.tenants.add(backup.tenant)
    await db.users.bulkAdd(backup.users)
    await db.products.bulkAdd(backup.products)
    await db.sales.bulkAdd(backup.sales)
    await db.shifts.bulkAdd(backup.shifts)
    await db.stockMoves.bulkAdd(backup.stockMoves)
    await db.audit.bulkAdd(backup.audit)
    await db.held.bulkAdd(backup.held)
    await db.settings.put(backup.settings)
    await db.audit.add({ id: newId(), tenantId: id, action: 'Pasang tenan', detail: `File ${backup.exportedAt}`, by: 'Perangkat', at: now() })
  })
  return backup.tenant
}

// ---------- Direktori ----------

export const listTenants = () => db.tenants.toArray()
export const getTenant = (id: string) => db.tenants.get(id)
export const listUsers = (tenantId: string) => db.users.where('tenantId').equals(tenantId).toArray()

// ---------- Produk dan stok ----------

export const listProducts = (ctx: Ctx) => db.products.where('tenantId').equals(ctx.tenantId).sortBy('name')

export type ProductDraft = Pick<Product, 'name' | 'sku' | 'category' | 'price' | 'minStock' | 'trackStock' | 'active'> & {
  id?: string
  stock?: number
}

export async function saveProduct(ctx: Ctx, draft: ProductDraft): Promise<void> {
  requireRole(ctx, 'owner')
  const existing = draft.id ? await db.products.get(draft.id) : undefined
  if (draft.id && existing?.tenantId !== ctx.tenantId) throw new UserError('Produk tidak ditemukan.')
  const parsed = productSchema.safeParse({
    ...draft,
    id: draft.id ?? newId(),
    tenantId: ctx.tenantId,
    stock: existing ? existing.stock : (draft.stock ?? 0),
  })
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message)
  const product = parsed.data
  await db.transaction('rw', db.products, db.audit, db.stockMoves, async () => {
    const clash = await db.products.where('[tenantId+sku]').equals([ctx.tenantId, product.sku]).first()
    if (clash && clash.id !== product.id) throw new UserError(`SKU ${product.sku} sudah dipakai ${clash.name}.`)
    await db.products.put(product)
    if (!existing && product.stock !== 0) {
      await db.stockMoves.add({
        id: newId(),
        tenantId: ctx.tenantId,
        productId: product.id,
        productName: product.name,
        delta: product.stock,
        reason: 'Stok awal',
        by: ctx.userName,
        at: now(),
      })
    }
    if (existing && existing.price !== product.price) {
      await log(ctx, 'Ubah harga', `${product.name}: ${existing.price} menjadi ${product.price}`)
    } else {
      await log(ctx, existing ? 'Ubah produk' : 'Tambah produk', product.name)
    }
  })
}

export async function adjustStock(ctx: Ctx, productId: string, delta: number, reason: string): Promise<void> {
  requireRole(ctx, 'owner')
  if (!Number.isInteger(delta) || delta === 0) throw new UserError('Isi jumlah perubahan stok selain nol.')
  if (!reason.trim()) throw new UserError('Isi alasan perubahan stok.')
  await db.transaction('rw', db.products, db.stockMoves, db.audit, async () => {
    const product = await db.products.get(productId)
    if (!product || product.tenantId !== ctx.tenantId) throw new UserError('Produk tidak ditemukan.')
    if (product.stock + delta < 0) throw new UserError(`Stok ${product.name} tinggal ${product.stock}.`)
    await db.products.update(productId, { stock: product.stock + delta })
    await db.stockMoves.add({
      id: newId(),
      tenantId: ctx.tenantId,
      productId,
      productName: product.name,
      delta,
      reason: reason.trim(),
      by: ctx.userName,
      at: now(),
    })
    await log(ctx, 'Ubah stok', `${product.name} ${delta > 0 ? '+' : ''}${delta} (${reason.trim()})`)
  })
}

export const listStockMoves = (ctx: Ctx, limit = 50) =>
  db.stockMoves
    .where('[tenantId+at]')
    .between([ctx.tenantId, ''], [ctx.tenantId, '￿'])
    .reverse()
    .limit(limit)
    .toArray()

// ---------- Pengaturan ----------

export async function getSettings(ctx: Ctx): Promise<Settings> {
  return (await db.settings.get(ctx.tenantId)) ?? defaultSettings(ctx.tenantId)
}

export const defaultSettings = (tenantId: string): Settings => ({
  tenantId,
  taxRate: 0,
  receiptFooter: 'Terima kasih sudah berbelanja',
  paperWidth: 58,
  qrisImage: null,
  lastBackupAt: null,
})

export async function saveSettings(ctx: Ctx, patch: Partial<Omit<Settings, 'tenantId'>>): Promise<void> {
  requireRole(ctx, 'owner')
  if (patch.taxRate !== undefined && !(patch.taxRate >= 0 && patch.taxRate <= 100)) {
    throw new UserError('Pajak harus antara 0 dan 100 persen.')
  }
  const current = await getSettings(ctx)
  await db.settings.put({ ...current, ...patch, tenantId: ctx.tenantId })
  await log(ctx, 'Ubah pengaturan', Object.keys(patch).join(', '))
}

export async function changePin(ctx: Ctx, userId: string, pin: string): Promise<void> {
  requireRole(ctx, 'owner', 'mall')
  assertPin(pin)
  const user = await db.users.get(userId)
  if (!user || (ctx.role !== 'mall' && user.tenantId !== ctx.tenantId)) throw new UserError('Akun tidak ditemukan.')
  const salt = newId()
  await db.users.update(userId, { salt, pinHash: await hashPin(pin, salt) })
  await log(ctx, 'Ubah PIN', user.name)
}

// ---------- Shift ----------

export async function getOpenShift(ctx: Ctx): Promise<Shift | undefined> {
  const shifts = await db.shifts.where('tenantId').equals(ctx.tenantId).toArray()
  return shifts.find((s) => s.closedAt === null)
}

export async function listShifts(ctx: Ctx, limit = 20): Promise<Shift[]> {
  return db.shifts
    .where('[tenantId+openedAt]')
    .between([ctx.tenantId, ''], [ctx.tenantId, '￿'])
    .reverse()
    .limit(limit)
    .toArray()
}

export async function openShift(ctx: Ctx, openingCash: number): Promise<void> {
  if (!Number.isInteger(openingCash) || openingCash < 0) throw new UserError('Isi modal awal dengan angka yang benar.')
  await db.transaction('rw', db.shifts, db.audit, async () => {
    if (await getOpenShift(ctx)) throw new UserError('Masih ada shift yang terbuka. Tutup dulu shift itu.')
    await db.shifts.add({
      id: newId(),
      tenantId: ctx.tenantId,
      cashierId: ctx.userId,
      cashierName: ctx.userName,
      openedAt: now(),
      openingCash,
      closedAt: null,
      countedCash: null,
      expectedCash: null,
    })
    await log(ctx, 'Buka shift', `Modal awal ${openingCash}`)
  })
}

/** Penjualan yang memengaruhi kas shift: penjualan shift ini dan refund yang dibayarkan di shift ini. */
export async function salesForShift(ctx: Ctx, shift: Shift): Promise<Sale[]> {
  const from = shift.openedAt
  const all = await db.sales.where('tenantId').equals(ctx.tenantId).toArray()
  return all.filter(
    (s) => s.shiftId === shift.id || (s.reversal?.shiftId === shift.id && (s.reversal?.at ?? '') >= from),
  )
}

export async function closeShift(ctx: Ctx, shiftId: string, countedCash: number): Promise<void> {
  if (!Number.isInteger(countedCash) || countedCash < 0) throw new UserError('Isi uang yang dihitung dengan angka yang benar.')
  await db.transaction('rw', db.shifts, db.sales, db.audit, async () => {
    const shift = await db.shifts.get(shiftId)
    if (!shift || shift.tenantId !== ctx.tenantId || shift.closedAt) throw new UserError('Shift tidak ditemukan atau sudah ditutup.')
    const expected = expectedCash(shift, await salesForShift(ctx, shift))
    await db.shifts.update(shiftId, { closedAt: now(), countedCash, expectedCash: expected })
    await log(ctx, 'Tutup shift', `Seharusnya ${expected}, dihitung ${countedCash}, selisih ${countedCash - expected}`)
  })
}

// ---------- Penjualan ----------

export interface SaleInput {
  lines: SaleItem[]
  discount: Discount
  method: PaymentMethod
  paid: number
  reference: string
}

export async function completeSale(ctx: Ctx, input: SaleInput): Promise<Sale> {
  if (!input.lines.length) throw new UserError('Keranjang masih kosong.')
  return db.transaction('rw', [db.products, db.sales, db.shifts, db.stockMoves, db.settings, db.tenants, db.audit], async () => {
    const shift = await getOpenShift(ctx)
    if (!shift) throw new UserError('Buka shift dulu sebelum menerima pembayaran.')
    const tenant = await db.tenants.get(ctx.tenantId)
    if (!tenant) throw new UserError('Tenan tidak ditemukan.')
    const settings = await getSettings(ctx)

    const items: SaleItem[] = []
    const stockUpdates: { product: Product; qty: number }[] = []
    for (const line of input.lines) {
      const product = await db.products.get(line.productId)
      if (!product || product.tenantId !== ctx.tenantId || !product.active) {
        throw new UserError(`${line.name} sudah tidak dijual.`)
      }
      if (product.price !== line.price) {
        throw new UserError(`Harga ${product.name} baru saja berubah. Hapus lalu tambahkan lagi ke keranjang.`)
      }
      if (product.trackStock) {
        if (product.stock < line.qty) throw new UserError(`Stok ${product.name} tinggal ${product.stock}.`)
        stockUpdates.push({ product, qty: line.qty })
      }
      items.push({ productId: product.id, name: product.name, sku: product.sku, price: product.price, qty: line.qty })
    }

    const totals = computeTotals(items, input.discount, settings.taxRate)
    const paid = input.method === 'cash' ? input.paid : totals.total
    if (!Number.isInteger(paid) || paid < totals.total) throw new UserError('Uang yang diterima kurang dari total.')

    const at = new Date()
    const today = dayKey(at)
    const startOfDay = new Date(at.getFullYear(), at.getMonth(), at.getDate()).toISOString()
    const seq =
      (await db.sales
        .where('[tenantId+createdAt]')
        .between([ctx.tenantId, startOfDay], [ctx.tenantId, '￿'])
        .count()) + 1

    const sale: Sale = {
      id: newId(),
      tenantId: ctx.tenantId,
      number: `${tenant.unit}-${today.slice(2).replaceAll('-', '')}-${String(seq).padStart(4, '0')}`,
      shiftId: shift.id,
      cashierId: ctx.userId,
      cashierName: ctx.userName,
      items,
      ...totals,
      taxRate: settings.taxRate,
      method: input.method,
      paid,
      change: paid - totals.total,
      reference: input.reference.trim(),
      createdAt: at.toISOString(),
      status: 'completed',
    }
    await db.sales.add(sale)
    for (const { product, qty } of stockUpdates) {
      await db.products.update(product.id, { stock: product.stock - qty })
      await db.stockMoves.add({
        id: newId(),
        tenantId: ctx.tenantId,
        productId: product.id,
        productName: product.name,
        delta: -qty,
        reason: `Penjualan ${sale.number}`,
        by: ctx.userName,
        at: sale.createdAt,
      })
    }
    return sale
  })
}

export async function listSales(ctx: Ctx, from: Date, to: Date): Promise<Sale[]> {
  const rows = await db.sales
    .where('[tenantId+createdAt]')
    .between([ctx.tenantId, from.toISOString()], [ctx.tenantId, to.toISOString()], true, true)
    .toArray()
  return rows.reverse()
}

/**
 * Void: membatalkan penjualan dari shift yang masih berjalan, seolah tidak pernah terjadi.
 * Refund: mengembalikan uang untuk penjualan shift yang sudah lewat, dicatat di shift aktif.
 * Pembatalan dan refund berlaku untuk seluruh transaksi, dan kasir butuh PIN pemilik.
 */
export async function reverseSale(ctx: Ctx, saleId: string, reason: string, ownerPin?: string): Promise<'voided' | 'refunded'> {
  if (!reason.trim()) throw new UserError('Isi alasan pembatalan.')
  let approver = ctx.userName
  if (ctx.role !== 'owner') {
    const owners = (await db.users.where('tenantId').equals(ctx.tenantId).toArray()).filter((u) => u.role === 'owner')
    let match: User | undefined
    for (const owner of owners) {
      if ((await hashPin(ownerPin ?? '', owner.salt)) === owner.pinHash) match = owner
    }
    if (!match) throw new UserError('PIN pemilik salah.')
    approver = match.name
  }
  return db.transaction('rw', [db.sales, db.shifts, db.products, db.stockMoves, db.audit], async () => {
    const sale = await db.sales.get(saleId)
    if (!sale || sale.tenantId !== ctx.tenantId) throw new UserError('Transaksi tidak ditemukan.')
    if (sale.status !== 'completed') throw new UserError('Transaksi ini sudah dibatalkan.')
    const active = await getOpenShift(ctx)
    if (!active) throw new UserError('Buka shift dulu sebelum membatalkan transaksi.')
    const status = sale.shiftId === active.id ? 'voided' : 'refunded'
    const at = now()
    await db.sales.update(saleId, {
      status,
      reversal: { reason: reason.trim(), by: approver, at, shiftId: active.id },
    })
    for (const item of sale.items) {
      const product = await db.products.get(item.productId)
      if (product?.trackStock) {
        await db.products.update(product.id, { stock: product.stock + item.qty })
        await db.stockMoves.add({
          id: newId(),
          tenantId: ctx.tenantId,
          productId: product.id,
          productName: product.name,
          delta: item.qty,
          reason: `${status === 'voided' ? 'Void' : 'Refund'} ${sale.number}`,
          by: approver,
          at,
        })
      }
    }
    await log(ctx, status === 'voided' ? 'Void' : 'Refund', `${sale.number}: ${reason.trim()} (disetujui ${approver})`)
    return status
  })
}

// ---------- Keranjang ditahan ----------

export const listHeld = (ctx: Ctx) => db.held.where('tenantId').equals(ctx.tenantId).toArray()

export async function holdCart(ctx: Ctx, label: string, lines: SaleItem[], discount: Discount): Promise<void> {
  if (!lines.length) throw new UserError('Keranjang masih kosong.')
  const held: Held = { id: newId(), tenantId: ctx.tenantId, label: label.trim() || 'Tanpa nama', lines, discount, at: now() }
  await db.held.add(held)
}

export async function takeHeld(ctx: Ctx, id: string): Promise<Held> {
  const held = await db.held.get(id)
  if (!held || held.tenantId !== ctx.tenantId) throw new UserError('Keranjang tidak ditemukan.')
  await db.held.delete(id)
  return held
}

// ---------- Log ----------

export const listAudit = (ctx: Ctx, limit = 200) =>
  db.audit
    .where('[tenantId+at]')
    .between([ctx.tenantId, ''], [ctx.tenantId, '￿'])
    .reverse()
    .limit(limit)
    .toArray()

// ---------- Backup dan rekap ----------

export async function exportBackup(ctx: Ctx): Promise<Backup> {
  requireRole(ctx, 'owner')
  const tenantId = ctx.tenantId
  const tenant = await db.tenants.get(tenantId)
  if (!tenant) throw new UserError('Tenan tidak ditemukan.')
  const exportedAt = now()
  const backup: Backup = {
    kind: 'backup-tenan',
    version: 1,
    exportedAt,
    tenant,
    users: await db.users.where('tenantId').equals(tenantId).toArray(),
    products: await db.products.where('tenantId').equals(tenantId).toArray(),
    sales: await db.sales.where('tenantId').equals(tenantId).toArray(),
    shifts: await db.shifts.where('tenantId').equals(tenantId).toArray(),
    stockMoves: await db.stockMoves.where('tenantId').equals(tenantId).toArray(),
    audit: await db.audit.where('tenantId').equals(tenantId).toArray(),
    held: await db.held.where('tenantId').equals(tenantId).toArray(),
    settings: { ...(await getSettings(ctx)), lastBackupAt: exportedAt },
  }
  await db.settings.put(backup.settings)
  await log(ctx, 'Buat backup', `${backup.sales.length} transaksi`)
  return backup
}

const fileKind = (raw: unknown) => (raw as { kind?: unknown } | null)?.kind

export function parseBackup(raw: unknown): Backup {
  if (fileKind(raw) === 'backup-mall') throw new UserError('File ini backup pengelola mall, bukan backup tenan.')
  const parsed = backupSchema.safeParse(raw)
  if (!parsed.success) throw new UserError('File ini bukan backup tenan yang valid.')
  return parsed.data
}

/** Pemilik hanya bisa memulihkan tenannya sendiri. Pengelola mall bisa memulihkan tenan apa pun ke perangkat baru. */
export async function restoreBackup(ctx: Ctx, backup: Backup): Promise<void> {
  requireRole(ctx, 'owner', 'mall')
  if (ctx.role === 'owner' && backup.tenant.id !== ctx.tenantId) {
    throw new UserError(`File ini milik ${backup.tenant.name}, bukan tenan yang sedang masuk.`)
  }
  const id = backup.tenant.id
  await db.transaction('rw', [db.tenants, db.users, db.products, db.sales, db.shifts, db.stockMoves, db.audit, db.held, db.settings], async () => {
    for (const table of [db.users, db.products, db.sales, db.shifts, db.stockMoves, db.audit, db.held]) {
      await table.where('tenantId').equals(id).delete()
    }
    await db.tenants.put(backup.tenant)
    await db.users.bulkAdd(backup.users)
    await db.products.bulkAdd(backup.products)
    await db.sales.bulkAdd(backup.sales)
    await db.shifts.bulkAdd(backup.shifts)
    await db.stockMoves.bulkAdd(backup.stockMoves)
    await db.audit.bulkAdd(backup.audit)
    await db.held.bulkAdd(backup.held)
    await db.settings.put(backup.settings)
    await log(ctx, 'Pulihkan backup', `${backup.tenant.name}, file ${backup.exportedAt}`)
  })
}

// ---------- Backup perangkat pengelola mall ----------

const MALL_BACKUP_ACTION = 'Buat backup mall'

/**
 * Memuat semua yang dibutuhkan layar pengelola: akun mall, tenan beserta akun dan pengaturannya
 * (untuk file penyiapan dan reset PIN), rekap yang diterima, dan log pengelola.
 * Produk dan transaksi tidak ikut. Pada perangkat bersama, tiap pemilik membuat backup tokonya sendiri.
 */
export async function exportMallBackup(ctx: Ctx): Promise<MallBackup> {
  requireRole(ctx, 'mall')
  return db.transaction('rw', [db.tenants, db.users, db.settings, db.rekap, db.audit], async () => {
    const tenants = await db.tenants.toArray()
    const tenantIds = new Set(tenants.map((t) => t.id))
    const rekap = await db.rekap.toArray()
    // Dicatat sebelum audit dibaca, supaya waktu backup terakhir ikut terbawa ke file.
    await log(ctx, MALL_BACKUP_ACTION, `${tenants.length} tenan, ${rekap.length} rekap`)
    const parsed = mallBackupSchema.safeParse({
      kind: 'backup-mall',
      version: 1,
      exportedAt: now(),
      users: (await db.users.toArray()).filter((u) => u.tenantId === 'mall' || tenantIds.has(u.tenantId)),
      tenants,
      settings: (await db.settings.toArray()).filter((s) => tenantIds.has(s.tenantId)),
      rekap,
      audit: await db.audit.where('tenantId').equals('mall').toArray(),
    })
    // File yang tidak bisa dipulihkan lebih berbahaya daripada gagal mengunduh.
    if (!parsed.success) throw new UserError(`Backup tidak dibuat: ${parsed.error.issues[0].message}.`)
    return parsed.data
  })
}

export function parseMallBackup(raw: unknown): MallBackup {
  const kind = fileKind(raw)
  if (kind === 'backup-tenan') throw new UserError('File ini milik tenan, bukan backup pengelola mall. Untuk memasangnya, pilih Perangkat tenan.')
  if (kind === 'rekap-tenan') throw new UserError('File ini rekap tenan, bukan backup pengelola mall.')
  const parsed = mallBackupSchema.safeParse(raw)
  if (!parsed.success) {
    throw new UserError(kind === 'backup-mall' ? 'File backup pengelola mall ini rusak atau berasal dari versi aplikasi yang berbeda.' : 'File ini bukan backup pengelola mall.')
  }
  return parsed.data
}

/**
 * Perangkat kosong belum punya sesi, jadi hak role mall dibuktikan dengan PIN akun mall di dalam file.
 * Pemulihan hanya berjalan di perangkat kosong dan tidak pernah menimpa data. Pemeriksaannya ada di dalam
 * transaksi, supaya tetap aman kalau perangkat baru saja disiapkan dari tab lain.
 */
export async function restoreMallBackup(backup: MallBackup, pin: string): Promise<Ctx> {
  let user: User | undefined
  for (const candidate of backup.users.filter((u) => u.role === 'mall')) {
    if ((await hashPin(pin, candidate.salt)) === candidate.pinHash) user = candidate
  }
  if (!user) throw new UserError('PIN pengelola mall salah.')
  const ctx: Ctx = { tenantId: 'mall', userId: user.id, userName: user.name, role: 'mall' }
  await db.transaction('rw', ALL_TABLES, async () => {
    for (const table of ALL_TABLES) {
      if ((await table.count()) > 0) throw new UserError('Perangkat ini sudah berisi data, jadi backup tidak dipulihkan.')
    }
    await db.users.bulkAdd(backup.users)
    await db.tenants.bulkAdd(backup.tenants)
    await db.settings.bulkAdd(backup.settings)
    await db.rekap.bulkAdd(backup.rekap)
    await db.audit.bulkAdd(backup.audit)
    await log(ctx, 'Pulihkan backup mall', `File ${backup.exportedAt}`)
  })
  return ctx
}

export async function lastMallBackupAt(ctx: Ctx): Promise<string | null> {
  requireRole(ctx, 'mall')
  const latest = await db.audit
    .where('[tenantId+at]')
    .between(['mall', ''], ['mall', '￿'])
    .reverse()
    .filter((a) => a.action === MALL_BACKUP_ACTION)
    .first()
  return latest?.at ?? null
}

export async function buildRekap(tenant: Tenant, month: string): Promise<Rekap> {
  const sales = (await db.sales.where('tenantId').equals(tenant.id).toArray()).filter((s) => monthKey(s.createdAt) === month)
  const s = summarize(sales)
  return {
    kind: 'rekap-tenan',
    version: 1,
    tenantId: tenant.id,
    tenantName: tenant.name,
    unit: tenant.unit,
    month,
    generatedAt: now(),
    net: s.net,
    tax: s.tax,
    transactions: s.transactions,
    reversed: s.reversed,
    byMethod: s.byMethod,
  }
}

export async function exportRekap(ctx: Ctx, month: string): Promise<Rekap> {
  requireRole(ctx, 'owner')
  const tenant = await db.tenants.get(ctx.tenantId)
  if (!tenant) throw new UserError('Tenan tidak ditemukan.')
  const rekap = await buildRekap(tenant, month)
  await log(ctx, 'Buat file rekap', month)
  return rekap
}

export async function storeRekap(rekap: Rekap): Promise<void> {
  await db.rekap.put({ ...rekap, id: `${rekap.tenantId}:${rekap.month}`, importedAt: now() })
}

export async function importRekap(ctx: Ctx, raw: unknown): Promise<Rekap> {
  requireRole(ctx, 'mall')
  const parsed = rekapSchema.safeParse(raw)
  if (!parsed.success) throw new UserError('File ini bukan file rekap tenan yang valid.')
  await storeRekap(parsed.data)
  await log(ctx, 'Terima rekap', `${parsed.data.tenantName}, ${parsed.data.month}`)
  return parsed.data
}

export const listRekap = (month: string) => db.rekap.where('month').equals(month).toArray()
export const listRekapMonths = async () => [...new Set((await db.rekap.toArray()).map((r) => r.month))].sort().reverse()

// ---------- Admin mall ----------

export interface TenantDraft {
  name: string
  unit: string
  floor: number
  category: string
  color: string
  ownerPin: string
  cashierPin: string
}

export async function createTenant(ctx: Ctx, draft: TenantDraft): Promise<void> {
  requireRole(ctx, 'mall')
  const parsed = tenantSchema.safeParse({ ...draft, id: newId(), active: true })
  if (!parsed.success) throw new UserError(parsed.error.issues[0].message)
  const tenant = parsed.data
  const taken = (await db.tenants.toArray()).some((t) => t.unit.toLowerCase() === tenant.unit.toLowerCase())
  if (taken) throw new UserError(`Unit ${tenant.unit} sudah terisi.`)
  const users = [
    await makeUser(tenant.id, 'Pemilik', 'owner', draft.ownerPin),
    await makeUser(tenant.id, 'Kasir', 'cashier', draft.cashierPin),
  ]
  await db.transaction('rw', db.tenants, db.users, db.settings, db.audit, async () => {
    await db.tenants.add(tenant)
    await db.users.bulkAdd(users)
    await db.settings.add(defaultSettings(tenant.id))
    await log(ctx, 'Tambah tenan', `${tenant.name} (${tenant.unit})`)
  })
}

export async function setTenantActive(ctx: Ctx, tenantId: string, active: boolean): Promise<void> {
  requireRole(ctx, 'mall')
  await db.tenants.update(tenantId, { active })
  await log(ctx, active ? 'Aktifkan tenan' : 'Nonaktifkan tenan', tenantId)
}

export async function eraseDevice(): Promise<void> {
  await db.transaction('rw', ALL_TABLES, async () => {
    await Promise.all(ALL_TABLES.map((t) => t.clear()))
  })
}

export const previousMonth = (d = new Date()) => {
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${pad2(prev.getMonth() + 1)}`
}
