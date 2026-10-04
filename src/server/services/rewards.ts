// ===========================================================================
//  Reward points — the engine
//
//  Awards fire on ALLOCATION, not on receipt. The M-Pesa callback is a claim
//  from an external system; the allocation is the platform's own decision
//  that this money settles that invoice. Only the allocation carries the two
//  facts the rules need: which invoice was settled, and therefore what was
//  owed and when it was due.
//
//  Every posting balances within an entry group. Issuing points credits the
//  tenant and debits the funding counterparty, so outstanding liability is a
//  query rather than an estimate.
//
//  Nothing here updates a row. A mistake is corrected by posting a reversing
//  group that references the original.
// ===========================================================================

import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import {
  invoiceItems,
  rentInvoices,
  rewardAccounts,
  rewardEntries,
  rewardProgrammes,
  rewardRedemptions,
  rewardRules,
  type RewardRule,
} from '@/db/schema'
import type { Tx } from '@/db'
import { db } from '@/db'
import { newId } from '@/lib/ids'
import { amount, cents } from '@/lib/money'
import {
  computeEarn,
  countsTowardStreak,
  explainEarn,
  pointsToCents,
  type EarnResult,
  type RewardRuleValues,
} from '@/lib/rewards'
import { TenancyError, type Scope } from '@/lib/tenancy'

export const PLATFORM_PROGRAMME_NAME = 'RentRewards Points'

/** How far back a streak walk will look. A tenancy older than this is capped. */
const STREAK_LOOKBACK_MONTHS = 24

export class RewardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RewardError'
  }
}

export class UnbalancedRewardPostingError extends RewardError {
  constructor(total: number) {
    super(
      `Reward posting is not balanced: the lines sum to ${total} points, not zero. ` +
        'The posting was rejected and nothing was written.',
    )
    this.name = 'UnbalancedRewardPostingError'
  }
}

// ---------------------------------------------------------------------------
// Programme, rules and accounts
// ---------------------------------------------------------------------------

/**
 * The platform-wide programme. Balances follow the tenant across
 * organizations, the same way the rental record does — it would be strange
 * for reputation to travel and rewards not to.
 */
export async function ensureProgramme(tx: Tx): Promise<{ programme: typeof rewardProgrammes.$inferSelect; rule: RewardRule }> {
  const existing = await tx
    .select()
    .from(rewardProgrammes)
    .where(and(isNull(rewardProgrammes.organizationId), eq(rewardProgrammes.name, PLATFORM_PROGRAMME_NAME)))
    .limit(1)

  let programme = existing[0]
  if (!programme) {
    const inserted = await tx
      .insert(rewardProgrammes)
      .values({ organizationId: null, name: PLATFORM_PROGRAMME_NAME })
      .onConflictDoNothing()
      .returning()
    programme =
      inserted[0] ??
      (
        await tx
          .select()
          .from(rewardProgrammes)
          .where(and(isNull(rewardProgrammes.organizationId), eq(rewardProgrammes.name, PLATFORM_PROGRAMME_NAME)))
          .limit(1)
      )[0]
  }
  if (!programme) throw new RewardError('The reward programme could not be created.')

  const rule = await ensureRule(tx, programme.id)
  return { programme, rule }
}

async function ensureRule(tx: Tx, programmeId: string): Promise<RewardRule> {
  const existing = await tx
    .select()
    .from(rewardRules)
    .where(eq(rewardRules.programmeId, programmeId))
    .orderBy(desc(rewardRules.version))
    .limit(1)
  if (existing[0]) return existing[0]

  const inserted = await tx
    .insert(rewardRules)
    .values({ programmeId, version: 1, effectiveFrom: new Date(0) })
    .onConflictDoNothing()
    .returning()
  if (inserted[0]) return inserted[0]

  const again = await tx
    .select()
    .from(rewardRules)
    .where(eq(rewardRules.programmeId, programmeId))
    .orderBy(desc(rewardRules.version))
    .limit(1)
  if (!again[0]) throw new RewardError('The reward rules could not be created.')
  return again[0]
}

