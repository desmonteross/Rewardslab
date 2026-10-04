// ===========================================================================
//  Reward points — the calculator
//
//  The worked examples in the design document are the specification. If one
//  of these numbers changes, the programme's cost per tenancy changed with
//  it, and that is a decision rather than a refactor.
// ===========================================================================

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RULE,
  centsToPoints,
  computeEarn,
  countsTowardStreak,
  explainEarn,
  multiplierBpFor,
  nextStreak,
  pointsToCents,
  punctualityFor,
  streakBonusBpFor,
  type RewardRuleValues,
} from '@/lib/rewards'

/** KES → integer cents, so the examples read as shillings. */
const kes = (value: number) => Math.round(value * 100)

describe('the worked examples from the design', () => {
  it('a 9,500 bedsitter paid on time with no streak earns 95', () => {
    const result = computeEarn({ pointableCents: kes(9_500), daysLate: 0, streakMonths: 0 })
    expect(result.basePoints).toBe(95)
    expect(result.points).toBe(95)
    expect(result.band).toBe('ON_TIME')
  })

  it('a 25,000 two-bed paid on time on a 7-month streak earns 300', () => {
    const result = computeEarn({ pointableCents: kes(25_000), daysLate: 0, streakMonths: 7 })
    expect(result.basePoints).toBe(250)
    expect(result.streakBonusBp).toBe(2_000)
    expect(result.points).toBe(300)
  })

  it('the same rent three days late, no streak, earns 125', () => {
    const result = computeEarn({ pointableCents: kes(25_000), daysLate: 3, streakMonths: 0 })
    expect(result.band).toBe('SLIGHTLY_LATE')
    expect(result.points).toBe(125)
  })

  it('a 30,000 three-bed twenty days late earns nothing, streak or not', () => {
    const result = computeEarn({ pointableCents: kes(30_000), daysLate: 20, streakMonths: 4 })
    expect(result.band).toBe('TOO_LATE')
    expect(result.points).toBe(0)
  })

  it('a 110,000 office unit on time with a full year earns 1,430', () => {
    const result = computeEarn({ pointableCents: kes(110_000), daysLate: 0, streakMonths: 12 })
    expect(result.basePoints).toBe(1_100)
    expect(result.effectiveBp).toBe(13_000)
    expect(result.points).toBe(1_430)
  })

  it('caps the return at 1.3% of rent — the maximum liability per tenancy', () => {
    const rent = kes(25_000)
    const best = computeEarn({ pointableCents: rent, daysLate: -5, streakMonths: 60 })
    const valueCents = pointsToCents(best.points)
    expect(valueCents / rent).toBeLessThanOrEqual(0.013)
  })
})

describe('punctuality bands', () => {
  it('treats paying early as on time', () => {
    expect(punctualityFor(-10)).toBe('ON_TIME')
    expect(punctualityFor(0)).toBe('ON_TIME')
  })

  it('breaks at the grace period, not a day either side', () => {
    expect(punctualityFor(1)).toBe('SLIGHTLY_LATE')
    expect(punctualityFor(5)).toBe('SLIGHTLY_LATE')
    expect(punctualityFor(6)).toBe('LATE')
  })

  it('stops earning after fifteen days', () => {
    expect(punctualityFor(15)).toBe('LATE')
    expect(punctualityFor(16)).toBe('TOO_LATE')
    expect(multiplierBpFor('TOO_LATE')).toBe(0)
  })

  it('matches the rental record engine on what counts as on time', () => {
    // GRACE_PERIOD_DAYS in rental-record.ts is 5. The two must never disagree
    // in public: an Attention band beside a healthy balance discredits both.
    expect(DEFAULT_RULE.graceDays).toBe(5)
    expect(countsTowardStreak(5)).toBe(true)
    expect(countsTowardStreak(6)).toBe(false)
  })
})

