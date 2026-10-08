import Link from 'next/link'
import clsx from 'clsx'
import { asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  maintenanceCategoryEnum,
  maintenanceTickets,
  priorityEnum,
  properties,
  tenants,
  ticketStatusEnum,
  units,
  users,
  vendors,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { FilterBar, ViewSwitch } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { createTicketAction } from './actions'
import { TICKET_FLOW } from '@/server/services/maintenance'

export const metadata = { title: 'Maintenance' }
export const dynamic = 'force-dynamic'

const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-faint',
  MEDIUM: 'bg-brand',
  HIGH: 'bg-serious',
  URGENT: 'bg-negative',
}

export default async function MaintenancePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('maintenance.view')
  const scope = scopeFromSession(session)
  const view = one(params, 'view') ?? 'board'

  const query = one(params, 'q')
  const status = one(params, 'status')
  const priority = one(params, 'priority')
  const category = one(params, 'category')
  const propertyId = one(params, 'property')

  const where = landlordScoped(
    properties,
    scope,
    query ? or(ilike(maintenanceTickets.title, `%${query}%`), ilike(maintenanceTickets.number, `%${query}%`)) : undefined,
    status ? eq(maintenanceTickets.status, status as 'REPORTED') : undefined,
    priority ? eq(maintenanceTickets.priority, priority as 'HIGH') : undefined,
    category ? eq(maintenanceTickets.category, category as 'PLUMBING') : undefined,
    propertyId ? eq(maintenanceTickets.propertyId, propertyId) : undefined,
  )

  const [rows, [summary], propertyOptions, vendorOptions, assigneeOptions] = await Promise.all([
    db
      .select({
        id: maintenanceTickets.id,
        number: maintenanceTickets.number,
        title: maintenanceTickets.title,
        category: maintenanceTickets.category,
        priority: maintenanceTickets.priority,
        status: maintenanceTickets.status,
        estimatedCost: maintenanceTickets.estimatedCost,
        actualCost: maintenanceTickets.actualCost,
        reportedAt: maintenanceTickets.reportedAt,
        dueDate: maintenanceTickets.dueDate,
        propertyName: properties.name,
        unitNumber: units.unitNumber,
        tenantName: tenants.fullName,
        assigneeName: users.fullName,
        vendorName: vendors.name,
      })
      .from(maintenanceTickets)
      .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
      .leftJoin(units, eq(units.id, maintenanceTickets.unitId))
      .leftJoin(tenants, eq(tenants.id, maintenanceTickets.tenantId))
      .leftJoin(users, eq(users.id, maintenanceTickets.assignedToId))
      .leftJoin(vendors, eq(vendors.id, maintenanceTickets.vendorId))
      .where(where)
      .orderBy(desc(maintenanceTickets.reportedAt))
      .limit(400),
    db
      .select({
        open: sql<number>`count(*) filter (where ${maintenanceTickets.status} <> 'CLOSED')::int`,
        urgent: sql<number>`count(*) filter (where ${maintenanceTickets.priority} = 'URGENT' and ${maintenanceTickets.status} <> 'CLOSED')::int`,
        overdue: sql<number>`count(*) filter (where ${maintenanceTickets.dueDate} < now() and ${maintenanceTickets.status} not in ('RESOLVED','CLOSED'))::int`,
        spend: sql<string>`coalesce(sum(${maintenanceTickets.actualCost}), 0)`,
      })
      .from(maintenanceTickets)
      .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
      .where(landlordScoped(properties, scope)),
    db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(scoped(vendors, scope, eq(vendors.isActive, true))).orderBy(asc(vendors.name)),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(sql`${users.organizationId} = ${scope.organizationId} and ${users.isActive} = true and ${users.role} not in ('TENANT', 'LANDLORD')`)
      .orderBy(asc(users.fullName)),
  ])

  const canCreate = can(session, 'maintenance.create')
  const canAssign = can(session, 'maintenance.assign')
  const boardColumns = TICKET_FLOW.filter((state) => state !== 'CLOSED')

  return (
    <>
      <PageHeader
        title="Maintenance"
        description="Tickets from tenants and caretakers, from report through to the cost hitting the landlord statement."
        actions={
          <ViewSwitch
            name="view"
            fallback="board"
            options={[
              { value: 'board', label: 'Board' },
              { value: 'table', label: 'Table' },
            ]}
          />
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Open tickets" value={String(summary?.open ?? 0)} tone={(summary?.open ?? 0) > 10 ? 'warning' : 'neutral'} />
        <KpiCard label="Urgent" value={String(summary?.urgent ?? 0)} tone={(summary?.urgent ?? 0) > 0 ? 'negative' : 'positive'} />
        <KpiCard label="Past due date" value={String(summary?.overdue ?? 0)} tone={(summary?.overdue ?? 0) > 0 ? 'serious' : 'positive'} />
        <KpiCard label="Spend to date" value={formatKES(summary?.spend ?? 0)} />
      </div>

      {canCreate && (
        <div className="mb-4">
          <Card title="Raise a ticket">
            <ActionForm action={createTicketAction} label="Raise ticket" pendingLabel="Raising…">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-muted">
                  Property
                  <select name="propertyId" className="field mt-1" defaultValue="" required>
                    <option value="">Choose a property…</option>
                    {propertyOptions.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Category
                  <select name="category" className="field mt-1" defaultValue="PLUMBING">
                    {maintenanceCategoryEnum.enumValues.map((value) => (
                      <option key={value} value={value}>
                        {humanise(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Priority
                  <select name="priority" className="field mt-1" defaultValue="MEDIUM">
                    {priorityEnum.enumValues.map((value) => (
                      <option key={value} value={value}>
                        {humanise(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted sm:col-span-2">
                  Title
                  <input name="title" className="field mt-1" placeholder="Kitchen sink blocked" required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Estimated cost (KES)
                  <input name="estimatedCost" type="number" min="0" step="1" className="field mt-1" defaultValue="0" />
                </label>
                <label className="block text-xs font-medium text-muted sm:col-span-3">
                  Description
                  <textarea name="description" rows={2} className="field mt-1" placeholder="What the tenant reported…" />
                </label>
                {canAssign && (
                  <>
                <label className="block text-xs font-medium text-muted">
                  Assign to
                  <select name="assignedToId" className="field mt-1" defaultValue="">
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
                  <select name="vendorId" className="field mt-1" defaultValue="">
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
              </div>
            </ActionForm>
          </Card>
        </div>
      )}

      <FilterBar
        searchPlaceholder="Search ticket number or title…"
        selects={[
          { name: 'status', label: 'All statuses', options: ticketStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'priority', label: 'All priorities', options: priorityEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'category', label: 'All categories', options: maintenanceCategoryEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />

      {view === 'board' ? (
        <div className="grid gap-3 overflow-x-auto lg:grid-cols-3 xl:grid-cols-6">
          {boardColumns.map((column) => {
            const columnRows = rows.filter((row) => row.status === column)
            return (
              <div key={column} className="min-w-[15rem]">
                <div className="mb-2 flex items-center justify-between gap-2 px-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-faint">{humanise(column)}</p>
                  <span className="rounded-full bg-canvas px-1.5 py-0.5 text-2xs tabular-nums text-faint">
                    {columnRows.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {columnRows.length === 0 && (
                    <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-2xs text-faint">
                      Nothing here
                    </p>
                  )}
                  {columnRows.map((ticket) => (
                    <Link
                      key={ticket.id}
                      href={`/maintenance/${ticket.id}`}
                      className="block overflow-hidden rounded-lg border border-line bg-surface transition-colors hover:border-brand/50"
                    >
                      <div className={clsx('h-1 w-full', PRIORITY_BAR[ticket.priority])} aria-hidden />
                      <div className="p-3">
                        <p className="text-sm font-medium leading-snug text-ink">{ticket.title}</p>
                        <p className="mt-1 text-2xs text-faint">
                          {ticket.number} · {ticket.propertyName}
                          {ticket.unitNumber ? ` · ${ticket.unitNumber}` : ''}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={ticket.priority} />
                          <span className="text-2xs text-faint">{humanise(ticket.category)}</span>
                        </div>
                        <p className="mt-2 text-2xs text-faint">
                          {ticket.assigneeName ?? ticket.vendorName ?? 'Unassigned'} · {fmtDate(ticket.reportedAt)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <Card padded={false}>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/maintenance/${row.id}`}
            columns={[
              { key: 'number', header: 'Ticket', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              {
                key: 'title',
                header: 'Issue',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.title}</p>
                    <p className="truncate text-2xs text-faint">
                      {row.propertyName}
                      {row.unitNumber ? ` · ${row.unitNumber}` : ''}
                      {row.tenantName ? ` · ${row.tenantName}` : ''}
                    </p>
                  </div>
                ),
              },
              { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.category)}</span> },
              { key: 'assignee', header: 'Assigned to', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.assigneeName ?? row.vendorName ?? '—'}</span> },
              { key: 'reported', header: 'Reported', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.reportedAt)}</span> },
              { key: 'cost', header: 'Cost', align: 'right', render: (row) => <Money value={cents(row.actualCost) > 0 ? row.actualCost : row.estimatedCost} muted /> },
              { key: 'priority', header: 'Priority', align: 'right', render: (row) => <StatusBadge status={row.priority} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No tickets match these filters" />}
          />
        </Card>
      )}
    </>
  )
}