/**
 * The rule in force at a given moment. An award stores the version it was
 * computed under, so a later rule change cannot silently rewrite history.
 */
export async function ruleInForce(tx: Tx, programmeId: string, at: Date): Promise<RewardRule> {
  const rows = await tx
    .select()
    .from(rewardRules)
    .where(
      and(
        eq(rewardRules.programmeId, programmeId),
        lte(rewardRules.effectiveFrom, at),
        or(isNull(rewardRules.effectiveTo), sql`${rewardRules.effectiveTo} > ${at}`),
      ),
    )
    .orderBy(desc(rewardRules.effectiveFrom), desc(rewardRules.version))
    .limit(1)
  if (rows[0]) return rows[0]
  return ensureRule(tx, programmeId)
}

/** Translate a stored rule row into the calculator's plain value object. */
export function ruleValues(rule: RewardRule): RewardRuleValues {
  return {
    earnDivisorKes: rule.earnDivisorKes,
    graceDays: rule.graceDays,
    lateDays: rule.lateDays,
    onTimeBp: rule.onTimeBp,
    slightlyLateBp: rule.slightlyLateBp,
    lateBp: rule.lateBp,
    streak3Bp: rule.streak3Bp,
    streak6Bp: rule.streak6Bp,
    streak12Bp: rule.streak12Bp,
    maxMultiplierBp: rule.maxMultiplierBp,
    includeServiceCharge: rule.includeServiceCharge,
  }
}

type AccountKind = 'TENANT' | 'FUNDING' | 'REDEEMED' | 'EXPIRED'

/**
 * Accounts hold no balance — they anchor entries, so there is nothing here
 * that can drift out of step with the ledger.
 */
export async function accountFor(
  tx: Tx,
  programmeId: string,
  kind: AccountKind,
  tenantId: string | null = null,
): Promise<string> {
  const where =
    kind === 'TENANT'
      ? and(
          eq(rewardAccounts.programmeId, programmeId),
          eq(rewardAccounts.kind, 'TENANT'),
          eq(rewardAccounts.tenantId, tenantId!),
        )
      : and(eq(rewardAccounts.programmeId, programmeId), eq(rewardAccounts.kind, kind), isNull(rewardAccounts.tenantId))

  const existing = await tx.select({ id: rewardAccounts.id }).from(rewardAccounts).where(where).limit(1)
  if (existing[0]) return existing[0].id

  const label =
    kind === 'TENANT' ? `Tenant ${tenantId}` : kind === 'FUNDING' ? 'Programme funding' : `${kind} sink`

  const inserted = await tx
    .insert(rewardAccounts)
    .values({ programmeId, kind, tenantId: kind === 'TENANT' ? tenantId : null, label })
    .onConflictDoNothing()
    .returning({ id: rewardAccounts.id })
  if (inserted[0]) return inserted[0].id

  const again = await tx.select({ id: rewardAccounts.id }).from(rewardAccounts).where(where).limit(1)
  if (!again[0]) throw new RewardError('The reward account could not be created.')
  return again[0].id
}

// ---------------------------------------------------------------------------
// Posting
// ---------------------------------------------------------------------------

export interface RewardLine {
  accountId: string
  /** Signed. Positive credits the account, negative debits it. Never zero. */
  points: number
  bucket?: 'PENDING' | 'AVAILABLE'
  tenantId?: string | null
  narrative?: string
}

export interface RewardPosting {
  programmeId: string
  type: 'EARN' | 'MATURE' | 'REDEEM' | 'EXPIRE' | 'REVERSAL' | 'ADJUSTMENT'
  narrative: string
  transactionDate: Date
  originOrganizationId?: string | null
  ruleVersionId?: string | null
  sourceAllocationId?: string | null
  sourcePaymentId?: string | null
  sourceInvoiceId?: string | null
  sourceRedemptionId?: string | null
  reversesGroupId?: string | null
  periodYear?: number | null
  periodMonth?: number | null
  daysLate?: number | null
  streakMonths?: number | null
  lines: RewardLine[]
}

/** Sum a posting's lines. Zero means balanced. */
export function balanceOf(lines: RewardLine[]): number {
  return lines.reduce((total, line) => total + line.points, 0)
}

