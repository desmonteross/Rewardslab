import { Sparkles } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { formatKES } from '@/lib/money'
import { Card, PageHeader } from '@/components/ui'
import { PayForm, type PayableInvoice } from '@/components/portal/pay-form'
import { outstandingInvoices } from '@/server/services/checkout'
import { portalRewards } from '@/server/queries/rewards'
import { getPaymentProvider } from '@/server/adapters'

export const metadata = { title: 'Pay rent' }

export default async function PortalPayPage() {
  const session = await requireSession()
  const scope = scopeFromSession(session)

  const [invoices, rewards] = await Promise.all([outstandingInvoices(scope), portalRewards(scope, 8)])
  const provider = getPaymentProvider().info()

  const payable: PayableInvoice[] = invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    periodLabel: invoice.periodLabel,
    dueDate: invoice.dueDate.toISOString(),
    balanceCents: invoice.balanceCents,
  }))

  const totalOutstanding = invoices.reduce((total, invoice) => total + invoice.balanceCents, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pay rent"
        description={
          totalOutstanding > 0
            ? `${formatKES(totalOutstanding / 100)} outstanding across ${invoices.length} invoice${invoices.length === 1 ? '' : 's'}.`
            : 'You are fully paid up.'
        }
      />

      {provider.mode === 'mock' && (
        <div className="rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Simulated M-Pesa
          </p>
          <p className="mt-1 text-sm text-muted">{provider.notice}</p>
        </div>
      )}

      <Card title="What you owe">
        {invoices.length === 0 ? (
          <p className="p-4 text-sm text-muted">Nothing outstanding.</p>
        ) : (
          <ul className="divide-y divide-line">
            {invoices.map((invoice) => (
              <li key={invoice.id} className="flex items-baseline justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{invoice.periodLabel}</p>
                  <p className="text-xs text-faint">
                    {invoice.number} · due {fmtDate(invoice.dueDate)}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                  {formatKES(invoice.balanceCents / 100)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Pay with M-Pesa">
        <div className="p-4">
          <PayForm invoices={payable} />
        </div>
      </Card>

      <Card title="Your points">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
            <div>
              <p className="text-2xl font-semibold tracking-tight text-ink">
                {rewards.balance.total.toLocaleString()}
                <span className="ml-1.5 text-sm font-normal text-muted">points</span>
              </p>
              <p className="mt-0.5 text-sm text-muted">
                {rewards.balance.available.toLocaleString()} available ·{' '}
                {rewards.balance.pending.toLocaleString()} still maturing
              </p>
            </div>
          </div>

          {rewards.recent.length > 0 && (
            <ul className="mt-4 space-y-2 border-t border-line pt-4">
              {rewards.recent.slice(0, 5).map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-4 text-sm">
                  <span className="min-w-0 truncate text-muted">{entry.narrative}</span>
                  <span className="shrink-0 font-medium tabular-nums text-ink">
                    +{entry.points.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  )
}
