import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import { prepareDevice } from '../data/boot'
import { DEMO_ENABLED } from '../data/demo'
import type { Backup, Tenant } from '../domain/schemas'
import { reportError, useSession, useToast } from '../store'
import { UpdateBanner } from '../ui/UpdateBanner'
import { Button, Empty, Field, Input, Modal, PageTitle, Select, Stat, dateTime, downloadFile, monthLabel, pickJsonFile, readableOn, rupiah } from '../ui/kit'

export function Admin({ ctx }: { ctx: repo.Ctx }) {
  const signOut = useSession((s) => s.signOut)
  const tenants = useLiveQuery(() => repo.listTenants(), []) ?? []
  const months = useLiveQuery(() => repo.listRekapMonths(), []) ?? []
  const [chosen, setChosen] = useState<string | null>(null)
  const month = chosen ?? months[0] ?? repo.previousMonth()
  const rekap = useLiveQuery(() => repo.listRekap(month), [month]) ?? []
  const [adding, setAdding] = useState(false)
  const [restoring, setRestoring] = useState<Backup | null>(null)
  const [erasing, setErasing] = useState(false)
  const [pinTenant, setPinTenant] = useState<Tenant | null>(null)

  const sorted = [...tenants].sort((a, b) => a.unit.localeCompare(b.unit))
  const total = rekap.reduce((sum, r) => sum + r.net, 0)
  const count = rekap.reduce((sum, r) => sum + r.transactions, 0)
  const ok = (message: string) => useToast.getState().show(message)

  const importFile = () =>
    pickJsonFile(async (raw) => {
      try {
        const r = await repo.importRekap(ctx, raw)
        setChosen(r.month)
        ok(`Rekap ${r.tenantName} untuk ${monthLabel(r.month)} diterima.`)
      } catch (err) {
        reportError(err)
      }
    }, reportError)

  const exportCsv = () => {
    const rows = [['Unit', 'Tenan', 'Bulan', 'Omzet', 'Transaksi', 'Tunai', 'QRIS', 'Kartu'], ...rekap.map((r) => [r.unit, r.tenantName, r.month, r.net, r.transactions, r.byMethod.cash, r.byMethod.qris, r.byMethod.card])]
    const cell = (v: string | number) => `"${String(v).replaceAll('"', '""').replace(/^([=+\-@])/, "'$1")}"`
    downloadFile(`rekap-mall-${month}.csv`, '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n'), 'text/csv')
  }

  return (
    <div className="h-full overflow-y-auto">
      <header className="flex items-center justify-between bg-rail px-4 py-3 text-white sm:px-6">
        <span className="font-sign text-2xl font-semibold">Pengelola mall</span>
        <button type="button" onClick={signOut} className="min-h-11 font-medium underline underline-offset-4">
          Kunci
        </button>
      </header>
      <UpdateBanner />
      <main className="mx-auto max-w-5xl space-y-10 p-4 sm:p-6">
        <section>
          <PageTitle title="Rekap tenan">
            {months.length > 0 && (
              <Select aria-label="Bulan rekap" value={month} onChange={(e) => setChosen(e.target.value)} className="w-auto!">
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </Select>
            )}
            <Button disabled={!rekap.length} onClick={exportCsv}>
              Unduh CSV
            </Button>
            <Button tone="primary" onClick={importFile}>
              Terima file rekap
            </Button>
          </PageTitle>
          <div className="mb-5 grid grid-cols-2 gap-5 md:grid-cols-3">
            <Stat label={`Omzet ${monthLabel(month)}`} value={rupiah(total)} note="Hanya dari file yang sudah diterima" />
            <Stat label="Transaksi" value={count.toLocaleString('id-ID')} />
            <Stat label="Tenan sudah mengirim" value={`${rekap.length} dari ${tenants.filter((t) => t.active).length}`} />
          </div>
          <div className="overflow-x-auto bg-surface">
            <table className="tnum w-full text-left">
              <thead className="border-b border-line text-sm text-muted">
                <tr>
                  <th className="p-3 font-medium">Tenan</th>
                  <th className="p-3 text-right font-medium">Omzet</th>
                  <th className="p-3 text-right font-medium">Transaksi</th>
                  <th className="p-3 font-medium">File diterima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {sorted
                  .filter((t) => t.active)
                  .map((t) => {
                    const r = rekap.find((x) => x.tenantId === t.id)
                    return (
                      <tr key={t.id}>
                        <td className="p-3">
                          <span className="font-medium">{t.name}</span> <span className="text-sm text-muted">{t.unit}</span>
                        </td>
                        <td className="p-3 text-right">{r ? rupiah(r.net) : '-'}</td>
                        <td className="p-3 text-right">{r ? r.transactions : '-'}</td>
                        <td className={`p-3 ${r ? 'text-muted' : 'font-semibold text-warn'}`}>{r ? dateTime(r.importedAt) : 'Belum mengirim'}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <PageTitle title="Daftar tenan">
            <Button tone="primary" onClick={() => setAdding(true)}>
              Tambah tenan
            </Button>
          </PageTitle>
          <p className="mb-3 max-w-prose text-muted">
            Tenan yang memakai perangkat sendiri butuh file penyiapan. Berikan filenya beserta PIN, lalu pilih Perangkat tenan saat membuka aplikasi di perangkat itu. Minta pemilik mengganti PIN setelah masuk.
          </p>
          {sorted.length === 0 && <Empty title="Belum ada tenan.">Tambahkan tenan pertama untuk mulai.</Empty>}
          <ul className="space-y-1">
            {sorted.map((t) => (
              <li key={t.id} className={`flex min-h-16 flex-wrap items-stretch bg-surface ${t.active ? '' : 'opacity-60'}`}>
                <span className="flex w-24 items-center justify-center font-sign text-2xl font-semibold" style={{ background: t.color, color: readableOn(t.color) }}>
                  {t.unit}
                </span>
                <span className="min-w-40 flex-1 self-center px-4 py-2">
                  <span className="block font-medium">{t.name}</span>
                  <span className="text-sm text-muted">
                    {t.category}, lantai {t.floor}
                    {!t.active && ', nonaktif'}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-1 p-2">
                  <Button
                    onClick={async () => {
                      try {
                        const setup = await repo.exportTenantSetup(ctx, t.id)
                        downloadFile(`penyiapan-${t.unit}.json`, JSON.stringify(setup))
                        ok(`File penyiapan ${t.name} diunduh. Pasang di perangkat tenan.`)
                      } catch (err) {
                        reportError(err)
                      }
                    }}
                  >
                    Unduh file penyiapan
                  </Button>
                  <Button onClick={() => setPinTenant(t)}>Reset PIN</Button>
                  <Button
                    onClick={async () => {
                      try {
                        await repo.setTenantActive(ctx, t.id, !t.active)
                        ok(t.active ? `${t.name} dinonaktifkan.` : `${t.name} diaktifkan.`)
                      } catch (err) {
                        reportError(err)
                      }
                    }}
                  >
                    {t.active ? 'Nonaktifkan' : 'Aktifkan'}
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-1 font-sign text-3xl font-semibold">Perangkat ini</h2>
          <p className="mb-3 max-w-prose text-muted">{DEMO_ENABLED ? 'Pulihkan backup tenan ke perangkat baru, atau kembalikan perangkat ini ke data contoh.' : 'Pulihkan backup tenan ke perangkat baru, atau kosongkan perangkat ini.'}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() =>
                pickJsonFile((raw) => {
                  try {
                    setRestoring(repo.parseBackup(raw))
                  } catch (err) {
                    reportError(err)
                  }
                }, reportError)
              }
            >
              Pulihkan backup tenan
            </Button>
            <Button tone="danger" onClick={() => setErasing(true)}>
              Hapus semua data perangkat
            </Button>
          </div>
        </section>
      </main>

      {adding && <TenantForm ctx={ctx} onClose={() => setAdding(false)} />}
      {pinTenant && <ResetPin ctx={ctx} tenant={pinTenant} onClose={() => setPinTenant(null)} />}
      {restoring && (
        <Modal title="Pulihkan backup?" onClose={() => setRestoring(null)}>
          <p>
            Data {restoring.tenant.name} di perangkat ini akan diganti dengan file dari {dateTime(restoring.exportedAt)} ({restoring.sales.length} transaksi).
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setRestoring(null)}>Jangan pulihkan</Button>
            <Button
              tone="danger"
              onClick={async () => {
                try {
                  await repo.restoreBackup(ctx, restoring)
                  ok(`Data ${restoring.tenant.name} dipulihkan.`)
                  setRestoring(null)
                } catch (err) {
                  reportError(err)
                }
              }}
            >
              Ganti dan pulihkan
            </Button>
          </div>
        </Modal>
      )}
      {erasing && (
        <Modal title="Hapus semua data?" onClose={() => setErasing(false)}>
          <p>Semua tenan, penjualan, dan rekap di perangkat ini akan dihapus permanen{DEMO_ENABLED ? ', lalu diganti dengan data contoh' : ', dan perangkat harus disiapkan ulang'}. Tindakan ini tidak bisa dibatalkan.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button onClick={() => setErasing(false)}>Jangan hapus</Button>
            <Button
              tone="danger"
              onClick={async () => {
                try {
                  await repo.eraseDevice()
                  await prepareDevice()
                  signOut()
                } catch (err) {
                  reportError(err)
                }
              }}
            >
              Hapus semua data
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function TenantForm({ ctx, onClose }: { ctx: repo.Ctx; onClose: () => void }) {
  const [draft, setDraft] = useState({ name: '', unit: '', floor: '1', category: '', color: '#2F4B9B', ownerPin: '', cashierPin: '' })
  const set = (key: keyof typeof draft) => (e: { target: { value: string } }) => setDraft({ ...draft, [key]: e.target.value })
  return (
    <Modal title="Tambah tenan" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await repo.createTenant(ctx, { ...draft, floor: Number(draft.floor) })
            useToast.getState().show(`${draft.name} ditambahkan.`)
            onClose()
          } catch (err) {
            reportError(err)
          }
        }}
      >
        <Field label="Nama tenan">
          <Input autoFocus required value={draft.name} onChange={set('name')} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nomor unit">
            <Input required placeholder="L1-07" value={draft.unit} onChange={set('unit')} />
          </Field>
          <Field label="Lantai">
            <Input required inputMode="numeric" value={draft.floor} onChange={set('floor')} />
          </Field>
          <Field label="Jenis usaha">
            <Input required value={draft.category} onChange={set('category')} />
          </Field>
          <Field label="Warna papan nama">
            <Input type="color" value={draft.color} onChange={set('color')} className="p-1" />
          </Field>
          <Field label="PIN pemilik" hint="4 sampai 6 angka">
            <Input required type="password" inputMode="numeric" value={draft.ownerPin} onChange={set('ownerPin')} />
          </Field>
          <Field label="PIN kasir" hint="4 sampai 6 angka">
            <Input required type="password" inputMode="numeric" value={draft.cashierPin} onChange={set('cashierPin')} />
          </Field>
        </div>
        <Button tone="primary" type="submit" className="w-full">
          Tambah tenan
        </Button>
      </form>
    </Modal>
  )
}

function ResetPin({ ctx, tenant, onClose }: { ctx: repo.Ctx; tenant: Tenant; onClose: () => void }) {
  const users = useLiveQuery(() => repo.listUsers(tenant.id), [tenant.id]) ?? []
  const owner = users.find((u) => u.role === 'owner')
  const [pin, setPin] = useState('')
  return (
    <Modal title={`Reset PIN pemilik ${tenant.name}`} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!owner) return
          try {
            await repo.changePin(ctx, owner.id, pin)
            useToast.getState().show('PIN pemilik direset.')
            onClose()
          } catch (err) {
            reportError(err)
          }
        }}
      >
        <Field label="PIN baru" hint="4 sampai 6 angka">
          <Input autoFocus type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
        <Button tone="primary" type="submit" className="mt-3 w-full">
          Reset PIN
        </Button>
      </form>
    </Modal>
  )
}
