// ===========================================================================
//  Rental record — an explainable summary of how a tenant has paid.
//
//  This is NOT a credit bureau score and must never be presented as one. It is
//  computed only from the tenant's own invoices and payments inside this
//  system, from rules written out in full below, and it is always displayed
//  together with the factors that produced it so the tenant can see why it is
//  what it is and what would move it.
//
//  Deliberate design constraints:
//    * No demographic, employment, national-ID or location input. Payment
//      behaviour only.
//    * No hidden model. Every point is attributable to a named factor.
//    * Thin files are labelled thin rather than scored badly — a new tenant
//      with two invoices is "Building", not "Poor". The one exception is
//      substantial arrears, which is reported however short the history is.
//    * Nothing here writes to the database. The record is derived on read, so
//      it can never drift out of step with the ledger.
//
//  The scoring function is pure so it can be unit-tested against fixed inputs;
//  `rentalRecordFor()` is the only part that touches the database.
// ===========================================================================

import { asc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, rentInvoices } from '@/db/schema'
import { cents, formatKES } from '@/lib/money'
import { scoped, type Scope } from '@/lib/tenancy'

/** Days after the due date still treated as substantially on time. */
export const GRACE_PERIOD_DAYS = 5

/** Enough settled invoices for a band to mean anything. */
export const MINIMUM_HISTORY = 3

const DAY_MS = 86_400_000

export type RentalBand = 'EXCELLENT' | 'GOOD' | 'FAIR' | 'BUILDING' | 'ATTENTION'

export interface RentalRecordInvoice {
  id: string
  periodLabel: string
  dueDate: Date
  totalCents: number
  balanceCents: number
  /** When the invoice first reached a zero balance; null while still owing. */
  clearedAt: Date | null
}

export interface RentalRecordInput {
  asOf: Date
  invoices: RentalRecordInvoice[]
  /** Used to express arrears in months of rent rather than raw shillings. */
  monthlyRentCents: number
  /** Start of the earliest tenancy on record. */
  tenancyStart: Date | null
}

export interface RentalRecordFactor {
  key: string
  label: string
  /** Maximum points this factor can contribute. */
  weight: number
  /** Points actually earned, rounded to one decimal. */
  earned: number
  /** The measurement in the tenant's own terms. */
  detail: string
  /** What would move this factor, phrased as an action. */
  improve: string
}

export interface RentalRecord {
  score: number
  band: RentalBand
  bandLabel: string
  /** False when there is too little history for the band to carry weight. */
  hasEnoughHistory: boolean
  invoicesAssessed: number
  invoicesSettled: number
  onTimeCount: number
  lateCount: number
  onTimeRate: number
  averageDaysLate: number
  longestOnTimeStreak: number
  currentArrearsCents: number
  arrearsInMonths: number
  monthsOnRecord: number
  factors: RentalRecordFactor[]
  /** Newest first — what the record is built from, for the tenant to check. */
  history: Array<{
    periodLabel: string
    dueDate: Date
    totalCents: number
    balanceCents: number
    clearedAt: Date | null
    daysLate: number
    outcome: 'ON_TIME' | 'WITHIN_GRACE' | 'LATE' | 'OUTSTANDING' | 'NOT_YET_DUE'
  }>
}

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value))
const round1 = (value: number) => Math.round(value * 10) / 10
const daysBetween = (from: Date, to: Date) => Math.floor((to.getTime() - from.getTime()) / DAY_MS)

export function bandFor(score: number, hasEnoughHistory: boolean, arrearsInMonths: number): RentalBand {
  // Substantial arrears outrank a thin file. A tenant two months behind is not
  // "Building" — labelling them that way would hide the one fact that matters,
  // from them and from the manager reading the same panel.
  if (arrearsInMonths >= 2) return 'ATTENTION'
  if (!hasEnoughHistory) return 'BUILDING'
  if (score >= 85) return 'EXCELLENT'
  if (score >= 70) return 'GOOD'
  if (score >= 50) return 'FAIR'
  return 'ATTENTION'
}

export const BAND_LABELS: Record<RentalBand, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  FAIR: 'Fair',
  BUILDING: 'Building',
  ATTENTION: 'Needs attention',
}

