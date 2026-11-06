import { useAppUpdate } from '../pwa'

export function UpdateBanner() {
  const { ready, apply } = useAppUpdate()
  if (!ready) return null
  return (
    <div role="status" className="flex flex-wrap items-center justify-between gap-2 bg-rail-soft px-4 py-2 font-medium text-white">
      <span>Versi baru tersedia. Isi struk yang sedang berjalan tetap tersimpan.</span>
      <button type="button" onClick={apply} className="min-h-9 underline underline-offset-3">
        Muat ulang
      </button>
    </div>
  )
}
