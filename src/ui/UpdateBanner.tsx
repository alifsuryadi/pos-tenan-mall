import { useAppUpdate } from '../pwa'

export function UpdateBanner() {
  const { ready, apply } = useAppUpdate()
  if (!ready) return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-ink px-4 py-1.5 font-medium text-white">
      <span>Versi baru tersedia. Isi struk yang sedang berjalan tetap tersimpan.</span>
      <button type="button" onClick={apply} className="min-h-11 font-semibold underline underline-offset-3">
        Muat ulang
      </button>
    </div>
  )
}
