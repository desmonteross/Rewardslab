import Link from 'next/link'
import { Gift, Sparkles } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, DataTable, EmptyState, PageHeader, humanise } from '@/components/ui'
import { PortalTile } from '@/components/portal'
import { portalRewards } from '@/server/queries/rewards'

export const metadata = { title: 'Rewards' }
export const dynamic = 'force-dynamic'

export default async function PortalRewardsPage() {
  const session = await requireSession()
  const { balance, recent } = await portalRewards(scopeFromSession(session))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rewards"
        description="Points earned on rent you have paid. Every line below is a movement you can check."
        actions={
          <Link href="/portal/pay" className="btn-primary">
            Pay rent
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-3">
        <PortalTile
          label="Total points"
          value={balance.total.toLocaleString()}
          sub="Everything earned, less anything redeemed"
          icon={<Gift className="h-4 w-4" />}
          tone="brand"
        />
        <PortalTile
          label="Available now"
          value={balance.available.toLocaleString()}
          sub="Matured and ready to redeem"
          icon={<Sparkles className="h-4 w-4" />}
          tone="positive"
        />
        <PortalTile
          label="Maturing"
          value={balance.pending.toLocaleString()}
          sub="Earned recently, available once the payment has settled"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>

      <Card title="How points are earned">
        <p className="text-sm leading-relaxed text-muted">
          Points are awarded when a rent payment is matched to an invoice, not when the money
          arrives — so a payment that has not yet been allocated has not yet earned. Rent paid on or
          before the due date earns at the full rate; later payments earn less. An unbroken run of
          on-time months earns more again.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Points mature after a short holding period. That is what the maturing figure above is: the
          points are yours, they are simply not yet redeemable.
        </p>
      </Card>

      <Card title="Your points statement" padded={false}>
        <DataTable
          dense
          rows={recent}
          rowKey={(row) => row.id}
          columns={[
            { key: 'date', header: 'Date', render: (row) => fmtDate(row.date) },
            {
              key: 'detail',
              header: 'Detail',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{row.narrative}</p>
                  <p className="truncate text-2xs text-faint">
                    {humanise(row.type)}
                    {row.periodLabel ? ` · ${row.periodLabel}` : ''}
                  </p>
                </div>
              ),
            },
            {
              key: 'bucket',
              header: 'Status',
              hideOnMobile: true,
              render: (row) => <span className="text-xs text-muted">{humanise(row.bucket)}</span>,
            },
            {
              key: 'points',
              header: 'Points',
              align: 'right',
              render: (row) => (
                <span
                  className={
                    row.points >= 0
                      ? 'tabular-nums font-medium text-positive'
                      : 'tabular-nums font-medium text-negative'
                  }
                >
                  {row.points > 0 ? '+' : ''}
                  {row.points.toLocaleString()}
                </span>
              ),
            },
          ]}
          empty={
            <EmptyState
              title="No points yet"
              description="Your first rent payment will earn the first of them."
            />
          }
        />
      </Card>
    </div>
  )
}
