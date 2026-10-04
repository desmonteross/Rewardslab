// ===========================================================================
//  Money
//
//  Every monetary value in this system is KES with two decimal places. The
//  database stores numeric(16,2) and node-postgres hands it back as a string,
//  which is exactly what we want: the value never passes through a float on
//  the way in or out.
//
//  All arithmetic is done in INTEGER CENTS. Convert at the boundary with
//  `cents()`, compute, then convert back with `amount()` before writing.
//  Nothing in this codebase should ever add two money strings with `+`.
// ===========================================================================

export type Amount = string | number | null | undefined

const CENTS_PER_KES = 100

/** Parse any money representation into integer cents. */
export function cents(value: Amount): number {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0
    return Math.round(value * CENTS_PER_KES)
  }
  const trimmed = value.trim()
  if (!trimmed) return 0
  const negative = trimmed.startsWith('-')
  const body = negative ? trimmed.slice(1) : trimmed
  const [whole = '0', fraction = ''] = body.split('.')
  const wholeDigits = whole.replace(/[^0-9]/g, '') || '0'
  const fractionDigits = (fraction.replace(/[^0-9]/g, '') + '00').slice(0, 2)
  const total = Number(wholeDigits) * CENTS_PER_KES + Number(fractionDigits)
  if (!Number.isFinite(total)) return 0
  return negative ? -total : total
}

/** Convert integer cents into the `numeric(16,2)` string the database expects. */
export function amount(valueInCents: number): string {
  const rounded = Math.round(valueInCents)
  const negative = rounded < 0
  const abs = Math.abs(rounded)
  const whole = Math.floor(abs / CENTS_PER_KES)
  const fraction = String(abs % CENTS_PER_KES).padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${fraction}`
}

/** Money as a plain KES number — for charts and JSON responses only. */
export function num(value: Amount): number {
  return cents(value) / CENTS_PER_KES
}

export function sumCents(values: Amount[]): number {
  let total = 0
  for (const value of values) total += cents(value)
  return total
}

/** Sum a collection by a money-valued key, in cents. */
export function sumBy<T>(rows: T[], pick: (row: T) => Amount): number {
  let total = 0
  for (const row of rows) total += cents(pick(row))
  return total
}

/**
 * Parse a rate. Rates are NOT money: numeric(6,3) carries three decimal
 * places, so a rate must never go through `cents()`, which would quantise
 * 0.125% to 0.13%.
 */
export function rateValue(value: Amount): number {
  if (value === null || value === undefined || value === '') return 0
  const parsed = typeof value === 'number' ? value : Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * A percentage of an amount, in cents, rounded half-up to the nearest cent.
 * `percentOfCents(2_500_000, 1)` → 25_000 (KES 250.00 of KES 25,000.00).
 */
export function percentOfCents(valueInCents: number, percent: Amount): number {
  // Three decimal places of rate precision, matching numeric(6,3).
  const rateThousandths = Math.round(rateValue(percent) * 1000)
  const product = valueInCents * rateThousandths
  return Math.round(product / 100_000)
}

/** Clamp to a non-negative value — balances never go below zero. */
export function floorZero(valueInCents: number): number {
  return valueInCents < 0 ? 0 : valueInCents
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const KES_FORMATTER = new Intl.NumberFormat('en-KE', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const KES_FORMATTER_2DP = new Intl.NumberFormat('en-KE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export interface FormatOptions {
  /** Show cents. Defaults to false — Kenyan rent figures are whole shillings. */
  decimals?: boolean
  /** Prefix with the currency code. Defaults to true. */
  currency?: boolean
}

/** `formatKES('25000.00')` → "KES 25,000" */
export function formatKES(value: Amount, options: FormatOptions = {}): string {
  const { decimals = false, currency = true } = options
  const formatter = decimals ? KES_FORMATTER_2DP : KES_FORMATTER
  const formatted = formatter.format(num(value))
  return currency ? `KES ${formatted}` : formatted
}

/**
 * Compact form for KPI cards and chart axes, matching the spec's examples:
 * `compactKES('12400000')` → "KES 12.4M".
 */
export function compactKES(value: Amount, options: { currency?: boolean } = {}): string {
  const { currency = true } = options
  const kes = num(value)
  const abs = Math.abs(kes)
  const sign = kes < 0 ? '-' : ''
  let body: string
  if (abs >= 1_000_000_000) body = `${trim(abs / 1_000_000_000)}B`
  else if (abs >= 1_000_000) body = `${trim(abs / 1_000_000)}M`
  else if (abs >= 1_000) body = `${trim(abs / 1_000)}K`
  else body = KES_FORMATTER.format(abs)
  return `${currency ? 'KES ' : ''}${sign}${body}`
}

function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** `percent(8_750_000, 10_000_000)` → 87.5 */
export function percent(part: number, whole: number, decimals = 1): number {
  if (!whole) return 0
  const value = (part / whole) * 100
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function formatPercent(value: number, decimals = 1): string {
  return `${value.toFixed(decimals)}%`
}
