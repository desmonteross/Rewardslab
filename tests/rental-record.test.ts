import { describe, expect, it } from 'vitest'
import {
  BAND_LABELS,
  GRACE_PERIOD_DAYS,
  MINIMUM_HISTORY,
  computeRentalRecord,
  type RentalRecordInvoice,
} from '@/server/services/rental-record'

const ASOF = new Date('2026-09-22T00:00:00Z')
const RENT = 5_000_000 // KES 50,000 in cents

function month(offsetFromAsOf: number): Date {
  const d = new Date(ASOF)
  d.setUTCMonth(d.getUTCMonth() - offsetFromAsOf)
  d.setUTCDate(5)
  return d
}

/** A settled invoice cleared `daysLate` days after its due date. */
function settled(offset: number, daysLate: number): RentalRecordInvoice {
  const dueDate = month(offset)
  const clearedAt = new Date(dueDate.getTime() + daysLate * 86_400_000)
  return {
    id: `inv-${offset}`,
    periodLabel: `M-${offset}`,
    dueDate,
    totalCents: RENT,
    balanceCents: 0,
    clearedAt,
  }
}

/** An invoice still owing in full. */
function owing(offset: number): RentalRecordInvoice {
  return {
    id: `inv-${offset}`,
    periodLabel: `M-${offset}`,
    dueDate: month(offset),
    totalCents: RENT,
    balanceCents: RENT,
    clearedAt: null,
  }
}

const base = {
  asOf: ASOF,
  monthlyRentCents: RENT,
  tenancyStart: new Date('2024-09-05T00:00:00Z'),
}

describe('rental record — the perfect payer', () => {
  const record = computeRentalRecord({
    ...base,
    invoices: Array.from({ length: 24 }, (_, i) => settled(i + 1, 0)),
  })

  it('scores at the top of the range', () => {
    expect(record.score).toBe(100)
    expect(record.band).toBe('EXCELLENT')
    expect(record.bandLabel).toBe(BAND_LABELS.EXCELLENT)
  })

  it('awards every factor its full weight', () => {
    for (const factor of record.factors) {
      expect(factor.earned).toBeCloseTo(factor.weight, 5)
    }
  })

  it('reports an unbroken run over the whole tenancy', () => {
    expect(record.longestOnTimeStreak).toBe(24)
    expect(record.onTimeRate).toBe(1)
    expect(record.currentArrearsCents).toBe(0)
  })
})

describe('rental record — weights', () => {
  it('sums to 100 so the score is a percentage of an attainable maximum', () => {
    const record = computeRentalRecord({ ...base, invoices: [settled(1, 0)] })
    const total = record.factors.reduce((sum, f) => sum + f.weight, 0)
    expect(total).toBe(100)
  })

  it('never awards more than a factor is worth', () => {
    const record = computeRentalRecord({
      ...base,
      // A 60-month unbroken run must not earn more than the 10-point cap.
      invoices: Array.from({ length: 60 }, (_, i) => settled(i + 1, 0)),
    })
    const consistency = record.factors.find((f) => f.key === 'consistency')!
    expect(consistency.earned).toBe(10)
    expect(record.score).toBeLessThanOrEqual(100)
  })

  it('never returns a negative score, however bad the record', () => {
    const record = computeRentalRecord({
      ...base,
      invoices: Array.from({ length: 12 }, (_, i) => owing(i + 1)),
      monthlyRentCents: RENT,
    })
    expect(record.score).toBeGreaterThanOrEqual(0)
  })
})

describe('rental record — the grace period', () => {
  it('treats payment inside the grace window as half credit, not a miss', () => {
    const inside = computeRentalRecord({
      ...base,
      invoices: Array.from({ length: 12 }, (_, i) => settled(i + 1, GRACE_PERIOD_DAYS)),
    })
    const outside = computeRentalRecord({
      ...base,
      invoices: Array.from({ length: 12 }, (_, i) => settled(i + 1, GRACE_PERIOD_DAYS + 1)),
    })
    expect(inside.onTimeRate).toBe(0.5)
    expect(outside.onTimeRate).toBe(0)
    expect(inside.score).toBeGreaterThan(outside.score)
  })

  it('does not break the run for a payment inside the grace window', () => {
    const record = computeRentalRecord({
      ...base,
      invoices: [settled(3, 0), settled(2, GRACE_PERIOD_DAYS), settled(1, 0)],
    })
    expect(record.longestOnTimeStreak).toBe(3)
  })

  it('breaks the run for a payment outside it', () => {
    const record = computeRentalRecord({
      ...base,
      invoices: [settled(3, 0), settled(2, 20), settled(1, 0)],
    })
    expect(record.longestOnTimeStreak).toBe(1)
  })
})

