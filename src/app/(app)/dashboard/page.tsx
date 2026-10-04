// ===========================================================================
//  Dashboard
//
//  The order of this screen is the order of the questions a manager arrives
//  with: who am I and what day is it, what can I do right now, what is the
//  money position, how is it moving, which properties are the problem, and
//  what needs my attention today.
//
//  Every figure is derived from the same ledger and invoice tables the rest of
//  the system writes to, so this screen and the accounting screens can never
//  disagree.
// ===========================================================================

import Link from 'next/link'
import {
  AlertTriangle,
  ArrowDownToLine,
  Building2,
  DoorOpen,
  FileText,
  Landmark,
  UserRoundPlus,
  Wallet,
  Wrench,
} from 'lucide-react'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { compactKES, formatKES, formatPercent } from '@/lib/money'
import { movement } from '@/lib/trend'
import { fmtDate, fmtDayMonth, periodOf } from '@/lib/dates'
import {
  Card,
  DataTable,
  EmptyState,
  Money,
  StatusBadge,
  humanise,
} from '@/components/ui'
import { AreaTrend, CollectionBars, RankedBars, TrendLine } from '@/components/charts'
import {
  AsOfChip,
  Greeting,
  PayablePanel,
  QuickActions,
  RangeTabs,
  StatTile,
  type QuickAction,
} from '@/components/dashboard'
import { PerformancePanel } from '@/components/performance-panel'
import {
  PERFORMANCE_LENSES,
  arrearsAgeing,
  monthlySeries,
  moneySummary,
  overdueRent,
  portfolioSummary,
  portfolioValue,
  propertyPerformance,
  rankPerformance,
  recentPayments,
  recentSettlements,
  recentTickets,
  rentSummary,
  upcomingLeaseExpiries,
} from '@/server/queries/dashboard'

export const metadata = { title: 'Dashboard' }
export const dynamic = 'force-dynamic'

const RANGES = [
  { value: 3, label: '3M' },
  { value: 6, label: '6M' },
  { value: 12, label: '12M' },
]

