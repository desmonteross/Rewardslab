import { describe, expect, it } from 'vitest'
import { totalsFor, type SettlementDraftLine } from '@/server/services/settlements'
import { amount } from '@/lib/money'

const rent = (grossKes: number, commissionKes: number): SettlementDraftLine => ({
  type: 'RENT',
  description: 'rent',
  grossCents: grossKes * 100,
  commissionCents: commissionKes * 100,
  netCents: (grossKes - commissionKes) * 100,
})

describe('settlement totals', () => {
  it('matches the worked example in the specification', () => {
    // Wanjiku Holdings Ltd, 1–7 September: gross 750,000, fees 7,500 → 742,500.
    const totals = totalsFor([rent(750_000, 7_500)])
    expect(amount(totals.grossCents)).toBe('750000.00')
    expect(amount(totals.commissionCents)).toBe('7500.00')
    expect(amount(totals.netCents)).toBe('742500.00')
  })

  it('deducts management fees and approved expenses', () => {
    const totals = totalsFor([
      rent(1_000_000, 10_000),
      { type: 'MANAGEMENT_FEE', description: 'fee', grossCents: 50_000 * 100, commissionCents: 0, netCents: -50_000 * 100 },
      { type: 'EXPENSE', description: 'security', grossCents: 40_000 * 100, commissionCents: 0, netCents: -40_000 * 100 },
    ])
    expect(amount(totals.expenseCents)).toBe('40000.00')
    expect(amount(totals.managementFeeCents)).toBe('50000.00')
    expect(amount(totals.netCents)).toBe('900000.00')
  })

  it('applies adjustments in both directions', () => {
    const credit = totalsFor([rent(100_000, 1_000), { type: 'ADJUSTMENT', description: 'refund', grossCents: 0, commissionCents: 0, netCents: 5_000 * 100 }])
    expect(amount(credit.netCents)).toBe('104000.00')

    const debit = totalsFor([rent(100_000, 1_000), { type: 'ADJUSTMENT', description: 'clawback', grossCents: 0, commissionCents: 0, netCents: -5_000 * 100 }])
    expect(amount(debit.netCents)).toBe('94000.00')
  })

  it('returns zeroes for an empty batch', () => {
    expect(totalsFor([])).toMatchObject({ grossCents: 0, netCents: 0 })
  })

  it('aggregates many receipts without drift', () => {
    const lines = Array.from({ length: 250 }, () => rent(33.33, 0.33))
    const totals = totalsFor(lines)
    expect(amount(totals.grossCents)).toBe('8332.50')
    expect(totals.grossCents - totals.commissionCents).toBe(totals.netCents)
  })
})
