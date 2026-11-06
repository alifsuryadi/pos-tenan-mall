import { computeTotals } from '../domain/calc'
import type { Product, Sale, Shift, Tenant, User } from '../domain/schemas'
import { db } from './db'
import { buildRekap, defaultSettings, makeUser, newId, previousMonth, storeRekap } from './repo'

export const DEMO_PINS = { owner: '1111', cashier: '2222', mall: '9999' }

type Row = [name: string, category: string, price: number, stock: number | null]

const CATALOG: { tenant: Omit<Tenant, 'id' | 'active'>; taxRate: number; history: boolean; rows: Row[] }[] = [
  {
    tenant: { name: 'Kopi Pagi Hari', unit: 'L1-07', floor: 1, category: 'Kafe', color: '#7A3E12' },
    taxRate: 10,
    history: true,
    rows: [
      ['Kopi susu gula aren', 'Kopi', 28000, null],
      ['Americano', 'Kopi', 24000, null],
      ['Cappuccino', 'Kopi', 32000, null],
      ['Es teh lemon', 'Non kopi', 18000, null],
      ['Cokelat panas', 'Non kopi', 30000, null],
      ['Croissant mentega', 'Roti', 26000, 14],
      ['Roti pisang', 'Roti', 22000, 3],
      ['Biji kopi 200 g', 'Kemasan', 95000, 9],
    ],
  },
  {
    tenant: { name: 'Batik Tiga Putri', unit: 'L2-14', floor: 2, category: 'Busana', color: '#6B1F4F' },
    taxRate: 11,
    history: true,
    rows: [
      ['Kemeja batik parang M', 'Kemeja', 289000, 12],
      ['Kemeja batik parang L', 'Kemeja', 289000, 8],
      ['Blus kawung S', 'Blus', 245000, 6],
      ['Blus kawung M', 'Blus', 245000, 2],
      ['Kain lurik 2 m', 'Kain', 175000, 15],
      ['Selendang sutra', 'Aksesori', 135000, 10],
    ],
  },
  {
    tenant: { name: 'Langkah Sepatu', unit: 'L2-03', floor: 2, category: 'Alas kaki', color: '#0B5D6B' },
    taxRate: 11,
    history: true,
    rows: [
      ['Sneakers kanvas 40', 'Sneakers', 359000, 7],
      ['Sneakers kanvas 42', 'Sneakers', 359000, 4],
      ['Loafer kulit 41', 'Formal', 549000, 5],
      ['Sandal santai 39', 'Sandal', 129000, 20],
      ['Kaus kaki katun', 'Aksesori', 35000, 40],
      ['Pembersih sepatu', 'Aksesori', 59000, 1],
    ],
  },
  {
    tenant: { name: 'Gawai Cermat', unit: 'L3-21', floor: 3, category: 'Aksesori ponsel', color: '#2F4B9B' },
    taxRate: 11,
    history: false,
    rows: [
      ['Kabel USB-C 1 m', 'Kabel', 49000, 30],
      ['Pengisi daya 20 W', 'Pengisi daya', 149000, 12],
      ['Pelindung layar', 'Pelindung', 39000, 50],
      ['Earphone kabel', 'Audio', 89000, 11],
    ],
  },
]

