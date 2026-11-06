import { useEffect, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { useToast } from '../store'

const rp = new Intl.NumberFormat('id-ID')
export const rupiah = (n: number) => `Rp${rp.format(n)}`
export const dateTime = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
export const shortDate = (key: string) => new Date(`${key}T12:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
export const monthLabel = (key: string) => new Date(`${key}-15T12:00:00`).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
export const METHOD_LABEL = { cash: 'Tunai', qris: 'QRIS', card: 'Kartu' } as const

/** Angka dari kolom input rupiah: titik pemisah ribuan diabaikan. */
export const parseAmount = (text: string) => Number(text.replace(/\D/g, '') || 0)
export const formatAmount = (text: string) => (text.replace(/\D/g, '') ? rp.format(parseAmount(text)) : '')

/** Warna teks yang terbaca di atas warna papan nama tenan. */
export function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.2 ? '#12263A' : '#FFFFFF'
}

type Tone = 'primary' | 'plain' | 'danger' | 'quiet'

const TONES: Record<Tone, string> = {
  primary: 'bg-sign text-ink hover:bg-sign-strong font-semibold',
  plain: 'bg-surface text-ink border border-line hover:border-ink font-medium',
  danger: 'bg-surface text-danger border border-danger hover:bg-danger hover:text-white font-medium',
  quiet: 'text-ink underline underline-offset-3 hover:text-muted font-medium',
}

export function Button({ tone = 'plain', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-11 rounded-sm px-4 disabled:opacity-45 ${TONES[tone]} ${className}`}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  )
}

const inputClass = 'min-h-11 w-full rounded-sm border border-line bg-white px-3 text-ink placeholder:text-muted/70 focus:border-ink'

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`${inputClass} ${props.className ?? ''}`} />

export function AmountInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Input {...rest} inputMode="numeric" className="tnum text-right" value={formatAmount(value)} onChange={(e) => onChange(e.target.value)} />
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    // showModal memindahkan fokus ke tombol Tutup, jadi kolom pertama difokuskan setelahnya.
    dialog.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=color])')?.focus()
  }, [])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className={`m-auto max-h-[92dvh] w-[calc(100%-2rem)] rounded-sm bg-surface text-ink ${wide ? 'max-w-3xl' : 'max-w-md'}`}
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="font-sign text-2xl font-semibold">{title}</h2>
        <Button tone="quiet" className="px-2" onClick={onClose}>
          Tutup
        </Button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  )
}

export function PageTitle({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <h1 className="font-sign text-4xl leading-none font-semibold">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-l-4 border-rail pl-3">
      <div className="text-sm text-muted">{label}</div>
      <div className="tnum font-sign text-3xl font-semibold">{value}</div>
      {note && <div className="text-sm text-muted">{note}</div>}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-muted">{children}</div>}
    </div>
  )
}

export function Toast() {
  const { message, tone, dismiss } = useToast()
  const ref = useRef<HTMLDivElement>(null)

  // Popover masuk ke top layer, sehingga pesan tetap terbaca di atas dialog yang sedang terbuka.
  useEffect(() => {
    const el = ref.current
    if (!el || !message) return
    if (el.matches(':popover-open')) el.hidePopover()
    el.showPopover()
  }, [message])

  if (!message) return null
  return (
    <div ref={ref} popover="manual" role="status" className="fixed inset-x-0 top-auto bottom-20 m-0 w-full justify-center border-0 bg-transparent px-4 [&:popover-open]:flex lg:bottom-6">
      <button
        type="button"
        onClick={dismiss}
        className={`max-w-lg rounded-sm px-5 py-3 text-left font-medium text-white shadow-lg ${tone === 'error' ? 'bg-danger' : 'bg-ok'}`}
      >
        {message}
      </button>
    </div>
  )
}

export function downloadFile(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export function pickJsonFile(onPick: (raw: unknown) => void, onError: (err: Error) => void) {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'application/json,.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      onPick(JSON.parse(await file.text()))
    } catch {
      onError(new Error('File tidak bisa dibaca. Pilih file .json dari aplikasi ini.'))
    }
  }
  input.click()
}
