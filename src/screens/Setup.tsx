import { useState } from 'react'
import * as repo from '../data/repo'
import { reportError, useSession, useToast } from '../store'
import { Button, Field, Input, pickJsonFile } from '../ui/kit'

export async function installTenantFile(raw: unknown) {
  try {
    const tenant = await repo.addTenantFromFile(repo.parseBackup(raw))
    useToast.getState().show(`${tenant.name} dipasang di perangkat ini.`)
  } catch (err) {
    reportError(err)
  }
}

/** Tampil saat perangkat belum berisi akun apa pun. */
export function Setup() {
  const signIn = useSession((s) => s.signIn)
  const [mallForm, setMallForm] = useState(false)
  const [pin, setPin] = useState('')
  const [repeat, setRepeat] = useState('')
  const choice = 'block w-full bg-rail-soft p-5 text-left hover:bg-white hover:text-ink'

  return (
    <main className="min-h-full bg-rail text-white">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8 sm:py-12">
        <h1 className="font-sign text-5xl leading-none font-semibold sm:text-7xl">Siapkan perangkat ini</h1>
        <p className="mt-3 text-lg text-white/80">Perangkat ini akan dipakai oleh siapa?</p>

        {mallForm ? (
          <form
            className="mt-8 bg-surface p-5 text-ink"
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
            <h2 className="mb-3 font-sign text-3xl font-semibold">Buat PIN pengelola mall</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="PIN baru" hint="4 sampai 6 angka">
                <Input autoFocus required type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value)} />
              </Field>
              <Field label="Ulangi PIN">
                <Input required type="password" inputMode="numeric" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
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
          <div className="mt-8 space-y-1">
            <button type="button" className={choice} onClick={() => setMallForm(true)}>
              <span className="block font-sign text-3xl font-medium">Perangkat pengelola mall</span>
              <span className="mt-1 block opacity-80">Menambahkan tenan dan menerima rekap dari tenan.</span>
            </button>
            <button type="button" className={choice} onClick={() => pickJsonFile(installTenantFile, reportError)}>
              <span className="block font-sign text-3xl font-medium">Perangkat tenan</span>
              <span className="mt-1 block opacity-80">Pilih file penyiapan dari pengelola mall, atau file backup toko Anda.</span>
            </button>
          </div>
        )}

        <p className="mt-8 max-w-prose text-white/80">Semua data tersimpan hanya di perangkat ini. Buat backup secara rutin dari menu Pengaturan.</p>
      </div>
    </main>
  )
}
