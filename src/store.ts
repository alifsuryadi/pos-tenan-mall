import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Ctx } from './data/repo'
import type { Discount, Product, SaleItem } from './domain/schemas'

interface SessionState {
  ctx: Ctx | null
  signIn: (ctx: Ctx) => void
  signOut: () => void
}

/** Sesi dan keranjang bertahan saat halaman dimuat ulang, dan hilang saat tab ditutup. */
export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      ctx: null,
      signIn: (ctx) => set({ ctx }),
      signOut: () => {
        useCart.getState().clear()
        set({ ctx: null })
      },
    }),
    { name: 'pos-session', storage: createJSONStorage(() => sessionStorage) },
  ),
)

interface CartState {
  lines: SaleItem[]
  discount: Discount
  add: (p: Product) => void
  setQty: (productId: string, qty: number) => void
  setDiscount: (d: Discount) => void
  load: (lines: SaleItem[], discount: Discount) => void
  clear: () => void
}

const noDiscount: Discount = { type: 'none', value: 0 }

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      discount: noDiscount,
      add: (p) =>
        set((s) => {
          const hit = s.lines.find((l) => l.productId === p.id)
          return {
            lines: hit
              ? s.lines.map((l) => (l.productId === p.id ? { ...l, qty: l.qty + 1 } : l))
              : [...s.lines, { productId: p.id, name: p.name, sku: p.sku, price: p.price, qty: 1 }],
          }
        }),
      setQty: (productId, qty) =>
        set((s) => ({
          lines: qty <= 0 ? s.lines.filter((l) => l.productId !== productId) : s.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        })),
      setDiscount: (discount) => set({ discount }),
      load: (lines, discount) => set({ lines, discount }),
      clear: () => set({ lines: [], discount: noDiscount }),
    }),
    {
      // sessionStorage, bukan localStorage, agar keranjang tidak terbawa ke tenan lain di perangkat bersama.
      name: 'pos-cart',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (s) => ({ lines: s.lines, discount: s.discount }),
    },
  ),
)

interface ToastState {
  message: string | null
  tone: 'ok' | 'error'
  show: (message: string, tone?: 'ok' | 'error') => void
  dismiss: () => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useToast = create<ToastState>((set) => ({
  message: null,
  tone: 'ok',
  show: (message, tone = 'ok') => {
    clearTimeout(toastTimer)
    set({ message, tone })
    toastTimer = setTimeout(() => set({ message: null }), tone === 'error' ? 6000 : 3000)
  },
  dismiss: () => set({ message: null }),
}))

export function reportError(err: unknown) {
  useToast.getState().show(err instanceof Error ? err.message : 'Tindakan gagal. Coba lagi.', 'error')
}
