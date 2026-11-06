import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import * as repo from '../data/repo'
import { dayKey, summarize } from '../domain/calc'
import type { Sale, Tenant } from '../domain/schemas'
import { reportError } from '../store'
import { Button, Empty, METHOD_LABEL, PageTitle, Stat, rupiah, shortDate } from '../ui/kit'

const RANGES = [
  { days: 1, label: 'Hari ini' },
  { days: 7, label: '7 hari' },
  { days: 30, label: '30 hari' },
] as const

interface DayPoint {
  key: string
  net: number
  transactions: number
}

/** Satu seri omzet harian: batang tipis, tooltip per batang, dan area sentuh setinggi grafik. */
function DailyChart({ points }: { points: DayPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...points.map((p) => p.net), 1)
  const top = Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max))
  const point = active === null ? null : points[active]
  const labelEvery = points.length > 10 ? 7 : 1

  return (
    <figure>
      <div className="relative">
        {point && (
          <div
            role="status"
            className="tnum pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full bg-ink px-3 py-1.5 text-sm whitespace-nowrap text-white"
            style={{ left: `clamp(5rem, ${((active! + 0.5) / points.length) * 100}%, calc(100% - 5rem))` }}
          >
            <div className="font-medium">{shortDate(point.key)}</div>
            <div>
              {rupiah(point.net)}, {point.transactions} transaksi
            </div>
          </div>
        )}
        <div className="absolute inset-x-0 top-0 border-t border-line" />
        <div className="absolute inset-x-0 top-1/2 border-t border-line" />
        <div className="relative flex h-52 items-end border-b border-muted" onMouseLeave={() => setActive(null)}>
          {points.map((p, i) => (
            <button
              key={p.key}
              type="button"
              aria-label={`${shortDate(p.key)}: ${rupiah(p.net)}, ${p.transactions} transaksi`}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(i)}
              className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center px-px hover:bg-rail/5"
            >
              <span
                className={`block w-full max-w-10 rounded-t-[4px] ${active === i ? 'bg-ink' : 'bg-rail'}`}
                style={{ height: p.net ? `max(2px, ${(p.net / top) * 100}%)` : 0 }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="tnum mt-1 flex text-sm text-muted">
        {points.map((p, i) => (
          <span key={p.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % labelEvery === 0 ? shortDate(p.key) : ''}
          </span>
        ))}
      </div>
      <figcaption className="tnum mt-1 text-sm text-muted">Garis atas {rupiah(top)}, garis tengah {rupiah(top / 2)}</figcaption>
    </figure>
  )
}

export function Reports({ ctx, tenant }: { ctx: repo.Ctx; tenant: Tenant }) {
  const [days, setDays] = useState<number>(7)
  const [tableOpen, setTableOpen] = useState(false)
  const from = useMemo(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - days + 1)
  }, [days])
  const sales: Sale[] | undefined = useLiveQuery(() => repo.listSales(ctx, from, new Date()), [ctx.tenantId, from])
  const summary = useMemo(() => summarize(sales ?? []), [sales])

  const points: DayPoint[] = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const key = dayKey(new Date(from.getFullYear(), from.getMonth(), from.getDate() + i))
        const day = summary.byDay.get(key)
        return { key, net: day?.net ?? 0, transactions: day?.transactions ?? 0 }
      }),
    [days, from, summary],
  )

  const exportExcel = async () => {
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(points.map((p) => ({ Tanggal: p.key, Omzet: p.net, Transaksi: p.transactions }))), 'Harian')
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary.topProducts.map((p) => ({ Produk: p.name, Terjual: p.qty, Pendapatan: p.revenue }))), 'Produk')
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.json_to_sheet(
          (sales ?? []).map((s) => ({ Nomor: s.number, Waktu: s.createdAt, Kasir: s.cashierName, Metode: METHOD_LABEL[s.method], Subtotal: s.subtotal, Diskon: s.discount, Pajak: s.tax, Total: s.total, Status: s.status })),
        ),
        'Transaksi',
      )
      XLSX.writeFile(wb, `laporan-${tenant.unit}-${points[0].key}-sampai-${points[points.length - 1].key}.xlsx`)
    } catch (err) {
      reportError(err)
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitle title="Laporan penjualan">
        <div className="flex" role="group" aria-label="Rentang laporan">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)} className={`min-h-11 px-4 font-medium ${days === r.days ? 'bg-rail text-white' : 'bg-surface hover:bg-white'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <Button disabled={!sales?.length} onClick={exportExcel}>
          Unduh Excel
        </Button>
      </PageTitle>

      <div className="mb-8 grid grid-cols-2 gap-5 md:grid-cols-4">
        <Stat label="Omzet" value={rupiah(summary.net)} note="Termasuk pajak" />
        <Stat label="Transaksi" value={String(summary.transactions)} note={summary.reversed ? `${summary.reversed} dibatalkan atau direfund` : undefined} />
        <Stat label="Rata-rata per transaksi" value={rupiah(summary.average)} />
        <Stat label="Pajak terkumpul" value={rupiah(summary.tax)} />
      </div>

      {sales?.length === 0 ? (
        <Empty title="Belum ada penjualan pada rentang ini.">Pilih rentang yang lebih panjang.</Empty>
      ) : (
        <>
          {days > 1 && (
            <section className="mb-8 bg-surface p-4">
              <div className="mb-8 flex items-center justify-between">
                <h2 className="font-sign text-2xl font-semibold">Omzet harian</h2>
                <Button tone="quiet" aria-expanded={tableOpen} onClick={() => setTableOpen(!tableOpen)}>
                  {tableOpen ? 'Sembunyikan tabel' : 'Lihat sebagai tabel'}
                </Button>
              </div>
              <DailyChart points={points} />
              {tableOpen && (
                <table className="tnum mt-4 w-full text-left">
                  <thead className="border-b border-line text-sm text-muted">
                    <tr>
                      <th className="py-2 font-medium">Tanggal</th>
                      <th className="py-2 text-right font-medium">Transaksi</th>
                      <th className="py-2 text-right font-medium">Omzet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {points.map((p) => (
                      <tr key={p.key}>
                        <td className="py-1.5">{shortDate(p.key)}</td>
                        <td className="py-1.5 text-right">{p.transactions}</td>
                        <td className="py-1.5 text-right">{rupiah(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          <div className="grid gap-8 md:grid-cols-[2fr_1fr]">
            <section>
              <h2 className="mb-2 font-sign text-2xl font-semibold">Produk terlaris</h2>
              <ul className="tnum divide-y divide-line bg-surface">
                {summary.topProducts.slice(0, 8).map((p) => (
                  <li key={p.name} className="flex justify-between gap-4 px-4 py-2">
                    <span>
                      {p.name} <span className="text-sm text-muted">x{p.qty}</span>
                    </span>
                    <span className="font-medium">{rupiah(p.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-2 font-sign text-2xl font-semibold">Metode bayar</h2>
              <ul className="tnum divide-y divide-line bg-surface">
                {(['cash', 'qris', 'card'] as const).map((m) => (
                  <li key={m} className="flex justify-between gap-4 px-4 py-2">
                    <span>{METHOD_LABEL[m]}</span>
                    <span className="font-medium">{rupiah(summary.byMethod[m])}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
