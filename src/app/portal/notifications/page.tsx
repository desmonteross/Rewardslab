import { Megaphone } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { portalAnnouncements } from '@/server/queries/portal'

export const metadata = { title: 'Notifications' }
export const dynamic = 'force-dynamic'

export default async function PortalNotificationsPage() {
  const session = await requireSession()
  const announcements = await portalAnnouncements(scopeFromSession(session), 60)

  const unread = announcements.filter((item) => item.unread).length

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `${unread} unread of ${announcements.length}.`
            : 'Notices sent to you by your property manager.'
        }
      />

      <Card padded={false}>
        {announcements.length === 0 ? (
          <EmptyState
            title="Nothing yet"
            description="Rent reminders, receipts and notices from your property manager appear here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {announcements.map((item) => (
              <li key={item.id} className="flex items-start gap-3 px-5 py-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-muted">
                  <Megaphone className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-ink">{item.title}</p>
                    {item.unread && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />
                    )}
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-muted">{item.body}</p>
                  <p className="mt-1.5 text-2xs text-faint">{fmtDate(item.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
