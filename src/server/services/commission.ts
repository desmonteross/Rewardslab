// ===========================================================================
//  Platform commission engine (spec §16)
//
//  The rate is configurable at four levels. The most specific active rule
//  wins:  PROPERTY → LANDLORD → ORGANIZATION → GLOBAL.
//
//      Tenant pays            KES 25,000
//      Platform commission 1%    KES 250
//      Net landlord amount    KES 24,750
// ===========================================================================

import { and, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { commissionRules, commissions } from '@/db/schema'
import type { Tx } from '@/db'
import { amount, cents, percentOfCents, rateValue } from '@/lib/money'
import type { Scope } from '@/lib/tenancy'

export type CommissionScopeName = 'GLOBAL' | 'ORGANIZATION' | 'LANDLORD' | 'PROPERTY'

const SPECIFICITY: Record<CommissionScopeName, number> = {
  PROPERTY: 4,
  LANDLORD: 3,
  ORGANIZATION: 2,
  GLOBAL: 1,
}

export interface RateCandidate {
  id?: string | null
  scope: CommissionScopeName
  /** Percent, e.g. 1 for 1%. */
  rate: number
  landlordId?: string | null
  propertyId?: string | null
}

export interface ResolvedRate {
  rate: number
  scope: CommissionScopeName
  ruleId: string | null
  source: string
}

/**
 * Pure resolution: given every candidate that applies to this payment, pick
 * the most specific one. Exposed separately so it can be unit-tested without
 * touching the database.
 */
export function resolveRate(candidates: RateCandidate[], fallbackRate: number): ResolvedRate {
  const applicable = candidates.filter((candidate) => Number.isFinite(candidate.rate))
  if (applicable.length === 0) {
    return { rate: fallbackRate, scope: 'GLOBAL', ruleId: null, source: 'platform default' }
  }
  applicable.sort((a, b) => SPECIFICITY[b.scope] - SPECIFICITY[a.scope])
  const winner = applicable[0]
  return {
    rate: winner.rate,
    scope: winner.scope,
    ruleId: winner.id ?? null,
    source: winner.id ? `rule ${winner.id}` : winner.scope.toLowerCase(),
  }
}

export interface CommissionBreakdown {
  /** Integer cents. */
  grossCents: number
  commissionCents: number
  netCents: number
  rate: number
}

/** Commission is rounded half-up to the cent; the landlord gets the remainder. */
export function computeCommission(grossCents: number, ratePercent: number): CommissionBreakdown {
  const commissionCents = percentOfCents(grossCents, ratePercent)
  return {
    grossCents,
    commissionCents,
    netCents: grossCents - commissionCents,
    rate: ratePercent,
  }
}

interface ResolveArgs {
  organizationRate: string | number
  landlordRate?: string | number | null
  propertyRate?: string | number | null
  landlordId: string
  propertyId: string
  at?: Date
}

/** Read every applicable configured rule plus the inline rate overrides. */
export async function resolveCommissionRate(
  tx: Tx,
  scope: Scope,
  args: ResolveArgs,
): Promise<ResolvedRate> {
  const at = args.at ?? new Date()

  const rules = await tx
    .select()
    .from(commissionRules)
    .where(
      and(
        or(eq(commissionRules.organizationId, scope.organizationId), isNull(commissionRules.organizationId)),
        eq(commissionRules.isActive, true),
        sql`${commissionRules.effectiveFrom} <= ${at}`,
        or(isNull(commissionRules.effectiveUntil), sql`${commissionRules.effectiveUntil} >= ${at}`),
      ),
    )
    .orderBy(desc(commissionRules.effectiveFrom))

  const candidates: RateCandidate[] = []

  for (const rule of rules) {
    const ruleScope = rule.scope as CommissionScopeName
    if (ruleScope === 'PROPERTY' && rule.propertyId !== args.propertyId) continue
    if (ruleScope === 'LANDLORD' && rule.landlordId !== args.landlordId) continue
    candidates.push({
      id: rule.id,
      scope: ruleScope,
      rate: rateValue(rule.rate),
      landlordId: rule.landlordId,
      propertyId: rule.propertyId,
    })
  }

  // Inline overrides stored on the property / landlord / organization records.
  if (args.propertyRate !== null && args.propertyRate !== undefined) {
    candidates.push({ scope: 'PROPERTY', rate: rateValue(args.propertyRate), propertyId: args.propertyId })
  }
  if (args.landlordRate !== null && args.landlordRate !== undefined) {
    candidates.push({ scope: 'LANDLORD', rate: rateValue(args.landlordRate), landlordId: args.landlordId })
  }
  candidates.push({ scope: 'ORGANIZATION', rate: rateValue(args.organizationRate) })

  return resolveRate(candidates, Number(process.env.DEFAULT_COMMISSION_RATE ?? 1))
}

export interface RecordCommissionArgs {
  paymentId: string
  landlordId: string
  propertyId: string
  grossCents: number
  resolved: ResolvedRate
}

export async function recordCommission(tx: Tx, scope: Scope, args: RecordCommissionArgs) {
  const breakdown = computeCommission(args.grossCents, args.resolved.rate)
  const [row] = await tx
    .insert(commissions)
    .values({
      organizationId: scope.organizationId,
      paymentId: args.paymentId,
      landlordId: args.landlordId,
      propertyId: args.propertyId,
      ruleId: args.resolved.ruleId,
      scope: args.resolved.scope,
      rate: String(args.resolved.rate),
      grossAmount: amount(breakdown.grossCents),
      commissionAmount: amount(breakdown.commissionCents),
      netAmount: amount(breakdown.netCents),
      status: 'EARNED',
    })
    .returning()
  return { row, breakdown }
}

export function commissionFromRow(row: { grossAmount: string; commissionAmount: string; netAmount: string }) {
  return {
    grossCents: cents(row.grossAmount),
    commissionCents: cents(row.commissionAmount),
    netCents: cents(row.netAmount),
  }
}
