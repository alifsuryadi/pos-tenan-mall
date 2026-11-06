import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as repo from '../data/repo'
import { computeTotals } from '../domain/calc'
import type { Discount, PaymentMethod, Product, Sale, Settings, Tenant } from '../domain/schemas'
import { reportError, useCart, useToast } from '../store'
import { ReceiptBody, printReceipt } from '../ui/Receipt'
import { AmountInput, Button, Empty, Field, Input, METHOD_LABEL, Modal, formatAmount, parseAmount, rupiah } from '../ui/kit'
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
        <h1 className="mb-1 font-sign text-4xl font-semibold">Buka shift dulu</h1>
        <p className="mb-5 text-muted">Hitung uang di laci kas, lalu catat sebagai modal awal.</p>
        <OpenShiftForm ctx={ctx} />
      </div>
    )
  }

  const count = lines.reduce((sum, l) => sum + l.qty, 0)

  return (
    <div className="flex h-full min-h-0 flex-col lg:grid lg:grid-cols-[1fr_24rem]">
      <div className="flex border-b border-line bg-surface lg:hidden" role="tablist">
        {(['items', 'cart'] as const).map((tab) => (
          <button
            key={tab}
            role="tab"
            type="button"
            aria-selected={mobileTab === tab}
            onClick={() => setMobileTab(tab)}
            className={`min-h-12 flex-1 font-sign text-xl font-medium ${mobileTab === tab ? 'bg-rail text-white' : ''}`}
          >
            {tab === 'items' ? 'Produk' : `Struk (${count})`}
          </button>
        ))}
      </div>

      <section className={`min-h-0 flex-col overflow-y-auto p-4 lg:flex ${mobileTab === 'items' ? 'flex flex-1' : 'hidden'}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (q && shown.length === 1) {
              addChecked(shown[0])
              setQuery('')
            } else if (q && addBySku(query)) setQuery('')
          }}
        >
          <Input aria-label="Cari produk atau ketik barcode" placeholder="Cari produk atau ketik barcode" value={query} onChange={(e) => setQuery(e.target.value)} />
        </form>
        <div className="mt-3 flex flex-wrap gap-1">
          {[null, ...categories].map((c) => (
            <button
              key={c ?? 'all'}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`min-h-10 px-3 font-medium ${category === c ? 'bg-rail text-white' : 'bg-surface hover:bg-white'}`}
            >
              {c ?? 'Semua'}
            </button>
          ))}
        </div>
        {shown.length === 0 ? (
          <div className="mt-4">
            <Empty title={sellable.length ? 'Tidak ada produk yang cocok.' : 'Belum ada produk.'}>
              {sellable.length ? 'Coba kata lain atau pilih kategori Semua.' : 'Pemilik bisa menambahkannya di menu Produk.'}
            </Empty>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
            {shown.map((p) => {
              const out = p.trackStock && p.stock <= 0
              const low = p.trackStock && !out && p.stock <= p.minStock
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={out}
                  onClick={() => addChecked(p)}
                  className="flex min-h-28 flex-col justify-between border-b-4 bg-surface p-3 text-left hover:bg-white disabled:opacity-55"
                  style={{ borderBottomColor: tenant.color }}
                >
                  <span className="leading-tight font-medium">{p.name}</span>
                  <span className="mt-2 flex items-baseline justify-between gap-2">
                    <span className="tnum font-sign text-xl font-semibold">{rupiah(p.price)}</span>
                    {p.trackStock && (
                      <span className={`tnum text-sm ${out ? 'font-semibold text-danger' : low ? 'font-semibold text-warn' : 'text-muted'}`}>
                        {out ? 'Habis' : `Sisa ${p.stock}`}
                      </span>
                    )}
                  </span>
                </button>
              )
            })}
          </div>
        )}
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

function CartPanel({ ctx, settings, products, onPay }: { ctx: repo.Ctx; settings: Settings; products: Product[]; onPay: () => void }) {
  const { lines, discount, setQty, setDiscount, clear, load } = useCart()
  const held = useLiveQuery(() => repo.listHeld(ctx), [ctx.tenantId]) ?? []
  const [discountOpen, setDiscountOpen] = useState(false)
  const [heldOpen, setHeldOpen] = useState(false)
  const totals = computeTotals(lines, discount, settings.taxRate)

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
    <section aria-label="Struk berjalan" className="flex min-h-0 w-full flex-col bg-rail p-3">
      <div className="receipt-edge min-h-0 flex-1 overflow-y-auto bg-paper px-4 pt-4 pb-6 font-receipt text-[13px] text-black">
        {lines.length === 0 ? (
          <div className="py-10 text-center">
            <p className="font-semibold">Struk masih kosong</p>
            <p className="mt-1">Ketuk produk atau pindai barcode.</p>
          </div>
        ) : (
          <>
            {lines.map((line) => (
              <div key={line.productId} className="feed-in border-b border-dashed border-black/40 py-2">
                <div className="flex justify-between gap-2">
                  <span>{line.name}</span>
                  <span className="tnum whitespace-nowrap">{rupiah(line.qty * line.price)}</span>
                </div>
                <div className="mt-1 flex items-center gap-1">
                  <button type="button" aria-label={`Kurangi ${line.name}`} onClick={() => setQty(line.productId, line.qty - 1)} className="size-9 border border-black/50 hover:bg-black hover:text-white">
                    -
                  </button>
                  <span className="tnum w-8 text-center font-semibold" aria-label={`Jumlah ${line.qty}`}>
                    {line.qty}
                  </span>
                  <button type="button" aria-label={`Tambah ${line.name}`} onClick={() => increase(line.productId, line.qty + 1)} className="size-9 border border-black/50 hover:bg-black hover:text-white">
                    +
                  </button>
                  <span className="tnum ml-2 text-black/70">@ {rupiah(line.price)}</span>
                </div>
              </div>
            ))}
            <dl className="tnum mt-3 space-y-0.5">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{rupiah(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between">
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
          </>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between text-white">
        <span className="font-sign text-2xl font-medium">Total</span>
        <span className="tnum font-sign text-5xl font-semibold">{rupiah(totals.total)}</span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1">
        <Button disabled={!lines.length} onClick={() => setDiscountOpen(true)} className="px-1">
          Diskon
        </Button>
        <Button disabled={!lines.length} onClick={hold} className="px-1">
          Tahan
        </Button>
        <Button disabled={!held.length} onClick={() => setHeldOpen(true)} className="px-1">
          Ditahan ({held.length})
        </Button>
      </div>
      <Button tone="primary" disabled={!lines.length} onClick={onPay} className="mt-1 min-h-16 font-sign text-3xl">
        Bayar
      </Button>
      {lines.length > 0 && (
        <Button tone="quiet" onClick={clear} className="mt-1 text-white hover:text-white/80">
          Kosongkan struk
        </Button>
      )}

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
      <div className="mb-3 grid grid-cols-2 gap-1" role="group" aria-label="Jenis diskon">
        {(['percent', 'amount'] as const).map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={`min-h-11 font-medium ${type === t ? 'bg-rail text-white' : 'border border-line'}`}>
            {t === 'percent' ? 'Persen' : 'Rupiah'}
          </button>
        ))}
      </div>
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
    <Modal title="Terima pembayaran" onClose={onClose}>
      <div className="tnum mb-4 font-sign text-6xl font-semibold">{rupiah(totals.total)}</div>
      <div className="mb-4 grid grid-cols-3 gap-1" role="group" aria-label="Metode pembayaran">
        {(['cash', 'qris', 'card'] as const).map((m) => (
          <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)} className={`min-h-12 font-medium ${method === m ? 'bg-rail text-white' : 'border border-line'}`}>
            {METHOD_LABEL[m]}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <>
          <Field label="Uang diterima">
            <AmountInput autoFocus value={cash} onChange={setCash} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-1">
            {quick.map((value, i) => (
              <Button key={value} onClick={() => setCash(String(value))} className="tnum">
                {i === 0 ? 'Uang pas' : formatAmount(String(value))}
              </Button>
            ))}
          </div>
          <div className="tnum mt-3 flex justify-between text-lg font-medium">
            <span>Kembalian</span>
            <span>{short ? '-' : rupiah(received - totals.total)}</span>
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
          <p className="mb-3 text-sm text-muted">Pembayaran tidak terverifikasi otomatis. Periksa bukti bayar pelanggan sebelum menyelesaikan.</p>
        </>
      )}

      {method !== 'cash' && (
        <Field label="Nomor referensi (boleh kosong)">
          <Input value={reference} onChange={(e) => setReference(e.target.value)} />
        </Field>
      )}

      <Button tone="primary" disabled={short || busy} onClick={confirm} className="mt-5 min-h-14 w-full font-sign text-2xl">
        Selesaikan pembayaran
      </Button>
    </Modal>
  )
}

function DoneDialog({ sale, tenant, settings, onClose }: { sale: Sale; tenant: Tenant; settings: Settings; onClose: () => void }) {
  return (
    <Modal title="Pembayaran selesai" onClose={onClose}>
      {sale.change > 0 && (
        <div className="mb-4 bg-sign p-4">
          <div className="font-medium">Kembalian</div>
          <div className="tnum font-sign text-5xl font-semibold">{rupiah(sale.change)}</div>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto border border-line bg-paper p-3">
        <ReceiptBody sale={sale} tenant={tenant} settings={settings} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={() => printReceipt(sale, tenant, settings)}>Cetak struk</Button>
        <Button tone="primary" onClick={onClose}>
          Transaksi baru
        </Button>
      </div>
    </Modal>
  )
}
