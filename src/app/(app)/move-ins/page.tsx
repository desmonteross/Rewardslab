import Link from 'next/link'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, moveEvents, properties, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { ActionForm } from '@/components/action-form'
import { completeMoveInAction } from '../onboarding-actions'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Move-ins' }
export const dynamic = 'force-dynamic'

export default async function MoveInsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('tenants.view')
  const canManage = can(session, 'moves.manage')
  const canSeeLeases = can(session, 'leases.view')
  const scope = scopeFromSession(session)
  const status = one(params, 'status')

  const where = landlordScoped(
    properties,
    scope,
    eq(moveEvents.type, 'MOVE_IN'),
    status ? eq(moveEvents.status, status as 'SCHEDULED') : undefined,
  )

  const [rows, [summary]] = await Promise.all([
    db
      .select({
        id: moveEvents.id,
        scheduledDate: moveEvents.scheduledDate,
        completedDate: moveEvents.completedDate,
        status: moveEvents.status,
        depositHeld: moveEvents.depositHeld,
        inspectionNotes: moveEvents.inspectionNotes,
        handledByName: moveEvents.handledByName,
        tenantId: tenants.id,
        tenantName: tenants.fullName,
        tenantPhone: tenants.phone,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
        leaseId: leases.id,
        leaseCode: leases.code,
        monthlyRent: leases.monthlyRent,
      })
      .from(moveEvents)
      .innerJoin(tenants, eq(tenants.id, moveEvents.tenantId))
      .innerJoin(units, eq(units.id, moveEvents.unitId))
      .innerJoin(properties, eq(properties.id, moveEvents.propertyId))
      .innerJoin(leases, eq(leases.id, moveEvents.leaseId))
      .where(where)
      .orderBy(desc(moveEvents.scheduledDate))
      .limit(200),
    db
      .select({
        scheduled: sql<number>`count(*) filter (where ${moveEvents.status} = 'SCHEDULED')::int`,
        completed: sql<number>`count(*) filter (where ${moveEvents.status} = 'COMPLETED')::int`,
        thisMonth: sql<number>`count(*) filter (where date_trunc('month', ${moveEvents.scheduledDate}) = date_trunc('month', now()))::int`,
        deposits: sql<string>`coalesce(sum(${moveEvents.depositHeld}), 0)`,
      })
      .from(moveEvents)
      .innerJoin(properties, eq(properties.id, moveEvents.propertyId))
      .where(landlordScoped(properties, scope, eq(moveEvents.type, 'MOVE_IN'))),
  ])

  return (
    <>
      <PageHeader title="Move-ins" description="New tenancies taking occupation, and the deposits collected." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Scheduled" value={String(summary?.scheduled ?? 0)} tone="brand" />
        <KpiCard label="Completed" value={String(summary?.completed ?? 0)} tone="positive" />
        <KpiCard label="This month" value={String(summary?.thisMonth ?? 0)} />
        <KpiCard label="Deposits held" value={`KES ${(Number(summary?.deposits ?? 0)).toLocaleString()}`} />
      </div>

      <FilterBar
        showSearch={false}
        selects={[
          {
            name: 'status',
            label: 'All statuses',
            options: [
              { value: 'SCHEDULED', label: 'Scheduled' },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'CANCELLED', label: 'Cancelled' },
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
              key: 'tenant',
              header: 'Tenant',
              render: (row) => (
                <div className="min-w-0">
                  <Link href={`/tenants/${row.tenantId}`} className="truncate text-sm font-medium text-ink hover:text-brand">
                    {row.tenantName}
                  </Link>
                  <p className="truncate text-2xs text-faint">{row.tenantPhone}</p>
                </div>
              ),
            },
            {
              key: 'unit',
              header: 'Unit',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{row.unitNumber}</p>
                  <p className="truncate text-2xs text-faint">{row.propertyName}</p>
                </div>
              ),
            },
            { key: 'lease', header: 'Lease', hideOnMobile: true, render: (row) => canSeeLeases ? <Link href={`/leases/${row.leaseId}`} className="font-mono text-xs text-muted hover:text-brand">{row.leaseCode}</Link> : <span className="font-mono text-xs text-muted">{row.leaseCode}</span> },
            { key: 'scheduled', header: 'Scheduled', render: (row) => <span className="text-xs text-muted">{fmtDate(row.scheduledDate)}</span> },
            { key: 'completed', header: 'Completed', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.completedDate ? fmtDate(row.completedDate) : '—'}</span> },
            { key: 'rent', header: 'Rent', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.monthlyRent} muted /> },
            { key: 'deposit', header: 'Deposit', align: 'right', render: (row) => <Money value={row.depositHeld} /> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ...(canManage
              ? [
                  {
                    key: 'action',
                    header: '',
                    align: 'right' as const,
                    render: (row: (typeof rows)[number]) =>
                      row.status === 'SCHEDULED' ? (
                        <ActionForm
                          action={completeMoveInAction}
                          label="Complete"
                          pendingLabel="Saving…"
                          variant="secondary"
                          confirm={`Hand over  to ?`}
                        >
                          <input type="hidden" name="moveEventId" value={row.id} />
                        </ActionForm>
                      ) : null,
                  },
                ]
              : []),
          ]}
          empty={<EmptyState title="No move-ins recorded" description="Signing a lease schedules its move-in here." />}
        />
      </Card>
    </>
  )
}

