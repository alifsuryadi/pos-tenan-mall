import { registerSW } from 'virtual:pwa-register'
import { create } from 'zustand'

interface AppUpdateState {
  ready: boolean
  apply: () => void
}

/** Versi baru menunggu sampai diterapkan, supaya halaman tidak termuat ulang di tengah transaksi. */
export const useAppUpdate = create<AppUpdateState>(() => ({ ready: false, apply: () => undefined }))

const CHECK_INTERVAL_MS = 60 * 60 * 1000

export function startAppUpdates() {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh: () => useAppUpdate.setState({ ready: true }),
    // Perangkat kasir bisa terbuka berhari-hari, jadi versi baru diperiksa berkala.
    onRegisteredSW: (_url, registration) => {
      if (!registration) return
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => undefined)
      }, CHECK_INTERVAL_MS)
    },
  })
  useAppUpdate.setState({ apply: () => void updateSW(true) })
}
