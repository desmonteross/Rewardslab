// ===========================================================================
//  Tenant portal furniture
//
//  The portal talks to one person about one tenancy, so its pieces are
//  shaped differently from the staff screens: fewer figures, more plain
//  language, and the one action that matters given prominence over
//  everything else on the page.
// ===========================================================================

import Link from 'next/link'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ArrowRight, CalendarDays, Check, Smartphone } from 'lucide-react'
import { compactKES, formatKES } from '@/lib/money'
import { BrandMark } from '@/components/brand'

// ---------------------------------------------------------------------------
// Greeting band
// ---------------------------------------------------------------------------

function greetingFor(date: Date): string {
  const hour = date.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function PortalGreeting({
  name,
  place,
  unit,
  asOf,
  aside,
}: {
  name: string
  place: string | null
  unit: string | null
  asOf: Date
  aside?: ReactNode
}) {
  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl bg-panel px-5 py-7 text-white sm:px-8 sm:py-9">
      {/* The same optional photograph the staff dashboard uses. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[image:url('/brand/hero.jpg'),url('/brand/hero.svg')] bg-cover bg-center opacity-90"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-panel via-panel/88 to-panel/55"
      />
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-20 opacity-[0.07]">
        <BrandMark className="h-72 w-72 text-brand-lime" />
      </div>

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-3xl">
            {greetingFor(asOf)}, <span className="text-brand-lime">{name}</span>
          </h1>
          {(place || unit) && (
            <p className="mt-1.5 text-sm text-white/80">
              {place}
              {place && unit && <span className="px-2 text-white/40">•</span>}
              {unit}
            </p>
          )}
        </div>
        {aside}
      </div>
    </section>
  )
}

/** The date chip in the corner of the band. */
export function PortalDateChip({ asOf, place }: { asOf: Date; place?: string | null }) {
  return (
    <div className="shrink-0 rounded-xl bg-black/35 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
      {place && <p className="text-xs text-white/70">{place}</p>}
      <p className="text-sm font-medium tabular-nums">
        {asOf.toLocaleDateString('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status tiles
// ---------------------------------------------------------------------------

const TILE_TONE = {
  neutral: 'bg-canvas text-muted',
  positive: 'bg-positive/10 text-positive',
  warning: 'bg-warning/15 text-warning',
  negative: 'bg-negative/10 text-negative',
  brand: 'bg-brand-soft text-brand-ink',
} as const

export function PortalTile({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  badge,
  href,
}: {
  label: string
  value: string
  sub?: string
  icon?: ReactNode
  tone?: keyof typeof TILE_TONE
  badge?: ReactNode
  href?: string
}) {
  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className={clsx('grid h-9 w-9 shrink-0 place-items-center rounded-lg', TILE_TONE[tone])}>
            {icon}
          </span>
        )}
        <p className="min-w-0 flex-1 text-xs font-medium leading-tight text-muted">{label}</p>
        {href && <ArrowRight className="h-4 w-4 shrink-0 text-faint" aria-hidden />}
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-xl font-semibold tracking-tight text-ink">{value}</p>
        {badge}
      </div>
      {sub && <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-faint">{sub}</p>}
    </>
  )

  if (href) {
    return (
      <Link href={href} className="card block p-4 transition-colors hover:border-brand/40">
        {body}
      </Link>
    )
  }
  return <div className="card p-4">{body}</div>
}

// ---------------------------------------------------------------------------
// The rent panel
// ---------------------------------------------------------------------------

/**
 * What is owed, and the one button that settles it.
 *
 * Dark, large and alone at the top of the column, because for most tenants
 * most months this is the only reason they opened the portal. When nothing is
 * owed it says so just as plainly rather than disappearing — an absent panel
 * reads as a page that failed to load.
 */
export function RentDuePanel({
  balanceCents,
  dueDate,
  periodLabel,
  daysUntilDue,
  payReference,
  overdue,
}: {
  balanceCents: number
  dueDate: Date | null
  periodLabel: string | null
  daysUntilDue: number | null
  payReference: string | null
  overdue: boolean
}) {
  const owing = balanceCents > 0

  return (
    <section className="relative overflow-hidden rounded-2xl bg-panel p-6 text-white sm:p-7">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 opacity-[0.06]">
        <BrandMark className="h-64 w-64 text-brand-lime" />
      </div>

      <div className="relative">
        <p className="text-xs font-medium uppercase tracking-wide text-white/60">
          {owing ? 'Rent due' : 'Your account'}
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
          {owing ? formatKES(balanceCents / 100) : 'Nothing owing'}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/75">
          {dueDate ? (
            <>
              <CalendarDays className="h-4 w-4 shrink-0" aria-hidden />
              <span>
                {periodLabel ? `${periodLabel} · ` : ''}due{' '}
                {dueDate.toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {daysUntilDue !== null && (
                <span
                  className={clsx(
                    'rounded-full px-2.5 py-0.5 text-2xs font-medium',
                    overdue ? 'bg-negative text-white' : 'bg-white/15 text-white',
                  )}
                >
                  {overdue
                    ? `${Math.abs(daysUntilDue)} ${Math.abs(daysUntilDue) === 1 ? 'day' : 'days'} overdue`
                    : daysUntilDue === 0
                      ? 'Due today'
                      : `Due in ${daysUntilDue} ${daysUntilDue === 1 ? 'day' : 'days'}`}
                </span>
              )}
            </>
          ) : (
            <span>You are fully paid up. The next invoice will appear here when it is issued.</span>
          )}
        </div>

        {owing && (
          <>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/portal/pay"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
              >
                <Smartphone className="h-4 w-4" aria-hidden />
                Pay with M-Pesa
              </Link>
              <Link
                href="/portal/payments"
                className="inline-flex items-center gap-2 rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                View details
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
            {payReference && (
              <p className="mt-3.5 text-xs leading-relaxed text-white/55">
                Paying at the till instead? Use account number{' '}
                <span className="font-semibold tabular-nums text-white/85">{payReference}</span> so it
                matches itself to your tenancy.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// The score dial
// ---------------------------------------------------------------------------

/**
 * The rental record as a ring.
 *
 * Deliberately marked 0–100 rather than dressed up as a credit score: it is
 * RentRewards' own measure, built from this tenancy's invoices, and a number
 * in the 300–850 shape would invite a tenant to read it as something a bureau
 * issued. The factors beside it are the whole calculation.
 */
export function ScoreDial({
  score,
  bandLabel,
  tone = 'brand',
  size = 168,
}: {
  score: number
  bandLabel: string
  tone?: 'brand' | 'positive' | 'warning' | 'negative'
  size?: number
}) {
  const stroke = 12
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(100, score))
  const filled = (clamped / 100) * circumference

  const colour = {
    brand: 'rgb(var(--brand))',
    positive: 'rgb(var(--positive))',
    warning: 'rgb(var(--warning))',
    negative: 'rgb(var(--negative))',
  }[tone]

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`Rental record ${clamped} out of 100 — ${bandLabel}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgb(var(--line))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colour}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-semibold tabular-nums text-ink">{clamped}</p>
          <p className="text-2xs text-faint">out of 100</p>
          <p className="mt-0.5 text-xs font-medium text-muted">{bandLabel}</p>
        </div>
      </div>
    </div>
  )
}

/** One line of the checklist beside the dial. */
export function ScoreFactor({
  label,
  detail,
  met,
}: {
  label: string
  detail: string
  met: boolean
}) {
  return (
    <li className="flex items-start gap-2.5">
      <span
        className={clsx(
          'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full',
          met ? 'bg-positive text-white' : 'bg-canvas text-faint',
        )}
        aria-hidden
      >
        <Check className="h-2.5 w-2.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm leading-tight text-ink">{label}</span>
        <span className="block text-2xs leading-snug text-faint">{detail}</span>
      </span>
    </li>
  )
}

/** A points figure, used on the home page and the rewards page alike. */
export function PointsBadge({ points, caption }: { points: number; caption: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
        <span className="text-sm font-semibold tabular-nums">{compactPoints(points)}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-semibold tabular-nums text-ink">
          {points.toLocaleString()}
        </span>
        <span className="block text-xs text-faint">{caption}</span>
      </span>
    </div>
  )
}

function compactPoints(points: number): string {
  if (points >= 1_000_000) return `${Math.round(points / 100_000) / 10}M`
  if (points >= 1_000) return `${Math.round(points / 100) / 10}K`
  return String(points)
}

export { compactKES }
