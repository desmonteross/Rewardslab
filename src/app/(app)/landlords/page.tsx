import Link from 'next/link'
import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, landlordTypeEnum, eritsStatusEnum } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { ownLandlordScoped, scopeFromSession } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents } from '@/lib/money'
import { periodOf } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Landlords' }
export const dynamic = 'force-dynamic'

export default async function LandlordsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('landlords.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)
  const period = periodOf(new Date())

  const query = one(params, 'q')
  const type = one(params, 'type')
  const erits = one(params, 'erits')

  const where = ownLandlordScoped(
    landlords,
    scope,
    query
      ? or(
          ilike(landlords.fullName, `%${query}%`),
          ilike(landlords.companyName, `%${query}%`),
          ilike(landlords.code, `%${query}%`),
          ilike(landlords.kraPin, `%${query}%`),
          ilike(landlords.phone, `%${query}%`),
        )
      : undefined,
    type ? eq(landlords.type, type as 'COMPANY') : undefined,
    erits ? eq(landlords.eritsStatus, erits as 'REGISTERED') : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: landlords.id,
        code: landlords.code,
        type: landlords.type,
        fullName: landlords.fullName,
        companyName: landlords.companyName,
        kraPin: landlords.kraPin,
        phone: landlords.phone,
        email: landlords.email,
        payoutMethod: landlords.payoutMethod,
        eritsStatus: landlords.eritsStatus,
        commissionRate: landlords.commissionRate,
        properties: sql<number>`(select count(*)::int from properties p where p.landlord_id = landlords.id)`,
        units: sql<number>`(select count(*)::int from units u join properties p on p.id = u.property_id where p.landlord_id = landlords.id)`,
        expected: sql<string>`(select coalesce(sum(p.expected_monthly_rent), 0) from properties p where p.landlord_id = landlords.id)`,
        collected: sql<string>`(select coalesce(sum(pm.gross_amount), 0) from payments pm where pm.landlord_id = landlords.id and pm.status = 'CONFIRMED' and pm.paid_at >= ${period.start} and pm.paid_at <= ${period.end})`,
        payable: sql<string>`(select coalesce(sum(c.net_amount), 0) from commissions c join payments pm on pm.id = c.payment_id where c.landlord_id = landlords.id and pm.settlement_status <> 'SETTLED' and pm.status = 'CONFIRMED')`,
      })
      .from(landlords)
      .where(where)
      .orderBy(asc(landlords.code))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(landlords).where(where),
  ])

  const totals = rows.reduce(
    (accumulator, row) => ({
      properties: accumulator.properties + row.properties,
      units: accumulator.units + row.units,
      collected: accumulator.collected + cents(row.collected),
      payable: accumulator.payable + cents(row.payable),
    }),
    { properties: 0, units: 0, collected: 0, payable: 0 },
  )

  return (
    <>
      <PageHeader
        title="Landlords"
        description="Property owners, their portfolios and what they are owed."
        actions={
          can(session, 'landlords.create') ? (
            <Link href="/landlords/new" className="btn-primary">
              Add landlord
            </Link>
          ) : null
        }
      />

      <FilterBar
        searchPlaceholder="Search name, code, KRA PIN or phone…"
        selects={[
          { name: 'type', label: 'All types', options: landlordTypeEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'erits', label: 'All eRITS statuses', options: eritsStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/landlords/${row.id}`}
          columns={[
            {
              key: 'name',
              header: 'Landlord',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.companyName ?? row.fullName}</p>
                  <p className="truncate text-2xs text-faint">
                    {row.code} · {humanise(row.type)}
                  </p>
                </div>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              hideOnMobile: true,
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted">{row.phone}</p>
                  <p className="truncate text-2xs text-faint">{row.email ?? '—'}</p>
                </div>
              ),
            },
            {
              key: 'kra',
              header: 'KRA PIN',
              hideOnMobile: true,
              render: (row) =>
                row.kraPin ? (
                  <span className="font-mono text-xs text-muted">{row.kraPin}</span>
                ) : (
                  <span className="text-xs text-negative">Missing</span>
                ),
            },
            {
              key: 'portfolio',
              header: 'Portfolio',
              align: 'right',
              render: (row) => (
                <span className="tabular-nums text-sm text-ink">
                  {row.properties} · {row.units} units
                </span>
              ),
            },
            { key: 'expected', header: 'Expected / month', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.expected} muted /> },
            { key: 'collected', header: 'Collected', align: 'right', render: (row) => <Money value={row.collected} tone="positive" /> },
            { key: 'payable', header: 'Net payable', align: 'right', render: (row) => <Money value={row.payable} /> },
            { key: 'erits', header: 'eRITS', align: 'right', render: (row) => <StatusBadge status={row.eritsStatus} /> },
          ]}
          empty={<EmptyState title="No landlords match these filters" />}
          footer={
            rows.length > 0 ? (
              <tr className="text-sm">
                <td className="px-4 py-2.5 font-medium text-ink">Totals (this page)</td>
                <td className="hidden sm:table-cell" />
                <td className="hidden sm:table-cell" />
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">
                  {totals.properties} · {totals.units} units
                </td>
                <td className="hidden sm:table-cell" />
                <td className="px-4 py-2.5 text-right">
                  <Money value={totals.collected / 100} tone="positive" />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={totals.payable / 100} />
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
          buildHref={(next) => withParams('/landlords', params, { page: next })}
        />
      </Card>
    </>
  )
}
