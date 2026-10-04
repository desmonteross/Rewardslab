import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { notificationChannelEnum, notifications } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { fmtDateTime } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Notice, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { getNotificationProvider } from '@/server/adapters'

export const metadata = { title: 'Notifications' }
export const dynamic = 'force-dynamic'

export default async function NotificationsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('notifications.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)
  const provider = getNotificationProvider().info()

  const channel = one(params, 'channel')
  const status = one(params, 'status')

  const where = scoped(
    notifications,
    scope,
    channel ? eq(notifications.channel, channel as 'EMAIL') : undefined,
    status ? eq(notifications.status, status as 'SENT') : undefined,
  )

  const [rows, [{ total }], [summary]] = await Promise.all([
    db.select().from(notifications).where(where).orderBy(desc(notifications.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where),
    db
      .select({
        sent: sql<number>`count(*) filter (where ${notifications.status} = 'SENT')::int`,
        queued: sql<number>`count(*) filter (where ${notifications.status} = 'QUEUED')::int`,
        failed: sql<number>`count(*) filter (where ${notifications.status} = 'FAILED')::int`,
        unread: sql<number>`count(*) filter (where ${notifications.readAt} is null)::int`,
      })
      .from(notifications)
      .where(scoped(notifications, scope)),
  ])

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Rent reminders, receipts and operational alerts sent from the system."
      />

      <div className="mb-4">
        <Notice tone="brand" title={`Delivery provider: ${provider.name}`}>
          {provider.notice ?? 'Messages are delivered through the configured notification provider.'}
        </Notice>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Sent" value={String(summary?.sent ?? 0)} tone="positive" />
        <KpiCard label="Queued" value={String(summary?.queued ?? 0)} />
        <KpiCard label="Failed" value={String(summary?.failed ?? 0)} tone={(summary?.failed ?? 0) > 0 ? 'negative' : 'positive'} />
        <KpiCard label="Unread in-app" value={String(summary?.unread ?? 0)} />
      </div>

      <FilterBar
        showSearch={false}
        selects={[
          { name: 'channel', label: 'All channels', options: notificationChannelEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          {
            name: 'status',
            label: 'All statuses',
            options: [
              { value: 'QUEUED', label: 'Queued' },
              { value: 'SENT', label: 'Sent' },
              { value: 'FAILED', label: 'Failed' },
              { value: 'READ', label: 'Read' },
            ],
          },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'title',
              header: 'Notification',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.title}</p>
                  <p className="line-clamp-2 text-2xs leading-relaxed text-faint">{row.body}</p>
                </div>
              ),
            },
            { key: 'channel', header: 'Channel', render: (row) => <span className="text-xs text-muted">{humanise(row.channel)}</span> },
            { key: 'recipient', header: 'Recipient', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.recipient ?? '—'}</span> },
            { key: 'entity', header: 'Related to', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.entityType ?? '—'}</span> },
            { key: 'created', header: 'Created', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.createdAt)}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={
            <EmptyState
              title="Nothing sent yet"
              description="Receipts emailed from the receipt screen, and other alerts, appear here."
            />
          }
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/notifications', params, { page: next })}
        />
      </Card>
    </>
  )
}