/** Generator tetap supaya data contoh sama di setiap perangkat. */
function randomFrom(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function historyFor(tenant: Tenant, products: Product[], taxRate: number, seed: number, cashier: { id: string; name: string }) {
  const rand = randomFrom(seed)
  const sales: Sale[] = []
  const shifts: Shift[] = []
  const today = new Date()
  for (let ago = 45; ago >= 1; ago--) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ago, 10)
    const weekend = day.getDay() === 0 || day.getDay() === 6
    const count = Math.round((weekend ? 14 : 7) + rand() * 6)
    let cash = 0
    const shift: Shift = {
      id: newId(),
      tenantId: tenant.id,
      cashierId: cashier.id,
      cashierName: cashier.name,
      openedAt: day.toISOString(),
      openingCash: 300000,
      closedAt: null,
      countedCash: null,
      expectedCash: null,
    }
    const stamp = `${day.getFullYear() % 100}`.padStart(2, '0') + `${day.getMonth() + 1}`.padStart(2, '0') + `${day.getDate()}`.padStart(2, '0')
    for (let i = 0; i < count; i++) {
      const lineCount = 1 + Math.floor(rand() * 2)
      const items = Array.from({ length: lineCount }, () => {
        const p = products[Math.floor(rand() * products.length)]
        return { productId: p.id, name: p.name, sku: p.sku, price: p.price, qty: 1 + Math.floor(rand() * 2) }
      })
      const totals = computeTotals(items, { type: 'none', value: 0 }, taxRate)
      const r = rand()
      const method = r < 0.45 ? 'qris' : r < 0.75 ? 'cash' : 'card'
      const voided = rand() < 0.015
      const at = new Date(day.getTime() + (i / count) * 10 * 3600_000)
      if (method === 'cash' && !voided) cash += totals.total
      sales.push({
        id: newId(),
        tenantId: tenant.id,
        number: `${tenant.unit}-${stamp}-${String(i + 1).padStart(4, '0')}`,
        shiftId: shift.id,
        cashierId: cashier.id,
        cashierName: cashier.name,
        items,
        ...totals,
        taxRate,
        method,
        paid: totals.total,
        change: 0,
        reference: '',
        createdAt: at.toISOString(),
        status: voided ? 'voided' : 'completed',
        ...(voided ? { reversal: { reason: 'Salah input', by: 'Pemilik', at: at.toISOString(), shiftId: shift.id } } : {}),
      })
    }
    const expected = shift.openingCash + cash
    shift.closedAt = new Date(day.getTime() + 11 * 3600_000).toISOString()
    shift.expectedCash = expected
    shift.countedCash = rand() < 0.1 ? expected - 5000 : expected
    shifts.push(shift)
  }
  return { sales, shifts }
}

let seeding: Promise<void> | null = null

/** Mengisi perangkat kosong dengan empat tenan contoh dan satu akun pengelola mall. */
export function seedIfEmpty(): Promise<void> {
  // Panggilan bersamaan (mis. React StrictMode) memakai proses yang sama agar data tidak terisi ganda.
  seeding ??= runSeed().finally(() => {
    seeding = null
  })
  return seeding
}

async function runSeed(): Promise<void> {
  if ((await db.users.count()) > 0) return
  const mall = await makeUser('mall', 'Pengelola mall', 'mall', DEMO_PINS.mall)
  const prepared: { tenant: Tenant; owner: User; cashier: User; products: Product[]; history: { sales: Sale[]; shifts: Shift[] }; taxRate: number }[] = []
  for (const [index, entry] of CATALOG.entries()) {
    const tenant: Tenant = { ...entry.tenant, id: newId(), active: true }
    const owner = await makeUser(tenant.id, 'Pemilik', 'owner', DEMO_PINS.owner)
    const cashier = await makeUser(tenant.id, 'Kasir', 'cashier', DEMO_PINS.cashier)
    const products: Product[] = entry.rows.map(([name, category, price, stock], i) => ({
      id: newId(),
      tenantId: tenant.id,
      name,
      sku: `899${String(index + 1).padStart(2, '0')}${String(i + 1).padStart(4, '0')}`,
      category,
      price,
      stock: stock ?? 0,
      minStock: stock === null ? 0 : 5,
      trackStock: stock !== null,
      active: true,
    }))
    const history = entry.history ? historyFor(tenant, products, entry.taxRate, 1234 + index * 77, cashier) : { sales: [], shifts: [] }
    prepared.push({ tenant, owner, cashier, products, history, taxRate: entry.taxRate })
  }

  await db.transaction('rw', [db.tenants, db.users, db.products, db.sales, db.shifts, db.settings], async () => {
    await db.users.add(mall)
    for (const p of prepared) {
      await db.tenants.add(p.tenant)
      await db.users.bulkAdd([p.owner, p.cashier])
      await db.products.bulkAdd(p.products)
      await db.sales.bulkAdd(p.history.sales)
      await db.shifts.bulkAdd(p.history.shifts)
      await db.settings.add({ ...defaultSettings(p.tenant.id), taxRate: p.taxRate })
    }
  })

  // Dua tenan pura-pura sudah mengirim rekap bulan lalu, satu lagi belum.
  const month = previousMonth()
  for (const p of prepared.slice(0, 2)) await storeRekap(await buildRekap(p.tenant, month))
}
