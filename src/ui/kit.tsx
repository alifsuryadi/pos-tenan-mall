import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
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

/** Hitam atau putih murni di atas warna tenan: kontrasnya minimal 4,58:1 untuk warna apa pun. */
export function readableOn(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.179 ? '#000000' : '#FFFFFF'
}

/** Perangkat sentuh: kolom jangan difokuskan otomatis bila keyboard layar tidak perlu. */
export const isTouch = () => window.matchMedia('(pointer: coarse)').matches

type Tone = 'primary' | 'plain' | 'danger' | 'quiet'

const TONES: Record<Tone, string> = {
  primary: 'bg-pay text-white hover:bg-pay-strong font-semibold disabled:bg-floor disabled:text-muted disabled:border disabled:border-line',
  plain: 'bg-surface text-ink border border-muted hover:bg-floor font-medium disabled:border-line disabled:text-muted disabled:hover:bg-surface',
  danger: 'bg-surface text-danger border-2 border-danger hover:bg-danger hover:text-white font-semibold',
  quiet: 'text-ink underline underline-offset-3 hover:text-muted font-medium',
}

export function Button({ tone = 'plain', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return <button type="button" {...props} className={`min-h-11 rounded-key px-4 ${TONES[tone]} ${className}`} />
}

/** Pilihan satu dari beberapa: metode bayar, jenis diskon, rentang laporan. */
export function Segmented<T extends string | number>({ label, options, value, onChange, className = '', itemClassName = 'min-h-11' }: { label: string; options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string; itemClassName?: string }) {
  return (
    <div role="group" aria-label={label} className={`flex overflow-hidden rounded-key border border-muted bg-surface ${className}`}>
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 px-3 font-medium whitespace-nowrap focus-visible:-outline-offset-4 ${itemClassName} ${i > 0 ? 'border-l border-muted' : ''} ${value === o.value ? 'bg-ink font-semibold text-white' : 'hover:bg-floor'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-sm text-muted">{hint}</span>}
    </label>
  )
}

const inputClass = 'min-h-11 w-full rounded-key border border-muted bg-surface px-3 text-ink placeholder:text-muted'

export const Input = (props: InputHTMLAttributes<HTMLInputElement>) => <input {...props} className={`${inputClass} ${props.className ?? ''}`} />
export const Select = (props: SelectHTMLAttributes<HTMLSelectElement>) => <select {...props} className={`${inputClass} ${props.className ?? ''}`} />

/** Tombol mata untuk menampilkan atau menyembunyikan PIN. Sengaja bukan submit agar aman di dalam form. */
export function RevealButton({ shown, onToggle, label = 'Tampilkan PIN', className = '' }: { shown: boolean; onToggle: () => void; label?: string; className?: string }) {
  return (
    <button type="button" aria-label={label} aria-pressed={shown} title={shown ? 'Sembunyikan PIN' : label} onClick={onToggle} className={`grid size-11 place-items-center ${className}`}>
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
        <circle cx="12" cy="12" r="3" />
        {shown && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )
}

export function PinInput({ className = '', ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={`pr-12 ${className}`} />
      <RevealButton shown={shown} onToggle={() => setShown(!shown)} className="absolute inset-y-0 right-0 text-muted hover:text-ink" />
    </div>
  )
}

export function AmountInput({ value, onChange, className = '', ...rest }: { value: string; onChange: (v: string) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return <Input {...rest} inputMode="numeric" className={`tnum text-right ${className}`} value={formatAmount(value)} onChange={(e) => onChange(e.target.value)} />
}

/** Nomor unit di atas warna tenan. Inilah satu-satunya tempat warna tenan muncul. */
export function UnitTag({ unit, color, className = 'px-2 py-1 text-lg' }: { unit: string; color: string; className?: string }) {
  return (
    <span className={`sign inline-flex shrink-0 items-center justify-center rounded-[2px] whitespace-nowrap ${className}`} style={{ background: color, color: readableOn(color) }}>
      {unit}
    </span>
  )
}

/** Angka lantai dibaca seperti papan lift, dipakai di direktori dan papan rekap. */
export function FloorLabel({ floor }: { floor: number }) {
  return (
    <h3 className="flex items-baseline gap-2 sm:block">
      <span className="text-muted">Lantai</span>
      <span className="sign block text-4xl leading-none sm:text-7xl">{floor}</span>
    </h3>
  )
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-block rounded-[2px] bg-warn px-1.5 font-semibold whitespace-nowrap text-ink">{children}</span>
}

export function Modal({ title, onClose, children, wide, noKeyboard }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; noKeyboard?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog || dialog.open) return
    dialog.showModal()
    if (noKeyboard && isTouch()) return
    // showModal memindahkan fokus ke tombol Tutup, jadi kolom pertama difokuskan setelahnya.
    dialog.querySelector<HTMLElement>('input:not([type=checkbox]):not([type=color])')?.focus()
  }, [noKeyboard])
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={title}
      className={`m-auto max-h-[94dvh] w-[calc(100%-1.5rem)] rounded-key bg-surface text-ink ${wide ? 'max-w-3xl' : 'max-w-lg'}`}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line py-2 pr-2 pl-5">
        <h2 className="sign text-2xl">{title}</h2>
        <Button tone="quiet" className="shrink-0" onClick={onClose}>
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
      <h1 className="sign text-4xl leading-none">{title}</h1>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  )
}

/** Lembar putih bergaris: dasar semua daftar dan tabel. */
export const sheet = 'rounded-key border border-line bg-surface'

/** Baris nama dan nilai. Nilai selalu rata kanan supaya mudah dibandingkan. */
export function Ledger({ rows, className = '' }: { rows: { label: ReactNode; value: ReactNode; note?: string }[]; className?: string }) {
  return (
    <dl className={`tnum divide-y divide-line ${sheet} ${className}`}>
      {rows.map((row, i) => (
        <div key={i} className="flex items-baseline justify-between gap-4 px-4 py-2.5">
          <dt>
            {row.label}
            {row.note && <span className="block text-sm text-muted">{row.note}</span>}
          </dt>
          <dd className="text-right font-semibold whitespace-nowrap">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-key border border-dashed border-muted px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
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
  // Di atas layar, supaya pesan tidak pernah menutupi tombol Bayar atau daftar produk.
  return (
    <div ref={ref} popover="manual" role="status" className="fixed inset-x-0 top-2 bottom-auto m-0 w-full justify-center border-0 bg-transparent px-4 [&:popover-open]:flex">
      <button type="button" onClick={dismiss} className={`flex min-h-12 max-w-xl items-center gap-3 rounded-key px-5 py-3 text-left font-semibold text-white ${tone === 'error' ? 'bg-danger' : 'bg-ink'}`}>
        <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {tone === 'error' ? <path d="M12 4v10M12 20h.01" /> : <path d="M4 13l5 5L20 6" />}
        </svg>
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
