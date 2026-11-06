import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import { useSession } from '../store'
import { UpdateBanner } from '../ui/UpdateBanner'
import { readableOn } from '../ui/kit'
import { AuditLog } from './AuditLog'
import { History } from './History'
import { Pos } from './Pos'
import { Products } from './Products'
import { Reports } from './Reports'
import { Settings } from './Settings'
import { ShiftView } from './ShiftView'

const NAV = [
  { id: 'pos', label: 'Kasir', ownerOnly: false },
  { id: 'history', label: 'Riwayat', ownerOnly: false },
  { id: 'shift', label: 'Shift', ownerOnly: false },
  { id: 'products', label: 'Produk', ownerOnly: true },
  { id: 'reports', label: 'Laporan', ownerOnly: true },
  { id: 'audit', label: 'Log', ownerOnly: true },
  { id: 'settings', label: 'Pengaturan', ownerOnly: true },
] as const

type View = (typeof NAV)[number]['id']

const BACKUP_REMINDER_DAYS = 7

export function Shell({ ctx }: { ctx: repo.Ctx }) {
  const signOut = useSession((s) => s.signOut)
  const [view, setView] = useState<View>('pos')
  const tenant = useLiveQuery(() => repo.getTenant(ctx.tenantId), [ctx.tenantId])
  const settings = useLiveQuery(() => repo.getSettings(ctx), [ctx.tenantId])
  const items = NAV.filter((n) => !n.ownerOnly || ctx.role === 'owner')

  if (!tenant) return null
  const stale =
    ctx.role === 'owner' &&
    settings &&
    (!settings.lastBackupAt || Date.now() - new Date(settings.lastBackupAt).getTime() > BACKUP_REMINDER_DAYS * 86_400_000)

  return (
    <div className="flex h-full flex-col-reverse lg:flex-row">
      <nav aria-label="Menu utama" className="flex shrink-0 overflow-x-auto bg-rail text-white lg:w-32 lg:flex-col lg:overflow-visible">
        <div className="hidden p-3 font-sign lg:block" style={{ background: tenant.color, color: readableOn(tenant.color) }}>
          <div className="text-3xl leading-none font-semibold">{tenant.unit}</div>
          <div className="mt-1 text-lg leading-tight font-medium">{tenant.name}</div>
        </div>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => setView(item.id)}
            className={`min-h-14 shrink-0 px-4 text-left font-sign text-xl font-medium lg:px-3 ${
              view === item.id ? 'bg-floor text-ink' : 'hover:bg-rail-soft'
            }`}
          >
            {item.label}
          </button>
        ))}
        <div className="flex shrink-0 items-center gap-3 px-3 lg:mt-auto lg:block lg:py-3">
          <div className="hidden text-sm text-white/80 lg:block">{ctx.userName}</div>
          <button type="button" onClick={signOut} className="min-h-11 font-medium whitespace-nowrap underline underline-offset-4">
            Kunci
          </button>
        </div>
      </nav>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 font-sign text-lg font-semibold lg:hidden" style={{ background: tenant.color, color: readableOn(tenant.color) }}>
          <span>
            {tenant.unit} {tenant.name}
          </span>
          <span className="font-medium">{ctx.userName}</span>
        </div>
        <UpdateBanner />
        {stale && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-sign px-4 py-2 font-medium">
            <span>{settings.lastBackupAt ? `Backup terakhir lebih dari ${BACKUP_REMINDER_DAYS} hari lalu.` : 'Data toko ini belum pernah dibackup.'} Data hanya tersimpan di perangkat ini.</span>
            <button type="button" onClick={() => setView('settings')} className="min-h-9 underline underline-offset-3">
              Buat backup
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === 'pos' && <Pos ctx={ctx} tenant={tenant} />}
          {view === 'history' && <History ctx={ctx} tenant={tenant} />}
          {view === 'shift' && <ShiftView ctx={ctx} />}
          {view === 'products' && <Products ctx={ctx} />}
          {view === 'reports' && <Reports ctx={ctx} tenant={tenant} />}
          {view === 'audit' && <AuditLog ctx={ctx} />}
          {view === 'settings' && <Settings ctx={ctx} tenant={tenant} />}
        </div>
      </main>
    </div>
  )
}
