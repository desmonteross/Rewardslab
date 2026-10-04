import { describe, expect, it } from 'vitest'
import { selectTaxRule, type TaxRuleCandidate } from '@/server/services/compliance'

const rule = (overrides: Partial<TaxRuleCandidate> & { id: string; rate: number }): TaxRuleCandidate => ({
  name: overrides.id,
  thresholdMinCents: null,
  thresholdMaxCents: null,
  propertyType: null,
  taxpayerType: 'ANY',
  effectiveFrom: new Date(2024, 0, 1),
  ...overrides,
})

const bands: TaxRuleCandidate[] = [
  rule({ id: 'below', rate: 0, thresholdMinCents: 0, thresholdMaxCents: 287_999_99 }),
  rule({ id: 'mri', rate: 7.5, thresholdMinCents: 288_000_00, thresholdMaxCents: 15_000_000_00 }),
  rule({ id: 'above', rate: 0, thresholdMinCents: 15_000_000_01 }),
]

describe('tax rule selection', () => {
  it('picks the band the annualised income falls into', () => {
    expect(selectTaxRule(bands, { taxpayerType: 'COMPANY', thresholdBasisCents: 12_600_000_00 })?.id).toBe('mri')
    expect(selectTaxRule(bands, { taxpayerType: 'COMPANY', thresholdBasisCents: 100_000_00 })?.id).toBe('below')
    expect(selectTaxRule(bands, { taxpayerType: 'COMPANY', thresholdBasisCents: 30_000_000_00 })?.id).toBe('above')
  })

  it('prefers a rule scoped to the taxpayer type', () => {
    const candidates = [
      rule({ id: 'any', rate: 7.5 }),
      rule({ id: 'company', rate: 10, taxpayerType: 'COMPANY' }),
    ]
    expect(selectTaxRule(candidates, { taxpayerType: 'COMPANY', thresholdBasisCents: 1_000_000_00 })?.id).toBe('company')
    expect(selectTaxRule(candidates, { taxpayerType: 'INDIVIDUAL', thresholdBasisCents: 1_000_000_00 })?.id).toBe('any')
  })

  it('ignores a property-scoped rule when the property type is unknown', () => {
    const candidates = [
      rule({ id: 'any', rate: 7.5 }),
      rule({ id: 'commercial', rate: 30, propertyType: 'COMMERCIAL' }),
    ]
    expect(selectTaxRule(candidates, { taxpayerType: 'COMPANY', thresholdBasisCents: 1_000_000_00 })?.id).toBe('any')
    expect(
      selectTaxRule(candidates, {
        taxpayerType: 'COMPANY',
        propertyType: 'COMMERCIAL',
        thresholdBasisCents: 1_000_000_00,
      })?.id,
    ).toBe('commercial')
  })

  it('prefers the most recently effective rule when specificity ties', () => {
    const candidates = [
      rule({ id: 'old', rate: 10, effectiveFrom: new Date(2020, 0, 1) }),
      rule({ id: 'new', rate: 7.5, effectiveFrom: new Date(2024, 0, 1) }),
    ]
    expect(selectTaxRule(candidates, { taxpayerType: 'ANY', thresholdBasisCents: 1_000_000_00 })?.id).toBe('new')
  })

  it('returns null rather than guessing when nothing applies', () => {
    expect(selectTaxRule([], { taxpayerType: 'COMPANY', thresholdBasisCents: 1_000_000_00 })).toBeNull()
  })
})
