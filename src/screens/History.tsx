import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import { dayKey } from '../domain/calc'
import type { Sale, Tenant } from '../domain/schemas'
import { reportError, useToast } from '../store'
import { ReceiptBody, printReceipt } from '../ui/Receipt'
import { Button, Empty, Field, Input, METHOD_LABEL, Modal, PageTitle, dateTime, rupiah } from '../ui/kit'

const STATUS = { completed: 'Selesai', voided: 'Dibatalkan', refunded: 'Direfund' } as const

export function History({ ctx, tenant }: { ctx: repo.Ctx; tenant: Tenant }) {
  const [day, setDay] = useState(dayKey(new Date()))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const settings = useLiveQuery(() => repo.getSettings(ctx), [ctx.tenantId])
  const sales = useLiveQuery(() => repo.listSales(ctx, new Date(`${day}T00:00:00`), new Date(`${day}T23:59:59.999`)), [ctx.tenantId, day])
  const selected = sales?.find((s) => s.id === selectedId)

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitle title="Riwayat transaksi">
        <label className="flex items-center gap-2 font-medium">
          Tanggal
          <Input type="date" value={day} max={dayKey(new Date())} onChange={(e) => e.target.value && setDay(e.target.value)} className="w-auto!" />
        </label>
      </PageTitle>
      {sales?.length === 0 ? (
        <Empty title="Tidak ada transaksi pada tanggal ini.">Pilih tanggal lain, atau catat penjualan di menu Kasir.</Empty>
      ) : (
        <ul className="divide-y divide-line bg-surface">
          {sales?.map((sale) => (
            <li key={sale.id}>
              <button type="button" onClick={() => setSelectedId(sale.id)} className="tnum grid min-h-14 w-full grid-cols-[1fr_auto] gap-x-4 px-4 py-2 text-left hover:bg-white">
                <span className="font-medium">{sale.number}</span>
                <span className={`text-right font-sign text-xl font-semibold ${sale.status !== 'completed' ? 'text-muted line-through' : ''}`}>{rupiah(sale.total)}</span>
                <span className="text-sm text-muted">
                  {new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}, {METHOD_LABEL[sale.method]}, {sale.cashierName}
                </span>
                <span className={`text-right text-sm ${sale.status === 'completed' ? 'text-muted' : 'font-semibold text-danger'}`}>{STATUS[sale.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && settings && <SaleDialog ctx={ctx} sale={selected} tenant={tenant} settings={settings} onClose={() => setSelectedId(null)} />}
    </div>
  )
}

function SaleDialog({ ctx, sale, tenant, settings, onClose }: { ctx: repo.Ctx; sale: Sale; tenant: Tenant; settings: NonNullable<Awaited<ReturnType<typeof repo.getSettings>>>; onClose: () => void }) {
  const [reversing, setReversing] = useState(false)
  const [reason, setReason] = useState('')
  const [pin, setPin] = useState('')
  const open = useLiveQuery(async () => (await repo.getOpenShift(ctx)) ?? null, [ctx.tenantId])
  const willVoid = open?.id === sale.shiftId
  const word = willVoid ? 'Batalkan' : 'Refund'

  return (
    <Modal title={sale.number} onClose={onClose}>
      <div className="max-h-80 overflow-y-auto border border-line bg-paper p-3">
        <ReceiptBody sale={sale} tenant={tenant} settings={settings} />
      </div>
      {sale.reversal && (
        <p className="mt-3 text-sm">
          {STATUS[sale.status]} oleh {sale.reversal.by}, {dateTime(sale.reversal.at)}. Alasan: {sale.reversal.reason}
        </p>
      )}
      {reversing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              const result = await repo.reverseSale(ctx, sale.id, reason, pin)
              useToast.getState().show(result === 'voided' ? 'Transaksi dibatalkan. Stok dikembalikan.' : 'Refund dicatat. Stok dikembalikan.')
              onClose()
            } catch (err) {
              reportError(err)
            }
          }}
        >
          <p className="text-sm text-muted">
            {willVoid ? 'Seluruh transaksi dibatalkan dan stok dikembalikan.' : `Refund seluruh transaksi. ${sale.method === 'cash' ? 'Uang tunai keluar dari laci shift berjalan.' : 'Kembalikan dana lewat metode pembayarannya.'}`}
          </p>
          <Field label="Alasan">
            <Input autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {ctx.role !== 'owner' && (
            <Field label="PIN pemilik">
              <Input type="password" inputMode="numeric" required value={pin} onChange={(e) => setPin(e.target.value)} />
            </Field>
          )}
          <Button tone="danger" type="submit" className="w-full">
            {word} transaksi
          </Button>
        </form>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={() => printReceipt(sale, tenant, settings)}>Cetak ulang</Button>
          {sale.status === 'completed' && (
            <Button
              tone="danger"
              onClick={() => (open ? setReversing(true) : reportError(new Error('Buka shift dulu sebelum membatalkan transaksi.')))}
            >
              {word}
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
}
