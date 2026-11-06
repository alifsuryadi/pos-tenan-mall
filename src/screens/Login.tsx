import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import * as repo from '../data/repo'
import { DEMO_PINS } from '../data/demo'
import type { Tenant } from '../domain/schemas'
import { reportError, useSession } from '../store'
import { Button, pickJsonFile, readableOn } from '../ui/kit'
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
    <main className="min-h-full bg-rail text-white">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="font-sign text-5xl leading-none font-semibold sm:text-7xl">Direktori tenan</h1>
        <p className="mt-3 text-lg text-white/80">Pilih toko Anda untuk mulai berjualan.</p>

        {tenants && active.length === 0 && (
          <p className="mt-8 border border-dashed border-white/40 p-6">
            {hasMall ? 'Belum ada tenan. Masuk sebagai pengelola mall untuk menambahkannya.' : 'Belum ada tenan aktif di perangkat ini.'}
          </p>
        )}

        <div className="mt-8 space-y-8">
          {floors.map((floor) => (
            <section key={floor} className="grid gap-3 sm:grid-cols-[6rem_1fr]">
              <h2 className="font-sign text-3xl font-semibold text-sign">Lantai {floor}</h2>
              <ul className="space-y-1">
                {active
                  .filter((t) => t.floor === floor)
                  .sort((a, b) => a.unit.localeCompare(b.unit))
                  .map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setTarget({ kind: 'tenant', tenant: t })}
                        className="flex min-h-16 w-full items-stretch bg-rail-soft text-left hover:bg-white hover:text-ink"
                      >
                        <span
                          className="flex w-24 shrink-0 items-center justify-center font-sign text-2xl font-semibold"
                          style={{ background: t.color, color: readableOn(t.color) }}
                        >
                          {t.unit}
                        </span>
                        <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 self-center px-4 py-2">
                          <span className="font-sign text-3xl font-medium">{t.name}</span>
                          <span className="opacity-75">{t.category}</span>
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap gap-x-8 border-t border-white/25 pt-5">
          {hasMall && (
            <button type="button" onClick={() => setTarget({ kind: 'mall' })} className="min-h-11 font-medium underline underline-offset-4">
              Masuk sebagai pengelola mall
            </button>
          )}
          <button type="button" onClick={() => pickJsonFile(installTenantFile, reportError)} className="min-h-11 font-medium underline underline-offset-4">
            Pasang tenan dari file
          </button>
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

  const color = target.kind === 'tenant' ? target.tenant.color : '#FFC629'
  const title = target.kind === 'tenant' ? target.tenant.name : 'Pengelola mall'
  const demoHint = DEMO_PINS && (target.kind === 'mall' ? `PIN contoh: ${DEMO_PINS.mall}` : `PIN contoh: pemilik ${DEMO_PINS.owner}, kasir ${DEMO_PINS.cashier}`)

  return (
    <main className="grid min-h-full bg-rail text-white md:grid-cols-[1fr_26rem]">
      <section className="flex flex-col justify-between p-6 sm:p-10" style={{ background: color, color: readableOn(color) }}>
        <button type="button" onClick={onBack} className="min-h-11 self-start font-medium underline underline-offset-4">
          Kembali ke direktori
        </button>
        <div className="mt-8">
          {target.kind === 'tenant' && <div className="font-sign text-3xl font-medium">{target.tenant.unit}</div>}
          <h1 className="font-sign text-6xl leading-none font-semibold sm:text-8xl">{title}</h1>
        </div>
      </section>

      <section className="flex flex-col justify-center gap-5 p-6 sm:p-10">
        {(users?.length ?? 0) > 1 && (
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Pilih akun">
            {users!.map((u) => (
              <button
                key={u.id}
                type="button"
                aria-pressed={selected === u.id}
                onClick={() => {
                  setUserId(u.id)
                  setPin('')
                }}
                className={`min-h-12 font-medium ${selected === u.id ? 'bg-sign text-ink' : 'bg-rail-soft text-white'}`}
              >
                {u.name}
              </button>
            ))}
          </div>
        )}
        <div aria-live="polite" aria-label={`${pin.length} angka PIN terisi`} className="flex h-10 items-center justify-center gap-3">
          {pin.length === 0 ? <span className="text-white/75">Masukkan PIN</span> : Array.from(pin).map((_, i) => <span key={i} className="size-4 rounded-full bg-sign" />)}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button key={d} type="button" onClick={() => press(d)} className="tnum h-16 bg-rail-soft font-sign text-3xl font-medium hover:bg-white hover:text-ink">
              {d}
            </button>
          ))}
          <button type="button" onClick={() => setPin(pin.slice(0, -1))} className="h-16 bg-rail-soft font-medium hover:bg-white hover:text-ink">
            Hapus
          </button>
          <button type="button" onClick={() => press('0')} className="tnum h-16 bg-rail-soft font-sign text-3xl font-medium hover:bg-white hover:text-ink">
            0
          </button>
          <Button tone="primary" className="h-16 rounded-none" disabled={!selected || pin.length < 4 || busy} onClick={() => submit(pin)}>
            Masuk
          </Button>
        </div>
        <p className="min-h-5 text-center text-sm text-white/80">{selected ? demoHint : 'Pilih akun dulu.'}</p>
      </section>
    </main>
  )
}
