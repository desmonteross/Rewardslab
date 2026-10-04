import { describe, expect, it } from 'vitest'
import { amount, cents, compactKES, formatKES, num, percent, percentOfCents, sumCents } from '@/lib/money'

describe('money — parsing', () => {
  it('parses database numeric strings exactly', () => {
    expect(cents('25000.00')).toBe(2_500_000)
    expect(cents('0.01')).toBe(1)
    expect(cents('1234.56')).toBe(123_456)
    expect(cents('-500.25')).toBe(-50_025)
  })

  it('treats missing values as zero rather than NaN', () => {
    expect(cents(null)).toBe(0)
    expect(cents(undefined)).toBe(0)
    expect(cents('')).toBe(0)
  })

  it('pads and truncates fractional digits the way the column does', () => {
    expect(cents('10.5')).toBe(1050)
    expect(cents('10')).toBe(1000)
    expect(cents('10.999')).toBe(1099)
  })

  it('round-trips through the database representation', () => {
    for (const value of ['0.00', '1.05', '25000.00', '999999.99', '-42.42']) {
      expect(amount(cents(value))).toBe(value)
    }
  })

  it('never introduces floating point drift when summing', () => {
    const values = Array.from({ length: 1000 }, () => '0.07')
    // 1000 × 0.07 is 70 exactly — a naive float sum gives 70.00000000000106.
    expect(amount(sumCents(values))).toBe('70.00')
  })
})

describe('money — percentages', () => {
  it('computes the platform commission from the spec', () => {
    // Tenant pays KES 25,000 → 1% commission is KES 250, landlord nets 24,750.
    const gross = cents('25000.00')
    const commission = percentOfCents(gross, 1)
    expect(amount(commission)).toBe('250.00')
    expect(amount(gross - commission)).toBe('24750.00')
  })

  it('honours fractional rates to three decimal places', () => {
    expect(amount(percentOfCents(cents('38000.00'), 1.25))).toBe('475.00')
    expect(amount(percentOfCents(cents('1000.00'), 0.125))).toBe('1.25')
  })

  it('rounds half up to the cent', () => {
    // 1% of 12.345 → 0.12345 → 0.12
    expect(percentOfCents(1234, 1)).toBe(12)
    // 1% of 12.35 → 0.1235 → 0.12 (half-up on the final cent)
    expect(percentOfCents(1250, 1)).toBe(13)
  })

  it('computes a collection rate', () => {
    expect(percent(8_750_000, 10_000_000)).toBe(87.5)
    expect(percent(0, 0)).toBe(0)
  })
})

describe('money — formatting', () => {
  it('formats KES the way the screens do', () => {
    expect(formatKES('25000.00')).toBe('KES 25,000')
    expect(formatKES('25000.00', { decimals: true })).toBe('KES 25,000.00')
    expect(formatKES('25000.00', { currency: false })).toBe('25,000')
  })

  it('compacts large figures for KPI cards', () => {
    expect(compactKES('12400000')).toBe('KES 12.4M')
    expect(compactKES('1600000')).toBe('KES 1.6M')
    expect(compactKES('750000')).toBe('KES 750K')
    expect(compactKES('2000000000')).toBe('KES 2B')
    expect(compactKES('950')).toBe('KES 950')
  })

  it('reports plain numbers for charts', () => {
    expect(num('1050000.50')).toBe(1_050_000.5)
  })
})
