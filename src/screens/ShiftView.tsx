import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import { expectedCash, summarize } from '../domain/calc'
import type { Shift } from '../domain/schemas'
import { reportError, useToast } from '../store'
import { AmountInput, Button, Field, Ledger, METHOD_LABEL, PageTitle, dateTime, parseAmount, rupiah, sheet } from '../ui/kit'

export function OpenShiftForm({ ctx }: { ctx: repo.Ctx }) {
  const [cash, setCash] = useState('')
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await repo.openShift(ctx, parseAmount(cash))
          useToast.getState().show('Shift dibuka.')
        } catch (err) {
          reportError(err)
        }
      }}
    >
      <Field label="Modal awal di laci kas">
        <AmountInput autoFocus value={cash} onChange={setCash} placeholder="0" />
      </Field>
      <Button tone="primary" type="submit" className="mt-3 w-full">
        Buka shift
      </Button>
    </form>
  )
}

function CurrentShift({ ctx, shift }: { ctx: repo.Ctx; shift: Shift }) {
  const sales = useLiveQuery(() => repo.salesForShift(ctx, shift), [shift.id]) ?? []
  const [counted, setCounted] = useState('')
  const own = summarize(sales.filter((s) => s.shiftId === shift.id))
  const expected = expectedCash(shift, sales)
  const diff = parseAmount(counted) - expected

  return (
    <section className="mb-8">
      <h2 className="sign mb-1 text-2xl">Shift berjalan</h2>
      <p className="mb-4 text-muted">
        Dibuka {dateTime(shift.openedAt)} oleh {shift.cashierName}, modal {rupiah(shift.openingCash)}
      </p>
      <div className="grid items-start gap-5 md:grid-cols-2">
        <Ledger
          rows={[
            { label: 'Transaksi', value: own.transactions, note: own.reversed ? `${own.reversed} dibatalkan` : undefined },
            ...(['cash', 'qris', 'card'] as const).map((m) => ({ label: METHOD_LABEL[m], value: rupiah(own.byMethod[m]) })),
          ]}
        />
        <form
          className={`p-4 ${sheet}`}
          onSubmit={async (e) => {
            e.preventDefault()
            if (!counted) return reportError(new Error('Hitung uang di laci dan isi jumlahnya dulu.'))
            try {
              await repo.closeShift(ctx, shift.id, parseAmount(counted))
              useToast.getState().show('Shift ditutup.')
            } catch (err) {
              reportError(err)
            }
          }}
        >
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
            <span className="font-medium">Kas seharusnya</span>
            <span className="sign ml-auto text-4xl">{rupiah(expected)}</span>
          </div>
          <Field label="Uang yang dihitung di laci">
            <AmountInput value={counted} onChange={setCounted} placeholder="0" className="min-h-12 text-lg" />
          </Field>
          {counted && (
            <div className={`tnum mt-2 flex justify-between text-lg font-semibold ${diff === 0 ? 'text-pay' : 'text-danger'}`}>
              <span>{diff === 0 ? 'Pas' : diff > 0 ? 'Lebih' : 'Kurang'}</span>
              <span>{rupiah(Math.abs(diff))}</span>
            </div>
          )}
          <Button tone="primary" type="submit" className="mt-3 min-h-12 w-full">
            Tutup shift
          </Button>
        </form>
      </div>
    </section>
  )
}

export function ShiftView({ ctx }: { ctx: repo.Ctx }) {
  const open = useLiveQuery(async () => (await repo.getOpenShift(ctx)) ?? null, [ctx.tenantId])
  const shifts = useLiveQuery(() => repo.listShifts(ctx), [ctx.tenantId]) ?? []
  const closed = shifts.filter((s) => s.closedAt)

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitle title="Shift kasir" />
      {open === null && (
        <section className="mb-8 max-w-md">
          <h2 className="sign mb-3 text-2xl">Belum ada shift berjalan</h2>
          <OpenShiftForm ctx={ctx} />
        </section>
      )}
      {open && <CurrentShift ctx={ctx} shift={open} />}

      <h2 className="sign mb-2 text-2xl">Shift sebelumnya</h2>
      <div className={`overflow-x-auto ${sheet}`}>
        <table className="tnum w-full min-w-xl text-left">
          <thead className="border-b border-line text-muted">
            <tr>
              <th className="p-3 font-medium">Ditutup</th>
              <th className="p-3 font-medium">Kasir</th>
              <th className="p-3 text-right font-medium">Kas seharusnya</th>
              <th className="p-3 text-right font-medium">Dihitung</th>
              <th className="p-3 text-right font-medium">Selisih</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {closed.map((s) => {
              const diff = (s.countedCash ?? 0) - (s.expectedCash ?? 0)
              return (
                <tr key={s.id}>
                  <td className="p-3 whitespace-nowrap">{dateTime(s.closedAt!)}</td>
                  <td className="p-3">{s.cashierName}</td>
                  <td className="p-3 text-right whitespace-nowrap">{rupiah(s.expectedCash ?? 0)}</td>
                  <td className="p-3 text-right whitespace-nowrap">{rupiah(s.countedCash ?? 0)}</td>
                  <td className={`p-3 text-right font-semibold whitespace-nowrap ${diff ? 'text-danger' : ''}`}>{diff === 0 ? 'Pas' : `${diff > 0 ? '+' : '-'}${rupiah(Math.abs(diff))}`}</td>
                </tr>
              )
            })}
            {closed.length === 0 && (
              <tr>
                <td colSpan={5} className="p-6 text-center text-muted">
                  Shift yang ditutup akan muncul di sini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
