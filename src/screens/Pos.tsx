import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as repo from '../data/repo'
import { computeTotals } from '../domain/calc'
import type { Discount, PaymentMethod, Product, Sale, Settings, Tenant } from '../domain/schemas'
import { reportError, useCart, useToast } from '../store'
import { ReceiptBody, printReceipt } from '../ui/Receipt'
import { AmountInput, Button, Chip, Empty, Field, Input, METHOD_LABEL, Modal, Segmented, formatAmount, isTouch, parseAmount, rupiah, sheet } from '../ui/kit'
import { OpenShiftForm } from './ShiftView'

export function Pos({ ctx, tenant }: { ctx: repo.Ctx; tenant: Tenant }) {
  // Hasil undefined berarti masih memuat, null berarti memang tidak ada shift terbuka.
  const shift = useLiveQuery(async () => (await repo.getOpenShift(ctx)) ?? null, [ctx.tenantId])
  const products = useLiveQuery(() => repo.listProducts(ctx), [ctx.tenantId])
  const settings = useLiveQuery(() => repo.getSettings(ctx), [ctx.tenantId])
  const { lines, add } = useCart()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [mobileTab, setMobileTab] = useState<'items' | 'cart'>('items')
  const [paying, setPaying] = useState(false)
  const [done, setDone] = useState<Sale | null>(null)

  const sellable = useMemo(() => (products ?? []).filter((p) => p.active), [products])
  const categories = useMemo(() => [...new Set(sellable.map((p) => p.category))], [sellable])
  const q = query.trim().toLowerCase()
  const shown = sellable.filter((p) => (!category || p.category === category) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)))

  const addChecked = (p: Product) => {
    const inCart = lines.find((l) => l.productId === p.id)?.qty ?? 0
    if (p.trackStock && inCart >= p.stock) {
      useToast.getState().show(`Stok ${p.name} tinggal ${p.stock}.`, 'error')
      return
    }
    add(p)
  }

  const addBySku = (sku: string) => {
    const hit = sellable.find((p) => p.sku.toLowerCase() === sku.trim().toLowerCase())
    if (hit) addChecked(hit)
    else useToast.getState().show(`Barcode ${sku} tidak ada di daftar produk.`, 'error')
    return Boolean(hit)
  }

  // Scanner barcode USB mengetik seperti keyboard lalu menekan Enter.
  const scanRef = useRef(addBySku)
  scanRef.current = addBySku
  useEffect(() => {
    let buffer = ''
    let last = 0
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || document.querySelector('dialog[open]')) return
      if (e.key === 'Enter' && buffer.length >= 3) {
        e.preventDefault()
        scanRef.current(buffer)
        buffer = ''
        return
      }
      if (e.key.length === 1) {
        buffer = Date.now() - last > 80 ? e.key : buffer + e.key
        last = Date.now()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (shift === undefined || !settings) return null
  if (shift === null) {
    return (
      <div className="mx-auto max-w-md p-6">
        <h1 className="sign mb-1 text-4xl">Buka shift dulu</h1>
        <p className="mb-5 text-muted">Hitung uang di laci kas, lalu catat sebagai modal awal.</p>
        <OpenShiftForm ctx={ctx} />
      </div>
    )
  }

  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  return (
    <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[1fr_26rem] 2xl:grid-cols-[1fr_32rem]">
      <div className="flex shrink-0 border-b border-line bg-surface lg:hidden" role="tablist">
        {(['items', 'cart'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={`tnum min-h-12 flex-1 border-b-4 font-semibold ${mobileTab === tab ? 'border-ink' : 'border-transparent text-muted'}`}
          >
            {tab === 'items' ? 'Produk' : `Struk (${count})`}
          </button>
        ))}
      </div>

      <section className={`min-h-0 flex-col lg:flex ${mobileTab === 'items' ? 'flex flex-1' : 'hidden'}`}>
        <div className="shrink-0 p-3 pb-2 lg:p-4 lg:pb-3">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (q && shown.length === 1) {
                addChecked(shown[0])
                setQuery('')
              } else if (q && addBySku(query)) setQuery('')
            }}
          >
            <Input aria-label="Cari produk atau ketik barcode" placeholder="Cari produk atau ketik barcode" value={query} onChange={(e) => setQuery(e.target.value)} className="min-h-12 text-lg" />
          </form>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[null, ...categories].map((c) => (
              <button
                key={c ?? 'all'}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={`min-h-11 rounded-key border px-4 font-medium ${category === c ? 'border-ink bg-ink font-semibold text-white' : 'border-line bg-surface hover:border-muted'}`}
              >
                {c ?? 'Semua'}
              </button>
            ))}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 lg:px-4 lg:pb-4">
          {shown.length === 0 ? (
            <Empty title={sellable.length ? 'Tidak ada produk yang cocok.' : 'Belum ada produk.'}>
              {sellable.length ? 'Coba kata lain atau pilih kategori Semua.' : 'Pemilik bisa menambahkannya di menu Produk.'}
            </Empty>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] border-t border-l border-line sm:grid-cols-[repeat(auto-fill,minmax(11.5rem,1fr))]">
              {shown.map((p) => (
                <ProductLabel key={p.id} product={p} onAdd={() => addChecked(p)} />
              ))}
            </div>
          )}
        </div>
      </section>

      <div className={`min-h-0 flex-1 lg:flex ${mobileTab === 'cart' ? 'flex' : 'hidden'}`}>
        <CartPanel ctx={ctx} settings={settings} products={sellable} onPay={() => setPaying(true)} />
      </div>

      {paying && (
        <PayDialog
          ctx={ctx}
          settings={settings}
          onClose={() => setPaying(false)}
          onPaid={(sale) => {
            setPaying(false)
            setDone(sale)
            setMobileTab('items')
          }}
        />
      )}
      {done && <DoneDialog sale={done} tenant={tenant} settings={settings} onClose={() => setDone(null)} />}
    </div>
  )
}

