import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { prepareDevice } from './data/boot'
import * as repo from './data/repo'
import { useAppUpdate } from './pwa'
import { Admin } from './screens/Admin'
import { Login } from './screens/Login'
import { Setup } from './screens/Setup'
import { Shell } from './screens/Shell'
import { reportError, useSession } from './store'
import { Toast } from './ui/kit'

export function App() {
  const ctx = useSession((s) => s.ctx)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    prepareDevice()
      .catch(reportError)
      .finally(() => setReady(true))
  }, [])

  const updateReady = useAppUpdate((s) => s.ready)
  const applyUpdate = useAppUpdate((s) => s.apply)

  // Tanpa sesi aktif tidak ada transaksi yang bisa terganggu, jadi update langsung diterapkan.
  useEffect(() => {
    if (updateReady && !ctx) applyUpdate()
  }, [updateReady, ctx, applyUpdate])

  const empty = useLiveQuery(() => repo.isDeviceEmpty(), [])

  return (
    <>
      {!ready || empty === undefined ? (
        <div className="grid h-full place-items-center sign text-2xl">Menyiapkan data di perangkat ini</div>
      ) : empty ? (
        <Setup />
      ) : !ctx ? (
        <Login />
      ) : ctx.role === 'mall' ? (
        <Admin ctx={ctx} />
      ) : (
        <Shell ctx={ctx} />
      )}
      <Toast />
    </>
  )
}
