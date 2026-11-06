import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import type { Product } from '../domain/schemas'
import { reportError, useToast } from '../store'
import { AmountInput, Button, Empty, Field, Input, Modal, PageTitle, dateTime, parseAmount, rupiah } from '../ui/kit'

export function Products({ ctx }: { ctx: repo.Ctx }) {
  const products = useLiveQuery(() => repo.listProducts(ctx), [ctx.tenantId])
  const moves = useLiveQuery(() => repo.listStockMoves(ctx, 30), [ctx.tenantId]) ?? []
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [adjusting, setAdjusting] = useState<Product | null>(null)
  const [query, setQuery] = useState('')
  const [lowOnly, setLowOnly] = useState(false)
  const [movesOpen, setMovesOpen] = useState(false)

  const isLow = (p: Product) => p.trackStock && p.active && p.stock <= p.minStock
  const lowCount = (products ?? []).filter(isLow).length
  const q = query.trim().toLowerCase()
  const shown = (products ?? []).filter((p) => (!lowOnly || isLow(p)) && (!q || p.name.toLowerCase().includes(q) || p.sku.includes(q)))

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <PageTitle title="Produk dan stok">
        <Button onClick={() => setMovesOpen(true)}>Riwayat stok</Button>
        <Button tone="primary" onClick={() => setEditing('new')}>
          Tambah produk
        </Button>
      </PageTitle>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input aria-label="Cari produk" placeholder="Cari nama atau SKU" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
        <Button aria-pressed={lowOnly} onClick={() => setLowOnly(!lowOnly)} className={lowOnly ? 'border-rail! bg-rail! text-white!' : ''}>
          Stok menipis ({lowCount})
        </Button>
      </div>
      {shown.length === 0 ? (
        <Empty title={products?.length ? 'Tidak ada produk yang cocok.' : 'Belum ada produk.'}>{products?.length ? 'Ubah pencarian atau filter.' : 'Tambahkan produk pertama toko Anda.'}</Empty>
      ) : (
        <div className="overflow-x-auto bg-surface">
          <table className="tnum w-full text-left">
            <thead className="border-b border-line text-sm text-muted">
              <tr>
                <th className="p-3 font-medium">Produk</th>
                <th className="p-3 font-medium">SKU</th>
                <th className="p-3 text-right font-medium">Harga</th>
                <th className="p-3 text-right font-medium">Stok</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map((p) => (
                <tr key={p.id} className={p.active ? '' : 'text-muted'}>
                  <td className="p-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-muted">
                      {p.category}
                      {!p.active && ', tidak dijual'}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">{p.sku}</td>
                  <td className="p-3 text-right whitespace-nowrap">{rupiah(p.price)}</td>
                  <td className={`p-3 text-right ${isLow(p) ? 'font-semibold text-warn' : ''}`}>{p.trackStock ? p.stock : 'Tidak dilacak'}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      {p.trackStock && <Button onClick={() => setAdjusting(p)}>Ubah stok</Button>}
                      <Button onClick={() => setEditing(p)}>Edit</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && <ProductForm ctx={ctx} product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {adjusting && <AdjustForm ctx={ctx} product={adjusting} onClose={() => setAdjusting(null)} />}
      {movesOpen && (
        <Modal title="Riwayat stok" wide onClose={() => setMovesOpen(false)}>
          {moves.length === 0 ? (
            <p className="text-muted">Perubahan stok akan muncul di sini.</p>
          ) : (
            <ul className="tnum divide-y divide-line">
              {moves.map((m) => (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-4 py-2">
                  <span className="font-medium">{m.productName}</span>
                  <span className={`text-right font-semibold ${m.delta < 0 ? 'text-danger' : 'text-ok'}`}>{m.delta > 0 ? `+${m.delta}` : m.delta}</span>
                  <span className="col-span-2 text-sm text-muted">
                    {dateTime(m.at)}, {m.by}: {m.reason}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  )
}

function ProductForm({ ctx, product, onClose }: { ctx: repo.Ctx; product: Product | null; onClose: () => void }) {
  const [name, setName] = useState(product?.name ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [category, setCategory] = useState(product?.category ?? '')
  const [price, setPrice] = useState(String(product?.price ?? ''))
  const [stock, setStock] = useState('')
  const [minStock, setMinStock] = useState(String(product?.minStock ?? 5))
  const [trackStock, setTrackStock] = useState(product?.trackStock ?? true)
  const [active, setActive] = useState(product?.active ?? true)

  return (
    <Modal title={product ? 'Edit produk' : 'Tambah produk'} onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await repo.saveProduct(ctx, {
              id: product?.id,
              name,
              sku,
              category,
              price: parseAmount(price),
              stock: parseAmount(stock),
              minStock: parseAmount(minStock),
              trackStock,
              active,
            })
            useToast.getState().show(product ? 'Produk disimpan.' : 'Produk ditambahkan.')
            onClose()
          } catch (err) {
            reportError(err)
          }
        }}
      >
        <Field label="Nama produk">
          <Input autoFocus required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU atau barcode">
            <Input required value={sku} onChange={(e) => setSku(e.target.value)} />
          </Field>
          <Field label="Kategori">
            <Input required value={category} onChange={(e) => setCategory(e.target.value)} />
          </Field>
        </div>
        <Field label="Harga jual (Rp)">
          <AmountInput required value={price} onChange={setPrice} />
        </Field>
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={trackStock} onChange={(e) => setTrackStock(e.target.checked)} />
          Lacak stok produk ini
        </label>
        {trackStock && (
          <div className="grid grid-cols-2 gap-3">
            {!product && (
              <Field label="Stok awal">
                <AmountInput value={stock} onChange={setStock} placeholder="0" />
              </Field>
            )}
            <Field label="Ingatkan saat stok">
              <AmountInput value={minStock} onChange={setMinStock} />
            </Field>
          </div>
        )}
        {product && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="size-5" checked={active} onChange={(e) => setActive(e.target.checked)} />
            Tampilkan di kasir
          </label>
        )}
        <Button tone="primary" type="submit" className="w-full">
          {product ? 'Simpan produk' : 'Tambah produk'}
        </Button>
      </form>
    </Modal>
  )
}

function AdjustForm({ ctx, product, onClose }: { ctx: repo.Ctx; product: Product; onClose: () => void }) {
  const [direction, setDirection] = useState<1 | -1>(1)
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  return (
    <Modal title={`Ubah stok ${product.name}`} onClose={onClose}>
      <p className="tnum mb-3 text-muted">Stok sekarang {product.stock}</p>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            await repo.adjustStock(ctx, product.id, direction * parseAmount(qty), reason)
            useToast.getState().show('Stok diperbarui.')
            onClose()
          } catch (err) {
            reportError(err)
          }
        }}
      >
        <div className="grid grid-cols-2 gap-1" role="group" aria-label="Arah perubahan">
          {([1, -1] as const).map((d) => (
            <button key={d} type="button" aria-pressed={direction === d} onClick={() => setDirection(d)} className={`min-h-11 font-medium ${direction === d ? 'bg-rail text-white' : 'border border-line'}`}>
              {d === 1 ? 'Stok masuk' : 'Stok keluar'}
            </button>
          ))}
        </div>
        <Field label="Jumlah">
          <AmountInput autoFocus required value={qty} onChange={setQty} />
        </Field>
        <Field label="Alasan" hint="Misalnya kiriman pemasok, barang rusak, atau hasil hitung ulang.">
          <Input required value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <Button tone="primary" type="submit" className="w-full">
          Simpan perubahan stok
        </Button>
      </form>
    </Modal>
  )
}