describe('the streak bonus', () => {
  it('pays nothing below three months', () => {
    expect(streakBonusBpFor(0)).toBe(0)
    expect(streakBonusBpFor(2)).toBe(0)
  })

  it('steps at three, six and twelve months', () => {
    expect(streakBonusBpFor(3)).toBe(1_000)
    expect(streakBonusBpFor(5)).toBe(1_000)
    expect(streakBonusBpFor(6)).toBe(2_000)
    expect(streakBonusBpFor(11)).toBe(2_000)
    expect(streakBonusBpFor(12)).toBe(3_000)
  })

  it('stops climbing after a year', () => {
    expect(streakBonusBpFor(120)).toBe(streakBonusBpFor(12))
  })

  it('survives a slip inside the grace period and breaks outside it', () => {
    expect(nextStreak(7, 3)).toBe(8)
    expect(nextStreak(7, 5)).toBe(8)
    expect(nextStreak(7, 6)).toBe(0)
  })

  it('does not rescue a payment that was too late to earn at all', () => {
    const result = computeEarn({ pointableCents: kes(50_000), daysLate: 40, streakMonths: 24 })
    expect(result.points).toBe(0)
  })
})

describe('arithmetic', () => {
  it('floors the base rather than rounding it up', () => {
    // 9,999 KES earns 99 points, not 100.
    expect(computeEarn({ pointableCents: kes(9_999), daysLate: 0, streakMonths: 0 }).basePoints).toBe(99)
    expect(computeEarn({ pointableCents: kes(100), daysLate: 0, streakMonths: 0 }).basePoints).toBe(1)
    expect(computeEarn({ pointableCents: kes(99), daysLate: 0, streakMonths: 0 }).basePoints).toBe(0)
  })

  it('never returns a fractional point', () => {
    for (const rent of [7_350, 12_345, 23_999, 41_111]) {
      for (const streak of [0, 3, 6, 12]) {
        for (const late of [0, 2, 8]) {
          const result = computeEarn({ pointableCents: kes(rent), daysLate: late, streakMonths: streak })
          expect(Number.isInteger(result.points)).toBe(true)
        }
      }
    }
  })

  it('earns nothing from a zero or negative invoice', () => {
    expect(computeEarn({ pointableCents: 0, daysLate: 0, streakMonths: 0 }).points).toBe(0)
    expect(computeEarn({ pointableCents: -5_000, daysLate: 0, streakMonths: 0 }).points).toBe(0)
  })

  it('converts points to KES at the peg, and back', () => {
    expect(pointsToCents(250, 1)).toBe(kes(250))
    expect(pointsToCents(250, 0.5)).toBe(kes(125))
    expect(centsToPoints(kes(250), 1)).toBe(250)
    expect(centsToPoints(kes(250), 0.5)).toBe(500)
  })

  it('refuses to divide by a zero peg', () => {
    expect(centsToPoints(kes(250), 0)).toBe(0)
  })
})

describe('rules are data', () => {
  it('honours a different earn divisor without touching the formula', () => {
    const generous: RewardRuleValues = { ...DEFAULT_RULE, earnDivisorKes: 50 }
    const result = computeEarn({ pointableCents: kes(25_000), daysLate: 0, streakMonths: 0 }, generous)
    expect(result.basePoints).toBe(500)
  })

  it('honours a different grace period', () => {
    const strict: RewardRuleValues = { ...DEFAULT_RULE, graceDays: 0 }
    expect(punctualityFor(1, strict)).toBe('LATE')
  })

  it('honours a lower cap', () => {
    const capped: RewardRuleValues = { ...DEFAULT_RULE, maxMultiplierBp: 10_000 }
    const result = computeEarn({ pointableCents: kes(25_000), daysLate: 0, streakMonths: 12 }, capped)
    expect(result.points).toBe(250)
  })
})

describe('the explanation', () => {
  it('says why, not just how many — the number alone invites a dispute', () => {
    const result = computeEarn({ pointableCents: kes(25_000), daysLate: 0, streakMonths: 7 })
    const text = explainEarn(result, 7)
    expect(text).toContain('250 base')
    expect(text).toContain('7-month streak')
    expect(text).toContain('300 points')
  })

  it('explains a zero award in plain words', () => {
    const result = computeEarn({ pointableCents: kes(25_000), daysLate: 30, streakMonths: 0 })
    expect(explainEarn(result, 0)).toMatch(/No points/i)
  })
})
