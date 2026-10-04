import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, maintenanceTickets, payments, properties, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, compactKES, formatPercent, percent } from '@/lib/money'
import { periodOf } from '@/lib/dates'
import { Card, KpiCard, PageHeader, humanise } from '@/components/ui'
import { AreaTrend, CollectionBars, RankedBars, TrendLine } from '@/components/charts'
import { arrearsAgeing, monthlySeries, portfolioSummary, propertyPerformance } from '@/server/queries/dashboard'

export const metadata = { title: 'Analytics' }
export const dynamic = 'force-dynamic'

export default async function AnalyticsPage() {
  const session = await requirePermission('analytics.view')
  const scope = scopeFromSession(session)
  const period = periodOf(new Date())

  const [series, portfolio, performance, ageing, byUnitType, byMethod, ticketsByCategory, tenure] =
    await Promise.all([
      monthlySeries(scope, 12),
      portfolioSummary(scope),
      propertyPerformance(scope),
      arrearsAgeing(scope),
      db
        .select({
          type: units.type,
          count: sql<number>`count(*)::int`,
          occupied: sql<number>`count(*) filter (where ${units.status} = 'OCCUPIED')::int`,
          rent: sql<string>`coalesce(avg(${units.monthlyRent}), 0)`,
        })
        .from(units)
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(landlordScoped(properties, scope))
        .groupBy(units.type)
        .orderBy(sql`count(*) desc`),
      db
        .select({
          method: payments.method,
          count: sql<number>`count(*)::int`,
          total: sql<string>`coalesce(sum(${payments.grossAmount}), 0)`,
        })
        .from(payments)
        .where(landlordScoped(payments, scope, eq(payments.status, 'CONFIRMED')))
        .groupBy(payments.method)
        .orderBy(sql`coalesce(sum(${payments.grossAmount}), 0) desc`),
      db
        .select({
          category: maintenanceTickets.category,
          count: sql<number>`count(*)::int`,
          cost: sql<string>`coalesce(sum(${maintenanceTickets.actualCost}), 0)`,
        })
        .from(maintenanceTickets)
        .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
        .where(landlordScoped(properties, scope))
        .groupBy(maintenanceTickets.category)
        .orderBy(sql`count(*) desc`),
      db
        .select({
          averageMonths: sql<string>`coalesce(round(avg(extract(epoch from (coalesce(${leases.moveOutDate}, now()) - ${leases.startDate})) / 2629800)::numeric, 1), 0)::text`,
          longest: sql<string>`coalesce(round(max(extract(epoch from (coalesce(${leases.moveOutDate}, now()) - ${leases.startDate})) / 2629800)::numeric, 1), 0)::text`,
        })
        .from(leases)
        .innerJoin(properties, eq(properties.id, leases.propertyId))
        .where(landlordScoped(properties, scope))
        .then((rows) => rows[0]),
    ])

  const latest = series[series.length - 1]
  const previous = series[series.length - 2]
  const collectionDelta = latest && previous ? latest.collectionRate - previous.collectionRate : 0

  const [tenantCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tenants)
    .where(scoped(tenants, scope, eq(tenants.status, 'ACTIVE')))

  const totalTickets = ticketsByCategory.reduce((sum, row) => sum + row.count, 0)

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Twelve months of trend across collection, occupancy, revenue and operations."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Collection rate"
          value={formatPercent(latest?.collectionRate ?? 0)}
          tone={collectionDelta >= 0 ? 'positive' : 'negative'}
          sub={`${collectionDelta >= 0 ? '+' : ''}${collectionDelta.toFixed(1)} pts on last month`}
        />
        <KpiCard label="Occupancy" value={formatPercent(portfolio.occupancyRate)} sub={`${portfolio.occupied} of ${portfolio.units} units`} />
        <KpiCard label="Active tenants" value={String(tenantCount?.count ?? 0)} />
        <KpiCard label="Average tenure" value={`${tenure?.averageMonths ?? 0} months`} sub={`longest ${tenure?.longest ?? 0}`} />
        <KpiCard
          label="Rent collected (12m)"
          value={compactKES(series.reduce((sum, row) => sum + row.collected, 0))}
        />
        <KpiCard
          label="Commission (12m)"
          value={compactKES(series.reduce((sum, row) => sum + row.commission, 0))}
          tone="brand"
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Expected against collected" description="Twelve months of billing and receipts.">
          <CollectionBars
            data={series.map((row) => ({ period: row.period, expected: row.expected, collected: row.collected }))}
            height={300}
          />
        </Card>
        <Card title="Collection rate" description="Share of each month’s billing received.">
          <TrendLine
            data={series.map((row) => ({ period: row.period, value: row.collectionRate }))}
            height={300}
            unit="percent"
            name="Collection rate"
            domain={[0, 100]}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Occupancy trend">
          <TrendLine
            data={series.map((row) => ({ period: row.period, value: row.occupancy }))}
            height={220}
            unit="percent"
            name="Occupancy"
            tone="positive"
            domain={[0, 100]}
          />
        </Card>
        <Card title="Outstanding rent">
          <TrendLine
            data={series.map((row) => ({ period: row.period, value: row.outstanding }))}
            height={220}
            unit="money"
            name="Outstanding"
            tone="warning"
          />
        </Card>
        <Card title="Platform revenue">
          <AreaTrend
            data={series.map((row) => ({ period: row.period, value: row.commission }))}
            height={220}
            name="Commission"
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Collection rate by property" description={`${period.label}, highest first.`}>
          <RankedBars
            data={performance
              .map((row) => ({ label: row.name, value: row.collectionRate }))
              .sort((a, b) => b.value - a.value)}
            height={Math.max(180, performance.length * 40)}
            unit="percent"
          />
        </Card>

        <Card title="Arrears ageing">
          <RankedBars data={ageing} height={Math.max(180, ageing.length * 44)} />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Unit mix" description="Units by type, and how many are let." padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2 text-right">Units</th>
                <th className="px-4 py-2 text-right">Let</th>
                <th className="px-4 py-2 text-right">Avg rent</th>
              </tr>
            </thead>
            <tbody>
              {byUnitType.map((row) => (
                <tr key={row.type} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2 text-ink">{humanise(row.type)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{row.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">
                    {row.occupied} ({formatPercent(percent(row.occupied, row.count))})
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">{compactKES(cents(row.rent) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Payment methods" description="How tenants actually pay." padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2">Method</th>
                <th className="px-4 py-2 text-right">Payments</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {byMethod.map((row) => (
                <tr key={row.method} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2 text-ink">{humanise(row.method)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{row.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">{compactKES(cents(row.total) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card title="Maintenance by category" description={`${totalTickets} tickets raised.`} padded={false}>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2 text-right">Tickets</th>
                <th className="px-4 py-2 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {ticketsByCategory.map((row) => (
                <tr key={row.category} className="border-b border-line/70 last:border-0">
                  <td className="px-4 py-2 text-ink">{humanise(row.category)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted">{row.count}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-ink">{compactKES(cents(row.cost) / 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  )
}
