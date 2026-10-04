// ===========================================================================
//  Tenant portal — home
//
//  The order is the order of a tenant's questions: who am I and where do I
//  live, am I up to date, what do I owe and how do I pay it, what is
//  happening with my repairs, what have I paid, and what is my record.
// ===========================================================================

import Link from 'next/link'
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  Download,
  FileText,
  Gauge,
  Gift,
  Megaphone,
  ReceiptText,
  Smartphone,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { formatKES } from '@/lib/money'
import { FINANCING_PARTNERS } from '@/lib/financing'
import { Card, EmptyState, Money, StatusBadge } from '@/components/ui'
import {
  PortalDateChip,
  PortalGreeting,
  PortalTile,
  RentDuePanel,
  ScoreDial,
  ScoreFactor,
} from '@/components/portal'
import {
  portalAnnouncements,
  portalOverview,
  portalReceipts,
  portalTickets,
} from '@/server/queries/portal'
import { portalRewardBalance } from '@/server/queries/rewards'

export const metadata = { title: 'Home' }
export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

/** Whole days from today to a date — negative once the date has passed. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime()
  return Math.round((b - a) / DAY_MS)
}

/** Months remaining on a lease, floored — "8 months left" must not round up. */
function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  return Math.max(0, to.getDate() >= from.getDate() ? months : months - 1)
}

