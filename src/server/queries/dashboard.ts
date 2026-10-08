// ===========================================================================
//  Dashboard and portfolio aggregates (spec §6)
//
//  Every figure here is derived from the same ledger the rest of the system
//  writes to, so the dashboard and the accounting screens can never disagree.
// ===========================================================================

import { and, asc, desc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  commissions,
  landlords,
  leases,
  ledgerEntries,
  maintenanceTickets,
  payments,
  properties,
  rentInvoices,
  settlements,
  tenants,
  units,
} from '@/db/schema'
import { cents, percent } from '@/lib/money'
import { periodOf, recentPeriods } from '@/lib/dates'
import { landlordScoped, portfolioTenantFilter, scoped, type Scope } from '@/lib/tenancy'

const SUM = (column: unknown) => sql<string>`coalesce(sum(${column}), 0)`
const COUNT = sql<number>`count(*)::int`

export interface PortfolioSummary {
  properties: number
  units: number
  occupied: number
  vacant: number
  maintenance: number
  reserved: number
  occupancyRate: number
  tenants: number
  activeLeases: number
}

export async function portfolioSummary(scope: Scope): Promise<PortfolioSummary> {
  const [propertyCount] = await db
    .select({ count: COUNT })
    .from(properties)
    .where(landlordScoped(properties, scope, ne(properties.status, 'ARCHIVED')))

  const statusRows = await db
    .select({ status: units.status, count: COUNT })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(landlordScoped(properties, scope))
    .groupBy(units.status)

  const byStatus = Object.fromEntries(statusRows.map((row) => [row.status, row.count])) as Record<
    string,
    number
  >
  const total = statusRows.reduce((sum, row) => sum + row.count, 0)
  const occupied = byStatus.OCCUPIED ?? 0

  const [tenantCount] = await db
    .select({ count: COUNT })
    .from(tenants)
    .where(scoped(tenants, scope, eq(tenants.status, 'ACTIVE'), portfolioTenantFilter(scope)))

  const [leaseCount] = await db
    .select({ count: COUNT })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(landlordScoped(properties, scope, inArray(leases.status, ['ACTIVE', 'EXPIRING'])))

  return {
    properties: propertyCount?.count ?? 0,
    units: total,
    occupied,
    vacant: byStatus.VACANT ?? 0,
    maintenance: byStatus.MAINTENANCE ?? 0,
    reserved: byStatus.RESERVED ?? 0,
    occupancyRate: percent(occupied, total),
    tenants: tenantCount?.count ?? 0,
    activeLeases: leaseCount?.count ?? 0,
  }
}

export interface PortfolioValue {
  /** Sum of the latest valuation held for each property, in cents. */
  totalCents: number
  /** The same sum a month earlier, so the tile can show movement. */
  previousCents: number
  valued: number
  unvalued: number
  /** The most recent valuation date in the portfolio, or null if none. */
  lastValuedAt: Date | null
}

/**
 * What the portfolio is worth, as of a date.
 *
 * A property's value is its most recent valuation *not later than* the date
 * asked for, so the figure for last month does not silently include a
 * revaluation done this week — otherwise every tile would report growth that
 * is really just newer paperwork.
 */
export async function portfolioValue(
  scope: Scope,
  when: Date = new Date(),
): Promise<PortfolioValue> {
  const priorMonth = new Date(when)
  priorMonth.setMonth(priorMonth.getMonth() - 1)

  /*
   * The correlation names the outer table in full. A `${properties.id}` here
   * would render as a bare `"id"`, which inside the subquery binds to the
   * subquery's own scope and silently matches the wrong row.
   */
  const amountAsOf = (asOf: Date) => sql<string | null>`(
    select v.amount
      from property_valuations v
     where v.property_id = properties.id
       and v.organization_id = properties.organization_id
       and v.valued_at <= ${asOf}
     order by v.valued_at desc
     limit 1
  )`

  const rows = await db
    .select({
      current: amountAsOf(when),
      previous: amountAsOf(priorMonth),
      valuedAt: sql<Date | null>`(
        select v.valued_at
          from property_valuations v
         where v.property_id = properties.id
           and v.organization_id = properties.organization_id
           and v.valued_at <= ${when}
         order by v.valued_at desc
         limit 1
      )`,
    })
    .from(properties)
    .where(landlordScoped(properties, scope, ne(properties.status, 'ARCHIVED')))

  let totalCents = 0
  let previousCents = 0
  let valued = 0
  let unvalued = 0
  let lastValuedAt: Date | null = null

  for (const row of rows) {
    if (row.current === null) {
      unvalued += 1
    } else {
      valued += 1
      totalCents += cents(row.current)
    }
    previousCents += cents(row.previous)
    if (row.valuedAt) {
      const at = new Date(row.valuedAt)
      if (!lastValuedAt || at > lastValuedAt) lastValuedAt = at
    }
  }

  return { totalCents, previousCents, valued, unvalued, lastValuedAt }
}

