import { useEffect, useState } from 'react'
import { seedIfEmpty } from './data/seed'
import { Admin } from './screens/Admin'
import { Login } from './screens/Login'
import { Shell } from './screens/Shell'
import { reportError, useSession } from './store'
import { Toast } from './ui/kit'

export function App() {
  const ctx = useSession((s) => s.ctx)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    seedIfEmpty()
      .catch(reportError)
      .finally(() => setReady(true))
  }, [])

  return (
    <>
      {!ready ? (
        <div className="grid h-full place-items-center font-sign text-2xl">Menyiapkan data di perangkat ini</div>
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