export default async function PortalHomePage() {
  const session = await requireSession()
  const scope = scopeFromSession(session)

  const [{ tenancy, rent, record }, points, tickets, receipts, announcements] = await Promise.all([
    portalOverview(scope),
    portalRewardBalance(scope),
    portalTickets(scope),
    portalReceipts(scope, 5),
    portalAnnouncements(scope, 3),
  ])

  const now = new Date()
  const owing = rent.balanceCents > 0
  const nextDue = rent.nextDue
  const daysUntilDue = nextDue ? daysBetween(now, nextDue.dueDate) : null
  const overdue = daysUntilDue !== null && daysUntilDue < 0

  const openTickets = tickets.filter((ticket) => ticket.status !== 'CLOSED')
  const lease = tenancy?.lease ?? null
  const monthsLeft = lease?.endDate ? monthsBetween(now, lease.endDate) : null

  const recordTone =
    record.band === 'EXCELLENT'
      ? 'positive'
      : record.band === 'GOOD'
        ? 'brand'
        : record.band === 'ATTENTION'
          ? 'negative'
          : 'warning'

  // The checklist beside the dial. Each line is a fact already computed for
  // the record, phrased as the tenant would say it, and "met" is what turns
  // the tick on — never a restatement of the score itself.
  const checks = [
    {
      label: 'Rent paid on time',
      // `onTimeRate` is a ratio, not a percentage — a payment inside the
      // grace period counts half, which is why it is not a whole count.
      detail: `${Math.round(record.onTimeRate * 100)}% of ${record.invoicesAssessed} invoices by the due date`,
      met: record.onTimeRate >= 0.8,
    },
    {
      label: 'Unbroken run',
      detail:
        record.longestOnTimeStreak > 0
          ? `${record.longestOnTimeStreak} consecutive on-time ${
              record.longestOnTimeStreak === 1 ? 'month' : 'months'
            }`
          : 'No streak yet',
      met: record.longestOnTimeStreak >= 3,
    },
    {
      label: 'Nothing outstanding',
      detail:
        record.currentArrearsCents > 0
          ? `${formatKES(record.currentArrearsCents / 100)} in arrears`
          : 'No arrears on the account',
      met: record.currentArrearsCents === 0,
    },
    {
      label: 'Length of tenancy',
      detail: `${record.monthsOnRecord} ${record.monthsOnRecord === 1 ? 'month' : 'months'} on record`,
      met: record.monthsOnRecord >= 12,
    },
  ]

  return (
    <>
      <PortalGreeting
        name={tenancy?.fullName.split(' ')[0] ?? 'there'}
        place={lease?.propertyName ?? null}
        unit={lease ? `Unit ${lease.unitNumber}` : null}
        asOf={now}
        aside={<PortalDateChip asOf={now} place={lease?.propertyAddress ?? null} />}
      />

      {/* ---- Status at a glance ------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
        <PortalTile
          label="Rent status"
          value={owing ? (overdue ? 'Overdue' : 'Due soon') : 'Up to date'}
          sub={owing ? `${formatKES(rent.balanceCents / 100)} outstanding` : 'No outstanding balance'}
          icon={<Wallet className="h-4 w-4" />}
          tone={owing ? (overdue ? 'negative' : 'warning') : 'positive'}
          href="/portal/pay"
        />
        <PortalTile
          label="Reward points"
          value={points.total.toLocaleString()}
          sub="Boosts your chances of owner offers"
          icon={<Sparkles className="h-4 w-4" />}
          tone="brand"
          href="/portal/rewards"
        />
        <PortalTile
          label="Rental record"
          value={String(record.score)}
          badge={
            <span className="rounded-full bg-canvas px-2 py-0.5 text-2xs font-medium text-muted">
              {record.bandLabel}
            </span>
          }
          sub={
            record.longestOnTimeStreak > 0
              ? `${record.longestOnTimeStreak} consecutive on-time payments`
              : 'Built from your own payment history'
          }
          icon={<Gauge className="h-4 w-4" />}
          tone={recordTone}
          href="/portal/record"
        />
        <PortalTile
          label="Lease"
          value={monthsLeft !== null ? `${monthsLeft} ${monthsLeft === 1 ? 'month' : 'months'} left` : 'Ongoing'}
          sub={lease?.endDate ? `Ends ${fmtDate(lease.endDate)}` : 'No end date recorded'}
          icon={<CalendarClock className="h-4 w-4" />}
          href="/portal/lease"
        />
      </div>

      {/* ---- The money, the actions, the news ------------------------------ */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <RentDuePanel
            balanceCents={rent.balanceCents}
            dueDate={nextDue?.dueDate ?? null}
            periodLabel={nextDue?.periodLabel ?? null}
            daysUntilDue={daysUntilDue}
            payReference={rent.payReference}
            overdue={overdue}
          />

          <Card
            title="Recent payments"
            padded={false}
            actions={
              <Link href="/portal/payments" className="text-xs text-brand hover:underline">
                View all
              </Link>
            }
          >
            {receipts.length === 0 ? (
              <EmptyState
                title="No payments yet"
                description="Payments appear here as soon as they are confirmed."
              />
            ) : (
              <ul className="divide-y divide-line">
                {receipts.map((receipt) => (
                  <li key={receipt.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{receipt.number}</p>
                      <p className="truncate text-2xs text-faint">{fmtDate(receipt.paidAt)}</p>
                    </div>
                    <Money value={receipt.amountCents / 100} />
                    {/* Wraps under the amount on a narrow screen rather than
                        squeezing the receipt number into an ellipsis. */}
                    <div className="flex shrink-0 items-center gap-2 text-xs">
                      <Link href={`/portal/receipts/${receipt.id}`} className="text-brand hover:underline">
                        View
                      </Link>
                      <span className="text-line" aria-hidden>
                        |
                      </span>
                      <a
                        href={`/portal/receipts/${receipt.id}/pdf`}
                        className="text-brand hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {lease && (
            <Card title="Lease information" padded={false}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 sm:grid-cols-4">
                {[
                  { label: 'Property', value: lease.propertyName },
                  { label: 'Unit', value: lease.unitNumber },
                  { label: 'Lease start', value: fmtDate(lease.startDate) },
                  { label: 'Lease end', value: lease.endDate ? fmtDate(lease.endDate) : 'Ongoing' },
                  { label: 'Monthly rent', value: formatKES(lease.monthlyRentCents / 100) },
                  {
                    label: 'Service charge',
                    value:
                      lease.serviceChargeCents > 0
                        ? formatKES(lease.serviceChargeCents / 100)
                        : 'None',
                  },
                  { label: 'Rent due on', value: `Day ${lease.dueDayOfMonth}` },
                  { label: 'Deposit held', value: formatKES(lease.depositCents / 100) },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-2xs uppercase tracking-wide text-faint">{item.label}</dt>
                    <dd className="mt-0.5 truncate text-sm text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Quick actions">
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: 'Pay rent', sub: 'M-Pesa', href: '/portal/pay', icon: <Smartphone className="h-4 w-4" /> },
                {
                  label: 'View receipt',
                  sub: 'Latest payment',
                  href: receipts[0] ? `/portal/receipts/${receipts[0].id}` : '/portal/receipts',
                  icon: <ReceiptText className="h-4 w-4" />,
                },
                {
                  label: 'View statement',
                  sub: 'Download PDF',
                  href: '/portal/statements',
                  icon: <FileText className="h-4 w-4" />,
                },
                {
                  label: 'Report an issue',
                  sub: 'Maintenance',
                  href: '/portal/maintenance/report',
                  icon: <Wrench className="h-4 w-4" />,
                },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="rounded-xl border border-line p-3 transition-colors hover:border-brand/40 hover:bg-canvas"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                    {action.icon}
                  </span>
                  <span className="mt-2.5 block text-sm font-medium leading-tight text-ink">
                    {action.label}
                  </span>
                  <span className="block text-2xs text-faint">{action.sub}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card
            title="Your rental record"
            actions={
              <Link href="/portal/record" className="text-xs text-brand hover:underline">
                View details
              </Link>
            }
          >
            {/* Stacked, not side by side: in a narrow column the dial and the
                checklist fight for width and every label wraps mid-phrase. */}
            <div className="flex flex-col items-center gap-5">
              <ScoreDial score={record.score} bandLabel={record.bandLabel} tone={recordTone} size={150} />
              <ul className="w-full space-y-2.5">
                {checks.map((check) => (
                  <ScoreFactor key={check.label} {...check} />
                ))}
              </ul>
            </div>
            {!record.hasEnoughHistory && (
              <p className="mt-4 text-xs leading-relaxed text-faint">
                This is RentRewards’ own measure of your payment record, not a credit score. A few
                more months of rent will fill it in.
              </p>
            )}
          </Card>

          <Card
            title="Rewards"
            actions={
              <Link href="/portal/rewards" className="text-xs text-brand hover:underline">
                View rewards
              </Link>
            }
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-ink">
                <Gift className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold tabular-nums text-ink">
                  {points.total.toLocaleString()}
                </p>
                <p className="text-xs text-faint">
                  {points.pending > 0
                    ? `${points.available.toLocaleString()} available · ${points.pending.toLocaleString()} maturing`
                    : 'Points earned on rent you have paid'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              You earn points every time rent is paid, and more of them when it arrives on time.
            </p>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title="Maintenance"
            padded={false}
            actions={
              openTickets.length > 0 ? (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 text-2xs font-medium text-warning">
                  {openTickets.length} active
                </span>
              ) : undefined
            }
          >
            {openTickets.length === 0 ? (
              <EmptyState
                title="Nothing outstanding"
                description="Report a problem and it appears here with its progress."
                action={
                  <Link href="/portal/maintenance/report" className="btn-secondary">
                    Report an issue
                  </Link>
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-line">
                  {openTickets.slice(0, 3).map((ticket) => (
                    <li key={ticket.id}>
                      <Link
                        href={`/portal/maintenance/${ticket.id}`}
                        className="group flex items-start gap-3 px-5 py-3 transition-colors hover:bg-canvas"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-muted">
                          <Wrench className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink group-hover:text-brand">
                            {ticket.title}
                          </span>
                          <span className="block truncate text-2xs text-faint">
                            {ticket.unitNumber ? `Unit ${ticket.unitNumber} · ` : ''}
                            reported {fmtDate(ticket.reportedAt)}
                          </span>
                          <span className="mt-1 inline-block">
                            <StatusBadge status={ticket.status} />
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-line px-5 py-3">
                  <Link href="/portal/maintenance" className="text-xs text-brand hover:underline">
                    View all maintenance requests
                  </Link>
                </div>
              </>
            )}
          </Card>

          {/*
            The financing card renders only when there is a real lender behind
            it. See src/lib/financing.ts — an empty list is the shipped state.
          */}
          {FINANCING_PARTNERS.length > 0 && (
            <Card title="Financing options">
              <ul className="space-y-3">
                {FINANCING_PARTNERS.map((partner) => (
                  <li key={partner.id}>
                    <a
                      href={partner.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-start gap-3 rounded-xl border border-line p-3 transition-colors hover:border-brand/40"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand-ink">
                        <Banknote className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">{partner.name}</span>
                        <span className="block text-xs text-muted">{partner.offer}</span>
                        <span className="block text-2xs text-faint">
                          {partner.detail}
                          {partner.regulator ? ` · ${partner.regulator}` : ''}
                        </span>
                      </span>
                      <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-faint" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-2xs leading-relaxed text-faint">
                Borrowing is between you and the lender. RentRewards is not a party to it and earns
                nothing from your application.
              </p>
            </Card>
          )}

          <Card
            title="Announcements"
            padded={false}
            actions={
              <Link href="/portal/notifications" className="text-xs text-brand hover:underline">
                View all
              </Link>
            }
          >
            {announcements.length === 0 ? (
              <EmptyState
                title="Nothing new"
                description="Notices from your property manager appear here."
              />
            ) : (
              <ul className="divide-y divide-line">
                {announcements.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 px-5 py-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-canvas text-muted">
                      <Megaphone className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                      <p className="line-clamp-2 text-2xs leading-snug text-faint">{item.body}</p>
                      <p className="mt-0.5 text-2xs text-faint">{fmtDate(item.createdAt)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Statement">
            <p className="text-sm leading-relaxed text-muted">
              Every charge and every payment on your tenancy, in one document.
            </p>
            <div className="mt-3.5 flex flex-wrap gap-2">
              <a href="/portal/statement/pdf" className="btn-secondary">
                <Download className="h-4 w-4" aria-hidden />
                PDF
              </a>
              <a href="/portal/statement/csv" className="btn-secondary">
                <Download className="h-4 w-4" aria-hidden />
                CSV
              </a>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}
