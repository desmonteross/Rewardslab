// ===========================================================================
//  Rental record display.
//
//  The band is never shown on its own. Every rendering of it carries the five
//  factors that produced it, the measurement behind each one, and what would
//  move it — so nobody, tenant or manager, is looking at an unexplained number.
// ===========================================================================

import clsx from 'clsx'
import type { ReactNode } from 'react'
import { Card, DetailList, Money, StatusBadge } from '@/components/ui'
import { fmtDate } from '@/lib/dates'
import { BAND_BLURBS, type RentalBand, type RentalRecord } from '@/server/services/rental-record'

const BAND_STYLE: Record<RentalBand, { ring: string; dot: string; text: string }> = {
  EXCELLENT: { ring: 'border-positive/30 bg-positive/5', dot: 'bg-positive', text: 'text-positive' },
  GOOD: { ring: 'border-brand/30 bg-brand/5', dot: 'bg-brand', text: 'text-brand' },
  FAIR: { ring: 'border-warning/40 bg-warning/5', dot: 'bg-warning', text: 'text-warning' },
  BUILDING: { ring: 'border-line bg-canvas', dot: 'bg-faint', text: 'text-muted' },
  ATTENTION: { ring: 'border-negative/30 bg-negative/5', dot: 'bg-negative', text: 'text-negative' },
}

const OUTCOME_TONE: Record<string, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  ON_TIME: 'positive',
  WITHIN_GRACE: 'warning',
  LATE: 'negative',
  OUTSTANDING: 'negative',
  NOT_YET_DUE: 'neutral',
}

const OUTCOME_LABEL: Record<string, string> = {
  ON_TIME: 'On time',
  WITHIN_GRACE: 'Just late',
  LATE: 'Late',
  OUTSTANDING: 'Unpaid',
  NOT_YET_DUE: 'Not due yet',
}

/** The headline: band, score out of 100, and what the band means. */
export function RentalRecordSummary({
  record,
  action,
  compact,
}: {
  record: RentalRecord
  action?: ReactNode
  compact?: boolean
}) {
  const style = BAND_STYLE[record.band]

  return (
    <div className={clsx('rounded-xl border px-5 py-4', style.ring)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">Rental record</p>
          <div className="mt-1.5 flex items-center gap-2.5">
            <span className={clsx('h-2.5 w-2.5 shrink-0 rounded-full', style.dot)} aria-hidden />
            <p className={clsx('text-2xl font-semibold tracking-tight', style.text)}>{record.bandLabel}</p>
            {record.hasEnoughHistory && (
              <p className="text-sm tabular-nums text-muted">{record.score} / 100</p>
            )}
          </div>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-muted">
            {BAND_BLURBS[record.band]}
          </p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>

      {!compact && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line/70 pt-4 sm:grid-cols-4">
          <Stat label="Months assessed" value={String(record.invoicesAssessed)} />
          <Stat label="Paid on time" value={`${Math.round(record.onTimeRate * 100)}%`} />
          <Stat label="Unbroken run" value={`${record.longestOnTimeStreak} mo`} />
          <Stat
            label="Outstanding"
            value={record.currentArrearsCents > 0 ? <Money value={record.currentArrearsCents / 100} /> : 'None'}
          />
        </dl>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{value}</dd>
    </div>
  )
}

/** The five factors, each with its measurement, its points and its lever. */
export function RentalRecordFactors({ record }: { record: RentalRecord }) {
  return (
    <ul className="divide-y divide-line">
      {record.factors.map((factor) => {
        const pct = factor.weight > 0 ? (factor.earned / factor.weight) * 100 : 0
        // One colour for every factor. A red bar on "unbroken run" would read
        // as a problem when the tenant simply has not been renting for a year
        // yet — the number and the note below it carry the meaning, not the hue.
        return (
          <li key={factor.key} className="py-4 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm font-medium text-ink">{factor.label}</p>
              <p className="shrink-0 text-sm tabular-nums text-muted">
                {factor.earned} <span className="text-faint">/ {factor.weight}</span>
              </p>
            </div>
            <div
              className="mt-2 h-1.5 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line"
              role="img"
              aria-label={`${factor.label}: ${factor.earned} of ${factor.weight} points`}
            >
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <p className="mt-2 text-sm text-muted">{factor.detail}</p>
            <p className="mt-1 text-xs text-faint">{factor.improve}</p>
          </li>
        )
      })}
    </ul>
  )
}

/** The months the record is built from, so the figures can be checked. */
export function RentalRecordHistory({ record, limit }: { record: RentalRecord; limit?: number }) {
  const rows = limit ? record.history.slice(0, limit) : record.history
  if (rows.length === 0) {
    return <p className="text-sm text-muted">No rent has been billed yet, so there is nothing to show.</p>
  }

  return (
    <ul className="divide-y divide-line">
      {rows.map((row, index) => (
        <li key={`${row.periodLabel}-${index}`} className="flex items-center justify-between gap-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{row.periodLabel}</p>
            <p className="text-xs text-faint">
              Due {fmtDate(row.dueDate)}
              {row.daysLate > 0 && ` · ${row.daysLate} day${row.daysLate === 1 ? '' : 's'} late`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Money value={row.totalCents / 100} muted />
            <StatusBadge
              status={row.outcome}
              label={OUTCOME_LABEL[row.outcome]}
              tone={OUTCOME_TONE[row.outcome]}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** The disclaimer. Shown wherever the record is shown. */
export function RentalRecordDisclaimer() {
  return (
    <p className="text-xs leading-relaxed text-faint">
      This is not a credit bureau score and is not shared with any credit reference bureau. It is
      calculated inside this system from your own rent invoices and payments only — no employment,
      demographic or identity information is used — and the five factors above account for every point.
    </p>
  )
}

/** A full panel: summary, factors, disclaimer. */
export function RentalRecordPanel({ record, action }: { record: RentalRecord; action?: ReactNode }) {
  return (
    <div className="space-y-4">
      <RentalRecordSummary record={record} action={action} />
      <Card title="How it is calculated" description="Every point comes from one of these five factors.">
        <RentalRecordFactors record={record} />
        <div className="mt-5 border-t border-line pt-4">
          <RentalRecordDisclaimer />
        </div>
      </Card>
    </div>
  )
}

/** Compact staff-side rendering for a tenant detail page. */
export function RentalRecordInline({ record }: { record: RentalRecord }) {
  return (
    <div className="space-y-4">
      <RentalRecordSummary record={record} compact />
      <DetailList
        columns={2}
        items={record.factors.map((factor) => ({
          label: `${factor.label} (${factor.earned}/${factor.weight})`,
          value: factor.detail,
        }))}
      />
      <RentalRecordDisclaimer />
    </div>
  )
}