export interface RentSummary {
  expectedCents: number
  collectedCents: number
  outstandingCents: number
  overdueCents: number
  collectionRate: number
  invoiceCount: number
  paidCount: number
  overdueCount: number
}

/** Rent position for one month, defaulting to the current month. */
export async function rentSummary(scope: Scope, when: Date = new Date()): Promise<RentSummary> {
  const period = periodOf(when)

  const [billed] = await db
    .select({
      expected: SUM(rentInvoices.total),
      balance: SUM(rentInvoices.balance),
      count: COUNT,
    })
    .from(rentInvoices)
    .where(
      landlordScoped(
        rentInvoices,
        scope,
        eq(rentInvoices.periodYear, period.year),
        eq(rentInvoices.periodMonth, period.month),
        ne(rentInvoices.status, 'CANCELLED'),
      ),
    )

  const [collected] = await db
    .select({ collected: SUM(payments.grossAmount), count: COUNT })
    .from(payments)
    .where(
      landlordScoped(
        payments,
        scope,
        eq(payments.status, 'CONFIRMED'),
        sql`${payments.paidAt} >= ${period.start}`,
        sql`${payments.paidAt} <= ${period.end}`,
      ),
    )

  const [overdue] = await db
    .select({ overdue: SUM(rentInvoices.balance), count: COUNT })
    .from(rentInvoices)
    .where(
      landlordScoped(
        rentInvoices,
        scope,
        eq(rentInvoices.status, 'OVERDUE'),
        gt(rentInvoices.balance, '0'),
      ),
    )

  const [paid] = await db
    .select({ count: COUNT })
    .from(rentInvoices)
    .where(
      landlordScoped(
        rentInvoices,
        scope,
        eq(rentInvoices.periodYear, period.year),
        eq(rentInvoices.periodMonth, period.month),
        eq(rentInvoices.status, 'PAID'),
      ),
    )

  const expectedCents = cents(billed?.expected)
  const collectedCents = cents(collected?.collected)

  return {
    expectedCents,
    collectedCents,
    outstandingCents: cents(billed?.balance),
    overdueCents: cents(overdue?.overdue),
    collectionRate: percent(collectedCents, expectedCents),
    invoiceCount: billed?.count ?? 0,
    paidCount: paid?.count ?? 0,
    overdueCount: overdue?.count ?? 0,
  }
}

export interface MoneySummary {
  landlordPayableCents: number
  commissionMonthCents: number
  commissionAllTimeCents: number
  settledMonthCents: number
  unmatchedCents: number
  unmatchedCount: number
  /** Raised but not yet paid out, and how many landlords are waiting. */
  pendingSettlementCents: number
  pendingLandlords: number
}

export async function moneySummary(scope: Scope, when: Date = new Date()): Promise<MoneySummary> {
  const period = periodOf(when)

  const [payable] = await db
    .select({
      balance: sql<string>`coalesce(sum(case when ${ledgerEntries.entryType} = 'CREDIT' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end), 0)`,
    })
    .from(ledgerEntries)
    .where(landlordScoped(ledgerEntries, scope, eq(ledgerEntries.account, 'LANDLORD_PAYABLE')))

  const [commissionMonth] = await db
    .select({ total: SUM(commissions.commissionAmount) })
    .from(commissions)
    .innerJoin(payments, eq(payments.id, commissions.paymentId))
    .where(
      landlordScoped(
        commissions,
        scope,
        eq(payments.status, 'CONFIRMED'),
        sql`${payments.paidAt} >= ${period.start}`,
        sql`${payments.paidAt} <= ${period.end}`,
      ),
    )

  const [commissionTotal] = await db
    .select({ total: SUM(commissions.commissionAmount) })
    .from(commissions)
    .where(landlordScoped(commissions, scope))

  const [settled] = await db
    .select({ total: SUM(settlements.netAmount) })
    .from(settlements)
    .where(
      landlordScoped(
        settlements,
        scope,
        eq(settlements.status, 'SETTLED'),
        sql`${settlements.processedAt} >= ${period.start}`,
      ),
    )

  const [unmatched] = await db
    .select({ total: SUM(payments.grossAmount), count: COUNT })
    .from(payments)
    .where(landlordScoped(payments, scope, eq(payments.status, 'UNMATCHED')))

  const [pending] = await db
    .select({
      total: SUM(settlements.netAmount),
      landlords: sql<number>`count(distinct ${settlements.landlordId})::int`,
    })
    .from(settlements)
    .where(
      landlordScoped(
        settlements,
        scope,
        inArray(settlements.status, ['PENDING', 'SCHEDULED', 'PROCESSING']),
      ),
    )

  return {
    landlordPayableCents: cents(payable?.balance),
    commissionMonthCents: cents(commissionMonth?.total),
    commissionAllTimeCents: cents(commissionTotal?.total),
    settledMonthCents: cents(settled?.total),
    unmatchedCents: cents(unmatched?.total),
    unmatchedCount: unmatched?.count ?? 0,
    pendingSettlementCents: cents(pending?.total),
    pendingLandlords: pending?.landlords ?? 0,
  }
}