export const BAND_BLURBS: Record<RentalBand, string> = {
  EXCELLENT: 'Rent has consistently arrived on or before the due date.',
  GOOD: 'Rent arrives reliably, with the occasional late month.',
  FAIR: 'Rent arrives, but often after the due date.',
  BUILDING: 'Not enough history yet — a few more months of rent will fill this in.',
  ATTENTION: 'There is rent outstanding, or payments have been consistently late.',
}

/**
 * The scoring rules, in one place.
 *
 *   Paid on time          45   how often rent cleared by the due date
 *   How late, when late   20   average days past due
 *   Nothing outstanding   20   current arrears measured in months of rent
 *   Unbroken run          10   longest streak of on-time months
 *   Length of tenancy      5   months on record
 *
 * Every weight is visible to the tenant next to the points they earned.
 */
export function computeRentalRecord(input: RentalRecordInput): RentalRecord {
  const { asOf, monthlyRentCents, tenancyStart } = input
  const invoices = [...input.invoices].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())

  const history: RentalRecord['history'] = []
  let onTimeCount = 0
  let lateCount = 0
  let settled = 0
  let assessed = 0
  let totalDaysLate = 0
  let daysLateSamples = 0
  let streak = 0
  let longestStreak = 0
  let arrearsCents = 0

  for (const invoice of invoices) {
    const outstanding = invoice.balanceCents > 0
    if (outstanding) arrearsCents += invoice.balanceCents

    if (invoice.clearedAt) {
      settled += 1
      assessed += 1
      const daysLate = Math.max(0, daysBetween(invoice.dueDate, invoice.clearedAt))
      totalDaysLate += daysLate
      daysLateSamples += 1

      if (daysLate <= 0) {
        onTimeCount += 1
        streak += 1
        history.push({ ...invoice, daysLate: 0, outcome: 'ON_TIME' })
      } else if (daysLate <= GRACE_PERIOD_DAYS) {
        // Substantially on time: half credit, and it does not break the run.
        onTimeCount += 0.5
        lateCount += 1
        streak += 1
        history.push({ ...invoice, daysLate, outcome: 'WITHIN_GRACE' })
      } else {
        lateCount += 1
        streak = 0
        history.push({ ...invoice, daysLate, outcome: 'LATE' })
      }
      longestStreak = Math.max(longestStreak, streak)
      continue
    }

    // Still owing. Only counts against the record once it is actually overdue —
    // an invoice issued for next month is not a black mark.
    if (invoice.dueDate.getTime() < asOf.getTime()) {
      assessed += 1
      lateCount += 1
      streak = 0
      const daysLate = daysBetween(invoice.dueDate, asOf)
      totalDaysLate += daysLate
      daysLateSamples += 1
      history.push({ ...invoice, daysLate, outcome: 'OUTSTANDING' })
    } else {
      history.push({ ...invoice, daysLate: 0, outcome: 'NOT_YET_DUE' })
    }
  }

  const onTimeRate = assessed > 0 ? onTimeCount / assessed : 0
  const averageDaysLate = daysLateSamples > 0 ? totalDaysLate / daysLateSamples : 0
  const arrearsInMonths = monthlyRentCents > 0 ? arrearsCents / monthlyRentCents : 0
  const monthsOnRecord = tenancyStart
    ? Math.max(0, Math.round(daysBetween(tenancyStart, asOf) / 30.44))
    : 0
  const hasEnoughHistory = settled >= MINIMUM_HISTORY

  // --- Points -------------------------------------------------------------
  const punctuality = 45 * onTimeRate
  // Full marks at 0 days, nothing left by 30 days past due.
  const lateness = 20 * (1 - clamp(averageDaysLate / 30))
  // Full marks with nothing outstanding, nothing left at three months of rent.
  const arrears = 20 * (1 - clamp(arrearsInMonths / 3))
  const consistency = 10 * clamp(longestStreak / 12)
  const tenure = 5 * clamp(monthsOnRecord / 24)

  const score = Math.round(punctuality + lateness + arrears + consistency + tenure)
  const band = bandFor(score, hasEnoughHistory, arrearsInMonths)

  const factors: RentalRecordFactor[] = [
    {
      key: 'punctuality',
      label: 'Paid on time',
      weight: 45,
      earned: round1(punctuality),
      detail:
        assessed > 0
          ? `${Math.round(onTimeRate * 100)}% of ${assessed} month${assessed === 1 ? '' : 's'} cleared by the due date`
          : 'No months assessed yet',
      improve: `Clearing rent by the due date — or within ${GRACE_PERIOD_DAYS} days of it — raises this.`,
    },
    {
      key: 'lateness',
      label: 'How late, when late',
      weight: 20,
      earned: round1(lateness),
      detail:
        daysLateSamples > 0
          ? `${round1(averageDaysLate)} days past due on average`
          : 'Nothing has fallen past due',
      improve: 'Paying sooner after the due date raises this, even when the month is already late.',
    },
    {
      key: 'arrears',
      label: 'Nothing outstanding',
      weight: 20,
      earned: round1(arrears),
      detail:
        arrearsCents > 0
          ? `${formatKES(arrearsCents / 100)} owing — about ${round1(arrearsInMonths)} month${arrearsInMonths === 1 ? '' : 's'} of rent`
          : 'Nothing owing',
      improve: 'Clearing the outstanding balance restores all 20 points.',
    },
    {
      key: 'consistency',
      label: 'Unbroken run',
      weight: 10,
      earned: round1(consistency),
      detail: `${longestStreak} month${longestStreak === 1 ? '' : 's'} in a row without a late payment`,
      improve: 'A run of twelve on-time months earns the full 10 points.',
    },
    {
      key: 'tenure',
      label: 'Length of tenancy',
      weight: 5,
      earned: round1(tenure),
      detail: monthsOnRecord > 0 ? `${monthsOnRecord} months on record` : 'Tenancy just started',
      improve: 'This grows on its own, reaching the full 5 points after two years.',
    },
  ]

  return {
    score,
    band,
    bandLabel: BAND_LABELS[band],
    hasEnoughHistory,
    invoicesAssessed: assessed,
    invoicesSettled: settled,
    onTimeCount,
    lateCount,
    onTimeRate,
    averageDaysLate: round1(averageDaysLate),
    longestOnTimeStreak: longestStreak,
    currentArrearsCents: arrearsCents,
    arrearsInMonths: round1(arrearsInMonths),
    monthsOnRecord,
    factors,
    history: history.reverse(),
  }
}

