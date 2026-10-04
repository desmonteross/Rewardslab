import { desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { auditLogs } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { fmtDateTime, recentPeriods } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Notice, PageHeader, Pagination } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Audit trail' }
export const dynamic = 'force-dynamic'

function summarise(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value !== 'object') return String(value)
  return Object.entries(value as Record<string, unknown>)
    .map(([key, entry]) => `${key}: ${entry === null ? '—' : String(entry)}`)
    .join(' · ')
}

export default async function AuditTrailPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('audit.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const action = one(params, 'action')
  const entityType = one(params, 'entity')
  const monthParam = one(params, 'month')
  const period = monthParam ? recentPeriods(new Date(), 24).find((entry) => `${entry.year}-${entry.month}` === monthParam) : undefined

  const where = scoped(
    auditLogs,
    scope,
    query
      ? or(
          ilike(auditLogs.reference, `%${query}%`),
          ilike(auditLogs.userName, `%${query}%`),
          ilike(auditLogs.entityId, `%${query}%`),
        )
      : undefined,
    action ? eq(auditLogs.action, action) : undefined,
    entityType ? eq(auditLogs.entityType, entityType) : undefined,
    period ? sql`${auditLogs.createdAt} >= ${period.start}` : undefined,
    period ? sql`${auditLogs.createdAt} <= ${period.end}` : undefined,
  )

  const [rows, [{ total }], actions, entities, [summary]] = await Promise.all([
    db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(auditLogs).where(where),
    db.selectDistinct({ action: auditLogs.action }).from(auditLogs).where(scoped(auditLogs, scope)).orderBy(auditLogs.action),
    db.selectDistinct({ entityType: auditLogs.entityType }).from(auditLogs).where(scoped(auditLogs, scope)).orderBy(auditLogs.entityType),
    db
      .select({
        total: sql<number>`count(*)::int`,
        today: sql<number>`count(*) filter (where ${auditLogs.createdAt} >= date_trunc('day', now()))::int`,
        users: sql<number>`count(distinct ${auditLogs.userId})::int`,
        financial: sql<number>`count(*) filter (where ${auditLogs.entityType} in ('Payment','Settlement','RentInvoice','Expense','Commission'))::int`,
      })
      .from(auditLogs)
      .where(scoped(auditLogs, scope)),
  ])

  return (
    <>
      <PageHeader
        title="Audit trail"
        description="Who did what, when, and what the value was before and after."
      />

      <div className="mb-4">
        <Notice tone="brand" title="Append-only">
          Audit rows are written inside the same transaction as the change they describe and are never updated or
          deleted. Financial, tenancy and tax actions are all covered.
        </Notice>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Entries" value={(summary?.total ?? 0).toLocaleString()} />
        <KpiCard label="Today" value={String(summary?.today ?? 0)} />
        <KpiCard label="Distinct users" value={String(summary?.users ?? 0)} />
        <KpiCard label="Financial actions" value={(summary?.financial ?? 0).toLocaleString()} />
      </div>

      <FilterBar
        searchPlaceholder="Search reference, user or entity id…"
        selects={[
          { name: 'action', label: 'All actions', options: actions.map((row) => ({ value: row.action, label: row.action })) },
          { name: 'entity', label: 'All entities', options: entities.map((row) => ({ value: row.entityType, label: row.entityType })) },
          {
            name: 'month',
            label: 'All periods',
            options: recentPeriods(new Date(), 12)
              .reverse()
              .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
          },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'when',
              header: 'When',
              render: (row) => <span className="whitespace-nowrap text-xs tabular-nums text-muted">{fmtDateTime(row.createdAt)}</span>,
            },
            {
              key: 'action',
              header: 'Action',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.action}</p>
                  <p className="truncate text-2xs text-faint">
                    {row.entityType}
                    {row.reference ? ` · ${row.reference}` : ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'user',
              header: 'User',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted">{row.userName ?? 'System'}</p>
                  <p className="truncate text-2xs text-faint">{row.userRole ?? ''}</p>
                </div>
              ),
            },
            {
              key: 'previous',
              header: 'Previous value',
              hideOnMobile: true,
              render: (row) => <span className="text-2xs text-faint">{summarise(row.previousValue)}</span>,
            },
            {
              key: 'next',
              header: 'New value',
              hideOnMobile: true,
              render: (row) => <span className="text-2xs text-muted">{summarise(row.newValue)}</span>,
            },
            {
              key: 'origin',
              header: 'Origin',
              align: 'right',
              hideOnMobile: true,
              render: (row) => (
                <span className="font-mono text-2xs text-faint">
                  {row.ipAddress ?? '—'}
                  {row.sessionId ? ` · ${row.sessionId.slice(-6)}` : ''}
                </span>
              ),
            },
          ]}
          empty={<EmptyState title="No audit entries match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/audit-trail', params, { page: next })}
        />
      </Card>
    </>
  )
}
