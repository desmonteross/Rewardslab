import { describe, expect, it } from 'vitest'
import { computeCommission, resolveRate, type RateCandidate } from '@/server/services/commission'
import { amount } from '@/lib/money'

describe('commission calculation', () => {
  it('matches the worked example in the specification', () => {
    const result = computeCommission(25_000 * 100, 1)
    expect(amount(result.grossCents)).toBe('25000.00')
    expect(amount(result.commissionCents)).toBe('250.00')
    expect(amount(result.netCents)).toBe('24750.00')
  })

  it('always leaves gross = commission + net, whatever the rounding', () => {
    for (const grossKes of [1, 7, 33.33, 1234.56, 99_999.99]) {
      for (const rate of [0, 0.5, 1, 1.25, 2.75, 7.5, 100]) {
        const grossCents = Math.round(grossKes * 100)
        const result = computeCommission(grossCents, rate)
        expect(result.commissionCents + result.netCents).toBe(grossCents)
        expect(result.commissionCents).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('gives the landlord everything at a zero rate', () => {
    const result = computeCommission(25_000 * 100, 0)
    expect(result.commissionCents).toBe(0)
    expect(result.netCents).toBe(25_000 * 100)
  })
})

describe('commission rate resolution', () => {
  const candidates: RateCandidate[] = [
    { scope: 'ORGANIZATION', rate: 1 },
    { scope: 'LANDLORD', rate: 1.25, landlordId: 'll-1' },
    { scope: 'PROPERTY', rate: 0.75, propertyId: 'prop-1', id: 'rule-prop' },
  ]

  it('prefers the most specific scope', () => {
    expect(resolveRate(candidates, 1)).toMatchObject({ rate: 0.75, scope: 'PROPERTY', ruleId: 'rule-prop' })
  })

  it('falls back through landlord then organization', () => {
    expect(resolveRate(candidates.slice(0, 2), 1)).toMatchObject({ rate: 1.25, scope: 'LANDLORD' })
    expect(resolveRate(candidates.slice(0, 1), 1)).toMatchObject({ rate: 1, scope: 'ORGANIZATION' })
  })

  it('uses the platform default when nothing is configured', () => {
    expect(resolveRate([], 1)).toMatchObject({ rate: 1, scope: 'GLOBAL', ruleId: null })
  })

  it('does not treat a zero rate as missing configuration', () => {
    const result = resolveRate([{ scope: 'PROPERTY', rate: 0, propertyId: 'prop-1' }], 1)
    expect(result.rate).toBe(0)
    expect(result.scope).toBe('PROPERTY')
  })
})