/**
 * Write one balanced group. Returns the group id. Rejects an unbalanced
 * posting outright rather than writing half of it.
 */
export async function postRewardGroup(tx: Tx, posting: RewardPosting): Promise<string> {
  if (posting.lines.length === 0) throw new RewardError('A reward posting must have at least one line.')
  if (posting.lines.some((line) => line.points === 0)) {
    throw new RewardError('A reward line of zero points carries no information — omit it.')
  }
  const total = balanceOf(posting.lines)
  if (total !== 0) throw new UnbalancedRewardPostingError(total)

  const entryGroupId = newId()
  await tx.insert(rewardEntries).values(
    posting.lines.map((line) => ({
      entryGroupId,
      programmeId: posting.programmeId,
      accountId: line.accountId,
      originOrganizationId: posting.originOrganizationId ?? null,
      tenantId: line.tenantId ?? null,
      ruleVersionId: posting.ruleVersionId ?? null,
      type: posting.type,
      bucket: line.bucket ?? 'AVAILABLE',
      points: line.points,
      narrative: line.narrative ?? posting.narrative,
      sourceAllocationId: posting.sourceAllocationId ?? null,
      sourcePaymentId: posting.sourcePaymentId ?? null,
      sourceInvoiceId: posting.sourceInvoiceId ?? null,
      sourceRedemptionId: posting.sourceRedemptionId ?? null,
      reversesGroupId: posting.reversesGroupId ?? null,
      periodYear: posting.periodYear ?? null,
      periodMonth: posting.periodMonth ?? null,
      daysLate: posting.daysLate ?? null,
      streakMonths: posting.streakMonths ?? null,
      transactionDate: posting.transactionDate,
    })),
  )
  return entryGroupId
}

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

export interface AwardInput {
  allocationId: string
  paymentId: string
  invoiceId: string
  tenantId: string
  organizationId: string
  /** When the invoice was actually cleared. */
  clearedAt: Date
}

export interface AwardOutcome {
  awarded: boolean
  points: number
  reason: string
  entryGroupId: string | null
  result: EarnResult | null
  streakMonths: number
}

const NOT_AWARDED = (reason: string): AwardOutcome => ({
  awarded: false,
  points: 0,
  reason,
  entryGroupId: null,
  result: null,
  streakMonths: 0,
})

/**
 * Award points for an allocation that cleared an invoice.
 *
 * Idempotent by database constraint: a retried M-Pesa callback collides on
 * the unique index and is swallowed as a successful no-op. Checking first and
 * then inserting is a race, and under concurrent callbacks it loses.
 */
