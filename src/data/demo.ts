/** Data contoh hanya aktif di lokal dan staging. Build produksi tidak memuatnya sama sekali. */
export const DEMO_ENABLED = import.meta.env.VITE_DEMO_DATA === 'true'

export const DEMO_PINS = DEMO_ENABLED ? { owner: '1111', cashier: '2222', mall: '9999' } : null
