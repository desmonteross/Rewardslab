import Link from 'next/link'
import { and, asc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, properties } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, ownLandlordScoped, scopeFromSession } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatPercent, percent } from '@/lib/money'
import { periodOf } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { propertyTypeEnum, propertyStatusEnum } from '@/db/schema'

export const metadata = { title: 'Properties' }
export const dynamic = 'force-dynamic'

export default async function PropertiesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('properties.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)
  const period = periodOf(new Date())

  const query = one(params, 'q')
  const type = one(params, 'type')
  const status = one(params, 'status')
  const landlordId = one(params, 'landlord')
  const county = one(params, 'county')

  const where = landlordScoped(
    properties,
    scope,
    ne(properties.status, 'ARCHIVED'),
    query
      ? or(
          ilike(properties.name, `%${query}%`),
          ilike(properties.code, `%${query}%`),
          ilike(properties.area, `%${query}%`),
          ilike(properties.town, `%${query}%`),
        )
      : undefined,
    type ? eq(properties.type, type as 'APARTMENT') : undefined,
    status ? eq(properties.status, status as 'ACTIVE') : undefined,
    landlordId ? eq(properties.landlordId, landlordId) : undefined,
    county ? eq(properties.county, county) : undefined,
  )

  const [rows, [{ total }], landlordOptions, counties] = await Promise.all([
    db
      .select({
        id: properties.id,
        code: properties.code,
        name: properties.name,
        type: properties.type,
        status: properties.status,
        area: properties.area,
        town: properties.town,
        county: properties.county,
        expectedMonthlyRent: properties.expectedMonthlyRent,
        commissionRate: properties.commissionRate,
        managementFeeRate: properties.managementFeeRate,
        landlordId: properties.landlordId,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
        unitCount: sql<number>`(select count(*)::int from units u where u.property_id = properties.id)`,
        occupied: sql<number>`(select count(*)::int from units u where u.property_id = properties.id and u.status = 'OCCUPIED')`,
        collected: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.property_id = properties.id and p.status = 'CONFIRMED' and p.paid_at >= ${period.start} and p.paid_at <= ${period.end})`,
        outstanding: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.property_id = properties.id and i.status <> 'CANCELLED')`,
      })
      .from(properties)
      .innerJoin(landlords, eq(landlords.id, properties.landlordId))
      .where(where)
      .orderBy(asc(properties.name))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(properties).where(where),
    db
      .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
      .from(landlords)
      .where(ownLandlordScoped(landlords, scope, eq(landlords.isActive, true)))
      .orderBy(asc(landlords.fullName)),
    db
      .selectDistinct({ county: properties.county })
      .from(properties)
      .where(landlordScoped(properties, scope))
      .orderBy(asc(properties.county)),
  ])

  const totals = rows.reduce(
    (accumulator, row) => ({
      units: accumulator.units + row.unitCount,
      occupied: accumulator.occupied + row.occupied,
      expected: accumulator.expected + cents(row.expectedMonthlyRent),
      collected: accumulator.collected + cents(row.collected),
    }),
    { units: 0, occupied: 0, expected: 0, collected: 0 },
  )

  return (
    <>
      <PageHeader
        title="Properties"
        description="Every building under management, with this month’s collection position."
        actions={
          can(session, 'properties.create') ? (
            <Link href="/properties/new" className="btn-primary">
              Add property
            </Link>
          ) : null
        }
      />

      <FilterBar
        searchPlaceholder="Search by name, code or area…"
        selects={[
          {
            name: 'type',
            label: 'All types',
            options: propertyTypeEnum.enumValues.map((value) => ({ value, label: humanise(value) })),
          },
          {
            name: 'status',
            label: 'All statuses',
            options: propertyStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })),
          },
          {
            name: 'landlord',
            label: 'All landlords',
            options: landlordOptions.map((row) => ({ value: row.id, label: row.name })),
          },
          {
            name: 'county',
            label: 'All counties',
            options: counties.filter((row) => row.county).map((row) => ({ value: row.county, label: row.county })),
          },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/properties/${row.id}`}
          columns={[
            {
              key: 'name',
              header: 'Property',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <p className="truncate text-2xs text-faint">
                    {row.code} · {humanise(row.type)}
                  </p>
                </div>
              ),
            },
            {
              key: 'location',
              header: 'Location',
              hideOnMobile: true,
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{row.area ?? row.town}</p>
                  <p className="truncate text-2xs text-faint">{row.county}</p>
                </div>
              ),
            },
            {
              key: 'landlord',
              header: 'Landlord',
              hideOnMobile: true,
              render: (row) => (
                <Link href={`/landlords/${row.landlordId}`} className="text-sm text-muted hover:text-brand">
                  {row.landlordName}
                </Link>
              ),
            },
            {
              key: 'units',
              header: 'Units',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums text-sm text-ink">
                  {row.occupied}/{row.unitCount}
                </span>
              ),
            },
            {
              key: 'occupancy',
              header: 'Occupancy',
              align: 'right',
              hideOnMobile: true,
              render: (row) => {
                const rate = percent(row.occupied, row.unitCount)
                return (
                  <span
                    className={
                      rate >= 85
                        ? 'tabular-nums text-sm text-positive'
                        : rate >= 65
                          ? 'tabular-nums text-sm text-ink'
                          : 'tabular-nums text-sm text-negative'
                    }
                  >
                    {formatPercent(rate)}
                  </span>
                )
              },
            },
            {
              key: 'expected',
              header: 'Expected / month',
              align: 'right',
              hideOnMobile: true,
              render: (row) => <Money value={row.expectedMonthlyRent} muted />,
            },
            {
              key: 'collected',
              header: `Collected ${period.label.split(' ')[0]}`,
              align: 'right',
              render: (row) => <Money value={row.collected} tone="positive" />,
            },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              render: (row) => <StatusBadge status={row.status} />,
            },
          ]}
          empty={
            <EmptyState
              title="No properties match these filters"
              description="Try clearing the filters, or add the first property to this portfolio."
            />
          }
          footer={
            rows.length > 0 ? (
              <tr className="text-sm">
                <td className="px-4 py-2.5 font-medium text-ink">Totals (this page)</td>
                <td className="hidden sm:table-cell" />
                <td className="hidden sm:table-cell" />
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                  {totals.occupied}/{totals.units}
                </td>
                <td className="hidden px-4 py-2.5 text-right tabular-nums text-muted sm:table-cell">
                  {formatPercent(percent(totals.occupied, totals.units))}
                </td>
                <td className="hidden px-4 py-2.5 text-right sm:table-cell">
                  <Money value={totals.expected / 100} muted />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={totals.collected / 100} tone="positive" />
                </td>
                <td />
              </tr>
            ) : null
          }
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/properties', params, { page: next })}
        />
      </Card>
    </>
  )
}

