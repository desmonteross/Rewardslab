import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq, sql } from 'drizzle-orm'
import {
  ArrowDownToLine,
  FileText,
  LogIn,
  LogOut,
  MessageSquare,
  Receipt,
  Wrench,
} from 'lucide-react'
import { db } from '@/db'
import {
  auditLogs,
  documents,
  leases,
  maintenanceTickets,
  moveEvents,
  paymentAllocations,
  payments,
  properties,
  receipts,
  rentInvoices,
  tenantNotes,
  tenants,
  units,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime, fmtDayMonth } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import {
  Card,
  DataTable,
  DetailList,
  EmptyState,
  KpiCard,
  Money,
  MoneyKpi,
  PageHeader,
  SectionTabs,
  StatusBadge,
  humanise,
} from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { RentalRecordInline, RentalRecordHistory } from '@/components/rental-record'
import { rentalRecordFor } from '@/server/services/rental-record'
import { invitesFor } from '@/server/services/portal-accounts'
import { users } from '@/db/schema'
import { inviteTenantAction, revokeInviteAction } from './portal-actions'

export const dynamic = 'force-dynamic'

const TABS = [
  'overview',
  'lease',
  'ledger',
  'payments',
  'receipts',
  'maintenance',
  'portal',
  'documents',
  'notes',
  'audit',
] as const

