import Link from 'next/link'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import { compactKES, formatKES, type Amount } from '@/lib/money'

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string
  description?: string
  actions?: ReactNode
  breadcrumb?: { label: string; href?: string }[]
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5 flex items-center gap-1.5 text-xs text-faint">
            {breadcrumb.map((crumb, index) => (
              <span key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                {index > 0 && <span aria-hidden>/</span>}
                {crumb.href ? (
                  <Link href={crumb.href} className="hover:text-ink">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-muted">{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        )}
        <h1 className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Card({
  children,
  className,
  title,
  description,
  actions,
  padded = true,
}: {
  children: ReactNode
  className?: string
  title?: string
  description?: string
  actions?: ReactNode
  padded?: boolean
}) {
  return (
    <section className={clsx('card overflow-hidden', className)}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? 'p-5' : undefined}>{children}</div>
    </section>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function SectionTabs({
  tabs,
  current,
}: {
  tabs: { label: string; href: string; count?: number }[]
  current: string
}) {
  return (
    <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
      {tabs.map((tab) => {
        const active = tab.href === current
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={clsx(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
              active
                ? 'border-brand text-ink'
                : 'border-transparent text-muted hover:border-line hover:text-ink',
            )}
          >
            {tab.label}
            {typeof tab.count === 'number' && (
              <span className="ml-1.5 rounded-full bg-canvas px-1.5 py-0.5 text-2xs tabular-nums text-faint">
                {tab.count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}

// ---------------------------------------------------------------------------
// KPI cards
// ---------------------------------------------------------------------------

export type Tone = 'neutral' | 'positive' | 'warning' | 'serious' | 'negative' | 'brand'

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  positive: 'text-positive',
  warning: 'text-warning',
  serious: 'text-serious',
  negative: 'text-negative',
  brand: 'text-brand',
}

export function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  href,
  icon,
}: {
  label: string
  value: string
  sub?: string
  tone?: Tone
  href?: string
  icon?: ReactNode
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
        {icon && <span className="text-faint">{icon}</span>}
      </div>
      <p className={clsx('mt-2 text-xl font-semibold tracking-tight sm:text-2xl', TONE_TEXT[tone])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
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

/** Money KPI — compact for headline figures, exact in the sub-line. */
export function MoneyKpi({
  label,
  amount,
  sub,
  tone = 'neutral',
  href,
}: {
  label: string
  amount: Amount
  sub?: string
  tone?: Tone
  href?: string
}) {
  return (
    <KpiCard label={label} value={compactKES(amount)} sub={sub ?? formatKES(amount)} tone={tone} href={href} />
  )
}

/** A single ratio against a limit — the form a two-slice pie should never take. */
export function Meter({
  label,
  value,
  max = 100,
  caption,
  tone = 'brand',
}: {
  label: string
  value: number
  max?: number
  caption?: string
  tone?: Tone
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const fill =
    tone === 'positive'
      ? 'bg-positive'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'negative'
          ? 'bg-negative'
          : 'bg-brand'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
        <p className="text-sm font-semibold tabular-nums text-ink">{value.toFixed(1)}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line">
        <div className={clsx('h-full rounded-full', fill)} style={{ width: `${pct}%` }} />
      </div>
      {caption && <p className="mt-1.5 text-xs text-muted">{caption}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Status badges
// ---------------------------------------------------------------------------

const TONE_BY_STATUS: Record<string, Tone> = {
  // invoices & payments
  PAID: 'positive',
  CONFIRMED: 'positive',
  DUE: 'neutral',
  PARTIALLY_PAID: 'warning',
  OVERDUE: 'negative',
  CANCELLED: 'neutral',
  DRAFT: 'neutral',
  INITIATED: 'neutral',
  PENDING: 'warning',
  FAILED: 'negative',
  REVERSED: 'negative',
  UNMATCHED: 'negative',
  // reconciliation
  UNRECONCILED: 'warning',
  AUTO_MATCHED: 'positive',
  MANUALLY_MATCHED: 'positive',
  PARTIALLY_ALLOCATED: 'warning',
  EXCEPTION: 'negative',
  // settlement
  SCHEDULED: 'brand',
  PROCESSING: 'brand',
  SETTLED: 'positive',
  // units
  OCCUPIED: 'positive',
  VACANT: 'warning',
  RESERVED: 'brand',
  MAINTENANCE: 'serious',
  UNAVAILABLE: 'neutral',
  // leases & tenancy
  ACTIVE: 'positive',
  EXPIRING: 'warning',
  EXPIRED: 'negative',
  TERMINATED: 'neutral',
  RENEWED: 'positive',
  PROSPECT: 'brand',
  NOTICE: 'warning',
  VACATED: 'neutral',
  BLACKLISTED: 'negative',
  // maintenance
  REPORTED: 'warning',
  ACKNOWLEDGED: 'brand',
  ASSIGNED: 'brand',
  IN_PROGRESS: 'brand',
  WAITING: 'serious',
  RESOLVED: 'positive',
  CLOSED: 'neutral',
  // priority
  LOW: 'neutral',
  MEDIUM: 'brand',
  HIGH: 'serious',
  URGENT: 'negative',
  CRITICAL: 'negative',
  // approvals
  APPROVED: 'positive',
  REJECTED: 'negative',
  UNPAID: 'warning',
  // compliance
  REGISTERED: 'positive',
  NOT_REGISTERED: 'neutral',
  REQUIRES_ATTENTION: 'serious',
  SYNC_FAILED: 'negative',
  OPEN: 'warning',
  READY_FOR_REVIEW: 'brand',
  UNDER_REVIEW: 'brand',
  SUBMITTED: 'positive',
  ACCEPTED: 'positive',
  SIMULATED: 'brand',
  IGNORED: 'neutral',
  SUCCESS: 'positive',
  SKIPPED: 'neutral',
  // organizations & integrations
  TRIAL: 'brand',
  SUSPENDED: 'negative',
  CONNECTED: 'positive',
  SANDBOX: 'brand',
  AVAILABLE: 'neutral',
  COMING_SOON: 'neutral',
  DISCONNECTED: 'neutral',
  ERROR: 'negative',
}

const BADGE_TONE: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted ring-line',
  positive: 'bg-positive/10 text-positive ring-positive/25',
  warning: 'bg-warning/15 text-[rgb(146,96,0)] ring-warning/35 dark:text-warning',
  serious: 'bg-serious/15 text-[rgb(158,70,32)] ring-serious/35 dark:text-serious',
  negative: 'bg-negative/10 text-negative ring-negative/25',
  brand: 'bg-brand/10 text-brand ring-brand/25',
}

export function humanise(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function StatusBadge({
  status,
  label,
  tone,
}: {
  status: string
  label?: string
  tone?: Tone
}) {
  const resolved = tone ?? TONE_BY_STATUS[status] ?? 'neutral'
  return (
    <span
      className={clsx(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-2xs font-medium ring-1 ring-inset',
        BADGE_TONE[resolved],
      )}
    >
      {label ?? humanise(status)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Data table
// ---------------------------------------------------------------------------

export interface Column<Row> {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  width?: string
  /** Hide below the sm breakpoint so tables stay usable on a phone. */
  hideOnMobile?: boolean
  render: (row: Row) => ReactNode
}

export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  empty,
  footer,
  dense,
}: {
  columns: Column<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  rowHref?: (row: Row) => string | null
  empty?: ReactNode
  footer?: ReactNode
  dense?: boolean
}) {
  if (rows.length === 0) {
    return <>{empty ?? <EmptyState title="Nothing to show yet" />}</>
  }

  const cell = dense ? 'px-4 py-2' : 'px-4 py-3'

  /*
   * Below `sm` the table becomes a list of cards.
   *
   * A financial table is six to nine columns wide and does not shrink: on a
   * phone it either scrolls sideways, which hides the money, or squeezes the
   * columns until nothing is legible. Stacking keeps every field visible with
   * its own label, and the first column stays the heading because that is the
   * thing being listed — the tenant, the property, the invoice.
   *
   * `hideOnMobile` still applies: a column not worth a phone's width in a
   * table is not worth a line in a card either.
   */
  const stacked = columns.filter((column) => !column.hideOnMobile)
  const [heading, ...rest] = stacked

  return (
    <>
      <ul className="divide-y divide-line sm:hidden">
        {rows.map((row) => {
          const href = rowHref?.(row) ?? null
          const title = heading ? heading.render(row) : null
          return (
            <li key={rowKey(row)} className="px-4 py-3">
              <div className="text-sm font-medium text-ink">
                {href ? (
                  <Link href={href} className="block hover:text-brand">
                    {title}
                  </Link>
                ) : (
                  title
                )}
              </div>
              {rest.length > 0 && (
                <dl className="mt-2 space-y-1">
                  {rest.map((column) => (
                    <div key={column.key} className="flex items-baseline justify-between gap-2">
                      <dt className="shrink-0 text-2xs uppercase tracking-wide text-faint">
                        {column.header}
                      </dt>
                      <dd className="min-w-0 text-right text-xs text-ink">
                        {column.render(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          )
        })}
      </ul>
      {/*
        The footer is a table row supplied by the caller, so it belongs to the
        table and is not repeated in the stacked view — a totals row without
        its columns says nothing.
      */}
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={clsx(
                  'whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-faint',
                  column.align === 'right' && 'text-right',
                  column.align === 'center' && 'text-center',
                  column.hideOnMobile && 'hidden sm:table-cell',
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const href = rowHref?.(row) ?? null
            return (
              <tr
                key={rowKey(row)}
                className="border-b border-line/70 last:border-0 hover:bg-canvas/70"
              >
                {columns.map((column, index) => (
                  <td
                    key={column.key}
                    className={clsx(
                      cell,
                      'align-middle text-ink',
                      column.align === 'right' && 'text-right',
                      column.align === 'center' && 'text-center',
                      column.hideOnMobile && 'hidden sm:table-cell',
                    )}
                  >
                    {href && index === 0 ? (
                      <Link href={href} className="block font-medium text-ink hover:text-brand">
                        {column.render(row)}
                      </Link>
                    ) : (
                      column.render(row)
                    )}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
        {footer && <tfoot className="border-t border-line bg-canvas/60">{footer}</tfoot>}
      </table>
      </div>
    </>
  )
}

/** Money cell — right-aligned, tabular, exact. */
export function Money({ value, muted, tone }: { value: Amount; muted?: boolean; tone?: Tone }) {
  return (
    <span
      className={clsx(
        'tabular-nums',
        tone ? TONE_TEXT[tone] : muted ? 'text-muted' : 'text-ink',
      )}
    >
      {formatKES(value)}
    </span>
  )
}

export function Pagination({
  page,
  pageCount,
  buildHref,
  total,
}: {
  page: number
  pageCount: number
  buildHref: (page: number) => string
  total: number
}) {
  if (pageCount <= 1) {
    return (
      <p className="border-t border-line px-4 py-3 text-xs text-faint">
        {total.toLocaleString()} {total === 1 ? 'record' : 'records'}
      </p>
    )
  }
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs">
      <p className="text-faint">
        Page {page} of {pageCount} · {total.toLocaleString()} records
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={buildHref(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={clsx('btn-secondary px-2.5 py-1', page <= 1 && 'pointer-events-none opacity-40')}
        >
          Previous
        </Link>
        <Link
          href={buildHref(Math.min(pageCount, page + 1))}
          aria-disabled={page >= pageCount}
          className={clsx('btn-secondary px-2.5 py-1', page >= pageCount && 'pointer-events-none opacity-40')}
        >
          Next
        </Link>
      </div>
    </nav>
  )
}

/** Key/value list used across the detail screens. */
export function DetailList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[]
  columns?: 1 | 2 | 3
}) {
  return (
    <dl
      className={clsx(
        'grid gap-x-8 gap-y-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-faint">{item.label}</dt>
          <dd className="mt-1 break-words text-sm text-ink">{item.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function Notice({
  tone = 'brand',
  title,
  children,
}: {
  tone?: Tone
  title?: string
  children: ReactNode
}) {
  const ring: Record<Tone, string> = {
    neutral: 'border-line bg-canvas',
    positive: 'border-positive/30 bg-positive/5',
    warning: 'border-warning/40 bg-warning/5',
    serious: 'border-serious/40 bg-serious/5',
    negative: 'border-negative/30 bg-negative/5',
    brand: 'border-brand/30 bg-brand/5',
  }
  return (
    <div className={clsx('rounded-xl border px-4 py-3 text-sm', ring[tone])}>
      {title && <p className="font-medium text-ink">{title}</p>}
      <div className={clsx('leading-relaxed text-muted', title && 'mt-1')}>{children}</div>
    </div>
  )
}
