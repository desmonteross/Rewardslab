import { Download } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, DetailList, EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui'
import {
  RentalRecordDisclaimer,
  RentalRecordFactors,
  RentalRecordHistory,
  RentalRecordSummary,
} from '@/components/rental-record'
import {
  portalPaymentSummary,
  portalTenancy,
  portalTenancyHistory,
} from '@/server/queries/portal'
import { rentalRecordFor } from '@/server/services/rental-record'

export const metadata = { title: 'My record' }

export default async function PortalRecordPage() {
  const session = await requireSession()
  const scope = scopeFromSession(session)
  const tenantId = session.tenantId!

  const [record, history, summary, tenancy] = await Promise.all([
    rentalRecordFor(scope, tenantId),
    portalTenancyHistory(scope),
    portalPaymentSummary(scope),
    portalTenancy(scope),
  ])

  const totalMonths = history.reduce((sum, entry) => sum + entry.months, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="My rental record"
        description="How your rent has been paid, and the tenancies behind it."
        actions={
          <a href="/portal/record/pdf" className="btn-secondary">
            <Download className="h-4 w-4" aria-hidden />
            Download
          </a>
        }
      />

      <RentalRecordSummary record={record} />

      <Card title="How it is calculated" description="Every point comes from one of these five factors.">
        <RentalRecordFactors record={record} />
        <div className="mt-5 border-t border-line pt-4">
          <RentalRecordDisclaimer />
        </div>
      </Card>

      <Card
        title="Month by month"
        description="The months the record is built from. If something here looks wrong, tell your property manager."
      >
        <RentalRecordHistory record={record} />
      </Card>

      <Card
        title="Rental passport"
        description="Your tenancy history — useful when a future landlord asks for a reference."
      >
        {history.length === 0 ? (
          <EmptyState title="No tenancies on record yet" />
        ) : (
          <ul className="divide-y divide-line">
            {history.map((entry) => (
              <li key={entry.leaseCode} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">
                      {entry.propertyName} · Unit {entry.unitNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-faint">
                      {fmtDate(entry.startDate)} — {entry.endDate ? fmtDate(entry.endDate) : 'present'} ·{' '}
                      {entry.months} month{entry.months === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <Money value={entry.monthlyRentCents / 100} muted />
                    <StatusBadge status={entry.status} />
                  </div>
                </div>
                {entry.terminationReason && (
                  <p className="mt-2 text-xs text-muted">Ended: {entry.terminationReason}</p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 border-t border-line pt-4">
          <DetailList
            columns={3}
            items={[
              { label: 'Tenant reference', value: tenancy?.code ?? '—' },
              { label: 'Total time renting', value: `${totalMonths} months` },
              { label: 'Payments made', value: String(summary.paymentCount) },
              {
                label: 'Total rent paid',
                value: <Money value={summary.totalPaidCents / 100} />,
              },
              { label: 'First payment', value: fmtDate(summary.firstPaymentAt) },
              { label: 'Most recent payment', value: fmtDate(summary.lastPaymentAt) },
            ]}
          />
        </div>
      </Card>
    </div>
  )
}
