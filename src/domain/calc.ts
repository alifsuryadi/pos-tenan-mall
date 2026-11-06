import type { Discount, PaymentMethod, Sale, Shift } from './schemas'

export interface Totals {
  subtotal: number
  discount: number
  tax: number
  total: number
}

/** Semua nilai dalam rupiah bulat. Pajak dihitung setelah diskon dan ditambahkan ke harga. */
export function computeTotals(
  lines: { price: number; qty: number }[],
  discount: Discount,
  taxRate: number,
): Totals {
  const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
  const raw =
    discount.type === 'percent'
      ? Math.round((subtotal * Math.min(discount.value, 100)) / 100)
      : discount.type === 'amount'
        ? Math.round(discount.value)
        : 0
  const cut = Math.min(raw, subtotal)
  const tax = Math.round(((subtotal - cut) * taxRate) / 100)
  return { subtotal, discount: cut, tax, total: subtotal - cut + tax }
}

export const pad2 = (n: number) => String(n).padStart(2, '0')

/** Tanggal lokal perangkat, bukan UTC, supaya penjualan malam tidak masuk ke hari lain. */
export function dayKey(value: string | Date): string {
  const d = new Date(value)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

export const monthKey = (value: string | Date) => dayKey(value).slice(0, 7)

export interface Summary {
  net: number
  tax: number
  discount: number
  transactions: number
  reversed: number
  reversedValue: number
  average: number
  byMethod: Record<PaymentMethod, number>
  byDay: Map<string, { net: number; transactions: number }>
  topProducts: { name: string; qty: number; revenue: number }[]
}

/** Penjualan yang dibatalkan atau direfund tidak dihitung sebagai omzet. */
export function summarize(sales: Sale[]): Summary {
  const s: Summary = {
    net: 0,
    tax: 0,
    discount: 0,
    transactions: 0,
    reversed: 0,
    reversedValue: 0,
    average: 0,
    byMethod: { cash: 0, qris: 0, card: 0 },
    byDay: new Map(),
    topProducts: [],
  }
  const products = new Map<string, { name: string; qty: number; revenue: number }>()
  for (const sale of sales) {
    if (sale.status !== 'completed') {
      s.reversed += 1
      s.reversedValue += sale.total
      continue
    }
    s.net += sale.total
    s.tax += sale.tax
    s.discount += sale.discount
    s.transactions += 1
    s.byMethod[sale.method] += sale.total
    const key = dayKey(sale.createdAt)
    const day = s.byDay.get(key) ?? { net: 0, transactions: 0 }
    day.net += sale.total
    day.transactions += 1
    s.byDay.set(key, day)
    for (const item of sale.items) {
      const p = products.get(item.productId) ?? { name: item.name, qty: 0, revenue: 0 }
      p.qty += item.qty
      p.revenue += item.price * item.qty
      products.set(item.productId, p)
    }
  }
  s.average = s.transactions ? Math.round(s.net / s.transactions) : 0
  s.topProducts = [...products.values()].sort((a, b) => b.revenue - a.revenue)
  return s
}

/**
 * Kas yang seharusnya ada di laci: modal + penjualan tunai shift ini
 * - refund tunai yang dibayarkan dalam shift ini.
 * Refund bisa berasal dari penjualan shift lain, jadi `sales` harus memuat keduanya.
 */
export function expectedCash(shift: Shift, sales: Sale[]): number {
  let cash = shift.openingCash
  for (const sale of sales) {
    if (sale.method !== 'cash') continue
    if (sale.shiftId === shift.id && sale.status !== 'voided') cash += sale.total
    if (sale.status === 'refunded' && sale.reversal?.shiftId === shift.id) cash -= sale.total
  }
  return cash
}
