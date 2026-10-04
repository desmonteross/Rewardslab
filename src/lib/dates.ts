import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
  subMonths,
} from 'date-fns'

export interface Period {
  year: number
  month: number // 1-12
  label: string // "September 2026"
  start: Date
  end: Date
}

export function periodOf(date: Date): Period {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  return {
    year,
    month,
    label: format(date, 'MMMM yyyy'),
    start: startOfMonth(date),
    end: endOfMonth(date),
  }
}

export function periodFrom(year: number, month: number): Period {
  const date = new Date(year, month - 1, 1)
  return periodOf(date)
}

/** The `count` most recent periods, oldest first, ending with `anchor`'s month. */
export function recentPeriods(anchor: Date, count: number): Period[] {
  const periods: Period[] = []
  for (let i = count - 1; i >= 0; i--) periods.push(periodOf(subMonths(anchor, i)))
  return periods
}

/**
 * Periods a manager may raise charges for, oldest first.
 *
 * Reporting screens only ever look backwards, but billing does not: rent for
 * October is normally invoiced in late September, and a screen that offers
 * only past months forces every invoice to be raised after its own due date.
 */
export function billingPeriods(anchor: Date, back = 3, forward = 2): Period[] {
  const periods: Period[] = []
  for (let i = back; i >= 1; i--) periods.push(periodOf(subMonths(anchor, i)))
  periods.push(periodOf(anchor))
  for (let i = 1; i <= forward; i++) periods.push(periodOf(addMonths(anchor, i)))
  return periods
}

/**
 * The due date for a rent period, honouring the lease's due day. A lease due
 * on the 31st in a 30-day month falls due on the last day of that month.
 */
export function dueDateFor(period: Period, dueDayOfMonth: number): Date {
  const lastDay = endOfMonth(period.start).getDate()
  const day = Math.min(Math.max(dueDayOfMonth, 1), lastDay)
  return startOfDay(new Date(period.year, period.month - 1, day))
}

export function isOverdue(dueDate: Date, gracePeriodDays: number, asOf: Date = new Date()): boolean {
  return isAfter(startOfDay(asOf), addDays(startOfDay(dueDate), gracePeriodDays))
}

export function daysOverdue(dueDate: Date, asOf: Date = new Date()): number {
  const diff = differenceInCalendarDays(startOfDay(asOf), startOfDay(dueDate))
  return diff > 0 ? diff : 0
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export const fmtDate = (date: Date | string | null | undefined) =>
  date ? format(new Date(date), 'dd MMM yyyy') : '—'

export const fmtDateTime = (date: Date | string | null | undefined) =>
  date ? format(new Date(date), 'dd MMM yyyy HH:mm') : '—'

export const fmtDayMonth = (date: Date | string | null | undefined) =>
  date ? format(new Date(date), 'dd MMM') : '—'

export const fmtMonth = (date: Date | string | null | undefined) =>
  date ? format(new Date(date), 'MMM yyyy') : '—'

export { addDays, addMonths, subMonths, startOfMonth, endOfMonth, startOfDay, isBefore, isAfter, format }
