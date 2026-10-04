import Link from 'next/link'
import clsx from 'clsx'
import { asc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, properties, tenants, units, unitStatusEnum, unitTypeEnum } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { amount, cents, formatKES, formatPercent, percent } from '@/lib/money'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar, ViewSwitch } from '@/components/filters'

export const metadata = { title: 'Units' }
export const dynamic = 'force-dynamic'

const STATUS_DOT: Record<string, string> = {
  OCCUPIED: 'bg-positive',
  VACANT: 'bg-warning',
  RESERVED: 'bg-brand',
  MAINTENANCE: 'bg-serious',
  UNAVAILABLE: 'bg-faint',
}

const STATUS_CELL: Record<string, string> = {
  OCCUPIED: 'border-positive/30 bg-positive/5',
  VACANT: 'border-warning/40 bg-warning/5',
  RESERVED: 'border-brand/30 bg-brand/5',
  MAINTENANCE: 'border-serious/40 bg-serious/5',
  UNAVAILABLE: 'border-line bg-canvas',
}

export default async function UnitsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('units.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)
  const view = one(params, 'view') ?? 'grid'

  const query = one(params, 'q')
  const propertyId = one(params, 'property')
  const status = one(params, 'status')
  const type = one(params, 'type')
  const floor = one(params, 'floor')
  const minRent = one(params, 'minRent')
  const maxRent = one(params, 'maxRent')

  const where = landlordScoped(
    properties,
    scope,
    query ? or(ilike(units.unitNumber, `%${query}%`), ilike(properties.name, `%${query}%`)) : undefined,
    propertyId ? eq(units.propertyId, propertyId) : undefined,
    status ? eq(units.status, status as 'VACANT') : undefined,
    type ? eq(units.type, type as 'ONE_BEDROOM') : undefined,
    floor ? eq(units.floor, Number(floor)) : undefined,
    minRent ? gte(units.monthlyRent, amount(Number(minRent) * 100)) : undefined,
    maxRent ? lte(units.monthlyRent, amount(Number(maxRent) * 100)) : undefined,
  )

  const selection = {
    id: units.id,
    unitNumber: units.unitNumber,
    floor: units.floor,
    type: units.type,
    bedrooms: units.bedrooms,
    bathrooms: units.bathrooms,
    monthlyRent: units.monthlyRent,
    serviceCharge: units.serviceCharge,
    deposit: units.deposit,
    status: units.status,
    propertyId: units.propertyId,
    propertyName: properties.name,
    propertyCode: properties.code,
    tenantId: tenants.id,
    tenantName: tenants.fullName,
    leaseId: leases.id,
    leaseEnd: leases.endDate,
  }

  const base = db
    .select(selection)
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .leftJoin(tenants, eq(tenants.id, units.currentTenantId))
    .leftJoin(leases, eq(leases.id, units.currentLeaseId))
    .where(where)
    .orderBy(asc(properties.name), asc(units.floor), asc(units.unitNumber))

  const [rows, [{ total }], statusCounts, propertyOptions] = await Promise.all([
    view === 'grid' ? base.limit(600) : base.limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(where),
    db
      .select({ status: units.status, count: sql<number>`count(*)::int`, rent: sql<string>`coalesce(sum(${units.monthlyRent}), 0)` })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(landlordScoped(properties, scope))
      .groupBy(units.status),
    db
      .select({ id: properties.id, name: properties.name })
      .from(properties)
      .where(landlordScoped(properties, scope))
      .orderBy(asc(properties.name)),
  ])

  const byStatus = Object.fromEntries(statusCounts.map((row) => [row.status, row.count])) as Record<string, number>
  const totalUnits = statusCounts.reduce((sum, row) => sum + row.count, 0)
  const occupied = byStatus.OCCUPIED ?? 0
  const vacantRentCents = cents(statusCounts.find((row) => row.status === 'VACANT')?.rent)

  // Group for the visual occupancy view.
  const grouped = new Map<string, { name: string; id: string; units: typeof rows }>()
  for (const row of rows) {
    const bucket = grouped.get(row.propertyId)
    if (bucket) bucket.units.push(row)
    else grouped.set(row.propertyId, { name: row.propertyName, id: row.propertyId, units: [row] })
  }

  return (
    <>
      <PageHeader
        title="Units"
        description="Occupancy across the portfolio, unit by unit."
        actions={
          <>
            <ViewSwitch
              name="view"
              fallback="grid"
              options={[
                { value: 'grid', label: 'Occupancy' },
                { value: 'table', label: 'Table' },
              ]}
            />
            {can(session, 'units.create') && propertyOptions.length > 0 && (
              // Units live on a property, so this picks the property and
              // opens its Units tab with the add form.
              <form action="/units/add" className="flex gap-2">
                <select name="property" className="field" defaultValue="" required aria-label="Property to add units to">
                  <option value="">Add units to…</option>
                  {propertyOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
                <button type="submit" className="btn-primary">
                  Add units
                </button>
              </form>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard label="Total units" value={String(totalUnits)} />
        <KpiCard label="Occupied" value={String(occupied)} tone="positive" sub={formatPercent(percent(occupied, totalUnits))} />
        <KpiCard label="Vacant" value={String(byStatus.VACANT ?? 0)} tone="warning" sub={`${formatKES(vacantRentCents / 100)} / month unearned`} />
        <KpiCard label="In maintenance" value={String(byStatus.MAINTENANCE ?? 0)} tone="serious" />
        <KpiCard label="Reserved" value={String(byStatus.RESERVED ?? 0)} tone="brand" />
      </div>

      <FilterBar
        searchPlaceholder="Search unit or property…"
        selects={[
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
          { name: 'status', label: 'All statuses', options: unitStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'type', label: 'All unit types', options: unitTypeEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'floor', label: 'All floors', options: Array.from({ length: 12 }, (_, index) => ({ value: String(index), label: index === 0 ? 'Ground floor' : `Floor ${index}` })) },
          {
            name: 'minRent',
            label: 'Min rent',
            options: [10000, 20000, 30000, 50000, 80000].map((value) => ({ value: String(value), label: `≥ ${formatKES(value)}` })),
          },
          {
            name: 'maxRent',
            label: 'Max rent',
            options: [20000, 30000, 50000, 80000, 150000].map((value) => ({ value: String(value), label: `≤ ${formatKES(value)}` })),
          },
        ]}
      />

      {view === 'grid' ? (
        <div className="space-y-4">
          {grouped.size === 0 && (
            <Card>
              <EmptyState title="No units match these filters" />
            </Card>
          )}
          {Array.from(grouped.values()).map((group) => {
            const groupOccupied = group.units.filter((unit) => unit.status === 'OCCUPIED').length
            return (
              <Card
                key={group.id}
                title={group.name}
                description={`${groupOccupied} of ${group.units.length} shown units occupied`}
                actions={
                  <Link href={`/properties/${group.id}`} className="text-xs text-brand hover:underline">
                    Open property
                  </Link>
                }
              >
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
                  {group.units.map((unit) => (
                    <Link
                      key={unit.id}
                      href={unit.leaseId ? `/leases/${unit.leaseId}` : `/properties/${unit.propertyId}?tab=units`}
                      className={clsx(
                        'rounded-lg border px-3 py-2.5 transition-colors hover:border-brand/50',
                        STATUS_CELL[unit.status] ?? 'border-line',
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-ink">{unit.unitNumber}</span>
                        <span
                          className={clsx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT[unit.status])}
                          aria-hidden
                        />
                      </div>
                      <p className="mt-0.5 truncate text-2xs text-muted">{humanise(unit.status)}</p>
                      <p className="mt-1 truncate text-2xs tabular-nums text-faint">
                        {formatKES(unit.monthlyRent)}
                      </p>
                      {unit.tenantName && (
                        <p className="mt-0.5 truncate text-2xs text-faint">{unit.tenantName}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </Card>
            )
          })}
          <p className="text-xs text-faint">
            {rows.length.toLocaleString()} of {total.toLocaleString()} units shown. Statuses:{' '}
            {Object.entries(STATUS_DOT).map(([status], index) => (
              <span key={status} className="mr-3 inline-flex items-center gap-1.5">
                <span className={clsx('inline-block h-2 w-2 rounded-full', STATUS_DOT[status])} aria-hidden />
                {humanise(status)}
                {index === 0 ? '' : ''}
              </span>
            ))}
          </p>
        </div>
      ) : (
        <Card padded={false}>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'unit',
                header: 'Unit',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.unitNumber}</p>
                    <p className="truncate text-2xs text-faint">{row.propertyName}</p>
                  </div>
                ),
              },
              { key: 'floor', header: 'Floor', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.floor === 0 ? 'Ground' : row.floor}</span> },
              { key: 'type', header: 'Type', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{humanise(row.type)}</span> },
              { key: 'beds', header: 'Beds / baths', hideOnMobile: true, align: 'center', render: (row) => <span className="tabular-nums text-sm text-muted">{row.bedrooms} / {row.bathrooms}</span> },
              { key: 'rent', header: 'Rent', align: 'right', render: (row) => <Money value={row.monthlyRent} /> },
              { key: 'service', header: 'Service charge', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.serviceCharge} muted /> },
              {
                key: 'tenant',
                header: 'Tenant',
                render: (row) =>
                  row.tenantId ? (
                    <Link href={`/tenants/${row.tenantId}`} className="text-sm text-muted hover:text-brand">
                      {row.tenantName}
                    </Link>
                  ) : (
                    <span className="text-sm text-faint">—</span>
                  ),
              },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No units match these filters" />}
          />
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            buildHref={(next) => withParams('/units', params, { page: next })}
          />
        </Card>
      )}
    </>
  )
}
