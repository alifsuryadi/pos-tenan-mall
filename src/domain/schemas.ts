import { z } from 'zod'

const id = z.string().min(1)
const rupiah = z.number().int().nonnegative()
const iso = z.string().min(10)

export const tenantSchema = z.object({
  id,
  name: z.string().trim().min(2, 'Nama tenan minimal 2 huruf'),
  unit: z.string().trim().min(2, 'Isi nomor unit, misalnya L1-07'),
  floor: z.number().int().min(0, 'Lantai tidak valid'),
  category: z.string().trim().min(2, 'Isi jenis usaha'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Warna harus berformat #RRGGBB'),
  active: z.boolean(),
})
export type Tenant = z.infer<typeof tenantSchema>

export const roleSchema = z.enum(['owner', 'cashier', 'mall'])
export type Role = z.infer<typeof roleSchema>

export const userSchema = z.object({
  id,
  tenantId: id, // 'mall' untuk pengelola mall
  name: z.string().min(1),
  role: roleSchema,
  salt: z.string().min(1),
  pinHash: z.string().min(1),
})
export type User = z.infer<typeof userSchema>

export const productSchema = z.object({
  id,
  tenantId: id,
  name: z.string().trim().min(2, 'Nama produk minimal 2 huruf'),
  sku: z.string().trim().min(1, 'Isi SKU atau barcode'),
  category: z.string().trim().min(1, 'Isi kategori'),
  price: rupiah,
  stock: z.number().int(),
  minStock: z.number().int().nonnegative(),
  trackStock: z.boolean(),
  active: z.boolean(),
})
export type Product = z.infer<typeof productSchema>

export const saleItemSchema = z.object({
  productId: id,
  name: z.string(),
  sku: z.string(),
  price: rupiah,
  qty: z.number().int().positive(),
})
export type SaleItem = z.infer<typeof saleItemSchema>

export const paymentMethodSchema = z.enum(['cash', 'qris', 'card'])
export type PaymentMethod = z.infer<typeof paymentMethodSchema>

export const discountSchema = z.object({
  type: z.enum(['none', 'percent', 'amount']),
  value: z.number().nonnegative(),
})
export type Discount = z.infer<typeof discountSchema>

export const saleSchema = z.object({
  id,
  tenantId: id,
  number: z.string(),
  shiftId: id,
  cashierId: id,
  cashierName: z.string(),
  items: z.array(saleItemSchema).min(1),
  subtotal: rupiah,
  discount: rupiah,
  taxRate: z.number().nonnegative(),
  tax: rupiah,
  total: rupiah,
  method: paymentMethodSchema,
  paid: rupiah,
  change: rupiah,
  reference: z.string(),
  createdAt: iso,
  status: z.enum(['completed', 'voided', 'refunded']),
  reversal: z
    .object({ reason: z.string(), by: z.string(), at: iso, shiftId: id })
    .optional(),
})
export type Sale = z.infer<typeof saleSchema>

export const shiftSchema = z.object({
  id,
  tenantId: id,
  cashierId: id,
  cashierName: z.string(),
  openedAt: iso,
  openingCash: rupiah,
  closedAt: iso.nullable(),
  countedCash: rupiah.nullable(),
  expectedCash: rupiah.nullable(),
})
export type Shift = z.infer<typeof shiftSchema>

export const stockMoveSchema = z.object({
  id,
  tenantId: id,
  productId: id,
  productName: z.string(),
  delta: z.number().int(),
  reason: z.string(),
  by: z.string(),
  at: iso,
})
export type StockMove = z.infer<typeof stockMoveSchema>

export const auditSchema = z.object({
  id,
  tenantId: id,
  action: z.string(),
  detail: z.string(),
  by: z.string(),
  at: iso,
})
export type Audit = z.infer<typeof auditSchema>

export const settingsSchema = z.object({
  tenantId: id,
  taxRate: z.number().min(0).max(100),
  receiptFooter: z.string(),
  paperWidth: z.union([z.literal(58), z.literal(80)]),
  qrisImage: z.string().nullable(),
  lastBackupAt: iso.nullable(),
})
export type Settings = z.infer<typeof settingsSchema>

export const heldSchema = z.object({
  id,
  tenantId: id,
  label: z.string(),
  lines: z.array(saleItemSchema),
  discount: discountSchema,
  at: iso,
})
export type Held = z.infer<typeof heldSchema>

export const rekapSchema = z.object({
  kind: z.literal('rekap-tenan'),
  version: z.literal(1),
  tenantId: id,
  tenantName: z.string(),
  unit: z.string(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
  generatedAt: iso,
  net: rupiah,
  tax: rupiah,
  transactions: z.number().int().nonnegative(),
  reversed: z.number().int().nonnegative(),
  byMethod: z.object({ cash: rupiah, qris: rupiah, card: rupiah }),
})
export type Rekap = z.infer<typeof rekapSchema>

export const backupSchema = z
  .object({
    kind: z.literal('backup-tenan'),
    version: z.literal(1),
    exportedAt: iso,
    tenant: tenantSchema,
    users: z.array(userSchema),
    products: z.array(productSchema),
    sales: z.array(saleSchema),
    shifts: z.array(shiftSchema),
    stockMoves: z.array(stockMoveSchema),
    audit: z.array(auditSchema),
    held: z.array(heldSchema),
    settings: settingsSchema,
  })
  .refine(
    (b) =>
      [b.users, b.products, b.sales, b.shifts, b.stockMoves, b.audit, b.held, [b.settings]].every((rows) =>
        rows.every((r) => r.tenantId === b.tenant.id),
      ),
    'Isi file backup tercampur dengan data tenan lain',
  )
  // File dari luar tidak boleh membawa akun pengelola mall.
  .refine((b) => b.tenant.id !== 'mall' && b.users.every((u) => u.role !== 'mall'), 'File berisi akun yang tidak diizinkan')
export type Backup = z.infer<typeof backupSchema>

export const storedRekapSchema = rekapSchema.extend({ id, importedAt: iso })

const hasDuplicates = (keys: string[]) => new Set(keys).size !== keys.length

/**
 * Backup perangkat pengelola mall. Skema ini sengaja terpisah dari backupSchema: nilai `kind` yang berbeda
 * membuat kedua jenis file saling tertolak, dan backupSchema tetap menolak akun pengelola mall.
 * Produk, transaksi, dan shift tidak termasuk karena itu data milik tenan.
 */
export const mallBackupSchema = z
  .object({
    kind: z.literal('backup-mall'),
    version: z.literal(1),
    exportedAt: iso,
    users: z.array(userSchema),
    tenants: z.array(tenantSchema),
    settings: z.array(settingsSchema),
    rekap: z.array(storedRekapSchema),
    audit: z.array(auditSchema),
  })
  .refine((b) => b.users.some((u) => u.role === 'mall'), 'File tidak memuat akun pengelola mall')
  .refine((b) => {
    const tenantIds = new Set(b.tenants.map((t) => t.id))
    return (
      !tenantIds.has('mall') &&
      b.users.every((u) => (u.role === 'mall' ? u.tenantId === 'mall' : tenantIds.has(u.tenantId))) &&
      b.settings.every((s) => tenantIds.has(s.tenantId)) &&
      b.audit.every((a) => a.tenantId === 'mall')
    )
  }, 'Isi file backup tidak cocok dengan daftar tenan')
  .refine((b) => b.rekap.every((r) => r.id === `${r.tenantId}:${r.month}`), 'Penanda rekap tidak valid')
  .refine(
    (b) =>
      ![b.users.map((u) => u.id), b.tenants.map((t) => t.id), b.settings.map((s) => s.tenantId), b.rekap.map((r) => r.id), b.audit.map((a) => a.id)].some(hasDuplicates),
    'File berisi data ganda',
  )
export type MallBackup = z.infer<typeof mallBackupSchema>
