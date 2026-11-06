import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import * as repo from '../data/repo'
import { dayKey, summarize } from '../domain/calc'
import type { Sale, Tenant } from '../domain/schemas'
import { reportError } from '../store'
import { Button, Empty, Ledger, METHOD_LABEL, PageTitle, Segmented, rupiah, shortDate, sheet } from '../ui/kit'

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

/** Satu seri omzet harian: batang tipis, label hanya di puncak, tooltip per batang, dan area sentuh setinggi grafik. */
function DailyChart({ points }: { points: DayPoint[] }) {
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...points.map((p) => p.net), 1)
  const top = Math.ceil(max / 10 ** Math.floor(Math.log10(max))) * 10 ** Math.floor(Math.log10(max))
  const point = active === null ? null : points[active]
  const labelEvery = points.length > 10 ? 7 : 1
  const peak = points.findIndex((p) => p.net === max)
  const at = (i: number) => `clamp(4rem, ${((i + 0.5) / points.length) * 100}%, calc(100% - 4rem))`

  return (
    <figure>
      <div className="relative pt-7">
        {point && (
          <div role="status" className="tnum pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-key bg-ink px-3 py-1.5 text-sm whitespace-nowrap text-white" style={{ left: at(active!) }}>
            <div className="font-semibold">{shortDate(point.key)}</div>
            <div>
              {rupiah(point.net)}, {point.transactions} transaksi
            </div>
          </div>
        )}
        <div className="relative h-56">
          {[1, 0.5].map((f) => (
            <div key={f} className="absolute inset-x-0 border-t border-line" style={{ bottom: `${f * 100}%` }}>
              <span className="tnum absolute right-0 bottom-0.5 bg-surface pl-1 text-sm text-muted">{rupiah(top * f)}</span>
            </div>
          ))}
          <div className="relative flex h-full items-end border-b border-muted" onMouseLeave={() => setActive(null)}>
            {points.map((p, i) => (
              <button
                key={p.key}
                type="button"
                aria-label={`${shortDate(p.key)}: ${rupiah(p.net)}, ${p.transactions} transaksi`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(i)}
                className="flex h-full min-w-0 flex-1 cursor-default items-end justify-center px-px hover:bg-ink/5"
              >
                <span className={`block w-full max-w-6 rounded-t-[4px] ${active === i ? 'bg-ink' : 'bg-chart'}`} style={{ height: p.net ? `max(2px, ${(p.net / top) * 100}%)` : 0 }} />
              </button>
            ))}
          </div>
          {active === null && (
            <span aria-hidden="true" className="tnum pointer-events-none absolute -translate-x-1/2 bg-surface px-1 text-sm font-semibold whitespace-nowrap" style={{ left: at(peak), bottom: `calc(${(max / top) * 100}% + 3px)` }}>
              {rupiah(max)}
            </span>
          )}
        </div>
      </div>
      <div className="tnum mt-1 flex text-sm text-muted">
        {points.map((p, i) => (
          <span key={p.key} className="flex min-w-0 flex-1 justify-center whitespace-nowrap">
            {i % labelEvery === 0 ? shortDate(p.key) : ''}
          </span>
        ))}
      </div>
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

  const rangeLabel = RANGES.find((r) => r.days === days)!.label.toLowerCase()

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitle title="Laporan penjualan">
        <Segmented label="Rentang laporan" value={days} onChange={setDays} options={RANGES.map((r) => ({ value: r.days as number, label: r.label }))} />
        <Button disabled={!sales?.length} onClick={exportExcel}>
          Unduh Excel
        </Button>
      </PageTitle>

      <div className="mb-6 grid items-end gap-5 md:grid-cols-[1fr_22rem]">
        <p>
          <span className="block text-lg font-medium">Omzet {rangeLabel}</span>
          <span className="sign block text-6xl leading-tight break-words sm:text-7xl">{rupiah(summary.net)}</span>
          <span className="text-muted">Termasuk pajak</span>
        </p>
        <Ledger
          rows={[
            { label: 'Transaksi', value: summary.transactions, note: summary.reversed ? `${summary.reversed} dibatalkan atau direfund` : undefined },
            { label: 'Rata-rata per transaksi', value: rupiah(summary.average) },
            { label: 'Pajak terkumpul', value: rupiah(summary.tax) },
          ]}
        />
      </div>

      {sales?.length === 0 ? (
        <Empty title="Belum ada penjualan pada rentang ini.">Pilih rentang yang lebih panjang.</Empty>
      ) : (
        <>
          {days > 1 && (
            <section className={`mb-8 p-4 ${sheet}`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="sign text-2xl">Omzet harian</h2>
                <Button tone="quiet" className="px-0" aria-expanded={tableOpen} onClick={() => setTableOpen(!tableOpen)}>
                  {tableOpen ? 'Sembunyikan tabel' : 'Lihat sebagai tabel'}
                </Button>
              </div>
              <DailyChart points={points} />
              {tableOpen && (
                <table className="tnum mt-4 w-full text-left">
                  <thead className="border-b border-line text-muted">
                    <tr>
                      <th className="py-2 font-medium">Tanggal</th>
                      <th className="py-2 text-right font-medium">Transaksi</th>
                      <th className="py-2 text-right font-medium">Omzet</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {points.map((p) => (
                      <tr key={p.key}>
                        <td className="py-2">{shortDate(p.key)}</td>
                        <td className="py-2 text-right">{p.transactions}</td>
                        <td className="py-2 text-right">{rupiah(p.net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          )}

          <div className="grid gap-8 md:grid-cols-[3fr_2fr]">
            <section>
              <h2 className="sign mb-2 text-2xl">Produk terlaris</h2>
              <Ledger
                rows={summary.topProducts.slice(0, 8).map((p) => ({
                  label: (
                    <>
                      {p.name} <span className="text-muted">× {p.qty}</span>
                    </>
                  ),
                  value: rupiah(p.revenue),
                }))}
              />
            </section>
            <section>
              <h2 className="sign mb-2 text-2xl">Metode bayar</h2>
              <Ledger rows={(['cash', 'qris', 'card'] as const).map((m) => ({ label: METHOD_LABEL[m], value: rupiah(summary.byMethod[m]) }))} />
            </section>
          </div>
        </>
      )}
    </div>
  )
}