// ---------------------------------------------------------------------------
// Time series
// ---------------------------------------------------------------------------

export interface MonthlySeries {
  period: string
  expected: number
  collected: number
  outstanding: number
  collectionRate: number
  commission: number
  occupancy: number
  activeLeases: number
}

export async function monthlySeries(scope: Scope, months = 6, anchor = new Date()): Promise<MonthlySeries[]> {
  const periods = recentPeriods(anchor, months)

  const billed = await db
    .select({
      year: rentInvoices.periodYear,
      month: rentInvoices.periodMonth,
      expected: SUM(rentInvoices.total),
      outstanding: SUM(rentInvoices.balance),
    })
    .from(rentInvoices)
    .where(landlordScoped(rentInvoices, scope, ne(rentInvoices.status, 'CANCELLED')))
    .groupBy(rentInvoices.periodYear, rentInvoices.periodMonth)

  const collected = await db
    .select({
      year: sql<number>`extract(year from ${payments.paidAt})::int`,
      month: sql<number>`extract(month from ${payments.paidAt})::int`,
      collected: SUM(payments.grossAmount),
    })
    .from(payments)
    .where(landlordScoped(payments, scope, eq(payments.status, 'CONFIRMED')))
    .groupBy(
      sql`extract(year from ${payments.paidAt})`,
      sql`extract(month from ${payments.paidAt})`,
    )

  const commissionRows = await db
    .select({
      year: sql<number>`extract(year from ${payments.paidAt})::int`,
      month: sql<number>`extract(month from ${payments.paidAt})::int`,
      total: SUM(commissions.commissionAmount),
    })
    .from(commissions)
    .innerJoin(payments, eq(payments.id, commissions.paymentId))
    .where(landlordScoped(commissions, scope, eq(payments.status, 'CONFIRMED')))
    .groupBy(
      sql`extract(year from ${payments.paidAt})`,
      sql`extract(month from ${payments.paidAt})`,
    )

  const [unitTotal] = await db
    .select({ count: COUNT })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(landlordScoped(properties, scope))

  // Occupancy per month is derived from leases that were live in that month.
  const leaseRows = await db
    .select({ startDate: leases.startDate, endDate: leases.endDate, status: leases.status })
    .from(leases)
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(landlordScoped(properties, scope, ne(leases.status, 'DRAFT')))

  const totalUnits = unitTotal?.count ?? 0

  return periods.map((period) => {
    const billedRow = billed.find((row) => row.year === period.year && row.month === period.month)
    const collectedRow = collected.find((row) => row.year === period.year && row.month === period.month)
    const commissionRow = commissionRows.find(
      (row) => row.year === period.year && row.month === period.month,
    )

    const expected = cents(billedRow?.expected) / 100
    const collectedValue = cents(collectedRow?.collected) / 100
    const live = leaseRows.filter(
      (lease) => lease.startDate <= period.end && lease.endDate >= period.start,
    ).length

    return {
      period: period.label.replace(/ \d{4}$/, (match) => ` ’${match.trim().slice(2)}`),
      expected,
      collected: collectedValue,
      outstanding: cents(billedRow?.outstanding) / 100,
      collectionRate: percent(collectedValue, expected),
      commission: cents(commissionRow?.total) / 100,
      occupancy: percent(live, totalUnits),
      activeLeases: live,
    }
  })
}

