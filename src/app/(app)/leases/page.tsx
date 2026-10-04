import Link from 'next/link'
import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, leaseStatusEnum, properties, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Leases' }
export const dynamic = 'force-dynamic'

export default async function LeasesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('leases.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const status = one(params, 'status')
  const propertyId = one(params, 'property')
  const expiring = one(params, 'expiring')

  const where = landlordScoped(
    properties,
    scope,
    query ? or(ilike(leases.code, `%${query}%`), ilike(tenants.fullName, `%${query}%`), ilike(units.unitNumber, `%${query}%`)) : undefined,
    status ? eq(leases.status, status as 'ACTIVE') : undefined,
    propertyId ? eq(leases.propertyId, propertyId) : undefined,
    expiring === '90'
      ? sql`${leases.endDate} <= now() + interval '90 days' and ${leases.status} in ('ACTIVE','EXPIRING')`
      : undefined,
  )

  const [rows, [{ total }], [summary], propertyOptions] = await Promise.all([
    db
      .select({
        id: leases.id,
        code: leases.code,
        startDate: leases.startDate,
        endDate: leases.endDate,
        monthlyRent: leases.monthlyRent,
        deposit: leases.deposit,
        dueDayOfMonth: leases.dueDayOfMonth,
        status: leases.status,
        tenantId: tenants.id,
        tenantName: tenants.fullName,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
      })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(where)
      .orderBy(asc(leases.endDate))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(leases)
      .innerJoin(tenants, eq(tenants.id, leases.tenantId))
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(where),
    db
      .select({
        active: sql<number>`count(*) filter (where ${leases.status} = 'ACTIVE')::int`,
        expiring: sql<number>`count(*) filter (where ${leases.status} = 'EXPIRING')::int`,
        expired: sql<number>`count(*) filter (where ${leases.status} = 'EXPIRED')::int`,
        terminated: sql<number>`count(*) filter (where ${leases.status} = 'TERMINATED')::int`,
      })
      .from(leases)
      .where(scoped(leases, scope)),
    db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(landlordScoped(properties, scope))
      .orderBy(asc(properties.name)),
  ])

  return (
    <>
      <PageHeader
        title="Leases"
        description="Tenancy agreements, their terms and when they end."
        actions={
          <>
            <Link href="/leases?expiring=90" className="btn-secondary">
              Expiring in 90 days
            </Link>
            {can(session, 'leases.create') && (
              <Link href="/leases/new" className="btn-primary">
                New lease
              </Link>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Active" value={String(summary?.active ?? 0)} tone="positive" />
        <KpiCard label="Expiring" value={String(summary?.expiring ?? 0)} tone="warning" />
        <KpiCard label="Expired" value={String(summary?.expired ?? 0)} tone="negative" />
        <KpiCard label="Terminated" value={String(summary?.terminated ?? 0)} />
      </div>

      <FilterBar
        searchPlaceholder="Search lease, tenant or unit…"
        selects={[
          { name: 'status', label: 'All statuses', options: leaseStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
          { name: 'expiring', label: 'Any end date', options: [{ value: '90', label: 'Ending within 90 days' }] },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/leases/${row.id}`}
          columns={[
            { key: 'code', header: 'Lease', render: (row) => <span className="font-mono text-xs">{row.code}</span> },
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
            { key: 'start', header: 'Start', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.startDate)}</span> },
            { key: 'end', header: 'End', render: (row) => <span className="text-xs text-muted">{fmtDate(row.endDate)}</span> },
            { key: 'due', header: 'Due day', align: 'center', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.dueDayOfMonth}</span> },
            { key: 'rent', header: 'Monthly rent', align: 'right', render: (row) => <Money value={row.monthlyRent} /> },
            { key: 'deposit', header: 'Deposit', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.deposit} muted /> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={<EmptyState title="No leases match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/leases', params, { page: next })}
        />
      </Card>
    </>
  )
}
