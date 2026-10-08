import { notFound } from 'next/navigation'
import { requireTenantSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { Card, DetailList, EmptyState, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { portalTicketUpdates, portalTickets } from '@/server/queries/portal'
import { TICKET_FLOW } from '@/server/services/maintenance'

export const metadata = { title: 'Repair' }

export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireTenantSession()
  const scope = scopeFromSession(session)

  // portalTickets is already narrowed to this tenant, so a ticket that is not
  // theirs simply is not in the list — no separate ownership check needed.
  const tickets = await portalTickets(scope)
  const ticket = tickets.find((row) => row.id === id)
  if (!ticket) notFound()

  const updates = await portalTicketUpdates(scope, ticket.id)
  const reached = TICKET_FLOW.indexOf(ticket.status as (typeof TICKET_FLOW)[number])

  return (
    <div className="space-y-5">
      <PageHeader
        title={ticket.title}
        description={`${ticket.number} · reported ${fmtDate(ticket.reportedAt)}`}
        breadcrumb={[{ label: 'Repairs', href: '/portal/maintenance' }, { label: ticket.number }]}
        actions={<StatusBadge status={ticket.status} />}
      />

      <Card title="Progress">
        <ol className="space-y-0">
          {TICKET_FLOW.map((step, index) => {
            const done = index <= reached
            const current = index === reached
            return (
              <li key={step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={
                      done
                        ? 'grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand text-2xs text-white'
                        : 'grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line bg-canvas text-2xs text-faint'
                    }
                    aria-hidden
                  >
                    {done ? '✓' : index + 1}
                  </span>
                  {index < TICKET_FLOW.length - 1 && (
                    <span className={done ? 'w-px flex-1 bg-brand/40' : 'w-px flex-1 bg-line'} aria-hidden />
                  )}
                </div>
                <div className={index < TICKET_FLOW.length - 1 ? 'pb-4' : ''}>
                  <p
                    className={
                      current
                        ? 'text-sm font-medium text-ink'
                        : done
                          ? 'text-sm text-muted'
                          : 'text-sm text-faint'
                    }
                  >
                    {humanise(step)}
                    {current && <span className="ml-2 text-xs text-brand">now</span>}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card title="What you told us">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">{ticket.description}</p>
        <div className="mt-5 border-t border-line pt-4">
          <DetailList
            columns={2}
            items={[
              { label: 'Category', value: humanise(ticket.category) },
              { label: 'Urgency', value: <StatusBadge status={ticket.priority} /> },
              { label: 'Property', value: ticket.propertyName },
              { label: 'Unit', value: ticket.unitNumber ?? '—' },
            ]}
          />
        </div>
      </Card>

      <Card title="Updates" description="Notes added by the people handling this.">
        {updates.length === 0 ? (
          <EmptyState
            title="No updates yet"
            description="You will see progress notes here as the repair is picked up."
          />
        ) : (
          <ul className="divide-y divide-line">
            {updates.map((update) => (
              <li key={update.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  {update.status && <StatusBadge status={update.status} />}
                  <p className="text-xs text-faint">
                    {update.authorName ?? 'Property team'} · {fmtDateTime(update.createdAt)}
                  </p>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-ink">{update.note}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {ticket.resolutionNotes && (
        <Notice tone="positive" title="How it was resolved">
          {ticket.resolutionNotes}
        </Notice>
      )}
    </div>
  )
}
