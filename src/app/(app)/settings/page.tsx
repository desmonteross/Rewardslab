import { asc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { commissionRules, landlords, organizations, properties } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { env } from '@/lib/env'
import { fmtDate } from '@/lib/dates'
import { Card, DataTable, DetailList, EmptyState, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { providerSummary } from '@/server/adapters'

export const metadata = { title: 'Settings' }
export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const session = await requirePermission('settings.view')
  const scope = scopeFromSession(session)
  const providers = providerSummary()

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, scope.organizationId))
    .limit(1)

  const rules = await db
    .select({
      rule: commissionRules,
      landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
      propertyName: properties.name,
    })
    .from(commissionRules)
    .leftJoin(landlords, eq(landlords.id, commissionRules.landlordId))
    .leftJoin(properties, eq(properties.id, commissionRules.propertyId))
    .where(or(eq(commissionRules.organizationId, scope.organizationId), isNull(commissionRules.organizationId)))
    .orderBy(asc(commissionRules.scope))

  const overrides = await db
    .select({
      landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
      rate: landlords.commissionRate,
    })
    .from(landlords)
    .where(sql`${landlords.organizationId} = ${scope.organizationId} and ${landlords.commissionRate} is not null`)
    .orderBy(asc(landlords.code))

  return (
    <>
      <PageHeader title="Settings" description="How this organization is configured on the platform." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Organization">
          <DetailList
            columns={3}
            items={[
              { label: 'Name', value: organization?.name ?? '—' },
              { label: 'Legal name', value: organization?.legalName ?? '—' },
              { label: 'Slug', value: <span className="font-mono">{organization?.slug}</span> },
              { label: 'KRA PIN', value: organization?.kraPin ?? '—' },
              { label: 'Status', value: organization ? <StatusBadge status={organization.status} /> : '—' },
              { label: 'Plan', value: organization ? humanise(organization.plan) : '—' },
              { label: 'Contact email', value: organization?.contactEmail ?? '—' },
              { label: 'Contact phone', value: organization?.contactPhone ?? '—' },
              { label: 'Address', value: organization?.address ?? '—' },
              { label: 'County / town', value: `${organization?.county ?? '—'} · ${organization?.town ?? '—'}` },
              { label: 'Currency', value: organization?.currency ?? 'KES' },
              { label: 'Timezone', value: organization?.timezone ?? 'Africa/Nairobi' },
              {
                label: 'Default commission',
                value: `${organization?.commissionRate ?? env.defaultCommissionRate}%`,
              },
              { label: 'Trial ends', value: organization?.trialEndsAt ? fmtDate(organization.trialEndsAt) : '—' },
              { label: 'Created', value: organization ? fmtDate(organization.createdAt) : '—' },
            ]}
          />
        </Card>

        <Card title="Platform" description="Runtime configuration this deployment is running with.">
          <DetailList
            columns={1}
            items={[
              { label: 'Platform name', value: env.platformName },
              { label: 'Default commission', value: `${env.defaultCommissionRate}%` },
              { label: 'Currency', value: env.currency },
              { label: 'Timezone', value: env.timezone },
              { label: 'Payments provider', value: `${providers.payments.name} (${providers.payments.mode})` },
              { label: 'Tax provider', value: `${providers.tax.name} (${providers.tax.mode})` },
              { label: 'Notifications', value: providers.notifications.name },
              { label: 'Session length', value: `${env.sessionTtlHours} hours` },
            ]}
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Commission rules"
          description="The most specific active rule wins: property → landlord → organization → platform default."
          padded={false}
        >
          <DataTable
            rows={rules}
            rowKey={(row) => row.rule.id}
            columns={[
              { key: 'name', header: 'Rule', render: (row) => <span className="text-sm text-ink">{row.rule.name}</span> },
              { key: 'scope', header: 'Scope', render: (row) => <StatusBadge status={row.rule.scope} tone="brand" /> },
              {
                key: 'applies',
                header: 'Applies to',
                render: (row) => (
                  <span className="text-xs text-muted">
                    {row.propertyName ?? row.landlordName ?? (row.rule.organizationId ? 'This organization' : 'Every organization')}
                  </span>
                ),
              },
              { key: 'rate', header: 'Rate', align: 'right', render: (row) => <span className="tabular-nums text-sm text-ink">{row.rule.rate}%</span> },
              { key: 'from', header: 'Effective from', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.rule.effectiveFrom)}</span> },
              { key: 'until', header: 'Until', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.rule.effectiveUntil ? fmtDate(row.rule.effectiveUntil) : 'Open'}</span> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.rule.isActive ? 'ACTIVE' : 'INACTIVE'} label={row.rule.isActive ? 'Active' : 'Inactive'} /> },
            ]}
            empty={<EmptyState title="No commission rules — the platform default applies" />}
          />

          {overrides.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="label mb-2">Inline landlord overrides</p>
              <ul className="space-y-1">
                {overrides.map((row) => (
                  <li key={row.landlordName} className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted">{row.landlordName}</span>
                    <span className="tabular-nums text-ink">{row.rate}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Notice tone="warning" title="Phase 1 scope">
          Settings are read-only on this screen. Commission rules, tax rules and organization details are stored as
          data and are editable through the API or directly in the database; a settings editor is a Phase 2 item.
        </Notice>
      </div>
    </>
  )
}
