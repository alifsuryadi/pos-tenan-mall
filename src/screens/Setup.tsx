import { useState } from 'react'
import * as repo from '../data/repo'
import type { MallBackup } from '../domain/schemas'
import { reportError, useSession, useToast } from '../store'
import { Button, Field, PinInput, dateTime, pickJsonFile, sheet } from '../ui/kit'

export async function installTenantFile(raw: unknown) {
  try {
    const tenant = await repo.addTenantFromFile(repo.parseBackup(raw))
    useToast.getState().show(`${tenant.name} dipasang di perangkat ini.`)
  } catch (err) {
    reportError(err)
  }
}

function RestoreMallForm({ backup, onBack }: { backup: MallBackup; onBack: () => void }) {
  const signIn = useSession((s) => s.signIn)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className={`mt-8 p-5 ${sheet}`}
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        try {
          signIn(await repo.restoreMallBackup(backup, pin))
          useToast.getState().show('Backup pengelola mall dipulihkan.')
        } catch (err) {
          reportError(err)
          setBusy(false)
        }
      }}
    >
      <h2 className="sign mb-1 text-3xl">Pulihkan backup pengelola mall?</h2>
      <p className="mb-3 max-w-prose">
        File dari {dateTime(backup.exportedAt)} berisi {backup.tenants.length} tenan dan {backup.rekap.length} rekap. Perangkat ini masih kosong, jadi tidak ada data yang tertimpa.
      </p>
      <p className="mb-3 max-w-prose text-muted">Produk dan transaksi tenan tidak ada di file ini. Di perangkat bersama, pemilik memulihkannya dari backup toko masing-masing.</p>
      <Field label="PIN pengelola mall" hint="PIN yang berlaku saat backup dibuat">
        <PinInput autoFocus required inputMode="numeric" autoComplete="current-password" value={pin} onChange={(e) => setPin(e.target.value)} />
      </Field>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button onClick={onBack}>Jangan pulihkan</Button>
        <Button tone="primary" type="submit" disabled={busy}>
          Pulihkan dan masuk
        </Button>
      </div>
    </form>
  )
}

/** Tampil saat perangkat belum berisi akun apa pun. */
export function Setup() {
  const signIn = useSession((s) => s.signIn)
  const [mallForm, setMallForm] = useState(false)
  const [restoring, setRestoring] = useState<MallBackup | null>(null)
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const choice = 'block w-full p-5 text-left hover:bg-floor'

  return (
    <main className="min-h-full">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="sign text-5xl leading-none sm:text-6xl">Siapkan perangkat ini</h1>
        <p className="mt-2 text-lg text-muted">Perangkat ini akan dipakai oleh siapa?</p>

        {restoring ? (
          <RestoreMallForm backup={restoring} onBack={() => setRestoring(null)} />
        ) : mallForm ? (
          <form
            className={`mt-8 p-5 ${sheet}`}
            onSubmit={async (e) => {
              e.preventDefault()
              if (pin !== repeat) return reportError(new Error('Kedua PIN tidak sama.'))
              try {
                signIn(await repo.setupMall(pin))
              } catch (err) {
                reportError(err)
              }
            }}
          >
            <h2 className="sign mb-3 text-3xl">Buat PIN pengelola mall</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="PIN baru" hint="4 sampai 6 angka">
                <PinInput autoFocus required inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
              </Field>
              <Field label="Ulangi PIN">
                <PinInput required inputMode="numeric" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
              </Field>
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button onClick={() => setMallForm(false)}>Kembali</Button>
              <Button tone="primary" type="submit">
                Buat PIN dan masuk
              </Button>
            </div>
          </form>
        ) : (
          <div className={`mt-8 divide-y divide-line ${sheet}`}>
            <button type="button" className={choice} onClick={() => setMallForm(true)}>
              <span className="sign block text-3xl">Perangkat pengelola mall</span>
              <span className="mt-1 block text-muted">Menambahkan tenan dan menerima rekap dari tenan.</span>
            </button>
            <button type="button" className={choice} onClick={() => pickJsonFile(installTenantFile, reportError)}>
              <span className="sign block text-3xl">Perangkat tenan</span>
              <span className="mt-1 block text-muted">Pilih file penyiapan dari pengelola mall, atau file backup toko Anda.</span>
            </button>
            <button
              type="button"
              className={choice}
              onClick={() =>
                pickJsonFile((raw) => {
                  try {
                    setRestoring(repo.parseMallBackup(raw))
                  } catch (err) {
                    reportError(err)
                  }
                }, reportError)
              }
            >
              <span className="sign block text-3xl">Pulihkan perangkat pengelola mall</span>
              <span className="mt-1 block text-muted">Pilih file backup pengelola mall untuk mengembalikan daftar tenan dan rekap.</span>
            </button>
          </div>
        )}

        <p className="mt-6 max-w-prose text-muted">Semua data tersimpan hanya di perangkat ini. Buat backup secara rutin: tenan dari menu Pengaturan, pengelola mall dari bagian Perangkat ini.</p>
      </div>
    </main>
  )
}