export interface PropertyPerformance {
  id: string
  code: string
  name: string
  area: string | null
  landlord: string
  units: number
  occupied: number
  occupancyRate: number
  expectedCents: number
  collectedCents: number
  outstandingCents: number
  collectionRate: number
}

export async function propertyPerformance(
  scope: Scope,
  when: Date = new Date(),
): Promise<PropertyPerformance[]> {
  const period = periodOf(when)

  const rows = await db
    .select({
      id: properties.id,
      code: properties.code,
      name: properties.name,
      area: properties.area,
      landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
      unitCount: sql<number>`(select count(*)::int from units u where u.property_id = properties.id)`,
      occupied: sql<number>`(select count(*)::int from units u where u.property_id = properties.id and u.status = 'OCCUPIED')`,
      expected: sql<string>`(select coalesce(sum(i.total), 0) from rent_invoices i where i.property_id = properties.id and i.period_year = ${period.year} and i.period_month = ${period.month} and i.status <> 'CANCELLED')`,
      outstanding: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.property_id = properties.id and i.period_year = ${period.year} and i.period_month = ${period.month} and i.status <> 'CANCELLED')`,
      collected: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.property_id = properties.id and p.status = 'CONFIRMED' and p.paid_at >= ${period.start} and p.paid_at <= ${period.end})`,
    })
    .from(properties)
    .innerJoin(landlords, eq(landlords.id, properties.landlordId))
    .where(landlordScoped(properties, scope, ne(properties.status, 'ARCHIVED')))
    .orderBy(asc(properties.name))

  return rows.map((row) => {
    const expectedCents = cents(row.expected)
    const collectedCents = cents(row.collected)
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      area: row.area,
      landlord: row.landlord,
      units: row.unitCount,
      occupied: row.occupied,
      occupancyRate: percent(row.occupied, row.unitCount),
      expectedCents,
      collectedCents,
      outstandingCents: cents(row.outstanding),
      collectionRate: percent(collectedCents, expectedCents),
    }
  })
}

export type PerformanceLens = 'top' | 'attention' | 'occupancy'

export const PERFORMANCE_LENSES: { key: PerformanceLens; label: string; caption: string }[] = [
  { key: 'top', label: 'Top performing', caption: 'Best collection rate this month.' },
  { key: 'attention', label: 'Needs attention', caption: 'Most rent still outstanding this month.' },
  { key: 'occupancy', label: 'Vacancy', caption: 'Most units standing empty.' },
]

/**
 * Order the same properties three ways.
 *
 * Deliberately a pure function over rows already fetched: the three tabs are
 * one question asked from three angles, not three trips to the database, and
 * sorting in memory keeps the tab switch instant.
 *
 * Properties with nothing billed are excluded from the collection lenses —
 * a property with no invoices has a collection rate of 0% by arithmetic, and
 * ranking it as the worst performer would be a lie about a property that
 * simply has not been billed yet.
 */
export function rankPerformance(
  rows: PropertyPerformance[],
  lens: PerformanceLens,
  limit = 4,
): PropertyPerformance[] {
  if (lens === 'occupancy') {
    return [...rows]
      .filter((row) => row.units > 0)
      .sort((a, b) => a.occupancyRate - b.occupancyRate || b.units - a.units)
      .slice(0, limit)
  }

  const billed = rows.filter((row) => row.expectedCents > 0)

  if (lens === 'attention') {
    return billed
      .filter((row) => row.outstandingCents > 0)
      .sort((a, b) => b.outstandingCents - a.outstandingCents)
      .slice(0, limit)
  }

  return [...billed]
    .sort((a, b) => b.collectionRate - a.collectionRate || b.collectedCents - a.collectedCents)
    .slice(0, limit)
}

// ---------------------------------------------------------------------------
// Activity feeds
// ---------------------------------------------------------------------------

export async function recentPayments(scope: Scope, limit = 6) {
  return db
    .select({
      id: payments.id,
      reference: payments.reference,
      externalReference: payments.externalReference,
      grossAmount: payments.grossAmount,
      method: payments.method,
      status: payments.status,
      paidAt: payments.paidAt,
      payerName: payments.payerName,
      tenantName: tenants.fullName,
      unitNumber: units.unitNumber,
      propertyName: properties.name,
    })
    .from(payments)
    .leftJoin(tenants, eq(tenants.id, payments.tenantId))
    .leftJoin(units, eq(units.id, payments.unitId))
    .leftJoin(properties, eq(properties.id, payments.propertyId))
    .where(landlordScoped(payments, scope))
    .orderBy(desc(payments.paidAt))
    .limit(limit)
}

