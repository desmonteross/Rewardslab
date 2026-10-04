import Link from 'next/link'
import { asc, eq, gt, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, properties, tenants, tenantStatusEnum, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Tenants' }
export const dynamic = 'force-dynamic'

export default async function TenantsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('tenants.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const status = one(params, 'status')
  const propertyId = one(params, 'property')
  const balance = one(params, 'balance')

  const balanceExpression = sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.tenant_id = tenants.id and i.status <> 'CANCELLED')`

  const where = scoped(
    tenants,
    scope,
    query
      ? or(
          ilike(tenants.fullName, `%${query}%`),
          ilike(tenants.code, `%${query}%`),
          ilike(tenants.phone, `%${query}%`),
          ilike(tenants.nationalId, `%${query}%`),
          ilike(tenants.email, `%${query}%`),
        )
      : undefined,
    status ? eq(tenants.status, status as 'ACTIVE') : undefined,
    propertyId
      ? sql`exists (select 1 from leases l where l.tenant_id = tenants.id and l.property_id = ${propertyId} and l.status in ('ACTIVE','EXPIRING'))`
      : undefined,
    balance === 'owing' ? sql`(${balanceExpression}) > 0` : undefined,
    balance === 'clear' ? sql`(${balanceExpression}) <= 0` : undefined,
    scope.landlordId
      ? sql`exists (select 1 from leases l join properties p on p.id = l.property_id where l.tenant_id = tenants.id and p.landlord_id = ${scope.landlordId})`
      : undefined,
  )

  const [rows, [{ total }], [summary], propertyOptions] = await Promise.all([
    db
      .select({
        id: tenants.id,
        code: tenants.code,
        fullName: tenants.fullName,
        phone: tenants.phone,
        email: tenants.email,
        nationalId: tenants.nationalId,
        status: tenants.status,
        balance: balanceExpression,
        unitNumber: units.unitNumber,
        propertyId: properties.id,
        propertyName: properties.name,
        monthlyRent: leases.monthlyRent,
        moveInDate: leases.moveInDate,
        leaseId: leases.id,
      })
      .from(tenants)
      .leftJoin(leases, sql`${leases.tenantId} = tenants.id and ${leases.status} in ('ACTIVE','EXPIRING')`)
      .leftJoin(units, eq(units.id, leases.unitId))
      .leftJoin(properties, eq(properties.id, leases.propertyId))
      .where(where)
      .orderBy(asc(tenants.fullName))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(tenants).where(where),
    db
      .select({
        active: sql<number>`count(*) filter (where ${tenants.status} = 'ACTIVE')::int`,
        notice: sql<number>`count(*) filter (where ${tenants.status} = 'NOTICE')::int`,
        owing: sql<number>`count(*) filter (where (${balanceExpression}) > 0)::int`,
        arrears: sql<string>`coalesce(sum(${balanceExpression}), 0)`,
      })
      .from(tenants)
      .where(scoped(tenants, scope)),
    db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(landlordScoped(properties, scope))
      .orderBy(asc(properties.name)),
  ])

  return (
    <>
      <PageHeader
        title="Tenants"
        description="Everyone renting in the portfolio, with what they owe."
        actions={
          can(session, 'tenants.create') ? (
            <Link href="/tenants/new" className="btn-primary">
              Add tenant
            </Link>
          ) : null
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Active tenants" value={String(summary?.active ?? 0)} tone="positive" />
        <KpiCard label="On notice" value={String(summary?.notice ?? 0)} tone="warning" />
        <KpiCard label="With a balance" value={String(summary?.owing ?? 0)} tone={(summary?.owing ?? 0) > 0 ? 'warning' : 'positive'} />
        <KpiCard label="Total arrears" value={`KES ${(cents(summary?.arrears) / 100).toLocaleString()}`} tone="negative" />
      </div>

      <FilterBar
        searchPlaceholder="Search name, code, phone or ID…"
        selects={[
          { name: 'status', label: 'All statuses', options: tenantStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
          {
            name: 'balance',
            label: 'Any balance',
            options: [
              { value: 'owing', label: 'In arrears' },
              { value: 'clear', label: 'Up to date' },
            ],
          },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/tenants/${row.id}`}
          columns={[
            {
              key: 'name',
              header: 'Tenant',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.fullName}</p>
                  <p className="truncate text-2xs text-faint">{row.code} · {row.phone}</p>
                </div>
              ),
            },
            {
              key: 'unit',
              header: 'Unit',
              render: (row) =>
                row.propertyId ? (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.unitNumber}</p>
                    <p className="truncate text-2xs text-faint">{row.propertyName}</p>
                  </div>
                ) : (
                  <span className="text-sm text-faint">No active lease</span>
                ),
            },
            { key: 'rent', header: 'Monthly rent', align: 'right', hideOnMobile: true, render: (row) => (row.monthlyRent ? <Money value={row.monthlyRent} muted /> : <span className="text-faint">—</span>) },
            { key: 'movein', header: 'Move-in', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.moveInDate ? fmtDate(row.moveInDate) : '—'}</span> },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (row) => {
                const value = cents(row.balance)
                return value > 0 ? <Money value={row.balance} tone="negative" /> : <span className="text-sm text-positive">Up to date</span>
              },
            },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={<EmptyState title="No tenants match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/tenants', params, { page: next })}
        />
      </Card>
    </>
  )
}

