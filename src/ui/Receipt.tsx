import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { Sale, Settings, Tenant } from '../domain/schemas'
import { METHOD_LABEL, dateTime, rupiah } from './kit'

export function ReceiptBody({ sale, tenant, settings }: { sale: Sale; tenant: Tenant; settings: Settings }) {
  // Mengalir ke baris baru bila nominal panjang tidak muat di kertas 58 mm.
  const row = 'flex flex-wrap justify-between gap-x-2'
  const rule = 'my-2 border-t border-dashed border-black'
  return (
    <div className="font-receipt text-[12px] leading-snug break-words text-black">
      <div className="text-center">
        <div className="text-[16px] font-semibold">{tenant.name}</div>
        <div>Unit {tenant.unit}</div>
      </div>
      <div className={rule} />
      <div>{sale.number}</div>
      <div>{dateTime(sale.createdAt)}</div>
      <div>Kasir: {sale.cashierName}</div>
      <div className={rule} />
      {sale.items.map((item) => (
        <div key={item.productId} className="mb-1">
          <div className="font-semibold">{item.name}</div>
          <div className={row}>
            <span>
              {item.qty} x {rupiah(item.price)}
            </span>
            <span className="ml-auto">{rupiah(item.qty * item.price)}</span>
          </div>
        </div>
      ))}
      <div className={rule} />
      <div className={row}>
        <span>Subtotal</span>
        <span>{rupiah(sale.subtotal)}</span>
      </div>
      {sale.discount > 0 && (
        <div className={row}>
          <span>Diskon</span>
          <span>-{rupiah(sale.discount)}</span>
        </div>
      )}
      {sale.taxRate > 0 && (
        <div className={row}>
          <span>Pajak {sale.taxRate}%</span>
          <span>{rupiah(sale.tax)}</span>
        </div>
      )}
      <div className={`${row} my-1 border-y-2 border-black py-1 text-[16px] font-semibold`}>
        <span>Total</span>
        <span>{rupiah(sale.total)}</span>
      </div>
      <div className={row}>
        <span>{METHOD_LABEL[sale.method]}</span>
        <span>{rupiah(sale.paid)}</span>
      </div>
      {sale.change > 0 && (
        <div className={row}>
          <span>Kembali</span>
          <span>{rupiah(sale.change)}</span>
        </div>
      )}
      {sale.reference && <div>Ref: {sale.reference}</div>}
      {sale.status !== 'completed' && (
        <div className="mt-2 border-2 border-black p-1 text-center font-semibold">{sale.status === 'voided' ? 'DIBATALKAN' : 'DIREFUND'}</div>
      )}
      <div className={rule} />
      <div className="text-center">{settings.receiptFooter}</div>
    </div>
  )
}

/** Membuka dialog cetak browser dengan lebar kertas thermal yang dipilih tenan. */
export function printReceipt(sale: Sale, tenant: Tenant, settings: Settings) {
  const width = settings.paperWidth === 58 ? '58mm' : '80mm'
  const host = document.createElement('div')
  host.id = 'print-root'
  document.body.appendChild(host)
  const style = document.createElement('style')
  style.textContent = `@media print { @page { size: ${width} auto; margin: 0 } #print-root { width: ${width}; padding: 2mm } }`
  document.head.appendChild(style)

  const root = createRoot(host)
  flushSync(() => root.render(<ReceiptBody sale={sale} tenant={tenant} settings={settings} />))
  const cleanup = () => {
    root.unmount()
    host.remove()
    style.remove()
    window.removeEventListener('afterprint', cleanup)
  }
  window.addEventListener('afterprint', cleanup)
  window.print()
}
