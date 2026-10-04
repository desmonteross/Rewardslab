// ===========================================================================
//  Dashboard furniture
//
//  Pieces that only the dashboard uses. They live here rather than in ui.tsx
//  so that the shared component file stays a vocabulary the whole app speaks,
//  rather than a drawer of one-offs.
// ===========================================================================

import Link from 'next/link'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from 'lucide-react'
import { compactKES, formatKES, type Amount } from '@/lib/money'
import { formatMovement, movementTone, type Movement } from '@/lib/trend'
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

/**
 * The band across the top of the dashboard.
 *
 * The greeting is computed from the viewer's own clock on the server, which is
 * the same machine for everyone — so it is rendered once per request rather
 * than guessed, and the date beside it says plainly which day the figures are.
 */
export function Greeting({
  name,
  organization,
  asOf,
  aside,
}: {
  name: string
  organization: string
  asOf: Date
  aside?: ReactNode
}) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-panel px-5 pb-16 pt-7 text-white sm:px-8 sm:pt-9 lg:pb-20">
      {/*
        The photograph.

        Two layers, and CSS paints the first one that resolves on top: a
        photograph at public/brand/hero.jpg if there is one, and otherwise the
        drawn skyline at hero.svg, which ships. So dropping a photograph in is
        still the only change needed to use one, and until then the band is a
        picture rather than a flat colour. It is decoration, so it is hidden
        from assistive technology and carries no meaning the text does not.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[image:url('/brand/hero.jpg'),url('/brand/hero.svg')] bg-cover bg-center opacity-90"
      />
      {/*
        The scrim. Dark at the left where the greeting sits, clearing to the
        right so the photograph is still a photograph — without it, white text
        on an unknown image is a contrast accident waiting to happen.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-panel via-panel/88 to-panel/55"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-panel to-transparent"
      />
      {/* Identity, not decoration: the mark is the only brand colour here. */}
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-20 opacity-[0.07]">
        <BrandMark className="h-72 w-72 text-brand-lime" />
      </div>

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight sm:text-3xl">
            {greetingFor(asOf)}, {name}
          </h1>
          <p className="mt-1.5 text-sm text-white/75">
            Here’s what’s happening across {organization} today.
          </p>
        </div>
        {aside}
      </div>
    </section>
  )
}

