import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import * as repo from '../data/repo'
import { DEMO_PINS } from '../data/demo'
import type { Tenant } from '../domain/schemas'
import { reportError, useSession } from '../store'
import { Button, FloorLabel, RevealButton, Segmented, UnitTag, pickJsonFile, sheet } from '../ui/kit'
import { installTenantFile } from './Setup'

type Target = { kind: 'tenant'; tenant: Tenant } | { kind: 'mall' }

/** Layar masuk dibuat seperti papan direktori mall: pilih tenan per lantai. */
export function Login() {
  const tenants = useLiveQuery(() => repo.listTenants(), [])
  const hasMall = useLiveQuery(() => repo.hasMallAccount(), [])
  const [target, setTarget] = useState<Target | null>(null)

  if (target) return <PinScreen target={target} onBack={() => setTarget(null)} />

  const active = (tenants ?? []).filter((t) => t.active)
  const floors = [...new Set(active.map((t) => t.floor))].sort((a, b) => a - b)

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="sign text-5xl leading-none sm:text-6xl">Direktori tenan</h1>
        <p className="mt-2 text-lg text-muted">Pilih toko Anda untuk mulai berjualan.</p>

        {tenants && active.length === 0 && (
          <p className="mt-8 rounded-key border border-dashed border-muted p-6">
            {hasMall ? 'Belum ada tenan. Masuk sebagai pengelola mall untuk menambahkannya.' : 'Belum ada tenan aktif di perangkat ini.'}
          </p>
        )}

        <div className="mt-8 space-y-6">
          {floors.map((floor) => (
            <section key={floor} className="grid gap-x-4 gap-y-2 sm:grid-cols-[5rem_1fr]">
              <FloorLabel floor={floor} />
              <ul className={`self-start divide-y divide-line ${sheet}`}>
                {active
                  .filter((t) => t.floor === floor)
                  .sort((a, b) => a.unit.localeCompare(b.unit))
                  .map((t) => (
                    <li key={t.id}>
                      <button type="button" onClick={() => setTarget({ kind: 'tenant', tenant: t })} className="flex min-h-18 w-full items-center gap-4 px-3 py-2 text-left hover:bg-floor">
                        <UnitTag unit={t.unit} color={t.color} className="min-w-20 px-2 py-2 text-xl" />
                        <span className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4">
                          <span className="sign text-[28px] leading-tight break-words">{t.name}</span>
                          <span className="text-muted">{t.category}</span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-x-8 border-t border-line pt-4">
          {hasMall && (
            <Button tone="quiet" className="px-0" onClick={() => setTarget({ kind: 'mall' })}>
              Masuk sebagai pengelola mall
            </Button>
          )}
          <Button tone="quiet" className="px-0" onClick={() => pickJsonFile(installTenantFile, reportError)}>
            Pasang tenan dari file
          </Button>
        </div>
      </div>
    </main>
  )
}

function PinScreen({ target, onBack }: { target: Target; onBack: () => void }) {
  const signIn = useSession((s) => s.signIn)
  const tenantId = target.kind === 'mall' ? 'mall' : target.tenant.id
  const users = useLiveQuery(() => repo.listUsers(tenantId), [tenantId])
  const [userId, setUserId] = useState<string | null>(null)
  const [pin, setPin] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const selected = userId ?? (users?.length === 1 ? users[0].id : null)

  const submit = async (value: string) => {
    if (!selected || busy) return
    setBusy(true)
    try {
      signIn(await repo.login(selected, value))
    } catch (err) {
      reportError(err)
      setPin('')
      setReveal(false)
    } finally {
      setBusy(false)
    }
  }

  const press = (digit: string) => {
    if (pin.length < 6) setPin(pin + digit)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p))
      if (e.key === 'Backspace') setPin((p) => p.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title = target.kind === 'tenant' ? target.tenant.name : 'Pengelola mall'
  const demoHint = DEMO_PINS && (target.kind === 'mall' ? `PIN contoh: ${DEMO_PINS.mall}` : `PIN contoh: pemilik ${DEMO_PINS.owner}, kasir ${DEMO_PINS.cashier}`)
  const key = 'min-h-18 rounded-key border border-muted bg-surface hover:bg-floor active:bg-line'

  return (
    <main className="grid min-h-full md:grid-cols-[1fr_27rem]">
      <section className="flex flex-col justify-between gap-6 p-4 sm:p-8">
        <Button tone="quiet" className="self-start px-0" onClick={onBack}>
          Kembali ke direktori
        </Button>
        <div>
          {target.kind === 'tenant' && <UnitTag unit={target.tenant.unit} color={target.tenant.color} className="mb-3 px-3 py-1.5 text-2xl" />}
          <h1 className="sign text-5xl leading-none break-words sm:text-7xl">{title}</h1>
        </div>
      </section>

      <section className="flex flex-col justify-center gap-4 border-line bg-surface p-4 sm:p-8 md:border-l">
        {(users?.length ?? 0) > 1 && (
          <Segmented
            label="Pilih akun"
            itemClassName="min-h-14 text-lg"
            value={selected ?? ''}
            onChange={(id) => {
              setUserId(id)
              setPin('')
              setReveal(false)
            }}
            options={users!.map((u) => ({ value: u.id, label: u.name }))}
          />
        )}
        <div className="relative">
          <div aria-live="polite" aria-label={`${pin.length} angka PIN terisi`} className="flex h-12 items-center justify-center gap-3">
            {pin.length === 0 ? (
              <span className="text-muted">Masukkan PIN</span>
            ) : (
              Array.from(pin).map((digit, i) =>
                reveal ? (
                  <span key={i} className="sign text-4xl">
                    {digit}
                  </span>
                ) : (
                  <span key={i} className="size-4 rounded-full bg-ink" />
                ),
              )
            )}
          </div>
          {pin.length > 0 && <RevealButton shown={reveal} onToggle={() => setReveal(!reveal)} className="absolute top-0.5 right-0" />}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className={`sign text-4xl ${key}`}>
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setPin(pin.slice(0, -1))} className={`font-medium ${key}`}>
            Hapus
          </button>
          <button type="button" onClick={() => press('0')} className={`sign text-4xl ${key}`}>
            0
          </button>
          <Button tone="primary" className="min-h-18 text-lg" disabled={!selected || pin.length < 4 || busy} onClick={() => submit(pin)}>
            Masuk
          </Button>
        </div>
        <p className="min-h-6 text-center text-muted">{selected ? demoHint : 'Pilih akun dulu.'}</p>
      </section>
    </main>
  )
}