export async function awardForAllocation(tx: Tx, input: AwardInput): Promise<AwardOutcome> {
  const { programme } = await ensureProgramme(tx)
  const rule = await ruleInForce(tx, programme.id, input.clearedAt)
  const values = ruleValues(rule)

  const invoiceRows = await tx
    .select({
      id: rentInvoices.id,
      dueDate: rentInvoices.dueDate,
      total: rentInvoices.total,
      balance: rentInvoices.balance,
      periodYear: rentInvoices.periodYear,
      periodMonth: rentInvoices.periodMonth,
      periodLabel: rentInvoices.periodLabel,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(eq(rentInvoices.id, input.invoiceId))
    .limit(1)

  const invoice = invoiceRows[0]
  if (!invoice) return NOT_AWARDED('The invoice no longer exists.')

  // Partial payments earn on full settlement, not per instalment — otherwise
  // an invoice paid in four parts earns four streak-bearing awards.
  if (cents(invoice.balance) > 0) {
    return NOT_AWARDED('The invoice is not yet fully settled.')
  }

  const pointableCents = await pointableAmountCents(tx, input.invoiceId, values.includeServiceCharge)
  if (pointableCents <= 0) return NOT_AWARDED('The invoice carries no pointable charges.')

  const daysLate = wholeDaysBetween(invoice.dueDate, input.clearedAt)
  const streakMonths = await streakBefore(tx, {
    programmeId: programme.id,
    tenantId: input.tenantId,
    periodYear: invoice.periodYear,
    periodMonth: invoice.periodMonth,
    graceDays: values.graceDays,
  })

  const result = computeEarn({ pointableCents, daysLate, streakMonths }, values)
  if (result.points <= 0) {
    return { ...NOT_AWARDED('Cleared too long after the due date to earn.'), result, streakMonths }
  }

  const tenantAccount = await accountFor(tx, programme.id, 'TENANT', input.tenantId)
  const fundingAccount = await accountFor(tx, programme.id, 'FUNDING')

  try {
    const entryGroupId = await postRewardGroup(tx, {
      programmeId: programme.id,
      type: 'EARN',
      narrative: `${invoice.periodLabel} rent — ${explainEarn(result, streakMonths)}`,
      transactionDate: input.clearedAt,
      originOrganizationId: input.organizationId,
      ruleVersionId: rule.id,
      sourceAllocationId: input.allocationId,
      sourcePaymentId: input.paymentId,
      sourceInvoiceId: input.invoiceId,
      periodYear: invoice.periodYear,
      periodMonth: invoice.periodMonth,
      daysLate,
      streakMonths,
      lines: [
        { accountId: tenantAccount, points: result.points, bucket: 'PENDING', tenantId: input.tenantId },
        { accountId: fundingAccount, points: -result.points, bucket: 'PENDING' },
      ],
    })
    return {
      awarded: true,
      points: result.points,
      reason: explainEarn(result, streakMonths),
      entryGroupId,
      result,
      streakMonths,
    }
  } catch (error) {
    if (isUniqueViolation(error)) {
      // A retry. The first attempt already posted this award.
      return { ...NOT_AWARDED('Already awarded for this allocation.'), result, streakMonths }
    }
    throw error
  }
}

/** The portion of an invoice that earns points. Service charge is a pass-through cost. */
async function pointableAmountCents(tx: Tx, invoiceId: string, includeServiceCharge: boolean): Promise<number> {
  const types = includeServiceCharge ? (['RENT', 'SERVICE_CHARGE'] as const) : (['RENT'] as const)
  const rows = await tx
    .select({ amount: invoiceItems.amount })
    .from(invoiceItems)
    .where(and(eq(invoiceItems.invoiceId, invoiceId), inArray(invoiceItems.type, [...types])))
  return rows.reduce((total, row) => total + cents(row.amount), 0)
}

interface StreakQuery {
  programmeId: string
  tenantId: string
  periodYear: number
  periodMonth: number
  graceDays: number
}

/**
 * Consecutive on-time months immediately before this one.
 *
 * Walked back through prior awards by period rather than carried on the
 * tenant row, so the streak is reconstructible from the ledger alone. A month
 * that earned nothing posts no entry, which breaks the run exactly as it
 * should: the walk requires contiguous periods.
 */
export async function streakBefore(tx: Tx, query: StreakQuery): Promise<number> {
  const reversed = await reversedGroupIds(tx, query.programmeId)

  const rows = await tx
    .select({
      entryGroupId: rewardEntries.entryGroupId,
      periodYear: rewardEntries.periodYear,
      periodMonth: rewardEntries.periodMonth,
      daysLate: rewardEntries.daysLate,
    })
    .from(rewardEntries)
    .where(
      and(
        eq(rewardEntries.programmeId, query.programmeId),
        eq(rewardEntries.tenantId, query.tenantId),
        eq(rewardEntries.type, 'EARN'),
        sql`${rewardEntries.points} > 0`,
      ),
    )
    .orderBy(desc(rewardEntries.periodYear), desc(rewardEntries.periodMonth))
    .limit(STREAK_LOOKBACK_MONTHS * 2)

  const byPeriod = new Map<string, number>()
  for (const row of rows) {
    if (row.periodYear === null || row.periodMonth === null) continue
    if (reversed.has(row.entryGroupId)) continue
    const key = `${row.periodYear}-${row.periodMonth}`
    if (!byPeriod.has(key)) byPeriod.set(key, row.daysLate ?? 0)
  }

  let streak = 0
  let { year, month } = previousPeriod(query.periodYear, query.periodMonth)
  for (let step = 0; step < STREAK_LOOKBACK_MONTHS; step += 1) {
    const daysLate = byPeriod.get(`${year}-${month}`)
    if (daysLate === undefined) break
    if (!countsTowardStreak(daysLate, { graceDays: query.graceDays } as RewardRuleValues)) break
    streak += 1
    ;({ year, month } = previousPeriod(year, month))
  }
  return streak
}

function previousPeriod(year: number, month: number): { year: number; month: number } {
  return month <= 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
}

/** Groups that have been undone. Their entries are excluded from every read. */
async function reversedGroupIds(tx: Tx, programmeId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ reversesGroupId: rewardEntries.reversesGroupId })
    .from(rewardEntries)
    .where(and(eq(rewardEntries.programmeId, programmeId), eq(rewardEntries.type, 'REVERSAL')))
  const set = new Set<string>()
  for (const row of rows) if (row.reversesGroupId) set.add(row.reversesGroupId)
  return set
}

