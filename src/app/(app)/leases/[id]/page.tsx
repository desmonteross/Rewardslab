import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  documents,
  leaseCharges,
  leases,
  moveEvents,
  payments,
  properties,
  rentInvoices,
  tenants,
  units,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import {
  Card,
  DataTable,
  DetailList,
  EmptyState,
  Money,
  MoneyKpi,
  Notice,
  PageHeader,
  StatusBadge,
  humanise,
} from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { billLeaseAction, renewLeaseAction, terminateLeaseAction, transferTenantAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function LeaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('leases.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      lease: leases,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
      unitId: units.id,
      unitNumber: units.unitNumber,
      propertyId: properties.id,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(scoped(leases, scope, eq(leases.id, id)))
    .limit(1)

  if (!record) notFound()
  const { lease } = record

  const [charges, invoices, paymentRows, moveRows, vacantUnits, documentRows] = await Promise.all([
    db.select().from(leaseCharges).where(scoped(leaseCharges, scope, eq(leaseCharges.leaseId, id))).orderBy(asc(leaseCharges.label)),
    db.select().from(rentInvoices).where(scoped(rentInvoices, scope, eq(rentInvoices.leaseId, id))).orderBy(desc(rentInvoices.periodStart)),
    db.select().from(payments).where(scoped(payments, scope, eq(payments.leaseId, id))).orderBy(desc(payments.paidAt)).limit(12),
    db.select().from(moveEvents).where(scoped(moveEvents, scope, eq(moveEvents.leaseId, id))).orderBy(desc(moveEvents.scheduledDate)),
    db
      .select({ id: units.id, unitNumber: units.unitNumber, propertyName: properties.name, monthlyRent: units.monthlyRent })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(scoped(units, scope, ne(units.status, 'OCCUPIED'), ne(units.id, record.unitId)))
      .orderBy(asc(properties.name), asc(units.unitNumber))
      .limit(100),
    db
      .select()
      .from(documents)
      .where(scoped(documents, scope, eq(documents.entityType, 'Lease'), eq(documents.entityId, id)))
      .orderBy(desc(documents.createdAt)),
  ])

  const billedCents = invoices.filter((row) => row.status !== 'CANCELLED').reduce((total, row) => total + cents(row.total), 0)
  const balanceCents = invoices.filter((row) => row.status !== 'CANCELLED').reduce((total, row) => total + cents(row.balance), 0)
  const canManage = can(session, 'leases.update')
  const canTerminate = can(session, 'leases.terminate')
  const openMoveOut = moveRows.find((row) => row.type === 'MOVE_OUT' && row.status === 'SCHEDULED')

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Leases', href: '/leases' }, { label: lease.code }]}
        title={`${record.tenantName} · ${record.unitNumber}`}
        description={`${lease.code} · ${record.propertyName} · ${fmtDate(lease.startDate)} to ${fmtDate(lease.endDate)}`}
        actions={
          <>
            <Link href={`/tenants/${record.tenantId}`} className="btn-secondary">
              Tenant
            </Link>
            <Link href={`/properties/${record.propertyId}`} className="btn-secondary">
              Property
            </Link>
          </>
        }
      />

      {lease.status === 'EXPIRING' && (
        <div className="mb-4">
          <Notice tone="warning" title="This lease is inside its notice window">
            It ends on {fmtDate(lease.endDate)}. Renew it, or serve notice, before the notice period of{' '}
            {lease.noticePeriodDays} days runs out.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MoneyKpi label="Monthly rent" amount={lease.monthlyRent} />
        <MoneyKpi label="Service charge" amount={lease.serviceCharge} />
        <MoneyKpi label="Deposit held" amount={lease.deposit} />
        <MoneyKpi label="Billed to date" amount={billedCents / 100} sub={`${invoices.length} invoices`} />
        <MoneyKpi label="Outstanding" amount={balanceCents / 100} tone={balanceCents > 0 ? 'negative' : 'positive'} />
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">Status</p>
          <div className="mt-2">
            <StatusBadge status={lease.status} />
          </div>
          <p className="mt-2 text-xs text-muted">Due on the {lease.dueDayOfMonth} of each month</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Lease terms" className="lg:col-span-2">
          <DetailList
            columns={3}
            items={[
              { label: 'Lease ID', value: lease.code },
              { label: 'Tenant', value: <Link href={`/tenants/${record.tenantId}`} className="link">{record.tenantName}</Link> },
              { label: 'Unit', value: `${record.propertyName} · ${record.unitNumber}` },
              { label: 'Start date', value: fmtDate(lease.startDate) },
              { label: 'End date', value: fmtDate(lease.endDate) },
              { label: 'Payment due day', value: `${lease.dueDayOfMonth} of each month` },
              { label: 'Grace period', value: `${lease.gracePeriodDays} days` },
              {
                label: 'Penalty rule',
                value:
                  lease.penaltyType === 'NONE'
                    ? 'No penalty'
                    : lease.penaltyType === 'PERCENT'
                      ? `${lease.penaltyValue}% of arrears`
                      : `${formatKES(lease.penaltyValue)} flat`,
              },
              { label: 'Rent escalation', value: `${lease.escalationPercent}% every ${lease.escalationMonths} months` },
              { label: 'Notice period', value: `${lease.noticePeriodDays} days` },
              { label: 'Move-in date', value: lease.moveInDate ? fmtDate(lease.moveInDate) : '—' },
              { label: 'Move-out date', value: lease.moveOutDate ? fmtDate(lease.moveOutDate) : '—' },
            ]}
          />

          {charges.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="label mb-3">Recurring charges</p>
              <ul className="space-y-2">
                {charges.map((charge) => (
                  <li key={charge.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {charge.label}
                      <span className="ml-2 text-2xs text-faint">{humanise(charge.frequency)}</span>
                    </span>
                    <Money value={charge.amount} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {canManage && lease.status !== 'TERMINATED' && (
            <Card title="Renew lease" description="Extends the tenancy and applies the escalation on the current rent.">
              <ActionForm action={renewLeaseAction} label="Renew lease" pendingLabel="Renewing…">
                <input type="hidden" name="leaseId" value={id} />
                <label className="block text-xs font-medium text-muted">
                  Term
                  <select name="months" className="field mt-1" defaultValue="12">
                    <option value="6">6 months</option>
                    <option value="12">12 months</option>
                    <option value="24">24 months</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" name="applyEscalation" defaultChecked className="rounded border-line" />
                  Apply the {lease.escalationPercent}% escalation
                </label>
              </ActionForm>
            </Card>
          )}

          {can(session, 'billing.run') && (
            <Card title="Raise this month’s invoice" description="Runs the billing engine for this lease only.">
              <ActionForm action={billLeaseAction} label="Raise invoice" variant="secondary" pendingLabel="Billing…">
                <input type="hidden" name="leaseId" value={id} />
              </ActionForm>
            </Card>
          )}

          {canManage && lease.status !== 'TERMINATED' && vacantUnits.length > 0 && (
            <Card title="Transfer tenant" description="Move this tenant into another unit.">
              <ActionForm action={transferTenantAction} label="Transfer" variant="secondary" pendingLabel="Transferring…">
                <input type="hidden" name="leaseId" value={id} />
                <label className="block text-xs font-medium text-muted">
                  New unit
                  <select name="toUnitId" className="field mt-1" defaultValue="">
                    <option value="">Choose a unit…</option>
                    {vacantUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.propertyName} · {unit.unitNumber} · {formatKES(unit.monthlyRent)}
                      </option>
                    ))}
                  </select>
                </label>
              </ActionForm>
            </Card>
          )}

          {canTerminate && lease.status !== 'TERMINATED' && (
            <Card title="Terminate lease" description="Ends the tenancy and schedules a move-out inspection.">
              <ActionForm
                action={terminateLeaseAction}
                label="Terminate lease"
                variant="danger"
                pendingLabel="Terminating…"
                confirm="Terminate this lease and schedule a move-out?"
              >
                <input type="hidden" name="leaseId" value={id} />
                <label className="block text-xs font-medium text-muted">
                  Reason
                  <textarea name="reason" rows={2} className="field mt-1" placeholder="Tenant gave notice…" />
                </label>
              </ActionForm>
            </Card>
          )}

          {openMoveOut && (
            <Notice tone="warning" title="Move-out scheduled">
              Inspection is scheduled for {fmtDate(openMoveOut.scheduledDate)}.{' '}
              <Link href="/move-outs" className="link">
                Complete it from Move-outs
              </Link>
              .
            </Notice>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Invoices" padded={false}>
          <DataTable
            dense
            rows={invoices}
            rowKey={(row) => row.id}
            rowHref={(row) => `/invoices/${row.id}`}
            columns={[
              { key: 'number', header: 'Invoice', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              { key: 'period', header: 'Period', render: (row) => <span className="text-sm">{row.periodLabel}</span> },
              { key: 'total', header: 'Total', align: 'right', render: (row) => <Money value={row.total} /> },
              { key: 'balance', header: 'Balance', align: 'right', render: (row) => <Money value={row.balance} tone={cents(row.balance) > 0 ? 'negative' : 'neutral'} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No invoices yet" />}
          />
        </Card>

        <Card title="Payments" padded={false}>
          <DataTable
            dense
            rows={paymentRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/payments/${row.id}`}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
              { key: 'paid', header: 'Paid', render: (row) => <span className="text-xs text-muted">{fmtDate(row.paidAt)}</span> },
              { key: 'method', header: 'Method', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.method)}</span> },
              { key: 'gross', header: 'Amount', align: 'right', render: (row) => <Money value={row.grossAmount} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No payments against this lease" />}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Move events" padded={false}>
          <DataTable
            dense
            rows={moveRows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'type', header: 'Event', render: (row) => <span className="text-sm">{humanise(row.type)}</span> },
              { key: 'scheduled', header: 'Scheduled', render: (row) => <span className="text-xs text-muted">{fmtDate(row.scheduledDate)}</span> },
              { key: 'completed', header: 'Completed', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.completedDate ? fmtDate(row.completedDate) : '—'}</span> },
              { key: 'deposit', header: 'Deposit', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.depositHeld} muted /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No move events recorded" />}
          />
        </Card>

        <Card title="Documents" padded={false}>
          <DataTable
            dense
            rows={documentRows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Document', render: (row) => <span className="text-sm">{row.name}</span> },
              { key: 'type', header: 'Type', render: (row) => <span className="text-xs text-muted">{humanise(row.type)}</span> },
              { key: 'uploaded', header: 'Uploaded', align: 'right', render: (row) => <span className="text-xs text-muted">{fmtDate(row.createdAt)}</span> },
            ]}
            empty={
              <EmptyState
                title="No documents attached"
                description="The signed lease agreement and inspection reports belong here."
              />
            }
          />
        </Card>
      </div>
    </>
  )
}