export async function recentTickets(scope: Scope, limit = 5) {
  return db
    .select({
      id: maintenanceTickets.id,
      number: maintenanceTickets.number,
      title: maintenanceTickets.title,
      category: maintenanceTickets.category,
      priority: maintenanceTickets.priority,
      status: maintenanceTickets.status,
      reportedAt: maintenanceTickets.reportedAt,
      propertyName: properties.name,
      unitNumber: units.unitNumber,
    })
    .from(maintenanceTickets)
    .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
    .leftJoin(units, eq(units.id, maintenanceTickets.unitId))
    .where(landlordScoped(properties, scope, ne(maintenanceTickets.status, 'CLOSED')))
    .orderBy(desc(maintenanceTickets.reportedAt))
    .limit(limit)
}

/**
 * Leases ending within the horizon.
 *
 * Bounded at both ends. Without the lower bound this returned leases that had
 * already ended — which the screen then rendered as "0 days" beside a date
 * months in the past. A lease that has already expired is a different problem
 * from one about to, and belongs on a different list.
 */
export async function upcomingLeaseExpiries(scope: Scope, days = 90, limit = 6) {
  const from = new Date()
  const horizon = new Date(Date.now() + days * 86_400_000)
  return db
    .select({
      id: leases.id,
      code: leases.code,
      endDate: leases.endDate,
      status: leases.status,
      monthlyRent: leases.monthlyRent,
      tenantName: tenants.fullName,
      unitNumber: units.unitNumber,
      propertyName: properties.name,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(
      landlordScoped(
        properties,
        scope,
        inArray(leases.status, ['ACTIVE', 'EXPIRING']),
        sql`${leases.endDate} >= ${from}`,
        sql`${leases.endDate} <= ${horizon}`,
      ),
    )
    .orderBy(asc(leases.endDate))
    .limit(limit)
}

export async function overdueRent(scope: Scope, limit = 6) {
  return db
    .select({
      id: rentInvoices.id,
      number: rentInvoices.number,
      balance: rentInvoices.balance,
      dueDate: rentInvoices.dueDate,
      periodLabel: rentInvoices.periodLabel,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      unitNumber: units.unitNumber,
      propertyName: properties.name,
    })
    .from(rentInvoices)
    .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
    .innerJoin(units, eq(units.id, rentInvoices.unitId))
    .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
    .where(
      landlordScoped(
        rentInvoices,
        scope,
        gt(rentInvoices.balance, '0'),
        inArray(rentInvoices.status, ['OVERDUE', 'PARTIALLY_PAID', 'DUE']),
      ),
    )
    .orderBy(asc(rentInvoices.dueDate))
    .limit(limit)
}

export async function recentSettlements(scope: Scope, limit = 5) {
  return db
    .select({
      id: settlements.id,
      reference: settlements.reference,
      netAmount: settlements.netAmount,
      grossAmount: settlements.grossAmount,
      status: settlements.status,
      periodStart: settlements.periodStart,
      periodEnd: settlements.periodEnd,
      landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
    })
    .from(settlements)
    .innerJoin(landlords, eq(landlords.id, settlements.landlordId))
    .where(landlordScoped(settlements, scope))
    .orderBy(desc(settlements.createdAt))
    .limit(limit)
}

/** Arrears by age — the form that actually helps someone chase money. */
export async function arrearsAgeing(scope: Scope) {
  const rows = await db
    .select({
      bucket: sql<string>`case
        when now()::date - ${rentInvoices.dueDate}::date <= 0 then 'Not yet due'
        when now()::date - ${rentInvoices.dueDate}::date <= 30 then '1–30 days'
        when now()::date - ${rentInvoices.dueDate}::date <= 60 then '31–60 days'
        when now()::date - ${rentInvoices.dueDate}::date <= 90 then '61–90 days'
        else 'Over 90 days' end`,
      total: SUM(rentInvoices.balance),
      count: COUNT,
    })
    .from(rentInvoices)
    .where(landlordScoped(rentInvoices, scope, gt(rentInvoices.balance, '0'), ne(rentInvoices.status, 'CANCELLED')))
    .groupBy(sql`1`)

  const order = ['Not yet due', '1–30 days', '31–60 days', '61–90 days', 'Over 90 days']
  return order
    .map((label) => {
      const row = rows.find((candidate) => candidate.bucket === label)
      return { label, value: cents(row?.total) / 100, count: row?.count ?? 0 }
    })
    .filter((row) => row.value > 0 || row.count > 0)
}

export { and, eq, sql }
