import Link from 'next/link'
import { notFound } from 'next/navigation'
import clsx from 'clsx'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  documents,
  eritsPeriodProperties,
  eritsProperties,
  expenses,
  landlords,
  leases,
  maintenanceTickets,
  payments,
  properties,
  rentInvoices,
  tenants,
  units,
  users,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, formatKES, formatPercent, percent } from '@/lib/money'
import { fmtDate, periodOf } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import {
  Card,
  DataTable,
  DetailList,
  EmptyState,
  KpiCard,
  Money,
  MoneyKpi,
  Notice,
  PageHeader,
  SectionTabs,
  StatusBadge,
  humanise,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

const STATUS_CELL: Record<string, string> = {
  OCCUPIED: 'border-positive/30 bg-positive/5',
  VACANT: 'border-warning/40 bg-warning/5',
  RESERVED: 'border-brand/30 bg-brand/5',
  MAINTENANCE: 'border-serious/40 bg-serious/5',
  UNAVAILABLE: 'border-line bg-canvas',
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParamsPromise
}) {
  const { id } = await params
  const query = await searchParams
  const session = await requirePermission('properties.view')
  const scope = scopeFromSession(session)
  const tab = one(query, 'tab') ?? 'overview'
  const period = periodOf(new Date())

  const [record] = await db
    .select({
      property: properties,
      landlordId: landlords.id,
      landlordName: landlords.fullName,
      landlordCompany: landlords.companyName,
      landlordKraPin: landlords.kraPin,
      managerName: users.fullName,
    })
    .from(properties)
    .innerJoin(landlords, eq(landlords.id, properties.landlordId))
    .leftJoin(users, eq(users.id, properties.managerId))
    .where(landlordScoped(properties, scope, eq(properties.id, id)))
    .limit(1)

  if (!record) notFound()
  const { property } = record

  const [
    unitRows,
    tenantRows,
    leaseRows,
    invoiceRows,
    paymentRows,
    expenseRows,
    ticketRows,
    eritsRow,
    eritsHistory,
    documentRows,
    [stats],
  ] = await Promise.all([
    db.select().from(units).where(scoped(units, scope, eq(units.propertyId, id))).orderBy(asc(units.floor), asc(units.unitNumber)),
    db
      .select({
        id: tenants.id,
        code: tenants.code,
        fullName: tenants.fullName,
        phone: tenants.phone,
        status: tenants.status,
        unitNumber: units.unitNumber,
        monthlyRent: leases.monthlyRent,
        leaseId: leases.id,
        balance: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.tenant_id = tenants.id and i.status <> 'CANCELLED')`,
      })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(scoped(leases, scope, eq(leases.propertyId, id), sql`${leases.status} in ('ACTIVE','EXPIRING')`))
      .orderBy(asc(units.unitNumber)),
    db
      .select({ lease: leases, tenantName: tenants.fullName, unitNumber: units.unitNumber })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .where(scoped(leases, scope, eq(leases.propertyId, id)))
      .orderBy(desc(leases.startDate))
      .limit(100),
    db
      .select({
        invoice: rentInvoices,
        tenantName: tenants.fullName,
        unitNumber: units.unitNumber,
      })
      .from(rentInvoices)
      .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
      .innerJoin(units, eq(units.id, rentInvoices.unitId))
      .where(scoped(rentInvoices, scope, eq(rentInvoices.propertyId, id)))
      .orderBy(desc(rentInvoices.issueDate))
      .limit(100),
    db
      .select({ payment: payments, tenantName: tenants.fullName, unitNumber: units.unitNumber })
      .from(payments)
      .leftJoin(tenants, eq(tenants.id, payments.tenantId))
      .leftJoin(units, eq(units.id, payments.unitId))
      .where(scoped(payments, scope, eq(payments.propertyId, id)))
      .orderBy(desc(payments.paidAt))
      .limit(100),
    db.select().from(expenses).where(scoped(expenses, scope, eq(expenses.propertyId, id))).orderBy(desc(expenses.expenseDate)).limit(100),
    db.select().from(maintenanceTickets).where(scoped(maintenanceTickets, scope, eq(maintenanceTickets.propertyId, id))).orderBy(desc(maintenanceTickets.reportedAt)).limit(100),
    db.select().from(eritsProperties).where(scoped(eritsProperties, scope, eq(eritsProperties.propertyId, id))).limit(1).then((rows) => rows[0]),
    db
      .select()
      .from(eritsPeriodProperties)
      .where(scoped(eritsPeriodProperties, scope, eq(eritsPeriodProperties.propertyId, id)))
      .orderBy(desc(eritsPeriodProperties.createdAt))
      .limit(12),
    db.select().from(documents).where(scoped(documents, scope, eq(documents.entityType, 'Property'), eq(documents.entityId, id))).orderBy(desc(documents.createdAt)),
    db
      .select({
        collectedMonth: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.property_id = ${id} and p.status = 'CONFIRMED' and p.paid_at >= ${period.start} and p.paid_at <= ${period.end})`,
        billedMonth: sql<string>`(select coalesce(sum(i.total), 0) from rent_invoices i where i.property_id = ${id} and i.period_year = ${period.year} and i.period_month = ${period.month} and i.status <> 'CANCELLED')`,
        outstanding: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.property_id = ${id} and i.status <> 'CANCELLED')`,
        expensesMonth: sql<string>`(select coalesce(sum(e.amount), 0) from expenses e where e.property_id = ${id} and e.approval_status = 'APPROVED' and e.expense_date >= ${period.start})`,
      })
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1),
  ])

  const occupied = unitRows.filter((unit) => unit.status === 'OCCUPIED').length
  const collectionRate = percent(cents(stats?.collectedMonth), cents(stats?.billedMonth))
  const href = (next: string) => `/properties/${id}?tab=${next}`

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Properties', href: '/properties' }, { label: property.name }]}
        title={property.name}
        description={`${property.code} · ${humanise(property.type)} · ${property.area ?? property.town}, ${property.county}`}
        actions={
          <>
            <Link href={`/landlords/${record.landlordId}`} className="btn-secondary">
              Landlord
            </Link>
            <Link href={`/rent?property=${id}`} className="btn-primary">
              Rent collection
            </Link>
          </>
        }
      />

      {!eritsRow && (
        <div className="mb-4">
          <Notice tone="warning" title="This property is not mapped to KRA eRITS">
            Rental income from {property.name} cannot be included in an eRITS return until the property is
            mapped.{' '}
            <Link href="/erits" className="link">
              Complete the mapping
            </Link>
            .
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Units" value={String(unitRows.length)} sub={`${occupied} occupied`} />
        <KpiCard
          label="Occupancy"
          value={formatPercent(percent(occupied, unitRows.length))}
          tone={percent(occupied, unitRows.length) >= 85 ? 'positive' : 'warning'}
        />
        <MoneyKpi label="Expected / month" amount={property.expectedMonthlyRent} />
        <MoneyKpi label={`Billed ${period.label.split(' ')[0]}`} amount={stats?.billedMonth ?? 0} />
        <MoneyKpi label="Collected" amount={stats?.collectedMonth ?? 0} tone="positive" sub={`${formatPercent(collectionRate)} of billed`} />
        <MoneyKpi label="Outstanding" amount={stats?.outstanding ?? 0} tone={cents(stats?.outstanding) > 0 ? 'warning' : 'positive'} />
      </div>

      <div className="mt-6">
        <SectionTabs
          current={href(tab)}
          tabs={[
            { label: 'Overview', href: href('overview') },
            { label: 'Units', href: href('units'), count: unitRows.length },
            { label: 'Tenants', href: href('tenants'), count: tenantRows.length },
            { label: 'Leases', href: href('leases'), count: leaseRows.length },
            { label: 'Rent', href: href('rent'), count: invoiceRows.length },
            { label: 'Payments', href: href('payments'), count: paymentRows.length },
            { label: 'Expenses', href: href('expenses'), count: expenseRows.length },
            { label: 'Maintenance', href: href('maintenance'), count: ticketRows.length },
            { label: 'Statements', href: href('statements') },
            { label: 'Tax / eRITS', href: href('tax') },
            { label: 'Documents', href: href('documents'), count: documentRows.length },
          ]}
        />
      </div>

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="Property details">
            <DetailList
              columns={3}
              items={[
                { label: 'Property ID', value: property.code },
                { label: 'Type', value: humanise(property.type) },
                { label: 'Status', value: <StatusBadge status={property.status} /> },
                { label: 'Owner', value: <Link href={`/landlords/${record.landlordId}`} className="link">{record.landlordCompany ?? record.landlordName}</Link> },
                { label: 'Property manager', value: record.managerName ?? 'Unassigned' },
                { label: 'KRA PIN', value: property.kraPin ?? record.landlordKraPin ?? <span className="text-negative">Missing</span> },
                { label: 'eRITS property reference', value: property.eritsPropertyRef ?? <span className="text-warning">Not issued</span> },
                { label: 'County', value: property.county },
                { label: 'Town', value: property.town },
                { label: 'Area / estate', value: property.area ?? '—' },
                { label: 'Address', value: property.address ?? '—' },
                { label: 'Number of units', value: String(property.unitCount) },
                { label: 'Expected monthly income', value: formatKES(property.expectedMonthlyRent) },
                { label: 'Management fee', value: `${property.managementFeeRate}%` },
                { label: 'Commission rate', value: property.commissionRate ? `${property.commissionRate}% (override)` : 'Organization default' },
                { label: 'Settlement account', value: property.settlementAccount ?? 'Landlord default' },
                { label: 'Year built', value: property.yearBuilt ? String(property.yearBuilt) : '—' },
              ]}
            />
            {property.description && (
              <p className="mt-5 border-t border-line pt-4 text-sm leading-relaxed text-muted">{property.description}</p>
            )}
          </Card>

          <Card title="This month" description={period.label}>
            <DetailList
              columns={1}
              items={[
                { label: 'Billed', value: formatKES(stats?.billedMonth ?? 0) },
                { label: 'Collected', value: formatKES(stats?.collectedMonth ?? 0) },
                { label: 'Collection rate', value: formatPercent(collectionRate) },
                { label: 'Approved expenses', value: formatKES(stats?.expensesMonth ?? 0) },
                { label: 'Open maintenance tickets', value: String(ticketRows.filter((t) => t.status !== 'CLOSED').length) },
                { label: 'Total outstanding', value: formatKES(stats?.outstanding ?? 0) },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === 'units' && (
        <Card title="Occupancy" description="Every unit in this property and its current state.">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
            {unitRows.map((unit) => (
              <div
                key={unit.id}
                className={clsx('rounded-lg border px-3 py-2.5', STATUS_CELL[unit.status] ?? 'border-line')}
              >
                <p className="truncate text-sm font-semibold text-ink">{unit.unitNumber}</p>
                <p className="mt-0.5 truncate text-2xs text-muted">{humanise(unit.status)}</p>
                <p className="mt-1 truncate text-2xs tabular-nums text-faint">{formatKES(unit.monthlyRent)}</p>
                <p className="truncate text-2xs text-faint">{humanise(unit.type)}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === 'tenants' && (
        <Card padded={false} title="Tenants in occupation">
          <DataTable
            rows={tenantRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/tenants/${row.id}`}
            columns={[
              { key: 'name', header: 'Tenant', render: (row) => <span className="text-sm font-medium text-ink">{row.fullName}</span> },
              { key: 'unit', header: 'Unit', render: (row) => <span className="text-sm">{row.unitNumber}</span> },
              { key: 'phone', header: 'Phone', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.phone}</span> },
              { key: 'rent', header: 'Rent', align: 'right', render: (row) => <Money value={row.monthlyRent} /> },
              { key: 'balance', header: 'Balance', align: 'right', render: (row) => (cents(row.balance) > 0 ? <Money value={row.balance} tone="negative" /> : <span className="text-sm text-positive">Up to date</span>) },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No tenants in occupation" />}
          />
        </Card>
      )}

      {tab === 'leases' && (
        <Card padded={false} title="Leases">
          <DataTable
            rows={leaseRows}
            rowKey={(row) => row.lease.id}
            rowHref={(row) => `/leases/${row.lease.id}`}
            columns={[
              { key: 'code', header: 'Lease', render: (row) => <span className="font-mono text-xs">{row.lease.code}</span> },
              { key: 'tenant', header: 'Tenant', render: (row) => <span className="text-sm">{row.tenantName}</span> },
              { key: 'unit', header: 'Unit', render: (row) => <span className="text-sm">{row.unitNumber}</span> },
              { key: 'start', header: 'Start', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.lease.startDate)}</span> },
              { key: 'end', header: 'End', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.lease.endDate)}</span> },
              { key: 'rent', header: 'Rent', align: 'right', render: (row) => <Money value={row.lease.monthlyRent} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.lease.status} /> },
            ]}
            empty={<EmptyState title="No leases on this property" />}
          />
        </Card>
      )}

      {tab === 'rent' && (
        <Card padded={false} title="Rent invoices">
          <DataTable
            rows={invoiceRows}
            rowKey={(row) => row.invoice.id}
            rowHref={(row) => `/invoices/${row.invoice.id}`}
            columns={[
              { key: 'number', header: 'Invoice', render: (row) => <span className="font-mono text-xs">{row.invoice.number}</span> },
              { key: 'tenant', header: 'Tenant', render: (row) => <span className="text-sm">{row.tenantName}</span> },
              { key: 'unit', header: 'Unit', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.unitNumber}</span> },
              { key: 'period', header: 'Period', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.invoice.periodLabel}</span> },
              { key: 'total', header: 'Total', align: 'right', render: (row) => <Money value={row.invoice.total} /> },
              { key: 'balance', header: 'Balance', align: 'right', render: (row) => <Money value={row.invoice.balance} tone={cents(row.invoice.balance) > 0 ? 'negative' : 'neutral'} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.invoice.status} /> },
            ]}
            empty={<EmptyState title="Nothing billed on this property yet" />}
          />
        </Card>
      )}

      {tab === 'payments' && (
        <Card padded={false} title="Payments received">
          <DataTable
            rows={paymentRows}
            rowKey={(row) => row.payment.id}
            rowHref={(row) => `/payments/${row.payment.id}`}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.payment.reference}</span> },
              { key: 'tenant', header: 'Tenant', render: (row) => <span className="text-sm">{row.tenantName ?? 'Unmatched'}</span> },
              { key: 'paid', header: 'Paid', render: (row) => <span className="text-xs text-muted">{fmtDate(row.payment.paidAt)}</span> },
              { key: 'gross', header: 'Gross', align: 'right', render: (row) => <Money value={row.payment.grossAmount} /> },
              { key: 'commission', header: 'Commission', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.payment.commissionAmount} muted /> },
              { key: 'net', header: 'Net', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.payment.netAmount} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.payment.status} /> },
            ]}
            empty={<EmptyState title="No payments recorded" />}
          />
        </Card>
      )}

      {tab === 'expenses' && (
        <Card padded={false} title="Expenses">
          <DataTable
            rows={expenseRows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
              { key: 'description', header: 'Description', render: (row) => <span className="text-sm">{row.description}</span> },
              { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.category)}</span> },
              { key: 'date', header: 'Date', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.expenseDate)}</span> },
              { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
              { key: 'approval', header: 'Approval', align: 'right', render: (row) => <StatusBadge status={row.approvalStatus} /> },
            ]}
            empty={<EmptyState title="No expenses recorded on this property" />}
          />
        </Card>
      )}

      {tab === 'maintenance' && (
        <Card padded={false} title="Maintenance tickets">
          <DataTable
            rows={ticketRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/maintenance/${row.id}`}
            columns={[
              { key: 'number', header: 'Ticket', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              { key: 'title', header: 'Issue', render: (row) => <span className="text-sm">{row.title}</span> },
              { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.category)}</span> },
              { key: 'reported', header: 'Reported', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.reportedAt)}</span> },
              { key: 'cost', header: 'Cost', align: 'right', hideOnMobile: true, render: (row) => <Money value={cents(row.actualCost) > 0 ? row.actualCost : row.estimatedCost} muted /> },
              { key: 'priority', header: 'Priority', align: 'right', render: (row) => <StatusBadge status={row.priority} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No maintenance tickets" />}
          />
        </Card>
      )}

      {tab === 'statements' && (
        <Card title="Statements" description="Owner statements are produced per landlord, across their whole portfolio.">
          <p className="text-sm leading-relaxed text-muted">
            This property belongs to{' '}
            <Link href={`/landlords/${record.landlordId}`} className="link">
              {record.landlordCompany ?? record.landlordName}
            </Link>
            . Their monthly statement shows gross rent collected, commission, approved expenses and the net
            payable across every property they own.
          </p>
          <Link href={`/reports/landlord-statement?landlord=${record.landlordId}`} className="btn-primary mt-4">
            Open landlord statement
          </Link>
        </Card>
      )}

      {tab === 'tax' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="eRITS mapping">
            {eritsRow ? (
              <DetailList
                columns={2}
                items={[
                  { label: 'eRITS property reference', value: eritsRow.eritsPropertyRef ?? <span className="text-warning">Not issued</span> },
                  { label: 'Registration status', value: <StatusBadge status={eritsRow.registrationStatus} /> },
                  { label: 'KRA PIN', value: eritsRow.kraPin ?? <span className="text-negative">Missing</span> },
                  { label: 'Property type', value: humanise(eritsRow.propertyType) },
                  { label: 'Location', value: `${eritsRow.town}, ${eritsRow.county}` },
                  { label: 'Units', value: String(eritsRow.unitCount) },
                  { label: 'Estimated annual rent', value: formatKES(eritsRow.estimatedAnnualRent) },
                  { label: 'Last synchronised', value: eritsRow.lastSyncedAt ? fmtDate(eritsRow.lastSyncedAt) : 'Never' },
                  { label: 'Last sync result', value: eritsRow.lastSyncStatus ? <StatusBadge status={eritsRow.lastSyncStatus} /> : '—' },
                ]}
              />
            ) : (
              <EmptyState
                title="Not mapped to eRITS"
                description="Map the property from the KRA eRITS screen so its rental income can be reported."
                action={
                  <Link href="/erits" className="btn-primary">
                    Go to KRA eRITS
                  </Link>
                }
              />
            )}
          </Card>

          <Card title="Reported rental income" padded={false}>
            <DataTable
              dense
              rows={eritsHistory}
              rowKey={(row) => row.id}
              columns={[
                { key: 'income', header: 'Gross income', align: 'right', render: (row) => <Money value={row.grossRentalIncome} /> },
                { key: 'count', header: 'Payments', align: 'right', render: (row) => <span className="tabular-nums text-sm text-muted">{row.paymentCount}</span> },
              ]}
              empty={<EmptyState title="No periods aggregated yet" />}
            />
          </Card>
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
              { key: 'uploaded', header: 'Uploaded', align: 'right', render: (row) => <span className="text-xs text-muted">{fmtDate(row.createdAt)}</span> },
            ]}
            empty={<EmptyState title="No documents" description="Title deeds, insurance and inspection reports belong here." />}
          />
        </Card>
      )}
    </>
  )
}
