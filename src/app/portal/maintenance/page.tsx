import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, EmptyState, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { portalTickets } from '@/server/queries/portal'
import { TICKET_FLOW } from '@/server/services/maintenance'

export const metadata = { title: 'Repairs' }

/** Where a ticket sits in the flow, as a share of the way to Closed. */
function progress(status: string): number {
  const index = TICKET_FLOW.indexOf(status as (typeof TICKET_FLOW)[number])
  if (index < 0) return 0
  return Math.round((index / (TICKET_FLOW.length - 1)) * 100)
}

export default async function PortalMaintenancePage() {
  const session = await requireSession()
  const scope = scopeFromSession(session)
  const tickets = await portalTickets(scope)

  const open = tickets.filter((ticket) => ticket.status !== 'CLOSED')
  const closed = tickets.filter((ticket) => ticket.status === 'CLOSED')

  return (
    <div className="space-y-5">
      <PageHeader
        title="Repairs"
        description="Issues you have reported, and where each one has got to."
        actions={
          <Link href="/portal/maintenance/report" className="btn-primary">
            <Plus className="h-4 w-4" aria-hidden />
            Report an issue
          </Link>
        }
      />

      <Card title={`Open (${open.length})`}>
        {open.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            description="Anything you report will appear here so you can follow its progress."
          />
        ) : (
          <ul className="divide-y divide-line">
            {open.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/portal/maintenance/${ticket.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3.5 transition-colors hover:bg-canvas"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-medium text-ink">{ticket.title}</p>
                      <StatusBadge status={ticket.status} />
                      {(ticket.priority === 'URGENT' || ticket.priority === 'HIGH') && (
                        <StatusBadge status={ticket.priority} />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-faint">
                      {ticket.number} · reported {fmtDate(ticket.reportedAt)} · {humanise(ticket.category)}
                    </p>
                    <div
                      className="mt-2 h-1 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line"
                      role="img"
                      aria-label={`Progress: ${humanise(ticket.status)}`}
                    >
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(8, progress(ticket.status))}%` }}
                      />
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {closed.length > 0 && (
        <Card title={`Closed (${closed.length})`}>
          <ul className="divide-y divide-line">
            {closed.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  href={`/portal/maintenance/${ticket.id}`}
                  className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-canvas"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{ticket.title}</p>
                    <p className="mt-0.5 text-xs text-faint">
                      {ticket.number} · closed {fmtDate(ticket.closedAt ?? ticket.resolvedAt)}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