/** The date chip that sits in the greeting band. */
export function AsOfChip({ asOf, place }: { asOf: Date; place?: string | null }) {
  return (
    <div className="shrink-0 rounded-xl bg-black/35 px-4 py-3 ring-1 ring-white/10 backdrop-blur-sm">
      {place && <p className="text-xs text-white/70">{place}</p>}
      <p className="text-sm font-medium tabular-nums">
        {asOf.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Quick actions
// ---------------------------------------------------------------------------

export interface QuickAction {
  label: string
  description: string
  href: string
  icon: ReactNode
  tone?: 'brand' | 'positive' | 'warning' | 'negative'
}

const ACTION_TONE = {
  brand: 'bg-brand-soft text-brand-ink',
  positive: 'bg-positive/10 text-positive',
  warning: 'bg-warning/15 text-warning',
  negative: 'bg-negative/10 text-negative',
} as const

/**
 * The four things a manager most often arrives wanting to do.
 *
 * Filtered by permission before it reaches here — an action a role cannot
 * complete is not shown and then refused.
 */
export function QuickActions({ actions }: { actions: QuickAction[] }) {
  if (actions.length === 0) return null
  return (
    /*
      The row rides up over the bottom of the greeting band, which is why the
      band carries extra bottom padding. The overlap is what ties the two into
      one header rather than two stacked boxes.
    */
    <div className="relative z-10 -mt-12 mb-4 grid grid-cols-2 gap-2.5 px-2 sm:gap-3 sm:px-4 lg:-mt-14 xl:grid-cols-4">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="card group flex items-center gap-2.5 p-3 transition-colors hover:border-brand/40 sm:gap-3 sm:p-4"
        >
          <span
            className={clsx(
              'grid h-9 w-9 shrink-0 place-items-center rounded-xl sm:h-10 sm:w-10',
              ACTION_TONE[action.tone ?? 'brand'],
            )}
          >
            {action.icon}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold leading-tight text-ink">{action.label}</span>
            <span className="hidden truncate text-xs text-muted sm:block">{action.description}</span>
          </span>
          <ArrowRight className="hidden h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-brand sm:block" />
        </Link>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Headline tiles
// ---------------------------------------------------------------------------

const DELTA_TONE = {
  positive: 'bg-positive/10 text-positive',
  negative: 'bg-negative/10 text-negative',
  neutral: 'bg-canvas text-faint',
} as const

/**
 * The small change badge beside a headline figure.
 *
 * Direction and goodness are separate: rising arrears is an increase and bad
 * news, so the caller says which direction is favourable and the colour
 * follows that rather than the sign.
 */
export function DeltaBadge({
  value,
  favourable = 'up',
  label,
}: {
  value: Movement
  favourable?: 'up' | 'down'
  label?: string
}) {
  const tone = movementTone(value.direction, favourable)
  const Icon = value.direction === 'up' ? ArrowUpRight : value.direction === 'down' ? ArrowDownRight : Minus
  const text = formatMovement(value)

  return (
    <span
      className={clsx(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-medium tabular-nums',
        DELTA_TONE[tone],
      )}
      title={label}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {text}
    </span>
  )
}

/**
 * A headline figure with an optional movement badge and a progress bar.
 *
 * The bar is the share of a whole — collected against billed, occupied against
 * held — so the tile answers "how much" and "how far along" without needing a
 * second chart beside it.
 */
export function StatTile({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
  delta,
  favourable,
  progress,
  href,
}: {
  label: string
  value: string
  sub?: string
  icon?: ReactNode
  tone?: 'neutral' | 'positive' | 'warning' | 'negative' | 'brand'
  delta?: Movement
  favourable?: 'up' | 'down'
  progress?: { value: number; max: number; tone?: 'positive' | 'warning' | 'negative' | 'brand' }
  href?: string
}) {
  const iconTone = {
    neutral: 'bg-canvas text-muted',
    positive: 'bg-positive/10 text-positive',
    warning: 'bg-warning/15 text-warning',
    negative: 'bg-negative/10 text-negative',
    brand: 'bg-brand-soft text-brand-ink',
  }[tone]

  const barTone = {
    positive: 'bg-positive',
    warning: 'bg-warning',
    negative: 'bg-negative',
    brand: 'bg-brand',
  }[progress?.tone ?? 'brand']

  const pct =
    progress && progress.max > 0
      ? Math.min(100, Math.max(0, (progress.value / progress.max) * 100))
      : 0

  const body = (
    <>
      <div className="flex items-center gap-2.5">
        {icon && <span className={clsx('grid h-8 w-8 shrink-0 place-items-center rounded-lg', iconTone)}>{icon}</span>}
        <p className="min-w-0 flex-1 text-xs font-medium leading-tight text-muted">{label}</p>
      </div>
      {/*
        The figure is never truncated: a headline that reads "KES 2…" has lost
        the only thing it was there to say. It wraps onto its own line before
        it will shorten, and the badge follows it down.
      */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="whitespace-nowrap text-xl font-semibold tracking-tight text-ink">{value}</p>
        {delta && <DeltaBadge value={delta} favourable={favourable} label="Against last month" />}
      </div>
      {progress && (
        <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-canvas">
          <div className={clsx('h-full rounded-full', barTone)} style={{ width: `${pct}%` }} />
        </div>
      )}
      {sub && <p className="mt-2 line-clamp-2 text-xs leading-snug text-faint">{sub}</p>}
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

/**
 * The time range a chart covers, as links rather than a dropdown.
 *
 * The range lives in the URL so the view is shareable and survives a refresh,
 * and the server does the widening — a twelve-month chart is twelve months of
 * aggregates, not twelve months of rows sent to the browser to filter.
 */
export function RangeTabs({
  options,
  current,
  hrefFor,
}: {
  options: { value: number; label: string }[]
  current: number
  hrefFor: (value: number) => string
}) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg bg-canvas p-0.5">
      {options.map((option) => {
        const active = option.value === current
        return (
          <Link
            key={option.value}
            href={hrefFor(option.value)}
            aria-current={active ? 'true' : undefined}
            className={clsx(
              'rounded-md px-2.5 py-1 text-2xs font-medium transition-colors',
              active ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </Link>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Money panel
// ---------------------------------------------------------------------------

/**
 * What is owed to landlords and what the platform earned on it.
 *
 * Dark on a light page because it is the one figure on the dashboard that is
 * somebody else's money — the visual break is the point, not decoration.
 */
export function PayablePanel({
  payableCents,
  commissionCents,
  commissionRateNote,
  pendingSettlementCents,
  pendingLandlords,
}: {
  payableCents: number
  commissionCents: number
  commissionRateNote: string
  pendingSettlementCents: number
  pendingLandlords: number
}) {
  return (
    <section className="flex flex-col justify-between gap-4 rounded-2xl bg-panel p-5 text-white">
      <div>
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium text-white/60">Total landlord payable</p>
          <Link
            href="/settlements"
            aria-label="Go to settlements"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{compactKES(payableCents / 100)}</p>
        <p className="mt-1 text-xs text-white/60">{formatKES(payableCents / 100)}</p>
      </div>

      <div className="rounded-xl bg-white/[0.07] p-3.5">
        <p className="text-xs text-white/60">Platform commission</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{compactKES(commissionCents / 100)}</p>
        <p className="mt-0.5 text-2xs text-white/50">{commissionRateNote}</p>
      </div>

      <Link
        href="/settlements?status=PENDING"
        className="rounded-xl bg-white p-3.5 text-panel transition-colors hover:bg-brand-soft"
      >
        <p className="text-xs opacity-70">Pending settlements</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {compactKES(pendingSettlementCents / 100)}
        </p>
        <p className="mt-0.5 text-2xs opacity-60">
          {pendingLandlords} {pendingLandlords === 1 ? 'landlord' : 'landlords'}
        </p>
      </Link>
    </section>
  )
}

/** A compact money figure for panels that are not cards. */
export function PanelMoney({ value }: { value: Amount }) {
  return <span className="tabular-nums">{formatKES(value)}</span>
}