/** Days left on a lease, for the expiry list. */
function daysUntil(date: Date, from: Date): number {
  return Math.max(0, Math.ceil((new Date(date).getTime() - from.getTime()) / 86_400_000))
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ months?: string }>
}) {
  const session = await requirePermission('dashboard.view')
  const scope = scopeFromSession(session)
  const now = new Date()
  const period = periodOf(now)

  const requested = Number((await searchParams).months)
  const months = RANGES.some((range) => range.value === requested) ? requested : 6

  const lastMonth = new Date(now)
  lastMonth.setMonth(lastMonth.getMonth() - 1)

  const [
    portfolio,
    value,
    rent,
    priorRent,
    money,
    series,
    performance,
    ageing,
    payments,
    tickets,
    expiries,
    overdue,
    settlements,
  ] = await Promise.all([
    portfolioSummary(scope),
    portfolioValue(scope, now),
    rentSummary(scope),
    rentSummary(scope, lastMonth),
    moneySummary(scope),
    monthlySeries(scope, months),
    propertyPerformance(scope),
    arrearsAgeing(scope),
    recentPayments(scope, 5),
    recentTickets(scope, 4),
    upcomingLeaseExpiries(scope, 90, 4),
    overdueRent(scope, 5),
    recentSettlements(scope, 5),
  ])

  // Movement is measured against the same month one period back, and the
  // epsilon keeps cent-level noise from drawing an arrow.
  const valueMovement = movement(value.totalCents, value.previousCents, { epsilon: 100 })
  const expectedMovement = movement(rent.expectedCents, priorRent.expectedCents, { epsilon: 100 })
  const collectedMovement = movement(rent.collectedCents, priorRent.collectedCents, { epsilon: 100 })
  const outstandingMovement = movement(rent.outstandingCents, priorRent.outstandingCents, {
    epsilon: 100,
  })

  const held = new Set(session.permissions)
  const quickActions: QuickAction[] = [
    held.has('rent.view') && {
      label: 'Collect rent',
      description: 'Invoice and chase what is due',
      href: '/rent',
      icon: <Wallet className="h-5 w-5" />,
      tone: 'brand' as const,
    },
    held.has('properties.create') && {
      label: 'Add property',
      description: 'Grow the portfolio',
      href: '/properties?new=1',
      icon: <Building2 className="h-5 w-5" />,
      tone: 'positive' as const,
    },
    held.has('tenants.create') && {
      label: 'Add tenant',
      description: 'Move-ins and leases',
      href: '/tenants?new=1',
      icon: <UserRoundPlus className="h-5 w-5" />,
      tone: 'brand' as const,
    },
    held.has('maintenance.create') && {
      label: 'Report an issue',
      description: 'Raise a maintenance ticket',
      href: '/maintenance?new=1',
      icon: <Wrench className="h-5 w-5" />,
      tone: 'warning' as const,
    },
  ].filter(Boolean) as QuickAction[]

  const lenses = PERFORMANCE_LENSES.map((lens) => ({
    key: lens.key,
    label: lens.label,
    caption: lens.caption,
    rows: rankPerformance(performance, lens.key).map((row) => ({
      id: row.id,
      name: row.name,
      area: row.area,
      units: row.units,
      occupied: row.occupied,
      occupancyRate: row.occupancyRate,
      collectedCents: row.collectedCents,
      outstandingCents: row.outstandingCents,
      collectionRate: row.collectionRate,
    })),
  }))

  const valueSub =
    value.unvalued > 0
      ? `${value.valued} of ${portfolio.properties} properties valued`
      : `${portfolio.properties} ${portfolio.properties === 1 ? 'property' : 'properties'}`

  return (
    <>
      <Greeting
        name={session.fullName.split(' ')[0]}
        organization={session.organizationName ?? 'your portfolio'}
        asOf={now}
        aside={<AsOfChip asOf={now} place={period.label} />}
      />

      <QuickActions actions={quickActions} />

      {/* --- Headline figures ---------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-5">
        <StatTile
          label="Portfolio value"
          value={value.valued > 0 ? compactKES(value.totalCents / 100) : '—'}
          sub={
            value.lastValuedAt
              ? `${valueSub} · valued ${fmtDayMonth(value.lastValuedAt)}`
              : 'No valuations recorded yet'
          }
          icon={<Landmark className="h-4 w-4" />}
          tone="brand"
          delta={value.valued > 0 ? valueMovement : undefined}
          href="/properties"
        />
        <StatTile
          label="Expected rent"
          value={compactKES(rent.expectedCents / 100)}
          sub={`${rent.invoiceCount} invoices · ${period.label}`}
          icon={<FileText className="h-4 w-4" />}
          delta={expectedMovement}
          href="/invoices"
        />
        <StatTile
          label="Rent collected"
          value={compactKES(rent.collectedCents / 100)}
          sub={`${formatPercent(rent.collectionRate)} of what was billed`}
          icon={<ArrowDownToLine className="h-4 w-4" />}
          tone="positive"
          delta={collectedMovement}
          progress={{
            value: rent.collectedCents,
            max: rent.expectedCents,
            tone:
              rent.collectionRate >= 90 ? 'positive' : rent.collectionRate >= 70 ? 'warning' : 'negative',
          }}
          href="/payments"
        />
        <StatTile
          label="Outstanding rent"
          value={compactKES(rent.outstandingCents / 100)}
          sub={
            rent.overdueCount > 0
              ? `${formatKES(rent.overdueCents / 100)} of it past due, across ${rent.overdueCount} ${
                  rent.overdueCount === 1 ? 'invoice' : 'invoices'
                }`
              : 'Billed this month, none past due yet'
          }
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={rent.outstandingCents > 0 ? 'negative' : 'positive'}
          delta={outstandingMovement}
          favourable="down"
          progress={{
            value: rent.outstandingCents,
            max: rent.expectedCents,
            tone: 'negative',
          }}
          href="/rent"
        />
        <StatTile
          label="Occupancy"
          value={formatPercent(portfolio.occupancyRate)}
          sub={`${portfolio.occupied} of ${portfolio.units} units · ${portfolio.vacant} vacant`}
          icon={<DoorOpen className="h-4 w-4" />}
          tone={portfolio.occupancyRate >= 90 ? 'positive' : 'warning'}
          progress={{
            value: portfolio.occupied,
            max: portfolio.units,
            tone: portfolio.occupancyRate >= 90 ? 'positive' : 'warning',
          }}
          href="/units"
        />
      </div>

      {/* --- Trend, performance, money ------------------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_minmax(0,0.75fr)]">
        <Card
          title="Rent collection trend"
          description="Expected is the context; collected is the point."
          actions={
            <RangeTabs
              options={RANGES}
              current={months}
              hrefFor={(value) => `/dashboard?months=${value}`}
            />
          }
        >
          <CollectionBars
            data={series.map((row) => ({
              period: row.period,
              expected: row.expected,
              collected: row.collected,
            }))}
            height={260}
          />
        </Card>

        <PerformancePanel lenses={lenses} />

        <PayablePanel
          payableCents={money.landlordPayableCents}
          commissionCents={money.commissionMonthCents}
          commissionRateNote={`${compactKES(money.commissionAllTimeCents / 100)} earned all time`}
          pendingSettlementCents={money.pendingSettlementCents}
          pendingLandlords={money.pendingLandlords}
        />
      </div>

      {/* --- Secondary trends ---------------------------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Occupancy trend" description="Units under an active lease, month by month.">
          <TrendLine
            data={series.map((row) => ({ period: row.period, value: row.occupancy }))}
            height={190}
            unit="percent"
            name="Occupancy"
            tone="positive"
            domain={[0, 100]}
          />
        </Card>

        <Card title="Collection rate" description="Share of each month’s billing received.">
          <TrendLine
            data={series.map((row) => ({ period: row.period, value: row.collectionRate }))}
            height={190}
            unit="percent"
            name="Collection rate"
            domain={[0, 100]}
          />
        </Card>

        <Card title="Platform revenue" description="Commission earned on reconciled rent.">
          <AreaTrend
            data={series.map((row) => ({ period: row.period, value: row.commission }))}
            height={190}
            name="Commission"
          />
        </Card>
      </div>

      {/* --- Where the money is stuck --------------------------------------- */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Arrears ageing" description="How long the money owed has been outstanding.">
          {ageing.length === 0 ? (
            <EmptyState title="No arrears" description="Every invoice raised has been settled." />
          ) : (
            <RankedBars data={ageing} height={Math.max(180, ageing.length * 44)} />
          )}
        </Card>

        <Card
          title="Overdue rent"
          padded={false}
          actions={
            <Link href="/rent" className="text-xs text-brand hover:underline">
              Rent collection
            </Link>
          }
        >
          <DataTable
            dense
            rows={overdue}
            rowKey={(row) => row.id}
            rowHref={(row) => `/invoices/${row.id}`}
            columns={[
              {
                key: 'tenant',
                header: 'Tenant',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.tenantName}</p>
                    <p className="truncate text-2xs text-faint">
                      {row.propertyName} · {row.unitNumber}
                    </p>
                  </div>
                ),
              },
              {
                key: 'due',
                header: 'Due',
                hideOnMobile: true,
                render: (row) => <span className="text-xs text-muted">{fmtDate(row.dueDate)}</span>,
              },
              {
                key: 'balance',
                header: 'Balance',
                align: 'right',
                render: (row) => <Money value={row.balance} tone="negative" />,
              },
            ]}
            empty={<EmptyState title="Nothing overdue" description="Every invoice is current." />}
          />
        </Card>
      </div>

      {/* --- Today's attention list ---------------------------------------- */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card
          title="Recent payments"
          padded={false}
          actions={
            <Link href="/payments" className="text-xs text-brand hover:underline">
              View all
            </Link>
          }
        >
          {payments.length === 0 ? (
            <EmptyState title="No payments recorded yet" />
          ) : (
            <ul className="divide-y divide-line">
              {payments.map((payment) => (
                <li key={payment.id}>
                  <Link
                    href={`/payments/${payment.id}`}
                    className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink group-hover:text-brand">
                        {payment.tenantName ?? payment.payerName ?? 'Unmatched'}
                      </p>
                      <p className="truncate text-2xs text-faint">
                        {payment.propertyName
                          ? `${payment.unitNumber ?? '—'} · ${payment.propertyName}`
                          : 'No property matched'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Money value={payment.grossAmount} />
                      <p className="mt-0.5 text-2xs text-faint">{fmtDayMonth(payment.paidAt)}</p>
                    </div>
                    <StatusBadge status={payment.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Maintenance requests"
          padded={false}
          actions={
            <Link href="/maintenance" className="text-xs text-brand hover:underline">
              View all
            </Link>
          }
        >
          {tickets.length === 0 ? (
            <EmptyState title="No open tickets" />
          ) : (
            <ul className="divide-y divide-line">
              {tickets.map((ticket) => (
                <li key={ticket.id}>
                  <Link
                    href={`/maintenance/${ticket.id}`}
                    className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-canvas"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink group-hover:text-brand">
                        {ticket.title}
                      </p>
                      <p className="truncate text-2xs text-faint">
                        {ticket.unitNumber ? `${ticket.unitNumber} · ` : ''}
                        {ticket.propertyName} · {humanise(ticket.category)}
                      </p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Upcoming lease expiries"
          padded={false}
          actions={
            <Link href="/leases" className="text-xs text-brand hover:underline">
              View all
            </Link>
          }
        >
          {expiries.length === 0 ? (
            <EmptyState title="No leases expiring" description="Nothing ends in the next 90 days." />
          ) : (
            <ul className="divide-y divide-line">
              {expiries.map((lease) => {
                const days = daysUntil(lease.endDate, now)
                return (
                  <li key={lease.id}>
                    <Link
                      href={`/leases/${lease.id}`}
                      className="group flex items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas"
                    >
                      <span
                        className={
                          days <= 30
                            ? 'shrink-0 rounded-lg bg-negative/10 px-2 py-1 text-2xs font-medium tabular-nums text-negative'
                            : 'shrink-0 rounded-lg bg-canvas px-2 py-1 text-2xs font-medium tabular-nums text-muted'
                        }
                      >
                        {days} days
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink group-hover:text-brand">
                          {lease.tenantName}
                        </p>
                        <p className="truncate text-2xs text-faint">
                          {lease.unitNumber} · {lease.propertyName}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs tabular-nums text-muted">
                        {fmtDate(lease.endDate)}
                      </span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* --- Settlements ---------------------------------------------------- */}
      {settlements.length > 0 && (
        <div className="mt-4">
          <Card
            title="Recent settlements"
            padded={false}
            actions={
              <Link href="/settlements" className="text-xs text-brand hover:underline">
                View all
              </Link>
            }
          >
            <DataTable
              dense
              rows={settlements}
              rowKey={(row) => row.id}
              rowHref={(row) => `/settlements/${row.id}`}
              columns={[
                { key: 'landlord', header: 'Landlord', render: (row) => row.landlordName },
                {
                  key: 'reference',
                  header: 'Reference',
                  hideOnMobile: true,
                  render: (row) => <span className="font-mono text-xs">{row.reference}</span>,
                },
                {
                  key: 'period',
                  header: 'Period',
                  hideOnMobile: true,
                  render: (row) => (
                    <span className="text-xs text-muted">
                      {fmtDayMonth(row.periodStart)}–{fmtDayMonth(row.periodEnd)}
                    </span>
                  ),
                },
                { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.status} /> },
                {
                  key: 'net',
                  header: 'Net',
                  align: 'right',
                  render: (row) => <Money value={row.netAmount} />,
                },
              ]}
            />
          </Card>
        </div>
      )}
    </>
  )
}
