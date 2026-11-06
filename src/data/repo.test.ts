import { beforeEach, describe, expect, it } from 'vitest'
import { computeTotals, expectedCash } from '../domain/calc'
import { db } from './db'
import * as repo from './repo'

const mallCtx: repo.Ctx = { tenantId: 'mall', userId: 'm', userName: 'Mall', role: 'mall' }

async function makeTenant(unit: string) {
  await repo.createTenant(mallCtx, { name: `Tenan ${unit}`, unit, floor: 1, category: 'Toko', color: '#123456', ownerPin: '1111', cashierPin: '2222' })
  const tenant = (await db.tenants.toArray()).find((t) => t.unit === unit)!
  const users = await repo.listUsers(tenant.id)
  const owner = users.find((u) => u.role === 'owner')!
  const cashier = users.find((u) => u.role === 'cashier')!
  const asOwner = await repo.login(owner.id, '1111')
  const asCashier = await repo.login(cashier.id, '2222')
  await repo.saveProduct(asOwner, { name: 'Barang', sku: 'A1', category: 'Umum', price: 10000, stock: 5, minStock: 1, trackStock: true, active: true })
  const product = (await repo.listProducts(asOwner))[0]
  return { tenant, asOwner, asCashier, cashier, product }
}

const line = (p: { id: string; name: string; sku: string; price: number }, qty: number) => ({ productId: p.id, name: p.name, sku: p.sku, price: p.price, qty })
const noDiscount = { type: 'none' as const, value: 0 }

beforeEach(() => repo.eraseDevice())

describe('computeTotals', () => {
  it('menghitung pajak setelah diskon', () => {
    expect(computeTotals([{ price: 10000, qty: 2 }], { type: 'percent', value: 10 }, 11)).toEqual({ subtotal: 20000, discount: 2000, tax: 1980, total: 19980 })
  })
  it('diskon tidak melebihi subtotal', () => {
    expect(computeTotals([{ price: 5000, qty: 1 }], { type: 'amount', value: 9000 }, 10).total).toBe(0)
  })
})

describe('pemisahan tenan', () => {
  it('tenan tidak bisa melihat atau mengubah data tenan lain', async () => {
    const a = await makeTenant('L1-01')
    const b = await makeTenant('L1-02')
    expect((await repo.listProducts(a.asOwner)).every((p) => p.tenantId === a.tenant.id)).toBe(true)
    await expect(repo.adjustStock(a.asOwner, b.product.id, 1, 'coba')).rejects.toThrow('tidak ditemukan')
    await repo.openShift(a.asCashier, 0)
    await expect(
      repo.completeSale(a.asCashier, { lines: [line(b.product, 1)], discount: noDiscount, method: 'qris', paid: 0, reference: '' }),
    ).rejects.toThrow('tidak dijual')
  })

  it('backup tenan lain ditolak oleh pemilik', async () => {
    const a = await makeTenant('L1-01')
    const b = await makeTenant('L1-02')
    const backup = await repo.exportBackup(b.asOwner)
    await expect(repo.restoreBackup(a.asOwner, backup)).rejects.toThrow('bukan tenan')
  })
})

