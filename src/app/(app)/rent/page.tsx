import Link from 'next/link'
import { asc, eq, gt, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { invoiceStatusEnum, landlords, leases, properties, rentInvoices, tenants, units, users } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, ownLandlordScoped, scopeFromSession } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, compactKES, formatKES, formatPercent, percent } from '@/lib/money'
import { fmtDate, periodFrom, periodOf, recentPeriods } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Meter, Money, MoneyKpi, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { CollectionBars } from '@/components/charts'
import { monthlySeries } from '@/server/queries/dashboard'
import { markOverdueAction, runBillingAction } from './actions'

export const metadata = { title: 'Rent collection' }
export const dynamic = 'force-dynamic'

export default async function RentPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('rent.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const monthParam = one(params, 'month')
  const period = monthParam
    ? periodFrom(Number(monthParam.split('-')[0]), Number(monthParam.split('-')[1]))
    : periodOf(new Date())

  const query = one(params, 'q')
  const status = one(params, 'status')
  const propertyId = one(params, 'property')
  const landlordId = one(params, 'landlord')
  const managerId = one(params, 'manager')

  const where = landlordScoped(
    rentInvoices,
    scope,
    eq(rentInvoices.periodYear, period.year),
    eq(rentInvoices.periodMonth, period.month),
    query ? or(ilike(tenants.fullName, `%${query}%`), ilike(units.unitNumber, `%${query}%`), ilike(rentInvoices.number, `%${query}%`)) : undefined,
    status ? eq(rentInvoices.status, status as 'DUE') : undefined,
    propertyId ? eq(rentInvoices.propertyId, propertyId) : undefined,
    landlordId ? eq(rentInvoices.landlordId, landlordId) : undefined,
    managerId ? eq(properties.managerId, managerId) : undefined,
  )

  const [rows, [{ total }], [totals], series, propertyOptions, landlordOptions, managerOptions] = await Promise.all([
    db
      .select({
        id: rentInvoices.id,
        number: rentInvoices.number,
        total: rentInvoices.total,
        amountPaid: rentInvoices.amountPaid,
        balance: rentInvoices.balance,
        dueDate: rentInvoices.dueDate,
        status: rentInvoices.status,
        tenantId: tenants.id,
        tenantName: tenants.fullName,
        tenantPhone: tenants.phone,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
        monthlyRent: leases.monthlyRent,
      })
      .from(rentInvoices)
      .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
      .innerJoin(units, eq(units.id, rentInvoices.unitId))
      .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
      .innerJoin(leases, eq(leases.id, rentInvoices.leaseId))
      .where(where)
      .orderBy(asc(rentInvoices.balance), asc(tenants.fullName))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(rentInvoices)
      .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
      .innerJoin(units, eq(units.id, rentInvoices.unitId))
      .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
      .innerJoin(leases, eq(leases.id, rentInvoices.leaseId))
      .where(where),
    db
      .select({
        expected: sql<string>`coalesce(sum(${rentInvoices.total}), 0)`,
        collected: sql<string>`coalesce(sum(${rentInvoices.amountPaid}), 0)`,
        outstanding: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)`,
        overdue: sql<string>`coalesce(sum(${rentInvoices.balance}) filter (where ${rentInvoices.status} = 'OVERDUE'), 0)`,
        invoices: sql<number>`count(*)::int`,
        paid: sql<number>`count(*) filter (where ${rentInvoices.status} = 'PAID')::int`,
      })
      .from(rentInvoices)
      .where(
        landlordScoped(
          rentInvoices,
          scope,
          eq(rentInvoices.periodYear, period.year),
          eq(rentInvoices.periodMonth, period.month),
        ),
      ),
    monthlySeries(scope, 6),
    db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name)),
    db
      .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
      .from(landlords)
      .where(ownLandlordScoped(landlords, scope))
      .orderBy(asc(landlords.code)),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(sql`${users.organizationId} = ${scope.organizationId} and ${users.role} in ('PROPERTY_MANAGER','ORG_ADMIN')`)
      .orderBy(asc(users.fullName)),
  ])

  const expectedCents = cents(totals?.expected)
  const collectedCents = cents(totals?.collected)
  const outstandingCents = cents(totals?.outstanding)
  const collectionRate = percent(collectedCents, expectedCents)

  return (
    <>
      <PageHeader
        title="Rent collection"
        description={`${period.label} — what was billed, what has come in, and what is still owed.`}
        actions={
          <>
            {can(session, 'billing.run') && (
              <Link href="/rent/charges" className="btn-primary">
                Raise charges
              </Link>
            )}
            <Link href="/invoices" className="btn-secondary">
              All invoices
            </Link>
            <Link href="/payments" className="btn-secondary">
              Payments
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <MoneyKpi label="Expected this month" amount={expectedCents / 100} sub={`${totals?.invoices ?? 0} invoices`} />
        <MoneyKpi label="Collected" amount={collectedCents / 100} tone="positive" sub={`${totals?.paid ?? 0} fully settled`} />
        <MoneyKpi label="Outstanding" amount={outstandingCents / 100} tone={outstandingCents > 0 ? 'warning' : 'positive'} />
        <MoneyKpi label="Overdue" amount={cents(totals?.overdue) / 100} tone="negative" />
        <KpiCard
          label="Collection rate"
          value={formatPercent(collectionRate)}
          tone={collectionRate >= 90 ? 'positive' : collectionRate >= 75 ? 'warning' : 'negative'}
          sub={`${compactKES(collectedCents / 100)} of ${compactKES(expectedCents / 100)}`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Expected against collected" description="The last six months of billing.">
          <CollectionBars data={series.map((row) => ({ period: row.period, expected: row.expected, collected: row.collected }))} />
        </Card>

        <div className="space-y-4">
          <Card title={`${period.label} progress`}>
            <Meter
              label="Collected"
              value={collectionRate}
              caption={`${formatKES(outstandingCents / 100)} still to come in`}
              tone={collectionRate >= 90 ? 'positive' : collectionRate >= 75 ? 'warning' : 'negative'}
            />
          </Card>

          {can(session, 'billing.run') && (
            <Card title="Billing engine" description="Raise this period’s invoices for every active lease.">
              <ActionForm action={runBillingAction} label="Run billing" pendingLabel="Running…">
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-xs font-medium text-muted">
                    Period
                    <select name="month" className="field mt-1" defaultValue={String(period.month)}>
                      {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                        <option key={month} value={month}>
                          {periodFrom(period.year, month).label.split(' ')[0]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-medium text-muted">
                    Year
                    <input name="year" type="number" className="field mt-1" defaultValue={period.year} />
                  </label>
                </div>
                <label className="block text-xs font-medium text-muted">
                  Property (optional)
                  <select name="propertyId" className="field mt-1" defaultValue="">
                    <option value="">Every property</option>
                    {propertyOptions.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-2xs leading-relaxed text-faint">
                  Safe to run twice — leases already invoiced for the period are skipped.
                </p>
              </ActionForm>
            </Card>
          )}

          {can(session, 'invoices.create') && (
            <Card title="Housekeeping">
              <ActionForm action={markOverdueAction} label="Flag overdue invoices" variant="secondary" pendingLabel="Checking…" />
            </Card>
          )}
        </div>
      </div>

      <div className="mt-6">
        <FilterBar
          searchPlaceholder="Search tenant, unit or invoice…"
          selects={[
            {
              name: 'month',
              label: 'This month',
              options: recentPeriods(new Date(), 12)
                .reverse()
                .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
            },
            { name: 'status', label: 'All statuses', options: invoiceStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
            { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
            { name: 'landlord', label: 'All landlords', options: landlordOptions.map((row) => ({ value: row.id, label: row.name })) },
            { name: 'manager', label: 'All managers', options: managerOptions.map((row) => ({ value: row.id, label: row.name })) },
          ]}
        />

        <Card padded={false}>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/invoices/${row.id}`}
            columns={[
              {
                key: 'tenant',
                header: 'Tenant',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.tenantName}</p>
                    <p className="truncate text-2xs text-faint">{row.tenantPhone}</p>
                  </div>
                ),
              },
              { key: 'property', header: 'Property', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.propertyName}</span> },
              { key: 'unit', header: 'Unit', render: (row) => <span className="text-sm text-ink">{row.unitNumber}</span> },
              { key: 'rent', header: 'Rent', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.monthlyRent} muted /> },
              { key: 'billed', header: 'Billed', align: 'right', render: (row) => <Money value={row.total} /> },
              { key: 'paid', header: 'Paid', align: 'right', render: (row) => <Money value={row.amountPaid} tone="positive" /> },
              { key: 'balance', header: 'Balance', align: 'right', render: (row) => (cents(row.balance) > 0 ? <Money value={row.balance} tone="negative" /> : <span className="text-sm text-positive">—</span>) },
              { key: 'due', header: 'Due date', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.dueDate)}</span> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={
              <EmptyState
                title={`Nothing billed for ${period.label}`}
                description="Run the billing engine to raise this period’s invoices."
              />
            }
          />
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            buildHref={(next) => withParams('/rent', params, { page: next })}
          />
        </Card>
      </div>
    </>
  )
}

