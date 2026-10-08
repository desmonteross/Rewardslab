import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { expenses, maintenanceTickets, maintenanceUpdates, properties, tenants, units, users, vendors } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { landlordOwnsProperty } from '@/server/landlord-access'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { Card, DataTable, DetailList, EmptyState, Money, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { updateTicketAction } from '../actions'
import { TICKET_FLOW } from '@/server/services/maintenance'

export const dynamic = 'force-dynamic'

export default async function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('maintenance.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      ticket: maintenanceTickets,
      propertyId: properties.id,
      propertyName: properties.name,
      unitNumber: units.unitNumber,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
      assigneeName: users.fullName,
      vendorName: vendors.name,
      vendorPhone: vendors.phone,
    })
    .from(maintenanceTickets)
    .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
    .leftJoin(units, eq(units.id, maintenanceTickets.unitId))
    .leftJoin(tenants, eq(tenants.id, maintenanceTickets.tenantId))
    .leftJoin(users, eq(users.id, maintenanceTickets.assignedToId))
    .leftJoin(vendors, eq(vendors.id, maintenanceTickets.vendorId))
    .where(scoped(maintenanceTickets, scope, eq(maintenanceTickets.id, id)))
    .limit(1)

  if (!record || !(await landlordOwnsProperty(scope, record.propertyId))) notFound()
  const { ticket } = record

  const [updates, linkedExpenses, assigneeOptions, vendorOptions] = await Promise.all([
    db
      .select()
      .from(maintenanceUpdates)
      .where(scoped(maintenanceUpdates, scope, eq(maintenanceUpdates.ticketId, id)))
      .orderBy(desc(maintenanceUpdates.createdAt)),
    db.select().from(expenses).where(scoped(expenses, scope, eq(expenses.ticketId, id))).orderBy(desc(expenses.expenseDate)),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(sql`${users.organizationId} = ${scope.organizationId} and ${users.isActive} = true and ${users.role} not in ('TENANT', 'LANDLORD')`)
      .orderBy(asc(users.fullName)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(scoped(vendors, scope, eq(vendors.isActive, true))).orderBy(asc(vendors.name)),
  ])

  const canUpdate = can(session, 'maintenance.update')
  const canAssign = can(session, 'maintenance.assign')
  const canClose = can(session, 'maintenance.close')
  const canRaiseExpense = can(session, 'expenses.create')
  const statusOptions = TICKET_FLOW.filter((state) => canClose || state !== 'CLOSED')

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Maintenance', href: '/maintenance' }, { label: ticket.number }]}
        title={ticket.title}
        description={`${ticket.number} · ${record.propertyName}${record.unitNumber ? ` · ${record.unitNumber}` : ''} · reported ${fmtDate(ticket.reportedAt)}`}
        actions={
          <>
            <Link href={`/properties/${record.propertyId}?tab=maintenance`} className="btn-secondary">
              Property
            </Link>
            {record.tenantId && (
              <Link href={`/tenants/${record.tenantId}`} className="btn-secondary">
                Tenant
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Ticket">
          <DetailList
            columns={3}
            items={[
              { label: 'Ticket number', value: <span className="font-mono">{ticket.number}</span> },
              { label: 'Status', value: <StatusBadge status={ticket.status} /> },
              { label: 'Priority', value: <StatusBadge status={ticket.priority} /> },
              { label: 'Category', value: humanise(ticket.category) },
              { label: 'Property', value: record.propertyName },
              { label: 'Unit', value: record.unitNumber ?? '—' },
              { label: 'Tenant', value: record.tenantName ? `${record.tenantName} · ${record.tenantPhone}` : '—' },
              { label: 'Reported by', value: ticket.reportedByName ?? '—' },
              { label: 'Assigned to', value: record.assigneeName ?? 'Unassigned' },
              { label: 'Vendor', value: record.vendorName ? `${record.vendorName}${record.vendorPhone ? ` · ${record.vendorPhone}` : ''}` : '—' },
              { label: 'Estimated cost', value: formatKES(ticket.estimatedCost) },
              { label: 'Actual cost', value: cents(ticket.actualCost) > 0 ? formatKES(ticket.actualCost) : '—' },
              { label: 'Reported', value: fmtDateTime(ticket.reportedAt) },
              { label: 'Due', value: ticket.dueDate ? fmtDate(ticket.dueDate) : '—' },
              { label: 'Resolved', value: ticket.resolvedAt ? fmtDateTime(ticket.resolvedAt) : '—' },
            ]}
          />

          <div className="mt-5 border-t border-line pt-4">
            <p className="label mb-2">Description</p>
            <p className="text-sm leading-relaxed text-muted">{ticket.description}</p>
          </div>

          {ticket.resolutionNotes && (
            <div className="mt-5 border-t border-line pt-4">
              <p className="label mb-2">Resolution</p>
              <p className="text-sm leading-relaxed text-muted">{ticket.resolutionNotes}</p>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          {canUpdate && ticket.status !== 'CLOSED' && (
            <Card title="Update ticket" description="Every change is recorded on the thread below.">
              <ActionForm action={updateTicketAction} label="Save update" pendingLabel="Saving…">
                <input type="hidden" name="ticketId" value={id} />
                <label className="block text-xs font-medium text-muted">
                  Status
                  <select name="status" className="field mt-1" defaultValue={ticket.status}>
                    {statusOptions.map((state) => (
                      <option key={state} value={state}>
                        {humanise(state)}
                      </option>
                    ))}
                  </select>
                </label>
                {canAssign && (
                  <>
                <label className="block text-xs font-medium text-muted">
                  Assign to
                  <select name="assignedToId" className="field mt-1" defaultValue={ticket.assignedToId ?? ''}>
                    <option value="">Unassigned</option>
                    {assigneeOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Vendor
                  <select name="vendorId" className="field mt-1" defaultValue={ticket.vendorId ?? ''}>
                    <option value="">No vendor</option>
                    {vendorOptions.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </label>
                  </>
                )}
                <label className="block text-xs font-medium text-muted">
                  Actual cost (KES)
                  <input
                    name="actualCost"
                    type="number"
                    min="0"
                    step="1"
                    className="field mt-1"
                    defaultValue={cents(ticket.actualCost) / 100}
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Note
                  <textarea name="note" rows={2} className="field mt-1" placeholder="What happened…" />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Resolution notes
                  <textarea name="resolutionNotes" rows={2} className="field mt-1" defaultValue={ticket.resolutionNotes ?? ''} />
                </label>
                {canClose && canRaiseExpense && (
                <label className="flex items-start gap-2 text-xs text-muted">
                  <input type="checkbox" name="raiseExpense" defaultChecked className="mt-0.5 rounded border-line" />
                  <span>
                    When closing, raise a property expense for the actual cost so it reaches the landlord
                    statement.
                  </span>
                </label>
                )}
              </ActionForm>
            </Card>
          )}

          {linkedExpenses.length > 0 && (
            <Card title="Linked expenses" padded={false}>
              <DataTable
                dense
                rows={linkedExpenses}
                rowKey={(row) => row.id}
                columns={[
                  { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
                  { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
                  { key: 'status', header: 'Approval', align: 'right', render: (row) => <StatusBadge status={row.approvalStatus} /> },
                ]}
                empty={<EmptyState title="No expenses" />}
              />
            </Card>
          )}
        </div>
      </div>

      <div className="mt-4">
        <Card title="Activity" padded={false}>
          {updates.length === 0 ? (
            <EmptyState title="No updates yet" />
          ) : (
            <ol className="divide-y divide-line">
              {updates.map((update) => (
                <li key={update.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{update.authorName ?? 'System'}</span>
                    {update.status && <StatusBadge status={update.status} />}
                    <span className="text-2xs text-faint">{fmtDateTime(update.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{update.note}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  )
}