describe('penjualan, void, dan refund', () => {
  it('mengurangi stok, menolak stok kurang, dan void mengembalikan stok serta kas', async () => {
    const { asOwner, asCashier, product } = await makeTenant('L1-01')
    await expect(
      repo.completeSale(asCashier, { lines: [line(product, 1)], discount: noDiscount, method: 'cash', paid: 10000, reference: '' }),
    ).rejects.toThrow('Buka shift')
    await repo.openShift(asCashier, 50000)
    await expect(
      repo.completeSale(asCashier, { lines: [line(product, 6)], discount: noDiscount, method: 'qris', paid: 0, reference: '' }),
    ).rejects.toThrow('tinggal 5')
    await expect(
      repo.completeSale(asCashier, { lines: [line(product, 1)], discount: noDiscount, method: 'cash', paid: 5000, reference: '' }),
    ).rejects.toThrow('kurang')

    const sale = await repo.completeSale(asCashier, { lines: [line(product, 2)], discount: noDiscount, method: 'cash', paid: 50000, reference: '' })
    expect(sale.change).toBe(30000)
    expect((await db.products.get(product.id))!.stock).toBe(3)

    await expect(repo.reverseSale(asCashier, sale.id, 'salah', '0000')).rejects.toThrow('PIN pemilik')
    expect(await repo.reverseSale(asCashier, sale.id, 'salah', '1111')).toBe('voided')
    expect((await db.products.get(product.id))!.stock).toBe(5)
    const shift = (await repo.getOpenShift(asOwner))!
    expect(expectedCash(shift, await repo.salesForShift(asOwner, shift))).toBe(50000)
  })

  it('refund shift lama mengurangi kas shift aktif', async () => {
    const { asOwner, asCashier, product } = await makeTenant('L1-01')
    await repo.openShift(asCashier, 0)
    const sale = await repo.completeSale(asCashier, { lines: [line(product, 1)], discount: noDiscount, method: 'cash', paid: 10000, reference: '' })
    const first = (await repo.getOpenShift(asOwner))!
    await repo.closeShift(asCashier, first.id, 10000)
    await repo.openShift(asCashier, 20000)
    expect(await repo.reverseSale(asOwner, sale.id, 'rusak')).toBe('refunded')
    const second = (await repo.getOpenShift(asOwner))!
    expect(expectedCash(second, await repo.salesForShift(asOwner, second))).toBe(10000)
    const closedFirst = (await db.shifts.get(first.id))!
    expect(closedFirst.expectedCash).toBe(10000)
  })

  it('kasir tidak boleh mengubah produk', async () => {
    const { asCashier } = await makeTenant('L1-01')
    await expect(
      repo.saveProduct(asCashier, { name: 'X', sku: 'B', category: 'U', price: 1, stock: 0, minStock: 0, trackStock: false, active: true }),
    ).rejects.toThrow('tidak punya akses')
  })
})

describe('backup', () => {
  it('memulihkan data tenan seperti semula', async () => {
    const { asOwner, asCashier, product } = await makeTenant('L1-01')
    await repo.openShift(asCashier, 0)
    await repo.completeSale(asCashier, { lines: [line(product, 1)], discount: noDiscount, method: 'qris', paid: 0, reference: '' })
    const backup = repo.parseBackup(JSON.parse(JSON.stringify(await repo.exportBackup(asOwner))))
    await repo.adjustStock(asOwner, product.id, 3, 'tambah')
    await repo.restoreBackup(asOwner, backup)
    expect((await db.products.get(product.id))!.stock).toBe(4)
    expect(() => repo.parseBackup({ kind: 'lain' })).toThrow('bukan backup')
  })
})