export default async function TenantDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParamsPromise
}) {
  const { id } = await params
  const query = await searchParams
  const session = await requirePermission('tenants.view')
  const scope = scopeFromSession(session)
  const tab = (one(query, 'tab') ?? 'overview') as (typeof TABS)[number]

  const [tenant] = await db.select().from(tenants).where(scoped(tenants, scope, eq(tenants.id, id))).limit(1)
  if (!tenant) notFound()

  const [currentLease] = await db
    .select({
      lease: leases,
      unitNumber: units.unitNumber,
      propertyId: properties.id,
      propertyName: properties.name,
      propertyCode: properties.code,
    })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(scoped(leases, scope, eq(leases.tenantId, id)))
    .orderBy(desc(leases.startDate))
    .limit(1)

  const [invoiceRows, paymentRows, receiptRows, ticketRows, noteRows, documentRows, auditRows, leaseRows, moveRows] =
    await Promise.all([
      db
        .select()
        .from(rentInvoices)
        .where(scoped(rentInvoices, scope, eq(rentInvoices.tenantId, id)))
        .orderBy(desc(rentInvoices.periodStart)),
      db
        .select()
        .from(payments)
        .where(scoped(payments, scope, eq(payments.tenantId, id)))
        .orderBy(desc(payments.paidAt)),
      db
        .select()
        .from(receipts)
        .where(scoped(receipts, scope, eq(receipts.tenantId, id)))
        .orderBy(desc(receipts.paidAt)),
      db
        .select()
        .from(maintenanceTickets)
        .where(scoped(maintenanceTickets, scope, eq(maintenanceTickets.tenantId, id)))
        .orderBy(desc(maintenanceTickets.reportedAt)),
      db
        .select()
        .from(tenantNotes)
        .where(scoped(tenantNotes, scope, eq(tenantNotes.tenantId, id)))
        .orderBy(desc(tenantNotes.createdAt)),
      db
        .select()
        .from(documents)
        .where(scoped(documents, scope, eq(documents.entityType, 'Tenant'), eq(documents.entityId, id)))
        .orderBy(desc(documents.createdAt)),
      db
        .select()
        .from(auditLogs)
        .where(scoped(auditLogs, scope, eq(auditLogs.entityType, 'Tenant'), eq(auditLogs.entityId, id)))
        .orderBy(desc(auditLogs.createdAt))
        .limit(50),
      db
        .select({
          lease: leases,
          unitNumber: units.unitNumber,
          propertyName: properties.name,
        })
        .from(leases)
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, leases.propertyId))
        .where(scoped(leases, scope, eq(leases.tenantId, id)))
        .orderBy(desc(leases.startDate)),
      db
        .select()
        .from(moveEvents)
        .where(scoped(moveEvents, scope, eq(moveEvents.tenantId, id)))
        .orderBy(desc(moveEvents.scheduledDate)),
    ])

  const billedCents = invoiceRows
    .filter((invoice) => invoice.status !== 'CANCELLED')
    .reduce((total, invoice) => total + cents(invoice.total), 0)
  const paidCents = paymentRows
    .filter((payment) => payment.status === 'CONFIRMED')
    .reduce((total, payment) => total + cents(payment.grossAmount), 0)
  const balanceCents = invoiceRows
    .filter((invoice) => invoice.status !== 'CANCELLED')
    .reduce((total, invoice) => total + cents(invoice.balance), 0)

  // ---- chronological timeline (spec §10) ----------------------------------
  type TimelineEntry = { at: Date; icon: 'payment' | 'invoice' | 'ticket' | 'move-in' | 'move-out' | 'note'; title: string; detail: string }
  const timeline: TimelineEntry[] = [
    ...paymentRows.map((payment) => ({
      at: payment.paidAt,
      icon: 'payment' as const,
      title: payment.status === 'REVERSED' ? 'Payment reversed' : 'Rent payment received',
      detail: `${formatKES(payment.grossAmount)} · ${payment.reference}${payment.externalReference ? ` · ${payment.externalReference}` : ''}`,
    })),
    ...invoiceRows.map((invoice) => ({
      at: invoice.issueDate,
      icon: 'invoice' as const,
      title: 'Rent invoice generated',
      detail: `${invoice.number} · ${invoice.periodLabel} · ${formatKES(invoice.total)}`,
    })),
    ...ticketRows.map((ticket) => ({
      at: ticket.resolvedAt ?? ticket.reportedAt,
      icon: 'ticket' as const,
      title: ticket.resolvedAt ? 'Maintenance ticket closed' : 'Maintenance ticket raised',
      detail: `${ticket.number} · ${ticket.title}`,
    })),
    ...moveRows.map((move) => ({
      at: move.completedDate ?? move.scheduledDate,
      icon: move.type === 'MOVE_IN' ? ('move-in' as const) : ('move-out' as const),
      title: move.type === 'MOVE_IN' ? 'Moved in' : 'Moved out',
      detail: humanise(move.status),
    })),
    ...noteRows.map((note) => ({
      at: note.createdAt,
      icon: 'note' as const,
      title: 'Note added',
      detail: note.body,
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, 25)

  // Portal tab data. The rental record is derived on read, so it always agrees
  // with the ledger above it.
  const record = await rentalRecordFor(scope, id)
  const invites = can(session, 'tenants.invite') ? await invitesFor(scope, id) : []
  const [portalUser] = await db
    .select({
      id: users.id,
      email: users.email,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(scoped(users, scope, eq(users.tenantId, id)))
    .limit(1)

  const ICONS = {
    payment: ArrowDownToLine,
    invoice: FileText,
    ticket: Wrench,
    'move-in': LogIn,
    'move-out': LogOut,
    note: MessageSquare,
  }

  const href = (next: string) => `/tenants/${id}?tab=${next}`

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tenants', href: '/tenants' }, { label: tenant.fullName }]}
        title={tenant.fullName}
        description={`${tenant.code} · ${tenant.phone}${currentLease ? ` · ${currentLease.propertyName} ${currentLease.unitNumber}` : ''}`}
        actions={
          <>
            {currentLease && (
              <Link href={`/leases/${currentLease.lease.id}`} className="btn-secondary">
                Open lease
              </Link>
            )}
            <Link href={`/reports/tenant-ledger?tenant=${id}`} className="btn-primary">
              Tenant ledger
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-5">
        <KpiCard label="Status" value={humanise(tenant.status)} tone={tenant.status === 'ACTIVE' ? 'positive' : 'neutral'} />
        <MoneyKpi label="Monthly rent" amount={currentLease?.lease.monthlyRent ?? 0} />
        <MoneyKpi label="Deposit held" amount={currentLease?.lease.deposit ?? 0} />
        <MoneyKpi label="Billed to date" amount={billedCents / 100} sub={`${invoiceRows.length} invoices`} />
        <MoneyKpi
          label="Outstanding balance"
          amount={balanceCents / 100}
          tone={balanceCents > 0 ? 'negative' : 'positive'}
          sub={balanceCents > 0 ? 'In arrears' : `${formatKES(paidCents / 100)} paid`}
        />
      </div>

      <div className="mt-6">
        <SectionTabs
          current={href(tab)}
          tabs={[
            { label: 'Overview', href: href('overview') },
            { label: 'Lease', href: href('lease'), count: leaseRows.length },
            { label: 'Rent ledger', href: href('ledger'), count: invoiceRows.length },
            { label: 'Payments', href: href('payments'), count: paymentRows.length },
            { label: 'Receipts', href: href('receipts'), count: receiptRows.length },
            { label: 'Maintenance', href: href('maintenance'), count: ticketRows.length },
            { label: 'Portal', href: href('portal') },
            { label: 'Documents', href: href('documents'), count: documentRows.length },
            { label: 'Notes', href: href('notes'), count: noteRows.length },
            { label: 'Audit history', href: href('audit'), count: auditRows.length },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title="Tenant details" className="lg:col-span-2">
            <DetailList
              columns={3}
              items={[
                { label: 'Tenant ID', value: tenant.code },
                { label: 'National ID', value: tenant.nationalId ?? tenant.passportNumber ?? '—' },
                { label: 'KRA PIN', value: tenant.kraPin ?? '—' },
                { label: 'Phone', value: tenant.phone },
                { label: 'Email', value: tenant.email ?? '—' },
                { label: 'Occupation', value: tenant.occupation ?? '—' },
                { label: 'Employer', value: tenant.employer ?? '—' },
                { label: 'Emergency contact', value: tenant.emergencyName ? `${tenant.emergencyName} (${tenant.emergencyRelationship ?? 'contact'})` : '—' },
                { label: 'Emergency phone', value: tenant.emergencyPhone ?? '—' },
                { label: 'Property', value: currentLease?.propertyName ?? '—' },
                { label: 'Unit', value: currentLease?.unitNumber ?? '—' },
                { label: 'Move-in date', value: currentLease?.lease.moveInDate ? fmtDate(currentLease.lease.moveInDate) : '—' },
              ]}
            />
          </Card>

          <Card title="Timeline" description="Everything that has happened on this tenancy." padded={false}>
            {timeline.length === 0 ? (
              <EmptyState title="Nothing has happened yet" />
            ) : (
              <ol className="divide-y divide-line">
                {timeline.map((entry, index) => {
                  const Glyph = ICONS[entry.icon]
                  return (
                    <li key={`${entry.icon}-${index}`} className="flex gap-3 px-4 py-3">
                      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-canvas text-muted">
                        <Glyph className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-faint">{fmtDayMonth(entry.at)}</p>
                        <p className="mt-0.5 text-sm font-medium text-ink">{entry.title}</p>
                        <p className="mt-0.5 break-words text-xs text-muted">{entry.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ol>
            )}
          </Card>
        </div>
      )}

      {tab === 'lease' && (
        <Card padded={false} title="Leases">
          <DataTable
            rows={leaseRows}
            rowKey={(row) => row.lease.id}
            rowHref={(row) => `/leases/${row.lease.id}`}
            columns={[
              { key: 'code', header: 'Lease', render: (row) => <span className="font-mono text-xs">{row.lease.code}</span> },
              { key: 'unit', header: 'Unit', render: (row) => <span className="text-sm">{row.propertyName} · {row.unitNumber}</span> },
              { key: 'start', header: 'Start', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.lease.startDate)}</span> },
              { key: 'end', header: 'End', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.lease.endDate)}</span> },
              { key: 'rent', header: 'Rent', align: 'right', render: (row) => <Money value={row.lease.monthlyRent} /> },
              { key: 'deposit', header: 'Deposit', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.lease.deposit} muted /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.lease.status} /> },
            ]}
            empty={<EmptyState title="No leases on record" />}
          />
        </Card>
      )}

      {tab === 'ledger' && (
        <Card padded={false} title="Rent ledger" description="Every invoice raised against this tenancy.">
          <DataTable
            rows={invoiceRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/invoices/${row.id}`}
            columns={[
              { key: 'number', header: 'Invoice', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              { key: 'period', header: 'Period', render: (row) => <span className="text-sm">{row.periodLabel}</span> },
              { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.dueDate)}</span> },
              { key: 'total', header: 'Billed', align: 'right', render: (row) => <Money value={row.total} /> },
              { key: 'paid', header: 'Paid', align: 'right', render: (row) => <Money value={row.amountPaid} tone="positive" /> },
              { key: 'balance', header: 'Balance', align: 'right', render: (row) => (cents(row.balance) > 0 ? <Money value={row.balance} tone="negative" /> : <Money value="0" muted />) },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No invoices raised yet" />}
            footer={
              <tr className="text-sm">
                <td className="px-4 py-2.5 font-medium text-ink">Totals</td>
                <td />
                <td className="hidden sm:table-cell" />
                <td className="px-4 py-2.5 text-right"><Money value={billedCents / 100} /></td>
                <td className="px-4 py-2.5 text-right"><Money value={(billedCents - balanceCents) / 100} tone="positive" /></td>
                <td className="px-4 py-2.5 text-right"><Money value={balanceCents / 100} tone={balanceCents > 0 ? 'negative' : 'neutral'} /></td>
                <td />
              </tr>
            }
          />
        </Card>
      )}

      {tab === 'payments' && (
        <Card padded={false} title="Payments">
          <DataTable
            rows={paymentRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/payments/${row.id}`}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
              { key: 'external', header: 'M-Pesa ref', hideOnMobile: true, render: (row) => <span className="font-mono text-xs text-muted">{row.externalReference ?? '—'}</span> },
              { key: 'date', header: 'Paid', render: (row) => <span className="text-xs text-muted">{fmtDate(row.paidAt)}</span> },
              { key: 'method', header: 'Method', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.method)}</span> },
              { key: 'gross', header: 'Gross', align: 'right', render: (row) => <Money value={row.grossAmount} /> },
              { key: 'allocated', header: 'Allocated', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.allocatedAmount} muted /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No payments recorded" />}
          />
        </Card>
      )}

      {tab === 'receipts' && (
        <Card padded={false} title="Receipts">
          <DataTable
            rows={receiptRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/receipts/${row.id}`}
            columns={[
              { key: 'number', header: 'Receipt', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              { key: 'period', header: 'Period', render: (row) => <span className="text-sm">{row.periodLabel}</span> },
              { key: 'date', header: 'Paid', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.paidAt)}</span> },
              { key: 'method', header: 'Method', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.method)}</span> },
              { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
              { key: 'balance', header: 'Balance after', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.balanceAfter} muted /> },
            ]}
            empty={<EmptyState title="No receipts issued" />}
          />
        </Card>
      )}

      {tab === 'maintenance' && (
        <Card padded={false} title="Maintenance">
          <DataTable
            rows={ticketRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/maintenance/${row.id}`}
            columns={[
              { key: 'number', header: 'Ticket', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              { key: 'title', header: 'Issue', render: (row) => <span className="text-sm">{row.title}</span> },
              { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.category)}</span> },
              { key: 'reported', header: 'Reported', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.reportedAt)}</span> },
              { key: 'priority', header: 'Priority', align: 'right', render: (row) => <StatusBadge status={row.priority} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No maintenance tickets" />}
          />
        </Card>
      )}

      {tab === 'portal' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <Card
              title="Rental record"
              description="Derived from this tenant's own invoices and payments. The tenant sees exactly this."
            >
              <RentalRecordInline record={record} />
            </Card>

            <Card title="Month by month" description="What the record is built from.">
              <RentalRecordHistory record={record} limit={18} />
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Portal account">
              {portalUser ? (
                <DetailList
                  columns={1}
                  items={[
                    { label: 'Email', value: portalUser.email },
                    {
                      label: 'Status',
                      value: (
                        <StatusBadge
                          status={portalUser.isActive ? 'ACTIVE' : 'INACTIVE'}
                          tone={portalUser.isActive ? 'positive' : 'neutral'}
                        />
                      ),
                    },
                    { label: 'Created', value: fmtDate(portalUser.createdAt) },
                    {
                      label: 'Last signed in',
                      value: portalUser.lastLoginAt ? fmtDateTime(portalUser.lastLoginAt) : 'Never',
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  title="No portal account yet"
                  description="Invite this tenant to give them their rent balance, receipts, statement and a way to report repairs."
                />
              )}
            </Card>

            {can(session, 'tenants.invite') && !portalUser && (
              <Card title="Invite to the portal">
                <ActionForm action={inviteTenantAction} label="Send invitation" pendingLabel="Creating…">
                  <input type="hidden" name="tenantId" value={id} />
                  <div>
                    <label htmlFor="invite-email" className="label">
                      Email address
                    </label>
                    <input
                      id="invite-email"
                      name="email"
                      type="email"
                      defaultValue={tenant.email ?? ''}
                      placeholder="tenant@example.co.ke"
                      className="field mt-1.5"
                    />
                    <p className="mt-1.5 text-xs text-faint">
                      A one-time link valid for 72 hours. Only its hash is stored.
                    </p>
                  </div>
                </ActionForm>
              </Card>
            )}

            {invites.length > 0 && (
              <Card title="Invitations" padded={false}>
                <ul className="divide-y divide-line">
                  {invites.map((invite) => (
                    <li key={invite.id} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink">{invite.email}</p>
                          <p className="mt-0.5 text-2xs text-faint">
                            {invite.invitedByName ?? 'System'} · expires {fmtDate(invite.expiresAt)}
                          </p>
                        </div>
                        <StatusBadge
                          status={invite.status}
                          tone={
                            invite.status === 'ACCEPTED'
                              ? 'positive'
                              : invite.status === 'PENDING'
                                ? 'warning'
                                : 'neutral'
                          }
                        />
                      </div>
                      {invite.status === 'PENDING' && can(session, 'tenants.invite') && (
                        <div className="mt-2">
                          <ActionForm
                            action={revokeInviteAction}
                            label="Revoke"
                            variant="danger"
                            confirm="Revoke this invitation? The link will stop working."
                            buttonClassName="px-2.5 py-1 text-xs"
                          >
                            <input type="hidden" name="inviteId" value={invite.id} />
                            <input type="hidden" name="tenantId" value={id} />
                          </ActionForm>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <Card padded={false} title="Documents">
          <DataTable
            rows={documentRows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'name', header: 'Document', render: (row) => <span className="text-sm">{row.name}</span> },
              { key: 'type', header: 'Type', render: (row) => <span className="text-xs text-muted">{humanise(row.type)}</span> },
              { key: 'uploaded', header: 'Uploaded', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.createdAt)}</span> },
              { key: 'by', header: 'By', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.uploadedByName ?? '—'}</span> },
            ]}
            empty={<EmptyState title="No documents uploaded" description="Lease agreements, ID copies and KRA PIN certificates appear here." />}
          />
        </Card>
      )}

      {tab === 'notes' && (
        <Card title="Notes" padded={false}>
          {noteRows.length === 0 ? (
            <EmptyState title="No notes yet" description="Notes recorded by the property manager appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {noteRows.map((note) => (
                <li key={note.id} className="px-5 py-4">
                  <p className="text-sm leading-relaxed text-ink">{note.body}</p>
                  <p className="mt-1.5 text-2xs text-faint">
                    {note.authorName ?? 'System'} · {fmtDateTime(note.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === 'audit' && (
        <Card padded={false} title="Audit history">
          <DataTable
            rows={auditRows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'when', header: 'When', render: (row) => <span className="text-xs tabular-nums text-muted">{fmtDateTime(row.createdAt)}</span> },
              { key: 'action', header: 'Action', render: (row) => <span className="text-sm">{row.action}</span> },
              { key: 'user', header: 'User', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.userName ?? 'System'}</span> },
              { key: 'reference', header: 'Reference', align: 'right', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-muted">{row.reference ?? '—'}</span> },
            ]}
            empty={<EmptyState title="No audit entries for this tenant" />}
          />
        </Card>
      )}
    </>
  )
}

