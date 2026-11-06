import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import { prepareDevice } from '../data/boot'
import { DEMO_ENABLED } from '../data/demo'
import type { Backup, Tenant } from '../domain/schemas'
import { reportError, useSession, useToast } from '../store'
import { UpdateBanner } from '../ui/UpdateBanner'
import { Button, Chip, Empty, Field, FloorLabel, Input, Modal, PageTitle, PinInput, Select, UnitTag, dateTime, downloadFile, monthLabel, pickJsonFile, rupiah } from '../ui/kit'

type Rekap = Awaited<ReturnType<typeof repo.listRekap>>[number]

/** Kolom papan rekap, sama untuk kepala, baris tenan, dan baris total. */
const BOARD_COLUMNS = 'lg:grid-cols-[minmax(0,1fr)_6rem_13rem_11rem_6rem]'
/** Kolom kiri selebar angka lantai, supaya kepala dan total sejajar dengan baris tenan. */
const FLOOR_OFFSET = 'sm:pl-24'

/** Kalimat pembuka menyebut nama tenan, supaya pengelola tidak perlu mencarinya di daftar. */
function sendingSummary(activeCount: number, missing: Tenant[]) {
  if (activeCount === 0) return 'Belum ada tenan aktif.'
  if (missing.length === 0) return 'Semua tenan sudah mengirim.'
  if (missing.length === activeCount) return 'Belum ada tenan yang mengirim.'
  const names = missing.map((t) => t.name)
  if (names.length === 1) return `${names[0]} belum mengirim.`
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} dan ${names[names.length - 1]} belum mengirim.`
  return `${names.slice(0, 2).join(', ')}, dan ${names.length - 2} tenan lain belum mengirim.`
}

function TenantRow({ ctx, tenant: t, rekap: r, open, onToggle, onResetPin }: { ctx: repo.Ctx; tenant: Tenant; rekap?: Rekap; open: boolean; onToggle: () => void; onResetPin: () => void }) {
  const ok = (message: string) => useToast.getState().show(message)
  return (
    <li>
      <div className={`grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 ${BOARD_COLUMNS}`}>
        <div className="col-span-2 flex min-w-0 items-center gap-3 lg:col-span-1">
          <UnitTag unit={t.unit} color={t.color} className="min-w-20 px-2 py-2 text-xl" />
          <span className="min-w-0 break-words">
            <span className="block text-lg font-semibold">{t.name}</span>
            <span className="text-muted">{t.category}</span>
          </span>
        </div>
        <div className={`tnum lg:text-right ${r ? '' : 'hidden lg:block lg:text-muted'}`}>
          {r ? r.transactions : '-'}
          <span className="text-muted lg:hidden"> transaksi</span>
        </div>
        <div className={`tnum text-right text-lg font-semibold whitespace-nowrap ${r ? '' : 'hidden lg:block lg:font-normal lg:text-muted'}`}>{r ? rupiah(r.net) : '-'}</div>
        <div className="tnum text-muted">{r ? dateTime(r.importedAt) : <Chip>Belum mengirim</Chip>}</div>
        <div className="text-right">
          <Button aria-expanded={open} onClick={onToggle} className="px-3">
            {open ? 'Tutup' : 'Kelola'}
          </Button>
        </div>
      </div>
      {open && (
        <div className="mb-2 rounded-key bg-floor p-3">
          <div className="flex flex-wrap gap-2">
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
            <Button onClick={onResetPin}>Reset PIN</Button>
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
          </div>
          <p className="mt-2 max-w-prose text-muted">Tenan yang memakai perangkat sendiri butuh file penyiapan. Berikan filenya beserta PIN, lalu pilih Perangkat tenan saat membuka aplikasi di perangkat itu. Minta pemilik mengganti PIN setelah masuk.</p>
        </div>
      )}
    </li>
  )
}

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
  const [managing, setManaging] = useState<string | null>(null)

  const sorted = [...tenants].sort((a, b) => a.unit.localeCompare(b.unit))
  const active = sorted.filter((t) => t.active)
  const inactive = sorted.filter((t) => !t.active)
  const floors = [...new Set(active.map((t) => t.floor))].sort((a, b) => a - b)
  const rekapOf = (t: Tenant) => rekap.find((x) => x.tenantId === t.id)
  const missing = active.filter((t) => !rekapOf(t))
  const row = (t: Tenant) => (
    <TenantRow key={t.id} ctx={ctx} tenant={t} rekap={rekapOf(t)} open={managing === t.id} onToggle={() => setManaging(managing === t.id ? null : t.id)} onResetPin={() => setPinTenant(t)} />
  )
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
    <div className="h-full overflow-y-auto bg-surface">
      <header className="flex min-h-14 items-center justify-between border-b border-line bg-surface pr-2 pl-4 sm:pl-6">
        <span className="sign text-2xl">Pengelola mall</span>
        <Button tone="quiet" className="px-2" onClick={signOut}>
          Keluar
        </Button>
      </header>
      <UpdateBanner />
      <main className="mx-auto max-w-6xl p-4 sm:p-6">
        <PageTitle title={`Rekap ${monthLabel(month)}`}>
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

        <p className="mb-6 max-w-4xl text-2xl leading-snug font-medium sm:text-3xl">{sendingSummary(active.length, missing)}</p>

        {sorted.length === 0 ? (
          <Empty title="Belum ada tenan.">Tambahkan tenan pertama untuk mulai.</Empty>
        ) : (
          <section aria-label="Papan rekap tenan">
            <div className={`hidden border-b-2 border-ink pb-2 font-medium lg:block ${FLOOR_OFFSET}`} aria-hidden="true">
              <div className={`grid gap-x-4 ${BOARD_COLUMNS}`}>
                <span>Tenan</span>
                <span className="text-right">Transaksi</span>
                <span className="text-right">Omzet</span>
                <span>File diterima</span>
                <span />
              </div>
            </div>
            <div className="divide-y divide-line border-t-2 border-ink lg:border-t-0">
              {floors.map((floor) => (
                <div key={floor} className="grid gap-x-4 py-2 sm:grid-cols-[5rem_1fr]">
                  <FloorLabel floor={floor} />
                  <ul className="min-w-0 divide-y divide-line">{active.filter((t) => t.floor === floor).map(row)}</ul>
                </div>
              ))}
            </div>
            {/* Baris jumlah seperti buku kas: inilah kesimpulan papan ini. */}
            <div className={`border-t-4 border-double border-ink py-3 ${FLOOR_OFFSET}`}>
              <div className={`grid grid-cols-[1fr_auto] items-baseline gap-x-4 ${BOARD_COLUMNS}`}>
                <span className="col-span-2 font-semibold lg:col-span-1">
                  Total, {active.length - missing.length} dari {active.length} tenan
                  <span className="block font-normal text-muted">Hanya dari file yang sudah diterima</span>
                </span>
                <span className="tnum font-semibold lg:text-right">
                  {count.toLocaleString('id-ID')}
                  <span className="font-normal text-muted lg:hidden"> transaksi</span>
                </span>
                <span className="sign col-span-1 text-right text-3xl leading-tight whitespace-nowrap">{rupiah(total)}</span>
              </div>
            </div>
          </section>
        )}

        <div className="mt-4">
          <Button onClick={() => setAdding(true)}>Tambah tenan</Button>
        </div>

        {inactive.length > 0 && (
          <section className={`mt-10 ${FLOOR_OFFSET}`}>
            <h2 className="sign border-b-2 border-ink pb-2 text-2xl">Tenan nonaktif</h2>
            <ul className="divide-y divide-line">{inactive.map(row)}</ul>
          </section>
        )}

        <section className="mt-12 border-t border-line pt-5">
          <h2 className="sign mb-1 text-2xl">Perangkat ini</h2>
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
          <div className="mt-4 flex flex-wrap justify-end gap-2">
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
            <PinInput required inputMode="numeric" value={draft.ownerPin} onChange={set('ownerPin')} />
          </Field>
          <Field label="PIN kasir" hint="4 sampai 6 angka">
            <PinInput required inputMode="numeric" value={draft.cashierPin} onChange={set('cashierPin')} />
          </Field>
        </div>
        <Button tone="primary" type="submit" className="min-h-12 w-full">
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
          <PinInput autoFocus inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
        <Button tone="primary" type="submit" className="mt-3 w-full">
          Reset PIN
        </Button>
      </form>
    </Modal>
  )
}