describe('backup pengelola mall', () => {
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
  const RESTORE = 'Pulihkan backup mall'

  async function snapshot() {
    return {
      users: byId(await db.users.toArray()),
      tenants: byId(await db.tenants.toArray()),
      settings: (await db.settings.toArray()).sort((a, b) => a.tenantId.localeCompare(b.tenantId)),
      rekap: byId(await db.rekap.toArray()),
      audit: byId((await db.audit.where('tenantId').equals('mall').toArray()).filter((a) => a.action !== RESTORE)),
    }
  }

  /** Perangkat mall dengan satu tenan dan satu rekap yang sudah diterima. */
  async function mallDevice() {
    const mall = await repo.setupMall('123456')
    const shop = await makeTenant('L1-01')
    await repo.importRekap(mall, await repo.exportRekap(shop.asOwner, '2026-10'))
    return { mall, shop }
  }

  /** Lewat JSON, seperti file sungguhan yang diunduh lalu dipilih lagi. */
  const throughFile = (data: unknown) => JSON.parse(JSON.stringify(data))

  it('ekspor lalu pulihkan di perangkat kosong menghasilkan data yang sama', async () => {
    const { mall } = await mallDevice()
    const file = throughFile(await repo.exportMallBackup(mall))
    const before = await snapshot()
    expect(before.users.map((u) => u.role).sort()).toEqual(['cashier', 'mall', 'owner'])
    expect(before.rekap).toHaveLength(1)
    expect(before.audit.some((a) => a.action === 'Buat backup mall')).toBe(true)

    await repo.eraseDevice()
    const ctx = await repo.restoreMallBackup(repo.parseMallBackup(file), '123456')
    expect(ctx).toMatchObject({ tenantId: 'mall', role: 'mall', userId: mall.userId })
    expect(await snapshot()).toEqual(before)
    expect(await repo.lastMallBackupAt(ctx)).toBe(before.audit.find((a) => a.action === 'Buat backup mall')!.at)
  })

  it('setelah dipulihkan, PIN lama, file penyiapan, dan reset PIN tetap berfungsi', async () => {
    const { mall, shop } = await mallDevice()
    const file = throughFile(await repo.exportMallBackup(mall))
    await repo.eraseDevice()
    const ctx = await repo.restoreMallBackup(repo.parseMallBackup(file), '123456')

    await expect(repo.login(mall.userId, '000000')).rejects.toThrow('PIN salah')
    expect((await repo.login(mall.userId, '123456')).role).toBe('mall')
    const setup = await repo.exportTenantSetup(ctx, shop.tenant.id)
    expect(setup.users).toHaveLength(2)
    await repo.changePin(ctx, shop.asOwner.userId, '4444')
    expect((await repo.login(shop.asOwner.userId, '4444')).role).toBe('owner')
  })

  it('produk dan transaksi tenan tidak ikut ke file', async () => {
    const { mall, shop } = await mallDevice()
    await repo.openShift(shop.asCashier, 0)
    await repo.completeSale(shop.asCashier, { lines: [line(shop.product, 1)], discount: noDiscount, method: 'qris', paid: 0, reference: '' })
    const file = throughFile(await repo.exportMallBackup(mall))
    for (const key of ['products', 'sales', 'shifts', 'stockMoves', 'held']) expect(file).not.toHaveProperty(key)
    expect(file.audit.every((a: { tenantId: string }) => a.tenantId === 'mall')).toBe(true)
  })

  it('tenan tidak bisa mengekspor', async () => {
    const { shop } = await mallDevice()
    await expect(repo.exportMallBackup(shop.asOwner)).rejects.toThrow('tidak punya akses')
    await expect(repo.exportMallBackup(shop.asCashier)).rejects.toThrow('tidak punya akses')
    expect((await db.audit.toArray()).some((a) => a.action === 'Buat backup mall')).toBe(false)
  })

  it('file tenan ditolak sebagai backup mall', async () => {
    const { mall, shop } = await mallDevice()
    const tenantBackup = throughFile(await repo.exportBackup(shop.asOwner))
    const setup = throughFile(await repo.exportTenantSetup(mall, shop.tenant.id))
    const rekap = throughFile(await repo.exportRekap(shop.asOwner, '2026-10'))
    expect(() => repo.parseMallBackup(tenantBackup)).toThrow('milik tenan')
    expect(() => repo.parseMallBackup(setup)).toThrow('milik tenan')
    expect(() => repo.parseMallBackup({ ...tenantBackup, kind: 'backup-mall' })).toThrow('rusak')
    expect(() => repo.parseMallBackup(rekap)).toThrow('rekap tenan')
    expect(() => repo.parseMallBackup(null)).toThrow('bukan backup pengelola mall')
  })

  it('file mall ditolak sebagai file tenan, juga kalau jenisnya dipalsukan', async () => {
    const { mall } = await mallDevice()
    const file = throughFile(await repo.exportMallBackup(mall))
    expect(() => repo.parseBackup(file)).toThrow('bukan backup tenan')
    expect(() => repo.parseBackup({ ...file, kind: 'backup-tenan' })).toThrow('bukan backup')
    await expect(repo.importRekap(mall, file)).rejects.toThrow('bukan file rekap')
  })

  it('file yang dipalsukan atau rusak ditolak', async () => {
    const { mall } = await mallDevice()
    const file = throughFile(await repo.exportMallBackup(mall))
    const mallUser = file.users.find((u: { role: string }) => u.role === 'mall')
    const shopUser = file.users.find((u: { role: string }) => u.role === 'owner')
    const forgeries = [
      { ...file, version: 2 },
      { ...file, users: file.users.filter((u: { role: string }) => u.role !== 'mall') },
      { ...file, users: [...file.users, { ...mallUser, id: 'x', tenantId: file.tenants[0].id }] },
      { ...file, users: [...file.users, { ...shopUser, id: 'x', tenantId: 'mall' }] },
      { ...file, users: [...file.users, { ...shopUser, id: 'x', tenantId: 'tidak-ada' }] },
      { ...file, users: [...file.users, shopUser] },
      { ...file, tenants: [...file.tenants, { ...file.tenants[0], id: 'mall' }] },
      { ...file, rekap: [{ ...file.rekap[0], id: 'lain' }] },
      { ...file, audit: [{ ...file.audit[0], tenantId: file.tenants[0].id }] },
    ]
    for (const forged of forgeries) expect(() => repo.parseMallBackup(forged)).toThrow('rusak')
  })

  it('hanya PIN akun mall yang bisa memulihkan, dan PIN salah tidak mengubah apa pun', async () => {
    const { mall } = await mallDevice()
    const file = repo.parseMallBackup(throughFile(await repo.exportMallBackup(mall)))
    await repo.eraseDevice()
    await expect(repo.restoreMallBackup(file, '000000')).rejects.toThrow('PIN pengelola mall salah')
    await expect(repo.restoreMallBackup(file, '1111')).rejects.toThrow('PIN pengelola mall salah')
    expect(await repo.isDeviceEmpty()).toBe(true)
  })

  it('pemulihan tidak menimpa perangkat yang sudah berisi data', async () => {
    const { mall } = await mallDevice()
    const file = repo.parseMallBackup(throughFile(await repo.exportMallBackup(mall)))
    await makeTenant('L1-02')
    const before = await snapshot()
    await expect(repo.restoreMallBackup(file, '123456')).rejects.toThrow('sudah berisi data')
    expect(await snapshot()).toEqual(before)
  })

  it('perangkat tanpa akun tetapi masih punya data lain dianggap berisi', async () => {
    const { mall } = await mallDevice()
    const file = repo.parseMallBackup(throughFile(await repo.exportMallBackup(mall)))
    await db.users.clear()
    expect(await repo.isDeviceEmpty()).toBe(true)
    await expect(repo.restoreMallBackup(file, '123456')).rejects.toThrow('sudah berisi data')
    expect(await db.users.count()).toBe(0)
  })
})