/** Label rak: nama di atas, sisa stok dan harga sejajar di bawah. */
function ProductLabel({ product: p, onAdd }: { product: Product; onAdd: () => void }) {
  const out = p.trackStock && p.stock <= 0
  const low = p.trackStock && !out && p.stock <= p.minStock
  return (
    <button
      type="button"
      disabled={out}
      onClick={onAdd}
      title={p.name}
      className={`flex min-h-30 flex-col justify-between gap-2 border-r border-b border-line p-3 text-left focus-visible:-outline-offset-3 ${out ? 'hatch bg-surface text-muted' : 'bg-surface hover:bg-floor active:bg-line'}`}
    >
      <span className="line-clamp-3 text-[17px] leading-snug font-medium break-words">{p.name}</span>
      <span className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="tnum text-sm">
          {out ? <span className="font-semibold text-ink">Habis</span> : low ? <Chip>Sisa {p.stock}</Chip> : p.trackStock ? <span className="text-muted">Sisa {p.stock}</span> : null}
        </span>
        <span className="sign ml-auto text-[26px] leading-none">{rupiah(p.price)}</span>
      </span>
    </button>
  )
}

function CartPanel({ ctx, settings, products, onPay }: { ctx: repo.Ctx; settings: Settings; products: Product[]; onPay: () => void }) {
  const { lines, discount, setQty, setDiscount, clear, load } = useCart()
  const held = useLiveQuery(() => repo.listHeld(ctx), [ctx.tenantId]) ?? []
  const [discountOpen, setDiscountOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const totals = computeTotals(lines, discount, settings.taxRate)
  const listRef = useRef<HTMLDivElement>(null)

  // Barang baru masuk di bawah daftar, jadi daftar ikut bergulir supaya kasir melihatnya.
  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [lines.length])

  const hold = async () => {
    const label = `Pesanan ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
    try {
      await repo.holdCart(ctx, label, lines, discount)
      clear()
      useToast.getState().show('Keranjang ditahan.')
    } catch (err) {
      reportError(err)
    }
  }

  const increase = (productId: string, qty: number) => {
    const product = products.find((p) => p.id === productId)
    if (product?.trackStock && qty > product.stock) {
      useToast.getState().show(`Stok ${product.name} tinggal ${product.stock}.`, 'error')
      return
    }
    setQty(productId, qty)
  }

  return (
    <section aria-label="Struk berjalan" className="flex min-h-0 w-full flex-col border-line bg-surface lg:border-l">
      {/* Kosongkan sengaja jauh dari Bayar: di ujung atas panel. */}
      <div className="flex min-h-15 shrink-0 items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h2 className="sign text-2xl">Struk</h2>
        {lines.length > 0 && (
          <Button tone="danger" onClick={clear} className="px-3">
            Kosongkan struk
          </Button>
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto">
        {lines.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="font-semibold">Struk masih kosong</p>
            <p className="mt-1 text-muted">Ketuk produk atau pindai barcode.</p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {lines.map((line) => (
              <li key={line.productId} className="line-in grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-4 py-2">
                <span className="flex items-center">
                  <button type="button" aria-label={`Kurangi ${line.name}`} onClick={() => setQty(line.productId, line.qty - 1)} className="size-11 rounded-key border border-muted text-xl font-semibold hover:bg-floor">
                    −
                  </button>
                  <span className="tnum w-8 text-center text-lg font-semibold" aria-label={`Jumlah ${line.qty}`}>
                    {line.qty}
                  </span>
                  <button type="button" aria-label={`Tambah ${line.name}`} onClick={() => increase(line.productId, line.qty + 1)} className="size-11 rounded-key border border-muted text-xl font-semibold hover:bg-floor">
                    +
                  </button>
                </span>
                <span className="min-w-0 leading-snug break-words">
                  <span className="block font-medium">{line.name}</span>
                  <span className="tnum block text-sm text-muted">@ {rupiah(line.price)}</span>
                </span>
                <span className="tnum text-right text-[17px] font-semibold whitespace-nowrap">{rupiah(line.qty * line.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-line p-3">
        {lines.length > 0 && (
          <dl className="tnum mb-2 space-y-0.5 px-1">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{rupiah(totals.subtotal)}</dd>
            </div>
            {totals.discount > 0 && (
              <div className="flex justify-between font-semibold">
                <dt>Diskon</dt>
                <dd>-{rupiah(totals.discount)}</dd>
              </div>
            )}
            {settings.taxRate > 0 && (
              <div className="flex justify-between">
                <dt>Pajak {settings.taxRate}%</dt>
                <dd>{rupiah(totals.tax)}</dd>
              </div>
            )}
          </dl>
        )}
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5">
          <Button disabled={!lines.length} onClick={() => setDiscountOpen(true)} className="min-h-12 px-1">
            Diskon
          </Button>
          <Button disabled={!lines.length} onClick={hold} className="min-h-12 px-1">
            Tahan
          </Button>
          <Button disabled={!held.length} onClick={() => setHeldOpen(true)} className="tnum min-h-12 px-3 whitespace-nowrap">
            Ditahan ({held.length})
          </Button>
        </div>
        {/* Total menyatu dengan Bayar dan selalu di tempat yang sama, kosong maupun terisi. */}
        <button
          type="button"
          disabled={!lines.length}
          onClick={onPay}
          className="mt-2 flex min-h-24 w-full flex-wrap items-center justify-between gap-x-4 rounded-key bg-pay px-5 py-2 text-white hover:bg-pay-strong disabled:border disabled:border-line disabled:bg-floor disabled:text-muted"
        >
          <span className="sign text-3xl">Bayar</span>
          <span className="sign ml-auto text-5xl leading-none">{rupiah(totals.total)}</span>
        </button>
      </div>

      {discountOpen && <DiscountDialog current={discount} subtotal={totals.subtotal} onSave={setDiscount} onClose={() => setDiscountOpen(false)} />}
      {heldOpen && (
        <Modal title="Keranjang ditahan" onClose={() => setHeldOpen(false)}>
          <ul className="divide-y divide-line">
            {held.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  <span className="font-medium">{h.label}</span>
                  <span className="block text-sm text-muted">{h.lines.reduce((s, l) => s + l.qty, 0)} barang</span>
                </span>
                <Button
                  disabled={lines.length > 0}
                  onClick={async () => {
                    try {
                      const taken = await repo.takeHeld(ctx, h.id)
                      load(taken.lines, taken.discount)
                      setHeldOpen(false)
                    } catch (err) {
                      reportError(err)
                    }
                  }}
                >
                  Lanjutkan
                </Button>
              </li>
            ))}
          </ul>
          {lines.length > 0 && <p className="mt-3 text-sm text-muted">Selesaikan atau tahan struk yang sedang berjalan dulu.</p>}
        </Modal>
      )}
    </section>
  )
}

function DiscountDialog({ current, subtotal, onSave, onClose }: { current: Discount; subtotal: number; onSave: (d: Discount) => void; onClose: () => void }) {
  const [type, setType] = useState<'percent' | 'amount'>(current.type === 'amount' ? 'amount' : 'percent')
  const [value, setValue] = useState(current.type === 'none' ? '' : String(current.value))
  const amount = parseAmount(value)
  const invalid = type === 'percent' ? amount > 100 : amount > subtotal
  return (
    <Modal title="Diskon transaksi" onClose={onClose}>
      <Segmented
        label="Jenis diskon"
        className="mb-3"
        value={type}
        onChange={setType}
        options={[
          { value: 'percent', label: 'Persen' },
          { value: 'amount', label: 'Rupiah' },
        ]}
      />
      <Field label={type === 'percent' ? 'Diskon (%)' : 'Diskon (Rp)'} hint={invalid ? (type === 'percent' ? 'Maksimal 100 persen.' : `Maksimal ${rupiah(subtotal)}.`) : undefined}>
        <AmountInput autoFocus value={value} onChange={setValue} />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <Button
          onClick={() => {
            onSave({ type: 'none', value: 0 })
            onClose()
          }}
        >
          Hapus diskon
        </Button>
        <Button
          tone="primary"
          disabled={invalid || amount === 0}
          onClick={() => {
            onSave({ type, value: amount })
            onClose()
          }}
        >
          Terapkan diskon
        </Button>
      </div>
    </Modal>
  )
}

function PayDialog({ ctx, settings, onClose, onPaid }: { ctx: repo.Ctx; settings: Settings; onClose: () => void; onPaid: (s: Sale) => void }) {
  const { lines, discount, clear } = useCart()
  const totals = computeTotals(lines, discount, settings.taxRate)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [cash, setCash] = useState('')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  const received = parseAmount(cash)
  const short = method === 'cash' && received < totals.total
  const quick = [...new Set([totals.total, Math.ceil(totals.total / 50000) * 50000, Math.ceil(totals.total / 100000) * 100000])]

  const confirm = async () => {
    setBusy(true)
    try {
      const sale = await repo.completeSale(ctx, { lines, discount, method, paid: received, reference })
      clear()
      onPaid(sale)
    } catch (err) {
      reportError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Terima pembayaran" noKeyboard onClose={onClose}>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
        <span className="text-lg font-medium">Total</span>
        <span className="sign ml-auto text-5xl leading-none sm:text-6xl">{rupiah(totals.total)}</span>
      </div>
      <Segmented label="Metode pembayaran" className="mb-4" itemClassName="min-h-14 text-lg" value={method} onChange={setMethod} options={(['cash', 'qris', 'card'] as const).map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />

      {method === 'cash' && (
        <>
          <Field label="Uang diterima">
            <AmountInput autoFocus={!isTouch()} value={cash} onChange={setCash} className="min-h-14 text-2xl font-semibold" />
          </Field>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {quick.map((value, i) => (
              <CashKey key={value} value={value} exact={i === 0} pressed={received === value} onPick={() => setCash(String(value))} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 border-t border-line pt-3">
            {received > 0 && short ? (
              <>
                <span className="text-lg font-semibold text-danger">Kurang</span>
                <span className="sign ml-auto text-5xl leading-none text-danger">{rupiah(totals.total - received)}</span>
              </>
            ) : (
              <>
                <span className="text-lg font-medium">Kembalian</span>
                <span className="sign ml-auto text-5xl leading-none">{short ? <span className="text-muted">-</span> : rupiah(received - totals.total)}</span>
              </>
            )}
          </div>
        </>
      )}

      {method === 'qris' && (
        <>
          {settings.qrisImage ? (
            <img src={settings.qrisImage} alt="Kode QRIS toko" className="mx-auto mb-3 max-h-64" />
          ) : (
            <p className="mb-3 text-muted">Pasang gambar QRIS di Pengaturan agar tampil di sini, atau pakai QRIS cetak di meja kasir.</p>
          )}
          <p className="mb-3 font-medium">Pembayaran tidak terverifikasi otomatis. Periksa bukti bayar pelanggan sebelum menyelesaikan.</p>
        </>
      )}

      {method !== 'cash' && (
        <Field label="Nomor referensi (boleh kosong)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}

      <Button tone="primary" disabled={short || busy} onClick={confirm} className="sign mt-5 min-h-16 w-full text-2xl">
        Selesaikan pembayaran
      </Button>
    </Modal>
  )
}

/** Tombol uang: warnanya sama dengan uang kertas di tangan kasir, satu bagian untuk tiap lembar. */
function CashKey({ value, exact, pressed, onPick }: { value: number; exact: boolean; pressed: boolean; onPick: () => void }) {
  // Hanya kelipatan Rp50.000 yang bisa disusun dari uang merah dan biru. Uang pas bisa nominal apa saja.
  const count = !exact && value % 50000 === 0 ? value / 50000 : 0
  const hundreds = Math.floor(count / 2)
  const sheets = count > 0 && hundreds + count % 2 <= 10 ? [...Array<string>(hundreds).fill('bg-note-100'), ...Array<string>(count % 2).fill('bg-note-50')] : []
  const isNotes = sheets.length > 0
  const ring = pressed ? 'ring-3 ring-ink ring-offset-2' : ''

  if (!isNotes) {
    return (
      <button type="button" aria-pressed={pressed} onClick={onPick} className={`tnum min-h-18 rounded-key border border-muted bg-surface px-1 font-semibold hover:bg-floor ${ring}`}>
        {exact ? 'Uang pas' : <span className="sign text-2xl">{formatAmount(String(value))}</span>}
      </button>
    )
  }
  return (
    <button type="button" aria-pressed={pressed} onClick={onPick} className={`min-h-18 rounded-key px-1 text-white hover:brightness-90 ${sheets[0]} ${ring}`}>
      <span className="sign block text-2xl leading-tight">{formatAmount(String(value))}</span>
      {sheets.length > 1 && (
        <span aria-label={`${sheets.length} lembar`} className="mt-1 flex justify-center gap-0.5">
          {sheets.map((color, i) => (
            <span key={i} className={`h-2.5 w-4 rounded-[1px] border border-white ${color}`} />
          ))}
        </span>
      )}
    </button>
  )
}

function DoneDialog({ sale, tenant, settings, onClose }: { sale: Sale; tenant: Tenant; settings: Settings; onClose: () => void }) {
  return (
    <Modal title="Pembayaran selesai" onClose={onClose}>
      {sale.change > 0 && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="text-lg font-medium">Kembalian</span>
          <span className="sign ml-auto text-6xl leading-none">{rupiah(sale.change)}</span>
        </div>
      )}
      <div className={`max-h-72 overflow-y-auto p-3 ${sheet}`}>
        <ReceiptBody sale={sale} tenant={tenant} settings={settings} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => printReceipt(sale, tenant, settings)} className="min-h-14">
          Cetak struk
        </Button>
        <Button tone="primary" onClick={onClose} className="min-h-14">
          Transaksi baru
        </Button>
      </div>
    </Modal>
  )
}
