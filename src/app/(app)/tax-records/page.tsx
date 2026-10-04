import Link from 'next/link'
import { asc, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { eritsPeriods, landlords, taxProfiles, taxRules } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, ownLandlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { formatKES } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { Card, DataTable, EmptyState, KpiCard, Money, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'

export const metadata = { title: 'Tax records' }
export const dynamic = 'force-dynamic'

export default async function TaxRecordsPage() {
  const session = await requirePermission('compliance.view')
  const scope = scopeFromSession(session)

  const [rules, profiles, periodTotals] = await Promise.all([
    db
      .select()
      .from(taxRules)
      .where(or(eq(taxRules.organizationId, scope.organizationId), isNull(taxRules.organizationId)))
      .orderBy(desc(taxRules.isActive), asc(taxRules.thresholdMin)),
    db
      .select({
        profile: taxProfiles,
        landlordId: landlords.id,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
        eritsStatus: landlords.eritsStatus,
        properties: sql<number>`(select count(*)::int from properties p where p.landlord_id = landlords.id)`,
      })
      .from(taxProfiles)
      .innerJoin(landlords, eq(landlords.id, taxProfiles.landlordId))
      .where(ownLandlordScoped(landlords, scope))
      .orderBy(asc(landlords.code)),
    db
      .select({
        periods: sql<number>`count(*)::int`,
        gross: sql<string>`coalesce(sum(${eritsPeriods.grossRentalIncome}), 0)`,
        tax: sql<string>`coalesce(sum(${eritsPeriods.taxAmount}), 0)`,
        submitted: sql<number>`count(*) filter (where ${eritsPeriods.status} in ('SUBMITTED','ACCEPTED'))::int`,
      })
      .from(eritsPeriods)
      .where(landlordScoped(eritsPeriods, scope))
      .then((rows) => rows[0]),
  ])

  const activeRules = rules.filter((rule) => rule.isActive)

  return (
    <>
      <PageHeader
        title="Tax records"
        description="Configurable tax rules and the taxpayer profiles they are applied to."
        actions={
          <Link href="/erits" className="btn-secondary">
            eRITS dashboard
          </Link>
        }
      />

      <div className="mb-4">
        <Notice tone="warning" title="Tax rates are configuration, not code">
          Rates, bands and effective dates live in the database so they can be changed when legislation changes,
          without a deployment. The rules seeded here are a sample configuration — confirm the current rate,
          thresholds and filing channel with KRA before relying on them for a real return.
        </Notice>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Active rules" value={String(activeRules.length)} />
        <KpiCard label="Taxpayer profiles" value={String(profiles.length)} />
        <KpiCard label="Periods aggregated" value={String(periodTotals?.periods ?? 0)} sub={`${periodTotals?.submitted ?? 0} submitted`} />
        <KpiCard label="Rental income reported" value={formatKES(periodTotals?.gross ?? 0)} sub={`${formatKES(periodTotals?.tax ?? 0)} tax`} />
      </div>

      <Card
        title="Tax rules"
        description="The most specific applicable rule wins; where specificity ties, the most recently effective rule is used."
        padded={false}
      >
        <DataTable
          rows={rules}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Rule',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <p className="truncate font-mono text-2xs text-faint">{row.code}</p>
                </div>
              ),
            },
            { key: 'rate', header: 'Rate', align: 'right', render: (row) => <span className="tabular-nums text-sm text-ink">{row.rate}%</span> },
            {
              key: 'band',
              header: 'Annual income band',
              render: (row) => (
                <span className="text-xs text-muted">
                  {row.thresholdMin ? formatKES(row.thresholdMin) : 'No minimum'} —{' '}
                  {row.thresholdMax ? formatKES(row.thresholdMax) : 'no maximum'}
                </span>
              ),
            },
            { key: 'taxpayer', header: 'Taxpayer', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.taxpayerType)}</span> },
            { key: 'propertyType', header: 'Property type', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.propertyType ? humanise(row.propertyType) : 'Any'}</span> },
            { key: 'from', header: 'Effective from', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.effectiveFrom)}</span> },
            { key: 'until', header: 'Until', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.effectiveUntil ? fmtDate(row.effectiveUntil) : 'Open'}</span> },
            { key: 'scope', header: 'Scope', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.organizationId ? 'This organization' : 'Platform default'}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'INACTIVE'} label={row.isActive ? 'Active' : 'Inactive'} /> },
          ]}
          empty={<EmptyState title="No tax rules configured" />}
        />
        <div className="border-t border-line px-5 py-4">
          <p className="label mb-2">Sources and notes</p>
          <ul className="space-y-1.5">
            {rules.map((rule) => (
              <li key={rule.id} className="text-xs leading-relaxed text-muted">
                <span className="font-mono text-2xs text-faint">{rule.code}</span> — {rule.notes ?? '—'}
                {rule.source && <span className="text-faint"> ({rule.source})</span>}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="mt-4">
        <Card title="Taxpayer profiles" description="Each landlord’s KRA registration and rental income obligation." padded={false}>
          <DataTable
            rows={profiles}
            rowKey={(row) => row.profile.id}
            rowHref={(row) => `/landlords/${row.landlordId}`}
            columns={[
              { key: 'landlord', header: 'Landlord', render: (row) => <span className="text-sm font-medium text-ink">{row.landlordName}</span> },
              { key: 'kra', header: 'KRA PIN', render: (row) => (row.profile.kraPin ? <span className="font-mono text-xs text-muted">{row.profile.kraPin}</span> : <span className="text-xs text-negative">Missing</span>) },
              { key: 'type', header: 'Taxpayer type', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.profile.taxpayerType)}</span> },
              { key: 'obligation', header: 'Obligation', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.profile.taxObligation}</span> },
              { key: 'properties', header: 'Properties', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.properties}</span> },
              { key: 'registered', header: 'Registered', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.profile.registrationDate ? fmtDate(row.profile.registrationDate) : '—'}</span> },
              { key: 'ref', header: 'eRITS reference', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-muted">{row.profile.eritsTaxpayerRef ?? '—'}</span> },
              { key: 'status', header: 'eRITS status', align: 'right', render: (row) => <StatusBadge status={row.eritsStatus} /> },
            ]}
            empty={<EmptyState title="No taxpayer profiles yet" />}
          />
        </Card>
      </div>
    </>
  )
}
