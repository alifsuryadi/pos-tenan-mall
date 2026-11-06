import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import * as repo from '../data/repo'
import { useSession } from '../store'
import { UpdateBanner } from '../ui/UpdateBanner'
import { Button, UnitTag } from '../ui/kit'
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

  const navItems = items.map((item) => (
    <button
      key={item.id}
      type="button"
      aria-current={view === item.id ? 'page' : undefined}
      onClick={() => setView(item.id)}
      className={`min-h-14 shrink-0 border-b-4 px-3 focus-visible:-outline-offset-4 xl:px-4 ${view === item.id ? 'border-ink font-bold' : 'border-transparent font-medium text-muted hover:text-ink'}`}
    >
      {item.label}
    </button>
  ))

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-surface pl-3 lg:pl-4">
        <UnitTag unit={tenant.unit} color={tenant.color} />
        <span title={tenant.name} className="sign min-w-0 flex-1 truncate text-xl md:hidden lg:block lg:max-w-56 lg:flex-none">
          {tenant.name}
        </span>
        <nav aria-label="Menu utama" className="ml-1 hidden self-stretch md:flex lg:ml-3">
          {navItems}
        </nav>
        <span className="ml-auto flex shrink-0 items-center gap-1 pr-2">
          <span className="max-w-28 truncate text-muted md:hidden lg:inline">{ctx.userName}</span>
          <Button tone="quiet" className="px-2" onClick={signOut}>
            Keluar
          </Button>
        </span>
      </header>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <UpdateBanner />
        {stale && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-warn px-4 py-1.5 font-medium">
            <span>{settings.lastBackupAt ? `Backup terakhir lebih dari ${BACKUP_REMINDER_DAYS} hari lalu.` : 'Data toko ini belum pernah dibackup.'} Data hanya tersimpan di perangkat ini.</span>
            <button type="button" onClick={() => setView('settings')} className="min-h-11 font-semibold underline underline-offset-3">
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

      <nav aria-label="Menu utama" className="flex shrink-0 overflow-x-auto border-t border-line bg-surface md:hidden">
        {navItems}
      </nav>
    </div>
  )
}