// ---------------------------------------------------------------------------
// Maturation
// ---------------------------------------------------------------------------

/**
 * Move points that have served their pending window into the available
 * bucket. Maturation is itself a posting, not a status update, so entries
 * stay immutable and the balance is two sums rather than one.
 */
export async function matureDuePoints(tx: Tx, asOf: Date = new Date()): Promise<{ groups: number; points: number }> {
  const { programme } = await ensureProgramme(tx)
  const cutoff = new Date(asOf.getTime() - programme.maturationDays * 86_400_000)
  const reversed = await reversedGroupIds(tx, programme.id)

  const pending = await tx
    .select({
      entryGroupId: rewardEntries.entryGroupId,
      accountId: rewardEntries.accountId,
      tenantId: rewardEntries.tenantId,
      points: rewardEntries.points,
      originOrganizationId: rewardEntries.originOrganizationId,
      transactionDate: rewardEntries.transactionDate,
    })
    .from(rewardEntries)
    .where(
      and(
        eq(rewardEntries.programmeId, programme.id),
        eq(rewardEntries.type, 'EARN'),
        eq(rewardEntries.bucket, 'PENDING'),
        sql`${rewardEntries.points} > 0`,
        lte(rewardEntries.transactionDate, cutoff),
      ),
    )
    .orderBy(asc(rewardEntries.transactionDate))

  const alreadyMatured = await maturedGroupIds(tx, programme.id)

  let groups = 0
  let points = 0
  for (const entry of pending) {
    if (reversed.has(entry.entryGroupId)) continue
    if (alreadyMatured.has(entry.entryGroupId)) continue
    await postRewardGroup(tx, {
      programmeId: programme.id,
      type: 'MATURE',
      narrative: 'Points confirmed after the 30-day settling period',
      transactionDate: asOf,
      originOrganizationId: entry.originOrganizationId,
      reversesGroupId: entry.entryGroupId,
      lines: [
        { accountId: entry.accountId, points: -entry.points, bucket: 'PENDING', tenantId: entry.tenantId },
        { accountId: entry.accountId, points: entry.points, bucket: 'AVAILABLE', tenantId: entry.tenantId },
      ],
    })
    groups += 1
    points += entry.points
  }
  return { groups, points }
}

/**
 * MATURE entries carry the earning group in `reversesGroupId` — it is the
 * group they act upon, not one they undo — so a second run is a no-op.
 */
async function maturedGroupIds(tx: Tx, programmeId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ reversesGroupId: rewardEntries.reversesGroupId })
    .from(rewardEntries)
    .where(and(eq(rewardEntries.programmeId, programmeId), eq(rewardEntries.type, 'MATURE')))
  const set = new Set<string>()
  for (const row of rows) if (row.reversesGroupId) set.add(row.reversesGroupId)
  return set
}

// ---------------------------------------------------------------------------
// Reversal
// ---------------------------------------------------------------------------

/**
 * Undo every award a payment produced. Called when the payment itself is
 * reversed — a recalled transfer, a correction. The awards are not deleted;
 * a compensating group is posted against each.
 */