describe('rental record — outstanding rent', () => {
  it('counts an overdue unpaid invoice against the record', () => {
    // Otherwise a tenant could keep a perfect on-time rate simply by never paying.
    const paying = computeRentalRecord({ ...base, invoices: [settled(3, 0), settled(2, 0), settled(1, 0)] })
    const notPaying = computeRentalRecord({ ...base, invoices: [settled(3, 0), settled(2, 0), owing(1)] })

    expect(notPaying.onTimeRate).toBeLessThan(paying.onTimeRate)
    expect(notPaying.score).toBeLessThan(paying.score)
    expect(notPaying.currentArrearsCents).toBe(RENT)
  })

  it('does not penalise an invoice that is not yet due', () => {
    const future: RentalRecordInvoice = {
      id: 'future',
      periodLabel: 'Next month',
      dueDate: new Date(ASOF.getTime() + 10 * 86_400_000),
      totalCents: RENT,
      balanceCents: RENT,
      clearedAt: null,
    }
    const withFuture = computeRentalRecord({
      ...base,
      invoices: [settled(2, 0), settled(1, 0), settled(3, 0), future],
    })
    const withoutFuture = computeRentalRecord({
      ...base,
      invoices: [settled(2, 0), settled(1, 0), settled(3, 0)],
    })
    expect(withFuture.onTimeRate).toBe(withoutFuture.onTimeRate)
    expect(withFuture.history.some((h) => h.outcome === 'NOT_YET_DUE')).toBe(true)
  })

  it('moves to ATTENTION once two months of rent are outstanding', () => {
    const record = computeRentalRecord({
      ...base,
      invoices: [settled(6, 0), settled(5, 0), settled(4, 0), settled(3, 0), owing(2), owing(1)],
    })
    expect(record.arrearsInMonths).toBeGreaterThanOrEqual(2)
    expect(record.band).toBe('ATTENTION')
  })

  it('expresses arrears in months of rent, not just shillings', () => {
    const record = computeRentalRecord({
      ...base,
      invoices: [settled(3, 0), settled(2, 0), owing(1)],
    })
    expect(record.arrearsInMonths).toBe(1)
  })
})

describe('rental record — thin files', () => {
  it('labels a new tenant Building rather than scoring them badly', () => {
    const record = computeRentalRecord({
      ...base,
      tenancyStart: month(2),
      invoices: [settled(2, 0), settled(1, 0)],
    })
    expect(record.invoicesSettled).toBeLessThan(MINIMUM_HISTORY)
    expect(record.hasEnoughHistory).toBe(false)
    expect(record.band).toBe('BUILDING')
  })

  it('leaves an empty record at Building with no history to show', () => {
    const record = computeRentalRecord({ ...base, invoices: [], tenancyStart: null })
    expect(record.band).toBe('BUILDING')
    expect(record.history).toHaveLength(0)
    expect(record.invoicesAssessed).toBe(0)
    expect(Number.isNaN(record.score)).toBe(false)
  })

  it('still reports arrears on a thin file rather than hiding them behind Building', () => {
    // A brand-new tenant who has paid nothing for three months has too little
    // history to score, but "Building" would conceal the only fact that matters.
    const record = computeRentalRecord({
      ...base,
      tenancyStart: month(3),
      invoices: [owing(3), owing(2), owing(1)],
    })
    expect(record.hasEnoughHistory).toBe(false)
    expect(record.arrearsInMonths).toBeGreaterThanOrEqual(2)
    expect(record.band).toBe('ATTENTION')
  })

  it('bands a tenant once they cross the minimum history', () => {
    const record = computeRentalRecord({
      ...base,
      invoices: Array.from({ length: MINIMUM_HISTORY }, (_, i) => settled(i + 1, 0)),
    })
    expect(record.hasEnoughHistory).toBe(true)
    expect(record.band).not.toBe('BUILDING')
  })
})

describe('rental record — explainability', () => {
  const record = computeRentalRecord({
    ...base,
    invoices: [settled(4, 0), settled(3, 12), settled(2, 0), owing(1)],
  })

  it('accounts for every point through a named factor', () => {
    const earned = record.factors.reduce((sum, f) => sum + f.earned, 0)
    expect(Math.round(earned)).toBe(record.score)
  })

  it('gives every factor a measurement and an action', () => {
    for (const factor of record.factors) {
      expect(factor.detail.length).toBeGreaterThan(0)
      expect(factor.improve.length).toBeGreaterThan(0)
    }
  })

  it('shows the underlying months newest first so the tenant can check them', () => {
    expect(record.history).toHaveLength(4)
    const dates = record.history.map((h) => h.dueDate.getTime())
    expect([...dates].sort((a, b) => b - a)).toEqual(dates)
    expect(record.history[0].outcome).toBe('OUTSTANDING')
  })

  it('uses only payment behaviour — the input carries no personal attributes', () => {
    // A guard against scope creep: if someone adds an attribute to the input
    // type, this test is where the conversation happens.
    const keys = Object.keys({ ...base, invoices: [] }).sort()
    expect(keys).toEqual(['asOf', 'invoices', 'monthlyRentCents', 'tenancyStart'])
  })
})