// ---------------------------------------------------------------------------
// Database side
// ---------------------------------------------------------------------------

/**
 * Build the rental record for one tenant.
 *
 * `clearedAt` is the date of the last payment that brought an invoice to a
 * zero balance — taken from the allocation ledger, never from a status flag,
 * so it always agrees with the money that actually moved.
 */
export async function rentalRecordFor(scope: Scope, tenantId: string, asOf = new Date()): Promise<RentalRecord> {
  const rows = await db
    .select({
      id: rentInvoices.id,
      periodLabel: rentInvoices.periodLabel,
      dueDate: rentInvoices.dueDate,
      total: rentInvoices.total,
      balance: rentInvoices.balance,
      clearedAt: sql<Date | null>`(
        select max(p.paid_at)
          from payment_allocations pa
          join payments p on p.id = pa.payment_id
         where pa.invoice_id = rent_invoices.id
           and p.status = 'CONFIRMED'
      )`,
    })
    .from(rentInvoices)
    .where(
      scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId), ne(rentInvoices.status, 'CANCELLED')),
    )
    .orderBy(asc(rentInvoices.dueDate))

  const [tenancy] = await db
    .select({ start: sql<Date | null>`min(${leases.startDate})`, rent: sql<string>`max(${leases.monthlyRent})` })
    .from(leases)
    .where(scoped(leases, scope, eq(leases.tenantId, tenantId)))

  return computeRentalRecord({
    asOf,
    monthlyRentCents: cents(tenancy?.rent ?? '0'),
    tenancyStart: tenancy?.start ? new Date(tenancy.start) : null,
    invoices: rows.map((row) => ({
      id: row.id,
      periodLabel: row.periodLabel,
      dueDate: new Date(row.dueDate),
      totalCents: cents(row.total),
      balanceCents: cents(row.balance),
      // An invoice with nothing left owing was cleared by its last payment.
      clearedAt: cents(row.balance) <= 0 && row.clearedAt ? new Date(row.clearedAt) : null,
    })),
  })
}

/** The same record for several tenants at once, for staff-side lists. */
export async function rentalRecordsFor(
  scope: Scope,
  tenantIds: string[],
  asOf = new Date(),
): Promise<Map<string, RentalRecord>> {
  const out = new Map<string, RentalRecord>()
  for (const tenantId of tenantIds) {
    out.set(tenantId, await rentalRecordFor(scope, tenantId, asOf))
  }
  return out
}
