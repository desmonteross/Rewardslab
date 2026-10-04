import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  commissions,
  landlords,
  organizations,
  payments,
  properties,
  settlements,
  tenants,
  units,
  users,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { cents, compactKES, formatKES } from '@/lib/money'
import { fmtDate, periodOf } from '@/lib/dates'
import { Card, DataTable, EmptyState, KpiCard, Money, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'

export const metadata = { title: 'SaaS administration' }
export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  await requirePermission('platform.admin')
  const period = periodOf(new Date())

  const [platform, orgs] = await Promise.all([
    db
      .select({
        organizations: sql<number>`(select count(*)::int from organizations)`,
        activeOrganizations: sql<number>`(select count(*)::int from organizations where status = 'ACTIVE')`,
        trials: sql<number>`(select count(*)::int from organizations where status = 'TRIAL')`,
        landlords: sql<number>`(select count(*)::int from landlords)`,
        properties: sql<number>`(select count(*)::int from properties)`,
        units: sql<number>`(select count(*)::int from units)`,
        tenants: sql<number>`(select count(*)::int from tenants)`,
        users: sql<number>`(select count(*)::int from users)`,
        activeUsers: sql<number>`(select count(*)::int from users where last_login_at > now() - interval '30 days')`,
        grossProcessed: sql<string>`(select coalesce(sum(gross_amount), 0) from payments where status = 'CONFIRMED')`,
        commissionRevenue: sql<string>`(select coalesce(sum(commission_amount), 0) from commissions)`,
        mpesaTransactions: sql<number>`(select count(*)::int from payments where method = 'MPESA')`,
        settlementVolume: sql<string>`(select coalesce(sum(net_amount), 0) from settlements where status = 'SETTLED')`,
      })
      .from(organizations)
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({
        organization: organizations,
        landlords: sql<number>`(select count(*)::int from landlords l where l.organization_id = organizations.id)`,
        properties: sql<number>`(select count(*)::int from properties p where p.organization_id = organizations.id)`,
        units: sql<number>`(select count(*)::int from units u where u.organization_id = organizations.id)`,
        tenants: sql<number>`(select count(*)::int from tenants t where t.organization_id = organizations.id)`,
        users: sql<number>`(select count(*)::int from users us where us.organization_id = organizations.id)`,
        collected: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.organization_id = organizations.id and p.status = 'CONFIRMED')`,
        collectedMonth: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.organization_id = organizations.id and p.status = 'CONFIRMED' and p.paid_at >= ${period.start})`,
        commission: sql<string>`(select coalesce(sum(c.commission_amount), 0) from commissions c where c.organization_id = organizations.id)`,
      })
      .from(organizations)
      .orderBy(asc(organizations.name)),
  ])

  return (
    <>
      <PageHeader
        title="SaaS administration"
        description="The platform view across every organization on the system."
      />

      <div className="mb-4">
        <Notice tone="brand" title="Platform staff see aggregates, not tenant data">
          This is the only screen a super admin can open. Organization data stays behind the tenant boundary —
          reading a specific tenant’s records requires a user inside that organization.
        </Notice>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Organizations"
          value={String(platform?.organizations ?? 0)}
          sub={`${platform?.activeOrganizations ?? 0} active · ${platform?.trials ?? 0} on trial`}
        />
        <KpiCard label="Landlords" value={String(platform?.landlords ?? 0)} />
        <KpiCard label="Properties" value={String(platform?.properties ?? 0)} />
        <KpiCard label="Units" value={String(platform?.units ?? 0)} />
        <KpiCard label="Tenants" value={String(platform?.tenants ?? 0)} />
        <KpiCard
          label="Monthly active users"
          value={String(platform?.activeUsers ?? 0)}
          sub={`${platform?.users ?? 0} accounts`}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Gross rent processed"
          value={compactKES(cents(platform?.grossProcessed) / 100)}
          sub={formatKES(cents(platform?.grossProcessed) / 100)}
        />
        <KpiCard
          label="Commission revenue"
          value={compactKES(cents(platform?.commissionRevenue) / 100)}
          tone="brand"
          sub={formatKES(cents(platform?.commissionRevenue) / 100)}
        />
        <KpiCard label="M-Pesa transactions" value={(platform?.mpesaTransactions ?? 0).toLocaleString()} />
        <KpiCard
          label="Settlement volume"
          value={compactKES(cents(platform?.settlementVolume) / 100)}
          sub={formatKES(cents(platform?.settlementVolume) / 100)}
        />
      </div>

      <div className="mt-6">
        <Card title="Organizations" padded={false}>
          <DataTable
            rows={orgs}
            rowKey={(row) => row.organization.id}
            columns={[
              {
                key: 'name',
                header: 'Organization',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.organization.name}</p>
                    <p className="truncate font-mono text-2xs text-faint">{row.organization.slug}</p>
                  </div>
                ),
              },
              { key: 'plan', header: 'Plan', render: (row) => <span className="text-xs text-muted">{humanise(row.organization.plan)}</span> },
              { key: 'location', header: 'Location', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.organization.town ?? '—'}</span> },
              { key: 'landlords', header: 'Landlords', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.landlords}</span> },
              { key: 'properties', header: 'Properties', align: 'right', render: (row) => <span className="tabular-nums text-sm text-muted">{row.properties}</span> },
              { key: 'units', header: 'Units', align: 'right', render: (row) => <span className="tabular-nums text-sm text-muted">{row.units}</span> },
              { key: 'tenants', header: 'Tenants', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.tenants}</span> },
              { key: 'users', header: 'Users', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.users}</span> },
              { key: 'rate', header: 'Commission', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.organization.commissionRate}%</span> },
              { key: 'collectedMonth', header: 'Collected this month', align: 'right', render: (row) => <Money value={row.collectedMonth} /> },
              { key: 'commission', header: 'Commission earned', align: 'right', render: (row) => <Money value={row.commission} tone="brand" /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.organization.status} /> },
            ]}
            empty={<EmptyState title="No organizations on the platform" />}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Subscription plans" description="The architecture supports plans; pricing is not finalised.">
          <ul className="space-y-3 text-sm">
            <li className="rounded-lg border border-line px-4 py-3">
              <p className="font-medium text-ink">Starter</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Independent landlords and small portfolios. Core portfolio, rent collection and M-Pesa
                reconciliation.
              </p>
            </li>
            <li className="rounded-lg border border-line px-4 py-3">
              <p className="font-medium text-ink">Professional</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Management companies. Adds landlord settlements, expenses, maintenance and the reporting centre.
              </p>
            </li>
            <li className="rounded-lg border border-line px-4 py-3">
              <p className="font-medium text-ink">Enterprise</p>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Large portfolios. Adds configurable roles, full audit export and priority integration support.
              </p>
            </li>
          </ul>
        </Card>

        <Card title="Trials and lifecycle" padded={false}>
          <DataTable
            dense
            rows={orgs.filter((row) => row.organization.status !== 'ACTIVE')}
            rowKey={(row) => row.organization.id}
            columns={[
              { key: 'name', header: 'Organization', render: (row) => <span className="text-sm">{row.organization.name}</span> },
              { key: 'status', header: 'Status', render: (row) => <StatusBadge status={row.organization.status} /> },
              {
                key: 'trial',
                header: 'Trial ends',
                align: 'right',
                render: (row) => (
                  <span className="text-xs text-muted">
                    {row.organization.trialEndsAt ? fmtDate(row.organization.trialEndsAt) : '—'}
                  </span>
                ),
              },
            ]}
            empty={<EmptyState title="Every organization is active" />}
          />
        </Card>
      </div>
    </>
  )
}
