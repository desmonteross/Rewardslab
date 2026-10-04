import Link from 'next/link'
import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { invoiceStatusEnum, properties, rentInvoices, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { cents } from '@/lib/money'
import { fmtDate, recentPeriods } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, MoneyKpi, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Invoices' }
export const dynamic = 'force-dynamic'

export default async function InvoicesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('invoices.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const status = one(params, 'status')
  const propertyId = one(params, 'property')
  const monthParam = one(params, 'month')
  const [year, month] = monthParam ? monthParam.split('-').map(Number) : [undefined, undefined]

  const where = landlordScoped(
    rentInvoices,
    scope,
    query ? or(ilike(rentInvoices.number, `%${query}%`), ilike(tenants.fullName, `%${query}%`), ilike(units.unitNumber, `%${query}%`)) : undefined,
    status ? eq(rentInvoices.status, status as 'DUE') : undefined,
    propertyId ? eq(rentInvoices.propertyId, propertyId) : undefined,
    year ? eq(rentInvoices.periodYear, year) : undefined,
    month ? eq(rentInvoices.periodMonth, month) : undefined,
  )

  const [rows, [{ total }], [totals], propertyOptions] = await Promise.all([
    db
      .select({
        id: rentInvoices.id,
        number: rentInvoices.number,
        periodLabel: rentInvoices.periodLabel,
        issueDate: rentInvoices.issueDate,
        dueDate: rentInvoices.dueDate,
        subtotal: rentInvoices.subtotal,
        penaltyAmount: rentInvoices.penaltyAmount,
        totalAmount: rentInvoices.total,
        amountPaid: rentInvoices.amountPaid,
        balance: rentInvoices.balance,
        status: rentInvoices.status,
        tenantId: tenants.id,
        tenantName: tenants.fullName,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
      })
      .from(rentInvoices)
      .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
      .innerJoin(units, eq(units.id, rentInvoices.unitId))
      .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
      .where(where)
      .orderBy(desc(rentInvoices.issueDate), desc(rentInvoices.number))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(rentInvoices)
      .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
      .innerJoin(units, eq(units.id, rentInvoices.unitId))
      .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
      .where(where),
    db
      .select({
        billed: sql<string>`coalesce(sum(${rentInvoices.total}), 0)`,
        paid: sql<string>`coalesce(sum(${rentInvoices.amountPaid}), 0)`,
        balance: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)`,
        penalties: sql<string>`coalesce(sum(${rentInvoices.penaltyAmount}), 0)`,
      })
      .from(rentInvoices)
      .where(landlordScoped(rentInvoices, scope)),
    db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name)),
  ])

  return (
    <>
      <PageHeader
        title="Invoices"
        description="Every rent invoice raised by the billing engine."
        actions={
          <Link href="/rent" className="btn-secondary">
            Rent collection
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyKpi label="Billed all time" amount={totals?.billed ?? 0} />
        <MoneyKpi label="Paid" amount={totals?.paid ?? 0} tone="positive" />
        <MoneyKpi label="Outstanding" amount={totals?.balance ?? 0} tone={cents(totals?.balance) > 0 ? 'warning' : 'positive'} />
        <MoneyKpi label="Penalties charged" amount={totals?.penalties ?? 0} tone="serious" />
      </div>

      <FilterBar
        searchPlaceholder="Search invoice, tenant or unit…"
        selects={[
          { name: 'status', label: 'All statuses', options: invoiceStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          {
            name: 'month',
            label: 'All periods',
            options: recentPeriods(new Date(), 12)
              .reverse()
              .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
          },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/invoices/${row.id}`}
          columns={[
            { key: 'number', header: 'Invoice', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
            {
              key: 'tenant',
              header: 'Tenant',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{row.tenantName}</p>
                  <p className="truncate text-2xs text-faint">{row.propertyName} · {row.unitNumber}</p>
                </div>
              ),
            },
            { key: 'period', header: 'Period', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.periodLabel}</span> },
            { key: 'issued', header: 'Issued', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.issueDate)}</span> },
            { key: 'due', header: 'Due', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.dueDate)}</span> },
            { key: 'total', header: 'Total', align: 'right', render: (row) => <Money value={row.totalAmount} /> },
            { key: 'paid', header: 'Paid', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.amountPaid} tone="positive" /> },
            { key: 'balance', header: 'Balance', align: 'right', render: (row) => (cents(row.balance) > 0 ? <Money value={row.balance} tone="negative" /> : <span className="text-sm text-positive">—</span>) },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={<EmptyState title="No invoices match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/invoices', params, { page: next })}
        />
      </Card>
    </>
  )
}
