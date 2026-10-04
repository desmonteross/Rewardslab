import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { paymentMethodEnum, properties, receipts, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, MoneyKpi, PageHeader, Pagination, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Receipts' }
export const dynamic = 'force-dynamic'

export default async function ReceiptsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('receipts.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const method = one(params, 'method')
  const propertyId = one(params, 'property')

  const where = landlordScoped(
    receipts,
    scope,
    query
      ? or(
          ilike(receipts.number, `%${query}%`),
          ilike(receipts.mpesaReference, `%${query}%`),
          ilike(tenants.fullName, `%${query}%`),
        )
      : undefined,
    method ? eq(receipts.method, method as 'MPESA') : undefined,
    propertyId ? eq(receipts.propertyId, propertyId) : undefined,
  )

  const [rows, [{ total }], [totals], propertyOptions] = await Promise.all([
    db
      .select({
        id: receipts.id,
        number: receipts.number,
        periodLabel: receipts.periodLabel,
        amount: receipts.amount,
        method: receipts.method,
        mpesaReference: receipts.mpesaReference,
        paidAt: receipts.paidAt,
        balanceAfter: receipts.balanceAfter,
        issuedByName: receipts.issuedByName,
        tenantName: tenants.fullName,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
      })
      .from(receipts)
      .innerJoin(tenants, eq(tenants.id, receipts.tenantId))
      .innerJoin(units, eq(units.id, receipts.unitId))
      .innerJoin(properties, eq(properties.id, receipts.propertyId))
      .where(where)
      .orderBy(desc(receipts.paidAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(receipts)
      .innerJoin(tenants, eq(tenants.id, receipts.tenantId))
      .innerJoin(units, eq(units.id, receipts.unitId))
      .innerJoin(properties, eq(properties.id, receipts.propertyId))
      .where(where),
    db
      .select({
        count: sql<number>`count(*)::int`,
        amount: sql<string>`coalesce(sum(${receipts.amount}), 0)`,
        mpesa: sql<string>`coalesce(sum(${receipts.amount}) filter (where ${receipts.method} = 'MPESA'), 0)`,
      })
      .from(receipts)
      .where(landlordScoped(receipts, scope)),
    db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name)),
  ])

  return (
    <>
      <PageHeader title="Receipts" description="Issued automatically the moment a payment is confirmed." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <MoneyKpi label="Receipted all time" amount={totals?.amount ?? 0} tone="positive" sub={`${totals?.count ?? 0} receipts`} />
        <MoneyKpi label="Via M-Pesa" amount={totals?.mpesa ?? 0} />
        <MoneyKpi
          label="Other methods"
          amount={(Number(totals?.amount ?? 0) - Number(totals?.mpesa ?? 0)).toFixed(2)}
          sub="Cash, cheque and bank transfer"
        />
      </div>

      <FilterBar
        searchPlaceholder="Search receipt, M-Pesa code or tenant…"
        selects={[
          { name: 'method', label: 'All methods', options: paymentMethodEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/receipts/${row.id}`}
          columns={[
            { key: 'number', header: 'Receipt', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
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
            { key: 'period', header: 'Rent period', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.periodLabel}</span> },
            { key: 'paid', header: 'Paid', render: (row) => <span className="text-xs text-muted">{fmtDate(row.paidAt)}</span> },
            { key: 'method', header: 'Method', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.method)}</span> },
            { key: 'mpesa', header: 'M-Pesa ref', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-muted">{row.mpesaReference ?? '—'}</span> },
            { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
            { key: 'balance', header: 'Balance after', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.balanceAfter} muted /> },
          ]}
          empty={<EmptyState title="No receipts match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/receipts', params, { page: next })}
        />
      </Card>
    </>
  )
}
