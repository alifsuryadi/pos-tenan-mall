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
