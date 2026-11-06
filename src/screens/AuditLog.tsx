import { useLiveQuery } from 'dexie-react-hooks'
import * as repo from '../data/repo'
import { Empty, PageTitle, dateTime, sheet } from '../ui/kit'

export function AuditLog({ ctx }: { ctx: repo.Ctx }) {
  const rows = useLiveQuery(() => repo.listAudit(ctx), [ctx.tenantId])
  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <PageTitle title="Log aktivitas" />
      {rows?.length === 0 ? (
        <Empty title="Belum ada aktivitas." />
      ) : (
        <ul className={`divide-y divide-line ${sheet}`}>
          {rows?.map((row) => (
            <li key={row.id} className="px-4 py-2.5">
              <div className="flex flex-wrap justify-between gap-x-4">
                <span className="font-semibold">{row.action}</span>
                <span className="tnum text-sm text-muted">{dateTime(row.at)}</span>
              </div>
              <div className="break-words text-muted">
                {row.by}: {row.detail}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
