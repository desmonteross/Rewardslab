import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, moveEvents, properties, rentInvoices, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { completeMoveOutAction } from '@/app/(app)/leases/[id]/actions'

export const metadata = { title: 'Move-outs' }
export const dynamic = 'force-dynamic'

export default async function MoveOutsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('tenants.view')
  const scope = scopeFromSession(session)
  const status = one(params, 'status')
  const canManage = can(session, 'moves.manage')

  const where = landlordScoped(
    properties,
    scope,
    eq(moveEvents.type, 'MOVE_OUT'),
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
        deductions: moveEvents.deductions,
        depositRefunded: moveEvents.depositRefunded,
        inspectionNotes: moveEvents.inspectionNotes,
        tenantId: tenants.id,
        tenantName: tenants.fullName,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
        leaseId: leases.id,
        leaseCode: leases.code,
        arrears: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.tenant_id = tenants.id and i.status <> 'CANCELLED')`,
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
        refunded: sql<string>`coalesce(sum(${moveEvents.depositRefunded}), 0)`,
        deducted: sql<string>`coalesce(sum(${moveEvents.deductions}), 0)`,
      })
      .from(moveEvents)
      .innerJoin(properties, eq(properties.id, moveEvents.propertyId))
      .where(landlordScoped(properties, scope, eq(moveEvents.type, 'MOVE_OUT'))),
  ])

  const pending = rows.filter((row) => row.status === 'SCHEDULED')

  return (
    <>
      <PageHeader
        title="Move-outs"
        description="Vacating tenancies, the inspection, and how the deposit is settled."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Scheduled" value={String(summary?.scheduled ?? 0)} tone="warning" />
        <KpiCard label="Completed" value={String(summary?.completed ?? 0)} tone="positive" />
        <KpiCard label="Deposits refunded" value={`KES ${Number(summary?.refunded ?? 0).toLocaleString()}`} />
        <KpiCard label="Deductions applied" value={`KES ${Number(summary?.deducted ?? 0).toLocaleString()}`} tone="serious" />
      </div>

      {canManage && pending.length > 0 && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          {pending.slice(0, 2).map((row) => {
            const arrearsCents = cents(row.arrears)
            return (
              <Card
                key={row.id}
                title={`Complete move-out · ${row.tenantName}`}
                description={`${row.propertyName} · ${row.unitNumber} · scheduled ${fmtDate(row.scheduledDate)}`}
              >
                <p className="mb-3 text-sm text-muted">
                  Deposit held {formatKES(row.depositHeld)}.{' '}
                  {arrearsCents > 0
                    ? `Outstanding rent of ${formatKES(row.arrears)} will be deducted automatically before any refund.`
                    : 'The tenant has no outstanding rent.'}
                </p>
                <ActionForm
                  action={completeMoveOutAction}
                  label="Complete move-out"
                  pendingLabel="Completing…"
                  confirm="Complete this move-out, settle the deposit and release the unit?"
                >
                  <input type="hidden" name="moveId" value={row.id} />
                  <label className="block text-xs font-medium text-muted">
                    Additional deductions (damages, cleaning)
                    <input name="deductions" type="number" min="0" step="1" defaultValue="0" className="field mt-1" />
                  </label>
                  <label className="block text-xs font-medium text-muted">
                    Inspection notes
                    <textarea name="notes" rows={2} className="field mt-1" placeholder="Condition on handover…" />
                  </label>
                </ActionForm>
              </Card>
            )
          })}
        </div>
      )}

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
                  <p className="truncate text-2xs text-faint">{row.propertyName} · {row.unitNumber}</p>
                </div>
              ),
            },
            { key: 'lease', header: 'Lease', hideOnMobile: true, render: (row) => <Link href={`/leases/${row.leaseId}`} className="font-mono text-xs text-muted hover:text-brand">{row.leaseCode}</Link> },
            { key: 'scheduled', header: 'Scheduled', render: (row) => <span className="text-xs text-muted">{fmtDate(row.scheduledDate)}</span> },
            { key: 'deposit', header: 'Deposit', align: 'right', render: (row) => <Money value={row.depositHeld} muted /> },
            { key: 'arrears', header: 'Arrears', align: 'right', hideOnMobile: true, render: (row) => (cents(row.arrears) > 0 ? <Money value={row.arrears} tone="negative" /> : <span className="text-sm text-positive">None</span>) },
            { key: 'deductions', header: 'Deductions', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.deductions} muted /> },
            { key: 'refund', header: 'Refunded', align: 'right', render: (row) => <Money value={row.depositRefunded} tone="positive" /> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={<EmptyState title="No move-outs recorded" description="Terminating a lease schedules a move-out here." />}
        />
      </Card>
    </>
  )
}

