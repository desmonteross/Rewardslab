import Link from 'next/link'
import { Gift, Sparkles } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, DataTable, EmptyState, PageHeader, humanise } from '@/components/ui'
import { PortalTile } from '@/components/portal'
import { portalRewards } from '@/server/queries/rewards'
import { PointsTree } from '@/components/portal/points-tree'
import { POINTS_PURPOSE } from '@/components/portal/points-copy'

export const metadata = { title: 'Rewards' }
export const dynamic = 'force-dynamic'

export default async function PortalRewardsPage() {
  const session = await requireSession()
  const { balance, recent, earnings } = await portalRewards(scopeFromSession(session))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rewards"
        description="Points grow with every month of rent you pay. They are not cash: they raise your chances of offers from property owners."
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
          sub="Everything earned on rent you have paid"
          icon={<Gift className="h-4 w-4" />}
          tone="brand"
        />
        <PortalTile
          label="Confirmed"
          value={balance.available.toLocaleString()}
          sub="Settled and counting towards offers"
          icon={<Sparkles className="h-4 w-4" />}
          tone="positive"
        />
        <PortalTile
          label="Settling"
          value={balance.pending.toLocaleString()}
          sub="Earned recently, confirmed after 30 days"
          icon={<Sparkles className="h-4 w-4" />}
        />
      </div>

      <Card title="Your points tree" description="Each branch is a month of rent. Longer branches and fuller leaves earned more.">
        <PointsTree earnings={earnings} total={balance.total} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="What points are for">
          <p className="text-sm leading-relaxed text-muted">{POINTS_PURPOSE}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Each owner decides what they offer and when, so there is no fixed price in points and
            nothing to cash in. Paying on time, month after month, is what moves you up.
          </p>
        </Card>

        <Card title="How points are earned">
          <p className="text-sm leading-relaxed text-muted">
            Points are awarded when a rent payment clears an invoice, at 1 point for every KES 100.
            Rent paid on or before the due date earns the full amount; later payments earn less, and
            nothing after 15 days. An unbroken run of on-time months earns a bonus of up to 30%.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            New points settle for 30 days before they are confirmed, in case a payment is reversed.
          </p>
        </Card>
      </div>

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
                  <p className="truncate text-sm text-ink">
                    {row.type === 'MATURE' ? 'Points confirmed after the 30-day settling period' : row.narrative}
                  </p>
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