export async function reverseAwardsForPayment(
  tx: Tx,
  paymentId: string,
  reason: string,
  at: Date = new Date(),
): Promise<{ groups: number; points: number }> {
  const { programme } = await ensureProgramme(tx)
  const reversed = await reversedGroupIds(tx, programme.id)
  const matured = await maturedGroupIds(tx, programme.id)

  const entries = await tx
    .select()
    .from(rewardEntries)
    .where(
      and(
        eq(rewardEntries.programmeId, programme.id),
        eq(rewardEntries.sourcePaymentId, paymentId),
        eq(rewardEntries.type, 'EARN'),
      ),
    )

  const groupsSeen = new Map<string, typeof entries>()
  for (const entry of entries) {
    if (reversed.has(entry.entryGroupId)) continue
    const list = groupsSeen.get(entry.entryGroupId) ?? []
    list.push(entry)
    groupsSeen.set(entry.entryGroupId, list)
  }

  let groups = 0
  let points = 0
  for (const [groupId, lines] of groupsSeen) {
    // If the points already matured they now sit in AVAILABLE, so the
    // compensating entry must come out of the bucket they actually occupy.
    const bucket = matured.has(groupId) ? ('AVAILABLE' as const) : ('PENDING' as const)
    await postRewardGroup(tx, {
      programmeId: programme.id,
      type: 'REVERSAL',
      narrative: `Reversed — ${reason}`,
      transactionDate: at,
      originOrganizationId: lines[0]?.originOrganizationId ?? null,
      ruleVersionId: lines[0]?.ruleVersionId ?? null,
      sourcePaymentId: paymentId,
      sourceInvoiceId: lines[0]?.sourceInvoiceId ?? null,
      reversesGroupId: groupId,
      lines: lines.map((line) => ({
        accountId: line.accountId,
        points: -line.points,
        bucket,
        tenantId: line.tenantId,
      })),
    })
    groups += 1
    points += lines.filter((line) => line.points > 0).reduce((total, line) => total + line.points, 0)
  }
  return { groups, points }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export interface RewardBalance {
  pending: number
  available: number
  total: number
  lifetimeEarned: number
  pegKesPerPoint: number
  availableValueCents: number
}

/**
 * A tenant's balance, summed across every organization they have rented
 * from. This is the one query in the system that deliberately reads across
 * organizations, which is exactly where an isolation guarantee gets broken by
 * accident — so it takes a tenant id and nothing else, and the caller must
 * have obtained that id from `requireOwnTenant` below.
 */
export async function rewardBalanceForTenant(tx: Tx, tenantId: string): Promise<RewardBalance> {
  const { programme } = await ensureProgramme(tx)

  const rows = await tx
    .select({
      bucket: rewardEntries.bucket,
      type: rewardEntries.type,
      points: rewardEntries.points,
    })
    .from(rewardEntries)
    .where(and(eq(rewardEntries.programmeId, programme.id), eq(rewardEntries.tenantId, tenantId)))

  let pending = 0
  let available = 0
  let lifetimeEarned = 0
  for (const row of rows) {
    if (row.bucket === 'PENDING') pending += row.points
    else available += row.points
    if (row.type === 'EARN' && row.points > 0) lifetimeEarned += row.points
  }

  const pegKesPerPoint = Number(programme.pegKesPerPoint)
  return {
    pending,
    available,
    total: pending + available,
    lifetimeEarned,
    pegKesPerPoint,
    availableValueCents: pointsToCents(Math.max(0, available), pegKesPerPoint),
  }
}

/**
 * The tenant whose rewards this session may read.
 *
 * Deliberately narrower than `requireTenantId`: it refuses any session that
 * is not a tenant portal session at all, so no staff scope can reach the
 * cross-organization balance even by passing a tenant id it happens to know.
 */
export function requireOwnTenant(scope: Scope): string {
  if (scope.role !== 'TENANT' || !scope.tenantId) {
    throw new TenancyError('Only a tenant portal session can read a reward balance.')
  }
  return scope.tenantId
}

export interface RewardStatementRow {
  id: string
  date: Date
  type: string
  bucket: string
  points: number
  narrative: string
  periodLabel: string | null
}

/** A tenant's own statement — their whole history, across organizations. */
export async function rewardStatementForTenant(tx: Tx, tenantId: string, limit = 100): Promise<RewardStatementRow[]> {
  const { programme } = await ensureProgramme(tx)
  const rows = await tx
    .select({
      id: rewardEntries.id,
      date: rewardEntries.transactionDate,
      type: rewardEntries.type,
      bucket: rewardEntries.bucket,
      points: rewardEntries.points,
      narrative: rewardEntries.narrative,
      periodYear: rewardEntries.periodYear,
      periodMonth: rewardEntries.periodMonth,
    })
    .from(rewardEntries)
    .where(
      and(
        eq(rewardEntries.programmeId, programme.id),
        eq(rewardEntries.tenantId, tenantId),
        sql`${rewardEntries.points} > 0`,
      ),
    )
    .orderBy(desc(rewardEntries.transactionDate))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    type: row.type,
    bucket: row.bucket,
    points: row.points,
    narrative: row.narrative,
    periodLabel:
      row.periodYear !== null && row.periodMonth !== null
        ? `${String(row.periodMonth).padStart(2, '0')}/${row.periodYear}`
        : null,
  }))
}

