import { useLiveQuery } from 'dexie-react-hooks'
import { useRef, useState } from 'react'
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
  { id: 'pos', label: 'Kasir', ownerOnly: false, inMore: false },
  { id: 'history', label: 'Riwayat', ownerOnly: false, inMore: false },
  { id: 'shift', label: 'Shift', ownerOnly: false, inMore: false },
  { id: 'products', label: 'Produk', ownerOnly: true, inMore: false },
  { id: 'reports', label: 'Laporan', ownerOnly: true, inMore: true },
  { id: 'audit', label: 'Log', ownerOnly: true, inMore: true },
  { id: 'settings', label: 'Pengaturan', ownerOnly: true, inMore: true },
] as const

type View = (typeof NAV)[number]['id']

const tabTone = (active: boolean) => `border-b-4 focus-visible:-outline-offset-4 ${active ? 'border-ink font-bold' : 'border-transparent font-medium text-muted hover:text-ink'}`

const BACKUP_REMINDER_DAYS = 7

export function Shell({ ctx }: { ctx: repo.Ctx }) {
  const signOut = useSession((s) => s.signOut)
  const [view, setView] = useState<View>('pos')
  const morePanel = useRef<HTMLDivElement>(null)
  const tenant = useLiveQuery(() => repo.getTenant(ctx.tenantId), [ctx.tenantId])
  const settings = useLiveQuery(() => repo.getSettings(ctx), [ctx.tenantId])
  const items = NAV.filter((n) => !n.ownerOnly || ctx.role === 'owner')

  if (!tenant) return null
  const stale =
    ctx.role === 'owner' &&
    settings &&
    (!settings.lastBackupAt || Date.now() - new Date(settings.lastBackupAt).getTime() > BACKUP_REMINDER_DAYS * 86_400_000)

  const tabs = (list: typeof items, className: string) =>
    list.map((item) => (
      <button
        key={item.id}
        type="button"
        aria-current={view === item.id ? 'page' : undefined}
        onClick={() => setView(item.id)}
        className={`min-h-14 ${tabTone(view === item.id)} ${className}`}
      >
        {item.label}
      </button>
    ))

  const moreItems = items.filter((item) => item.inMore)
  const moreActive = moreItems.some((item) => item.id === view)

  return (
    <div className="flex h-full flex-col">
      <header className="flex min-h-14 shrink-0 items-center gap-3 border-b border-line bg-surface pl-3 lg:pl-4">
        <UnitTag unit={tenant.unit} color={tenant.color} />
        <span title={tenant.name} className="sign min-w-0 flex-1 truncate text-xl md:hidden lg:block lg:max-w-56 lg:flex-none">
          {tenant.name}
        </span>
        <nav aria-label="Menu utama" className="ml-1 hidden self-stretch md:flex lg:ml-3">
          {tabs(items, 'shrink-0 px-3 xl:px-4')}
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

      {/* Layar hp hanya muat lima tab, sehingga menu yang jarang dipakai pemilik masuk ke Lainnya. */}
      <nav aria-label="Menu utama" className="flex shrink-0 border-t border-line bg-surface md:hidden">
        {tabs(items.filter((item) => !item.inMore), 'flex-auto px-1')}
        {moreItems.length > 0 && (
          <>
            <button type="button" popoverTarget="menu-lainnya" aria-current={moreActive ? 'page' : undefined} className={`min-h-14 flex-auto px-1 ${tabTone(moreActive)}`}>
              Lainnya
            </button>
            <div ref={morePanel} id="menu-lainnya" popover="auto" className="fixed inset-x-0 top-auto bottom-14.25 m-0 w-full divide-y divide-line border-0 border-t border-line bg-surface text-ink shadow-lg">
              {moreItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-current={view === item.id ? 'page' : undefined}
                  onClick={() => {
                    setView(item.id)
                    morePanel.current?.hidePopover()
                  }}
                  className={`min-h-14 w-full border-l-4 px-4 text-left focus-visible:-outline-offset-4 ${view === item.id ? 'border-l-ink font-bold' : 'border-l-transparent font-medium hover:bg-floor'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </nav>
    </div>
  )
}
