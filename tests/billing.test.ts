import { describe, expect, it } from 'vitest'
import { planInvoiceItems } from '@/server/services/billing'
import { periodFrom, billingPeriods, recentPeriods } from '@/lib/dates'
import { amount } from '@/lib/money'

const september = periodFrom(2026, 9) // 30 days

const base = {
  period: september,
  monthlyRentCents: 25_000 * 100,
  serviceChargeCents: 2_500 * 100,
  leaseStart: new Date(2025, 0, 1),
  leaseEnd: new Date(2027, 0, 1),
  extraCharges: [] as { label: string; type: 'WATER'; amountCents: number }[],
  arrearsCents: 0,
  penaltyType: 'PERCENT' as const,
  penaltyValueCents: 5 * 100,
  applyPenalties: true,
  prorateFirstMonth: true,
}

describe('rent billing engine', () => {
  it('bills rent and service charge for a full month', () => {
    const plan = planInvoiceItems(base)
    expect(plan.items.map((item) => item.type)).toEqual(['RENT', 'SERVICE_CHARGE'])
    expect(amount(plan.subtotalCents)).toBe('27500.00')
    expect(amount(plan.totalCents)).toBe('27500.00')
    expect(plan.penaltyCents).toBe(0)
  })

  it('adds recurring lease charges', () => {
    const plan = planInvoiceItems({
      ...base,
      extraCharges: [{ label: 'Water', type: 'WATER', amountCents: 1_500 * 100 }],
    })
    expect(plan.items).toHaveLength(3)
    expect(amount(plan.totalCents)).toBe('29000.00')
    expect(plan.items[2].description).toBe('September 2026 Water')
  })

  it('prorates a lease that starts mid-month', () => {
    // Moving in on 16 September leaves 15 of 30 days.
    const plan = planInvoiceItems({ ...base, leaseStart: new Date(2026, 8, 16) })
    const rent = plan.items.find((item) => item.type === 'RENT')!
    expect(amount(rent.amountCents)).toBe('12500.00')
    expect(rent.description).toContain('prorated, 15/30 days')
  })

  it('prorates a lease that ends mid-month', () => {
    const plan = planInvoiceItems({ ...base, leaseEnd: new Date(2026, 8, 10) })
    const rent = plan.items.find((item) => item.type === 'RENT')!
    expect(amount(rent.amountCents)).toBe('8333.33')
  })

  it('does not prorate when proration is switched off', () => {
    const plan = planInvoiceItems({
      ...base,
      leaseStart: new Date(2026, 8, 16),
      prorateFirstMonth: false,
    })
    expect(amount(plan.items[0].amountCents)).toBe('25000.00')
  })

  it('charges a percentage penalty on arrears', () => {
    const plan = planInvoiceItems({ ...base, arrearsCents: 25_000 * 100 })
    expect(amount(plan.penaltyCents)).toBe('1250.00')
    expect(amount(plan.totalCents)).toBe('28750.00')
    // The penalty is excluded from the subtotal so it can be reported separately.
    expect(amount(plan.subtotalCents)).toBe('27500.00')
  })

  it('charges a flat penalty when the lease says so', () => {
    const plan = planInvoiceItems({
      ...base,
      arrearsCents: 25_000 * 100,
      penaltyType: 'FIXED',
      penaltyValueCents: 2_000 * 100,
    })
    expect(amount(plan.penaltyCents)).toBe('2000.00')
  })

  it('charges no penalty without arrears, or when penalties are disabled', () => {
    expect(planInvoiceItems({ ...base, arrearsCents: 0 }).penaltyCents).toBe(0)
    expect(
      planInvoiceItems({ ...base, arrearsCents: 50_000 * 100, applyPenalties: false }).penaltyCents,
    ).toBe(0)
    expect(
      planInvoiceItems({ ...base, arrearsCents: 50_000 * 100, penaltyType: 'NONE' }).penaltyCents,
    ).toBe(0)
  })

  it('omits zero-value lines', () => {
    const plan = planInvoiceItems({ ...base, serviceChargeCents: 0 })
    expect(plan.items.map((item) => item.type)).toEqual(['RENT'])
  })
})

// ---------------------------------------------------------------------------
// Which periods a manager may bill
//
// Rent for October is invoiced in late September. A screen offering only past
// months forces every invoice to be raised after its own due date, which
// means every payment against it is late before the tenant sees it.
// ---------------------------------------------------------------------------

describe('billing periods', () => {
  const anchor = new Date(2026, 8, 24) // 24 September 2026

  it('offers the coming month as well as recent ones', () => {
    const labels = billingPeriods(anchor).map((period) => `${period.year}-${period.month}`)
    expect(labels).toContain('2026-9')
    expect(labels).toContain('2026-10')
    expect(labels).toContain('2026-11')
  })

  it('runs oldest first, so the list reads forward', () => {
    const periods = billingPeriods(anchor)
    for (let i = 1; i < periods.length; i += 1) {
      expect(periods[i].start.getTime()).toBeGreaterThan(periods[i - 1].start.getTime())
    }
  })

  it('crosses a year boundary without losing a month', () => {
    const labels = billingPeriods(new Date(2026, 11, 10)).map((p) => `${p.year}-${p.month}`)
    expect(labels).toContain('2026-12')
    expect(labels).toContain('2027-1')
    expect(labels).toContain('2027-2')
  })

  it('keeps reporting screens looking backwards only', () => {
    const labels = recentPeriods(anchor, 6).map((p) => `${p.year}-${p.month}`)
    expect(labels).toContain('2026-9')
    expect(labels).not.toContain('2026-10')
  })
})
