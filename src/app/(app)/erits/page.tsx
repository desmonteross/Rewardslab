import Link from 'next/link'
import { asc, desc, eq, isNull, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  complianceExceptions,
  eritsPeriods,
  eritsProperties,
  eritsPeriodStatusEnum,
  eritsSubmissions,
  eritsSyncLogs,
  landlords,
  properties,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, ownLandlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime, periodOf, recentPeriods } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import {
  Card,
  DataTable,
  EmptyState,
  KpiCard,
  Money,
  MoneyKpi,
  Notice,
  PageHeader,
  StatusBadge,
  humanise,
} from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { getTaxProvider } from '@/server/adapters'
import {
  buildPeriodsAction,
  mapPropertyAction,
  refreshExceptionsAction,
  resolveExceptionAction,
  submitPeriodAction,
} from './actions'

export const metadata = { title: 'KRA eRITS' }
export const dynamic = 'force-dynamic'

const SEVERITY_TONE: Record<string, 'neutral' | 'warning' | 'serious' | 'negative'> = {
  LOW: 'neutral',
  MEDIUM: 'warning',
  HIGH: 'serious',
  CRITICAL: 'negative',
}

export default async function EritsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('compliance.view')
  const scope = scopeFromSession(session)
  const provider = getTaxProvider().info()

  const monthParam = one(params, 'month')
  const period = monthParam
    ? recentPeriods(new Date(), 24).find((entry) => `${entry.year}-${entry.month}` === monthParam) ?? periodOf(new Date())
    : periodOf(new Date())
  const statusFilter = one(params, 'status')

  const [mappings, unmapped, periods, exceptions, submissions, syncLogs, landlordOptions, [mappingStats]] =
    await Promise.all([
      db
        .select({
          mapping: eritsProperties,
          propertyName: properties.name,
          propertyCode: properties.code,
          landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          landlordId: landlords.id,
          income: sql<string>`(select coalesce(sum(epp.gross_rental_income), 0) from erits_period_properties epp join erits_periods ep on ep.id = epp.period_id where epp.property_id = erits_properties.property_id and ep.period_year = ${period.year} and ep.period_month = ${period.month})`,
        })
        .from(eritsProperties)
        .innerJoin(properties, eq(properties.id, eritsProperties.propertyId))
        .innerJoin(landlords, eq(landlords.id, eritsProperties.landlordId))
        .where(landlordScoped(eritsProperties, scope))
        .orderBy(asc(properties.name)),
      db
        .select({ id: properties.id, name: properties.name, code: properties.code })
        .from(properties)
        .leftJoin(eritsProperties, eq(eritsProperties.propertyId, properties.id))
        .where(landlordScoped(properties, scope, isNull(eritsProperties.id), ne(properties.status, 'ARCHIVED')))
        .orderBy(asc(properties.name)),
      db
        .select({
          period: eritsPeriods,
          landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          landlordKraPin: landlords.kraPin,
        })
        .from(eritsPeriods)
        .innerJoin(landlords, eq(landlords.id, eritsPeriods.landlordId))
        .where(
          landlordScoped(
            eritsPeriods,
            scope,
            eq(eritsPeriods.periodYear, period.year),
            eq(eritsPeriods.periodMonth, period.month),
            statusFilter ? eq(eritsPeriods.status, statusFilter as 'OPEN') : undefined,
          ),
        )
        .orderBy(desc(eritsPeriods.grossRentalIncome)),
      db
        .select()
        .from(complianceExceptions)
        .where(scoped(complianceExceptions, scope, eq(complianceExceptions.status, 'OPEN')))
        .orderBy(desc(complianceExceptions.severity), desc(complianceExceptions.createdAt))
        .limit(30),
      db
        .select({
          submission: eritsSubmissions,
          landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          periodLabel: eritsPeriods.label,
        })
        .from(eritsSubmissions)
        .innerJoin(landlords, eq(landlords.id, eritsSubmissions.landlordId))
        .innerJoin(eritsPeriods, eq(eritsPeriods.id, eritsSubmissions.periodId))
        .where(landlordScoped(eritsSubmissions, scope))
        .orderBy(desc(eritsSubmissions.submittedAt))
        .limit(10),
      db
        .select()
        .from(eritsSyncLogs)
        .where(scoped(eritsSyncLogs, scope))
        .orderBy(desc(eritsSyncLogs.createdAt))
        .limit(10),
      db
        .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
        .from(landlords)
        .where(ownLandlordScoped(landlords, scope, eq(landlords.isActive, true)))
        .orderBy(asc(landlords.code)),
      db
        .select({
          registered: sql<number>`count(*) filter (where ${eritsProperties.registrationStatus} = 'REGISTERED')::int`,
          pending: sql<number>`count(*) filter (where ${eritsProperties.registrationStatus} in ('PENDING','NOT_REGISTERED'))::int`,
          attention: sql<number>`count(*) filter (where ${eritsProperties.registrationStatus} in ('REQUIRES_ATTENTION','SYNC_FAILED'))::int`,
        })
        .from(eritsProperties)
        .where(landlordScoped(eritsProperties, scope)),
    ])

  const grossIncome = periods.reduce((sum, row) => sum + cents(row.period.grossRentalIncome), 0)
  const taxAmount = periods.reduce((sum, row) => sum + cents(row.period.taxAmount), 0)
  const pendingReturns = periods.filter((row) => row.period.status !== 'SUBMITTED' && row.period.status !== 'ACCEPTED').length
  const submittedReturns = periods.filter((row) => row.period.status === 'SUBMITTED' || row.period.status === 'ACCEPTED').length
  const syncErrors = syncLogs.filter((log) => log.status === 'FAILED').length

  const canManage = can(session, 'compliance.manage')
  const canSubmit = can(session, 'compliance.submit')

  return (
    <>
      <PageHeader
        title="KRA eRITS"
        description="Electronic Rental Income Tax System — property mapping, monthly aggregation, review and filing."
        actions={
          <Link href="/tax-records" className="btn-secondary">
            Tax rules
          </Link>
        }
      />

      <div className="mb-4">
        <Notice tone="brand" title={`${provider.name} — ${provider.mode} mode`}>
          {provider.notice ??
            'Connected through the configured tax provider adapter.'}{' '}
          Rental income below is aggregated from payments that were actually received and reconciled, never from
          invoices raised.
        </Notice>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Registered properties" value={String(mappingStats?.registered ?? 0)} tone="positive" />
        <KpiCard label="Pending registration" value={String((mappingStats?.pending ?? 0) + unmapped.length)} tone={unmapped.length > 0 ? 'warning' : 'neutral'} />
        <MoneyKpi label="Gross rental income" amount={grossIncome / 100} sub={period.label} />
        <MoneyKpi label="Tax reporting amount" amount={taxAmount / 100} tone="brand" />
        <KpiCard label="Pending returns" value={String(pendingReturns)} tone={pendingReturns > 0 ? 'warning' : 'positive'} />
        <KpiCard label="Submitted returns" value={String(submittedReturns)} tone="positive" />
        <KpiCard label="Compliance issues" value={String(exceptions.length)} tone={exceptions.length > 0 ? 'negative' : 'positive'} />
        <KpiCard label="Sync errors" value={String(syncErrors)} tone={syncErrors > 0 ? 'negative' : 'positive'} />
      </div>

      {(canManage || canSubmit) && (
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {canManage && (
            <>
              <Card title="Map a property to eRITS" description="Registers the property against its landlord’s KRA PIN.">
                <ActionForm action={mapPropertyAction} label="Map property" pendingLabel="Mapping…">
                  <label className="block text-xs font-medium text-muted">
                    Property
                    <select name="propertyId" className="field mt-1" defaultValue="">
                      <option value="">Choose a property…</option>
                      {unmapped.map((property) => (
                        <option key={property.id} value={property.id}>
                          {property.name} ({property.code}) — unmapped
                        </option>
                      ))}
                      {mappings.map((row) => (
                        <option key={row.mapping.propertyId} value={row.mapping.propertyId}>
                          {row.propertyName} — re-sync
                        </option>
                      ))}
                    </select>
                  </label>
                </ActionForm>
              </Card>

              <Card title="Aggregate the period" description="Rebuilds each landlord’s rental income for the month.">
                <ActionForm action={buildPeriodsAction} label="Aggregate" pendingLabel="Aggregating…">
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-xs font-medium text-muted">
                      Month
                      <select name="month" className="field mt-1" defaultValue={String(period.month)}>
                        {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => (
                          <option key={month} value={month}>
                            {new Date(2000, month - 1, 1).toLocaleString('en', { month: 'long' })}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-xs font-medium text-muted">
                      Year
                      <input name="year" type="number" className="field mt-1" defaultValue={period.year} />
                    </label>
                  </div>
                  <label className="block text-xs font-medium text-muted">
                    Landlord (optional)
                    <select name="landlordId" className="field mt-1" defaultValue="">
                      <option value="">Every landlord</option>
                      {landlordOptions.map((landlord) => (
                        <option key={landlord.id} value={landlord.id}>
                          {landlord.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </ActionForm>
              </Card>

              <Card title="Run compliance checks" description="Detects problems before anything is reported.">
                <ActionForm action={refreshExceptionsAction} label="Run checks" variant="secondary" pendingLabel="Checking…" />
              </Card>
            </>
          )}
        </div>
      )}

      <div className="mt-6">
        <FilterBar
          showSearch={false}
          selects={[
            {
              name: 'month',
              label: 'This month',
              options: recentPeriods(new Date(), 12)
                .reverse()
                .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
            },
            { name: 'status', label: 'All statuses', options: eritsPeriodStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          ]}
        />

        <Card
          title={`Tax periods · ${period.label}`}
          description="One row per landlord. A period is only ready once every payment in it is reconciled and no compliance issues remain."
          padded={false}
        >
          <DataTable
            rows={periods}
            rowKey={(row) => row.period.id}
            rowHref={(row) => `/erits/${row.period.id}`}
            columns={[
              {
                key: 'landlord',
                header: 'Landlord',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.landlordName}</p>
                    <p className="truncate font-mono text-2xs text-faint">
                      {row.landlordKraPin ?? 'KRA PIN missing'}
                    </p>
                  </div>
                ),
              },
              { key: 'properties', header: 'Properties', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.period.propertyCount}</span> },
              { key: 'payments', header: 'Payments', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.period.paymentCount}</span> },
              { key: 'gross', header: 'Gross rent', align: 'right', render: (row) => <Money value={row.period.grossRentalIncome} /> },
              { key: 'rule', header: 'Rule', hideOnMobile: true, render: (row) => <span className="text-2xs text-muted">{row.period.taxRuleName ?? '—'}</span> },
              { key: 'rate', header: 'Rate', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.period.taxRate}%</span> },
              { key: 'tax', header: 'Tax', align: 'right', render: (row) => <Money value={row.period.taxAmount} muted /> },
              {
                key: 'issues',
                header: 'Issues',
                align: 'right',
                hideOnMobile: true,
                render: (row) =>
                  row.period.unreconciledCount + row.period.exceptionCount > 0 ? (
                    <span className="text-xs text-negative">
                      {row.period.unreconciledCount} unreconciled · {row.period.exceptionCount} open
                    </span>
                  ) : (
                    <span className="text-xs text-positive">Clear</span>
                  ),
              },
              { key: 'status', header: 'eRITS status', align: 'right', render: (row) => <StatusBadge status={row.period.status} /> },
            ]}
            empty={
              <EmptyState
                title={`No periods built for ${period.label}`}
                description="Aggregate the period to pull confirmed rent into the compliance engine."
              />
            }
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card
          title="Compliance exceptions"
          description="Problems that would block or distort a return."
          padded={false}
        >
          {exceptions.length === 0 ? (
            <EmptyState title="No open issues" description="Every property is mapped and every payment reconciled." />
          ) : (
            <ul className="divide-y divide-line">
              {exceptions.map((exception) => (
                <li key={exception.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={exception.severity} tone={SEVERITY_TONE[exception.severity]} />
                        <p className="text-sm font-medium text-ink">{exception.title}</p>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted">{exception.detail}</p>
                      <p className="mt-1.5 text-2xs text-faint">
                        Action: {exception.recommendedAction} · {exception.entityType} · {fmtDate(exception.createdAt)}
                      </p>
                    </div>
                    {canManage && (
                      <ActionForm
                        action={resolveExceptionAction}
                        label="Resolve"
                        variant="secondary"
                        buttonClassName="px-2 py-1 text-xs"
                        className="space-y-0"
                      >
                        <input type="hidden" name="exceptionId" value={exception.id} />
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Recent submissions" padded={false}>
            <DataTable
              dense
              rows={submissions}
              rowKey={(row) => row.submission.id}
              columns={[
                { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.submission.reference}</span> },
                { key: 'landlord', header: 'Landlord', render: (row) => <span className="text-sm">{row.landlordName}</span> },
                { key: 'period', header: 'Period', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.periodLabel}</span> },
                { key: 'mode', header: 'Mode', hideOnMobile: true, render: (row) => <StatusBadge status={row.submission.mode} /> },
                { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.submission.status} /> },
              ]}
              empty={<EmptyState title="Nothing submitted yet" />}
            />
          </Card>

          <Card title="Synchronisation log" padded={false}>
            <DataTable
              dense
              rows={syncLogs}
              rowKey={(row) => row.id}
              columns={[
                { key: 'operation', header: 'Operation', render: (row) => <span className="text-sm">{row.operation}</span> },
                { key: 'when', header: 'When', render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.createdAt)}</span> },
                { key: 'duration', header: 'Duration', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-xs text-muted">{row.durationMs} ms</span> },
                { key: 'status', header: 'Result', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
              ]}
              empty={<EmptyState title="No synchronisation attempts yet" />}
            />
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card
          title="Property mapping"
          description="PMS property ↔ landlord ↔ KRA PIN ↔ eRITS property reference."
          padded={false}
        >
          <DataTable
            rows={mappings}
            rowKey={(row) => row.mapping.id}
            rowHref={(row) => `/properties/${row.mapping.propertyId}?tab=tax`}
            columns={[
              {
                key: 'property',
                header: 'Property',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.propertyName}</p>
                    <p className="truncate text-2xs text-faint">{row.propertyCode} · {humanise(row.mapping.propertyType)}</p>
                  </div>
                ),
              },
              { key: 'landlord', header: 'Landlord', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.landlordName}</span> },
              { key: 'kra', header: 'KRA PIN', render: (row) => (row.mapping.kraPin ? <span className="font-mono text-xs text-muted">{row.mapping.kraPin}</span> : <span className="text-xs text-negative">Missing</span>) },
              { key: 'ref', header: 'eRITS reference', render: (row) => (row.mapping.eritsPropertyRef ? <span className="font-mono text-xs text-muted">{row.mapping.eritsPropertyRef}</span> : <span className="text-xs text-warning">Not issued</span>) },
              { key: 'units', header: 'Units', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.mapping.unitCount}</span> },
              { key: 'income', header: `Gross rent ${period.label.split(' ')[0]}`, align: 'right', render: (row) => <Money value={row.income} /> },
              { key: 'sync', header: 'Last sync', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.mapping.lastSyncedAt ? fmtDate(row.mapping.lastSyncedAt) : 'Never'}</span> },
              { key: 'status', header: 'eRITS status', align: 'right', render: (row) => <StatusBadge status={row.mapping.registrationStatus} /> },
            ]}
            empty={<EmptyState title="No properties mapped yet" />}
          />

          {unmapped.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="text-xs font-medium text-warning">
                {unmapped.length} properties are not mapped: {unmapped.map((row) => row.name).join(', ')}.
              </p>
            </div>
          )}
        </Card>
      </div>

      {canSubmit && periods.some((row) => row.period.status === 'READY_FOR_REVIEW') && (
        <div className="mt-4">
          <Card title="Prepare submissions" description="Only periods with no unreconciled payments and no open exceptions can be filed.">
            <div className="space-y-3">
              {periods
                .filter((row) => row.period.status === 'READY_FOR_REVIEW')
                .map((row) => (
                  <div key={row.period.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{row.landlordName}</p>
                      <p className="text-xs text-muted">
                        {row.period.label} · {formatKES(row.period.grossRentalIncome)} gross ·{' '}
                        {formatKES(row.period.taxAmount)} tax at {row.period.taxRate}%
                      </p>
                    </div>
                    <ActionForm
                      action={submitPeriodAction}
                      label="Submit (simulated)"
                      pendingLabel="Submitting…"
                      className="space-y-0"
                      confirm="Record a SIMULATED eRITS submission? Nothing is transmitted to KRA."
                    >
                      <input type="hidden" name="periodId" value={row.period.id} />
                    </ActionForm>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