export interface RewardEarning {
  periodYear: number
  periodMonth: number
  points: number
  /** Days after the due date the rent was cleared; 0 or less is on time. */
  daysLate: number | null
  streakMonths: number | null
  pending: boolean
}

/**
 * What a tenant earned, one row per rent month, oldest first. Reversed
 * awards are left out, so every branch on the points tree is still standing.
 */
export async function rewardEarningsForTenant(tx: Tx, tenantId: string): Promise<RewardEarning[]> {
  const { programme } = await ensureProgramme(tx)
  const rows = await tx
    .select({
      groupId: rewardEntries.entryGroupId,
      type: rewardEntries.type,
      bucket: rewardEntries.bucket,
      points: rewardEntries.points,
      periodYear: rewardEntries.periodYear,
      periodMonth: rewardEntries.periodMonth,
      daysLate: rewardEntries.daysLate,
      streakMonths: rewardEntries.streakMonths,
      reversesGroupId: rewardEntries.reversesGroupId,
    })
    .from(rewardEntries)
    .where(
      and(
        eq(rewardEntries.programmeId, programme.id),
        eq(rewardEntries.tenantId, tenantId),
        inArray(rewardEntries.type, ['EARN', 'REVERSAL', 'MATURE']),
      ),
    )

  const reversed = new Set(rows.filter((row) => row.type === 'REVERSAL' && row.reversesGroupId).map((row) => row.reversesGroupId))
  const matured = new Set(rows.filter((row) => row.type === 'MATURE' && row.reversesGroupId).map((row) => row.reversesGroupId))

  const byPeriod = new Map<string, RewardEarning>()
  for (const row of rows) {
    if (row.type !== 'EARN' || row.points <= 0 || reversed.has(row.groupId)) continue
    if (row.periodYear === null || row.periodMonth === null) continue
    const key = `${row.periodYear}-${row.periodMonth}`
    const existing = byPeriod.get(key)
    const pending = !matured.has(row.groupId)
    if (existing) {
      existing.points += row.points
      existing.pending = existing.pending || pending
      existing.daysLate = Math.max(existing.daysLate ?? 0, row.daysLate ?? 0)
    } else {
      byPeriod.set(key, {
        periodYear: row.periodYear,
        periodMonth: row.periodMonth,
        points: row.points,
        daysLate: row.daysLate,
        streakMonths: row.streakMonths,
        pending,
      })
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.periodYear - b.periodYear || a.periodMonth - b.periodMonth)
}

/**
 * The staff-side view: only what this organization issued or honoured. One
 * organization never learns that another exists, even though the tenant's
 * balance spans both.
 */
export async function rewardActivityForOrganization(tx: Tx, scope: Scope, limit = 100) {
  const { programme } = await ensureProgramme(tx)
  return tx
    .select({
      id: rewardEntries.id,
      date: rewardEntries.transactionDate,
      tenantId: rewardEntries.tenantId,
      type: rewardEntries.type,
      points: rewardEntries.points,
      narrative: rewardEntries.narrative,
    })
    .from(rewardEntries)
    .where(
      and(
        eq(rewardEntries.programmeId, programme.id),
        eq(rewardEntries.originOrganizationId, scope.organizationId),
        sql`${rewardEntries.points} > 0`,
        // Sink and funding rows are accounting artefacts with no tenant
        // behind them. Showing them as "activity" would put a redemption on
        // screen twice and attribute it to nobody.
        sql`${rewardEntries.tenantId} is not null`,
      ),
    )
    .orderBy(desc(rewardEntries.transactionDate))
    .limit(limit)
}

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

export interface RedeemInput {
  tenantId: string
  organizationId: string | null
  type: 'DEPOSIT_FUND' | 'AIRTIME' | 'VOUCHER' | 'RENT_CREDIT'
  points: number
  /** Caller-supplied idempotency key — a retried request must not spend twice. */
  requestKey: string
  invoiceId?: string | null
  requestedById?: string | null
  requestedByName?: string | null
}

/**
 * Spend points. Debits the available bucket only, never pending, and freezes
 * the peg it was priced at so the value cannot drift if the peg later moves.
 */
export async function redeemPoints(tx: Tx, input: RedeemInput, at: Date = new Date()) {
  if (input.points <= 0) throw new RewardError('A redemption must be for a positive number of points.')

  const { programme } = await ensureProgramme(tx)

  const existing = await tx
    .select()
    .from(rewardRedemptions)
    .where(
      and(eq(rewardRedemptions.programmeId, programme.id), eq(rewardRedemptions.requestKey, input.requestKey)),
    )
    .limit(1)
  if (existing[0]) return existing[0]

  const balance = await rewardBalanceForTenant(tx, input.tenantId)
  if (balance.available < input.points) {
    throw new RewardError(
      `Not enough available points: ${balance.available} available, ${input.points} requested. ` +
        `${balance.pending} points are still maturing.`,
    )
  }

  const pegKesPerPoint = Number(programme.pegKesPerPoint)
  const valueCents = pointsToCents(input.points, pegKesPerPoint)

  const tenantAccount = await accountFor(tx, programme.id, 'TENANT', input.tenantId)
  const sink = await accountFor(tx, programme.id, 'REDEEMED')

  const [redemption] = await tx
    .insert(rewardRedemptions)
    .values({
      programmeId: programme.id,
      tenantId: input.tenantId,
      organizationId: input.organizationId,
      type: input.type,
      status: 'FULFILLED',
      points: input.points,
      pegKesPerPoint: programme.pegKesPerPoint,
      valueAmount: amount(valueCents),
      invoiceId: input.invoiceId ?? null,
      requestKey: input.requestKey,
      requestedById: input.requestedById ?? null,
      requestedByName: input.requestedByName ?? null,
    })
    .returning()

  const entryGroupId = await postRewardGroup(tx, {
    programmeId: programme.id,
    type: 'REDEEM',
    narrative: `Redeemed ${input.points} points (${amount(valueCents)} KES) — ${input.type.toLowerCase().replace('_', ' ')}`,
    transactionDate: at,
    originOrganizationId: input.organizationId,
    sourceRedemptionId: redemption.id,
    lines: [
      { accountId: tenantAccount, points: -input.points, bucket: 'AVAILABLE', tenantId: input.tenantId },
      { accountId: sink, points: input.points, bucket: 'AVAILABLE' },
    ],
  })

  const [updated] = await tx
    .update(rewardRedemptions)
    .set({ entryGroupId, updatedAt: new Date() })
    .where(eq(rewardRedemptions.id, redemption.id))
    .returning()

  return updated
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function wholeDaysBetween(from: Date, to: Date): number {
  const startOfDay = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  return Math.round((startOfDay(to) - startOfDay(from)) / 86_400_000)
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505'
}

/** Convenience wrapper for callers outside a transaction. */
export async function withRewards<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => fn(tx))
}
