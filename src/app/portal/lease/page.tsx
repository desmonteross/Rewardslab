import Link from 'next/link'
import { CalendarClock } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { formatKES } from '@/lib/money'
import { Card, DetailList, EmptyState, Meter, Notice, PageHeader } from '@/components/ui'
import { portalTenancy } from '@/server/queries/portal'

export const metadata = { title: 'My lease' }
export const dynamic = 'force-dynamic'

const DAY_MS = 86_400_000

export default async function PortalLeasePage() {
  const session = await requireSession()
  const tenancy = await portalTenancy(scopeFromSession(session))
  const lease = tenancy?.lease ?? null

  if (!lease) {
    return (
      <div className="space-y-5">
        <PageHeader title="My lease" />
        <Card>
          <EmptyState
            title="No active tenancy"
            description="Your account is not currently linked to a unit. Your property manager can put that right."
          />
        </Card>
      </div>
    )
  }

  const now = new Date()
  const start = new Date(lease.startDate)
  const end = lease.endDate ? new Date(lease.endDate) : null

  const elapsedDays = Math.max(0, Math.round((now.getTime() - start.getTime()) / DAY_MS))
  const totalDays = end ? Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS)) : null
  const daysLeft = end ? Math.max(0, Math.round((end.getTime() - now.getTime()) / DAY_MS)) : null
  const endingSoon = daysLeft !== null && daysLeft <= 90

  const monthlyTotal = lease.monthlyRentCents + lease.serviceChargeCents

  return (
    <div className="space-y-5">
      <PageHeader
        title="My lease"
        description={`${lease.propertyName} · Unit ${lease.unitNumber}`}
        actions={
          <Link href="/portal/pay" className="btn-primary">
            Pay rent
          </Link>
        }
      />

      {endingSoon && (
        <Notice tone="warning">
          Your lease ends {fmtDate(end!)} — {daysLeft} {daysLeft === 1 ? 'day' : 'days'} from today.
          Speak to your property manager about renewing if you intend to stay.
        </Notice>
      )}

      {totalDays !== null && (
        <Card title="Where you are in the term">
          <Meter
            label="Elapsed"
            value={Math.min(elapsedDays, totalDays)}
            max={totalDays}
            tone={endingSoon ? 'warning' : 'brand'}
            caption={`${fmtDate(start)} to ${fmtDate(end!)} · ${daysLeft} ${
              daysLeft === 1 ? 'day' : 'days'
            } remaining`}
          />
        </Card>
      )}

      <Card title="The agreement">
        <DetailList
          columns={2}
          items={[
            { label: 'Lease reference', value: lease.code },
            { label: 'Status', value: lease.status },
            { label: 'Property', value: lease.propertyName },
            { label: 'Unit', value: lease.unitNumber },
            { label: 'Address', value: lease.propertyAddress ?? '—' },
            {
              label: 'Term',
              value: end ? `${fmtDate(start)} — ${fmtDate(end)}` : `From ${fmtDate(start)}, ongoing`,
            },
            { label: 'Monthly rent', value: formatKES(lease.monthlyRentCents / 100) },
            {
              label: 'Service charge',
              value:
                lease.serviceChargeCents > 0 ? formatKES(lease.serviceChargeCents / 100) : 'None',
            },
            { label: 'Payable each month', value: formatKES(monthlyTotal / 100) },
            { label: 'Rent due on', value: `Day ${lease.dueDayOfMonth} of each month` },
            { label: 'Deposit held', value: formatKES(lease.depositCents / 100) },
            { label: 'Tenant reference', value: tenancy?.code ?? '—' },
          ]}
        />
      </Card>

      <Card title="What happens at the end of the term">
        <p className="text-sm leading-relaxed text-muted">
          {end ? (
            <>
              This lease runs to {fmtDate(end)}. Renewals are agreed with your property manager
              rather than automatically — if nothing is agreed, speak to them before the end date so
              you are not left without an agreement in place.
            </>
          ) : (
            <>
              This tenancy has no end date recorded, so it continues until either side ends it under
              the terms of your agreement.
            </>
          )}
        </p>
        <p className="mt-3 flex items-center gap-2 text-xs text-faint">
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Your deposit is held against the tenancy and is dealt with when you move out.
        </p>
      </Card>
    </div>
  )
}
