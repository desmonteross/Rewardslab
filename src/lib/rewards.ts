// ===========================================================================
//  Reward points — the calculator
//
//  Pure arithmetic, no database access, so every rule in the design document
//  can be unit-tested directly against worked KES examples.
//
//  THE RULE
//    points = floor(pointableKES / 100) × punctuality × (1 + streak)
//
//  Full points are the reward for paying ON TIME; lateness reduces them.
//  Structuring it the other way — a baseline for any payment, a bonus for
//  punctuality — pays a tenant for meeting an obligation they already owe.
//
//  POINTS ARE INTEGERS, like money is integer cents. Multipliers are carried
//  as basis points (10_000 = 1.0) so no intermediate value is ever a float,
//  and rounding happens exactly once, at the end.
// ===========================================================================

/** KES of rent that earns one point. Rule-configurable; this is the default. */
export const DEFAULT_EARN_DIVISOR_KES = 100

/** KES a single point is worth on redemption. Rule-configurable. */
export const DEFAULT_PEG_KES_PER_POINT = 1

/**
 * Days after the due date still treated as on time. Mirrors
 * GRACE_PERIOD_DAYS in the rental record engine deliberately: the two must
 * never disagree in public about what "paid on time" means.
 */
export const DEFAULT_GRACE_DAYS = 5
export const DEFAULT_LATE_DAYS = 15

export type PunctualityBand = 'ON_TIME' | 'SLIGHTLY_LATE' | 'LATE' | 'TOO_LATE'

export interface RewardRuleValues {
  earnDivisorKes: number
  graceDays: number
  lateDays: number
  /** Multipliers in basis points: 10_000 = ×1.00. */
  onTimeBp: number
  slightlyLateBp: number
  lateBp: number
  /** Streak bonuses in basis points, added to 10_000. */
  streak3Bp: number
  streak6Bp: number
  streak12Bp: number
  /** Ceiling on the combined multiplier, in basis points. */
  maxMultiplierBp: number
  includeServiceCharge: boolean
}

/**
 * The shipped defaults. A tenant paying on time with a full year of history
 * reaches ×1.30, which at the default peg returns 1.3% of rent — the maximum
 * liability per tenancy, and the number the programme is costed against.
 */
export const DEFAULT_RULE: RewardRuleValues = {
  earnDivisorKes: DEFAULT_EARN_DIVISOR_KES,
  graceDays: DEFAULT_GRACE_DAYS,
  lateDays: DEFAULT_LATE_DAYS,
  onTimeBp: 10_000,
  slightlyLateBp: 5_000,
  lateBp: 2_500,
  streak3Bp: 1_000,
  streak6Bp: 2_000,
  streak12Bp: 3_000,
  maxMultiplierBp: 13_000,
  includeServiceCharge: false,
}

/**
 * Which band a payment falls into. `daysLate` is days past the due date;
 * zero or negative means paid on or before it.
 */
export function punctualityFor(daysLate: number, rule: RewardRuleValues = DEFAULT_RULE): PunctualityBand {
  if (daysLate <= 0) return 'ON_TIME'
  if (daysLate <= rule.graceDays) return 'SLIGHTLY_LATE'
  if (daysLate <= rule.lateDays) return 'LATE'
  return 'TOO_LATE'
}

/** The band's multiplier, in basis points. */
export function multiplierBpFor(band: PunctualityBand, rule: RewardRuleValues = DEFAULT_RULE): number {
  switch (band) {
    case 'ON_TIME':
      return rule.onTimeBp
    case 'SLIGHTLY_LATE':
      return rule.slightlyLateBp
    case 'LATE':
      return rule.lateBp
    case 'TOO_LATE':
      return 0
  }
}

/**
 * The streak bonus in basis points for a run of consecutive on-time months.
 * Bands, not a curve: a tenant can be told "three more months takes you to
 * +20%", which a continuous function cannot express.
 */
export function streakBonusBpFor(streakMonths: number, rule: RewardRuleValues = DEFAULT_RULE): number {
  if (streakMonths >= 12) return rule.streak12Bp
  if (streakMonths >= 6) return rule.streak6Bp
  if (streakMonths >= 3) return rule.streak3Bp
  return 0
}

/**
 * Whether a month counts towards the streak. The threshold is the grace
 * period, so the streak breaks on the same event the punctuality bands treat
 * as a genuine miss rather than a slip.
 */