describe('penyiapan perangkat', () => {
  it('akun mall hanya bisa dibuat di perangkat kosong', async () => {
    const ctx = await repo.setupMall('123456')
    expect(ctx.role).toBe('mall')
    await expect(repo.setupMall('654321')).rejects.toThrow('sudah disiapkan')
    expect(await repo.hasMallAccount()).toBe(true)
  })

  it('PIN pengelola divalidasi', async () => {
    await expect(repo.setupMall('12')).rejects.toThrow('PIN harus')
    expect(await repo.isDeviceEmpty()).toBe(true)
  })

  it('file penyiapan memasang tenan di perangkat baru dan PIN-nya berlaku', async () => {
    const { tenant, asOwner } = await makeTenant('L1-01')
    await repo.openShift(asOwner, 0)
    const raw = JSON.parse(JSON.stringify(await repo.exportTenantSetup(mallCtx, tenant.id)))
    expect(raw.products).toEqual([])
    expect(raw.shifts).toEqual([])

    await repo.eraseDevice()
    await repo.addTenantFromFile(repo.parseBackup(raw))
    expect(await repo.hasMallAccount()).toBe(false)
    const owner = (await repo.listUsers(tenant.id)).find((u) => u.role === 'owner')!
    await expect(repo.login(owner.id, '0000')).rejects.toThrow('PIN salah')
    expect((await repo.login(owner.id, '1111')).tenantId).toBe(tenant.id)
  })

  it('file tidak bisa menimpa tenan yang sudah ada atau unit yang terisi', async () => {
    const { tenant } = await makeTenant('L1-01')
    const setup = await repo.exportTenantSetup(mallCtx, tenant.id)
    await expect(repo.addTenantFromFile(setup)).rejects.toThrow('sudah ada')
    await expect(repo.addTenantFromFile({ ...setup, tenant: { ...setup.tenant, id: 'lain' }, users: [], settings: { ...setup.settings, tenantId: 'lain' } })).rejects.toThrow('sudah terisi')
  })

  it('file berisi akun pengelola mall ditolak', async () => {
    const { tenant } = await makeTenant('L1-01')
    const setup = await repo.exportTenantSetup(mallCtx, tenant.id)
    const forged = { ...setup, users: [{ ...setup.users[0], role: 'mall' }] }
    expect(() => repo.parseBackup(forged)).toThrow('bukan backup')
  })
})