export function countsTowardStreak(daysLate: number, rule: RewardRuleValues = DEFAULT_RULE): boolean {
  return daysLate <= rule.graceDays
}

export interface EarnInput {
  /** The pointable portion of the invoice, in integer cents. */
  pointableCents: number
  /** Days past the due date the invoice was cleared. Negative is early. */
  daysLate: number
  /** Consecutive on-time months BEFORE this one. */
  streakMonths: number
}

export interface EarnResult {
  points: number
  basePoints: number
  band: PunctualityBand
  multiplierBp: number
  streakBonusBp: number
  /** The combined multiplier actually applied, after the cap. */
  effectiveBp: number
}

/**
 * Compute an award. Returns zero points rather than throwing for a payment
 * that earns nothing, because "too late to earn" is an ordinary outcome and
 * the caller still records why.
 */
export function computeEarn(input: EarnInput, rule: RewardRuleValues = DEFAULT_RULE): EarnResult {
  const band = punctualityFor(input.daysLate, rule)
  const multiplierBp = multiplierBpFor(band, rule)
  const streakBonusBp = streakBonusBpFor(input.streakMonths, rule)

  // Base points floor the division: a 9,999 KES invoice earns 99, not 100.
  // Cents → KES → points in one step, so no intermediate rounding.
  const divisorCents = Math.max(1, Math.round(rule.earnDivisorKes * 100))
  const basePoints = Math.max(0, Math.floor(input.pointableCents / divisorCents))

  // The bonus applies to the punctuality multiplier, not to the base, so a
  // late payment with a long streak still loses most of its value.
  const combinedBp = Math.round((multiplierBp * (10_000 + streakBonusBp)) / 10_000)
  const effectiveBp = Math.min(combinedBp, rule.maxMultiplierBp)

  // One rounding, at the very end.
  const points = Math.round((basePoints * effectiveBp) / 10_000)

  return { points, basePoints, band, multiplierBp, streakBonusBp, effectiveBp }
}

/**
 * The next streak value after a month with this lateness. Kept beside the
 * band logic so the two cannot drift apart.
 */
export function nextStreak(
  previousStreak: number,
  daysLate: number,
  rule: RewardRuleValues = DEFAULT_RULE,
): number {
  return countsTowardStreak(daysLate, rule) ? previousStreak + 1 : 0
}

/**
 * Points expressed in KES at a given peg. Returns integer cents, so the
 * result can go straight into the money helpers without a float in between.
 */
export function pointsToCents(points: number, pegKesPerPoint: number = DEFAULT_PEG_KES_PER_POINT): number {
  // Peg carried to four decimal places, matching numeric(10,4) in the schema.
  const pegTenThousandths = Math.round(pegKesPerPoint * 10_000)
  return Math.round((points * pegTenThousandths) / 100)
}

/** How many whole points a KES amount is worth at a given peg. */
export function centsToPoints(valueInCents: number, pegKesPerPoint: number = DEFAULT_PEG_KES_PER_POINT): number {
  const pegTenThousandths = Math.round(pegKesPerPoint * 10_000)
  if (pegTenThousandths <= 0) return 0
  return Math.floor((valueInCents * 100) / pegTenThousandths)
}

export const PUNCTUALITY_LABELS: Record<PunctualityBand, string> = {
  ON_TIME: 'Paid on time',
  SLIGHTLY_LATE: 'A few days late',
  LATE: 'Late',
  TOO_LATE: 'Too late to earn',
}

/**
 * A one-line explanation of an award, for the portal and the statement. The
 * number on its own invites a dispute; the reason settles it.
 */
export function explainEarn(result: EarnResult, streakMonths: number): string {
  if (result.points === 0) {
    return 'No points — rent cleared more than two weeks after the due date.'
  }
  const parts = [`${result.basePoints} base`]
  if (result.multiplierBp !== 10_000) {
    parts.push(`${PUNCTUALITY_LABELS[result.band].toLowerCase()} (×${(result.multiplierBp / 10_000).toFixed(2)})`)
  }
  if (result.streakBonusBp > 0) {
    parts.push(`${streakMonths}-month streak (+${result.streakBonusBp / 100}%)`)
  }
  return `${parts.join(', ')} → ${result.points} points`
}
