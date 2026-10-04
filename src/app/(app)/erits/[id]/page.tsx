import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  complianceExceptions,
  eritsPeriodProperties,
  eritsPeriods,
  eritsProperties,
  eritsSubmissions,
  landlords,
  payments,
  properties,
  tenants,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime, periodFrom } from '@/lib/dates'
import {
  Card,
  DataTable,
  DetailList,
  EmptyState,
  KpiCard,
  Money,
  MoneyKpi,
  Notice,
  PageHeader,
  StatusBadge,
  humanise,
} from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { PrintButton } from '@/components/print-button'
import { submitPeriodAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function EritsPeriodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('compliance.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      period: eritsPeriods,
      landlordId: landlords.id,
      landlordName: landlords.fullName,
      landlordCompany: landlords.companyName,
      landlordKraPin: landlords.kraPin,
      taxpayerType: landlords.taxpayerType,
      eritsTaxpayerRef: landlords.eritsTaxpayerRef,
    })
    .from(eritsPeriods)
    .innerJoin(landlords, eq(landlords.id, eritsPeriods.landlordId))
    .where(landlordScoped(eritsPeriods, scope, eq(eritsPeriods.id, id)))
    .limit(1)

  if (!record) notFound()
  const { period } = record
  const window = periodFrom(period.periodYear, period.periodMonth)

  const [breakdown, transactions, unreconciled, exceptions, submissions] = await Promise.all([
    db
      .select({
        row: eritsPeriodProperties,
        propertyName: properties.name,
        propertyCode: properties.code,
        propertyId: properties.id,
        eritsRef: eritsProperties.eritsPropertyRef,
      })
      .from(eritsPeriodProperties)
      .innerJoin(properties, eq(properties.id, eritsPeriodProperties.propertyId))
      .leftJoin(eritsProperties, eq(eritsProperties.propertyId, eritsPeriodProperties.propertyId))
      .where(scoped(eritsPeriodProperties, scope, eq(eritsPeriodProperties.periodId, id)))
      .orderBy(desc(eritsPeriodProperties.grossRentalIncome)),
    db
      .select({
        payment: payments,
        tenantName: tenants.fullName,
        propertyName: properties.name,
      })
      .from(payments)
      .leftJoin(tenants, eq(tenants.id, payments.tenantId))
      .leftJoin(properties, eq(properties.id, payments.propertyId))
      .where(
        scoped(
          payments,
          scope,
          eq(payments.landlordId, record.landlordId),
          eq(payments.status, 'CONFIRMED'),
          sql`${payments.paidAt} >= ${window.start}`,
          sql`${payments.paidAt} <= ${window.end}`,
        ),
      )
      .orderBy(desc(payments.paidAt))
      .limit(200),
    db
      .select({ payment: payments })
      .from(payments)
      .where(
        scoped(
          payments,
          scope,
          eq(payments.status, 'UNMATCHED'),
          sql`${payments.paidAt} >= ${window.start}`,
          sql`${payments.paidAt} <= ${window.end}`,
        ),
      )
      .orderBy(desc(payments.paidAt)),
    db
      .select()
      .from(complianceExceptions)
      .where(
        scoped(
          complianceExceptions,
          scope,
          eq(complianceExceptions.landlordId, record.landlordId),
          eq(complianceExceptions.status, 'OPEN'),
        ),
      )
      .orderBy(desc(complianceExceptions.severity)),
    db
      .select()
      .from(eritsSubmissions)
      .where(scoped(eritsSubmissions, scope, eq(eritsSubmissions.periodId, id)))
      .orderBy(desc(eritsSubmissions.submittedAt)),
  ])

  const displayName = record.landlordCompany ?? record.landlordName
  const canSubmit = can(session, 'compliance.submit')
  const ready = period.status === 'READY_FOR_REVIEW'

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[{ label: 'KRA eRITS', href: '/erits' }, { label: `${displayName} · ${period.label}` }]}
          title={`${period.label}`}
          description={`${displayName} · ${record.landlordKraPin ?? 'KRA PIN missing'} · ${humanise(record.taxpayerType)} taxpayer`}
          actions={
            <>
              <Link href={`/landlords/${record.landlordId}`} className="btn-secondary">
                Landlord
              </Link>
              <PrintButton label="Print" />
            </>
          }
        />
      </div>

      {submissions.length > 0 && (
        <div className="mb-4">
          <Notice tone="brand" title="SIMULATED eRITS SUBMISSION">
            This period was recorded as a simulated filing ({submissions[0].reference}) on{' '}
            {fmtDateTime(submissions[0].submittedAt)}. Nothing was transmitted to KRA — Phase 1 runs against a
            mock provider.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Properties" value={String(period.propertyCount)} />
        <KpiCard label="Payments" value={String(period.paymentCount)} />
        <MoneyKpi label="Gross rental income" amount={period.grossRentalIncome} />
        <MoneyKpi label="Taxable amount" amount={period.taxableAmount} />
        <MoneyKpi label="Tax at rate" amount={period.taxAmount} tone="brand" sub={`${period.taxRate}% · ${period.taxRuleName ?? 'no rule matched'}`} />
        <KpiCard
          label="Exceptions"
          value={String(period.unreconciledCount + period.exceptionCount)}
          tone={period.unreconciledCount + period.exceptionCount > 0 ? 'negative' : 'positive'}
          sub={`${period.unreconciledCount} unreconciled`}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Return summary">
          <DetailList
            columns={3}
            items={[
              { label: 'Taxpayer', value: displayName },
              { label: 'KRA PIN', value: record.landlordKraPin ?? <span className="text-negative">Missing</span> },
              { label: 'eRITS taxpayer reference', value: record.eritsTaxpayerRef ?? '—' },
              { label: 'Tax period', value: period.label },
              { label: 'Gross rental income', value: formatKES(period.grossRentalIncome) },
              { label: 'Allowable deductions', value: formatKES(period.allowableDeductions) },
              { label: 'Taxable amount', value: formatKES(period.taxableAmount) },
              { label: 'Rule applied', value: period.taxRuleName ?? 'No rule matched' },
              { label: 'Rate', value: `${period.taxRate}%` },
              { label: 'Tax payable', value: formatKES(period.taxAmount) },
              { label: 'Status', value: <StatusBadge status={period.status} /> },
              { label: 'Prepared by', value: period.preparedByName ?? '—' },
            ]}
          />
        </Card>

        <div className="space-y-4 no-print">
          {canSubmit && (
            <Card
              title="Prepare submission"
              description={ready ? 'This period is ready for review.' : 'Resolve the exceptions below before filing.'}
            >
              {ready ? (
                <ActionForm
                  action={submitPeriodAction}
                  label="Submit (simulated)"
                  pendingLabel="Submitting…"
                  confirm="Record a SIMULATED eRITS submission? Nothing is transmitted to KRA."
                >
                  <input type="hidden" name="periodId" value={id} />
                  <p className="text-2xs leading-relaxed text-faint">
                    The payload is stored exactly as it would be transmitted, and the result is stamped
                    SIMULATED so it can never be mistaken for a real filing.
                  </p>
                </ActionForm>
              ) : (
                <p className="text-sm leading-relaxed text-muted">
                  {period.unreconciledCount > 0 &&
                    `${period.unreconciledCount} payments in this window are still unreconciled. `}
                  {period.exceptionCount > 0 && `${period.exceptionCount} compliance issues are open. `}
                  {!record.landlordKraPin && 'The landlord has no KRA PIN on file. '}
                  Fix these and aggregate the period again.
                </p>
              )}
            </Card>
          )}

          <Card title="Exceptions to resolve" padded={false}>
            {exceptions.length === 0 && unreconciled.length === 0 ? (
              <EmptyState title="Nothing blocking" description="This period is clean." />
            ) : (
              <ul className="divide-y divide-line">
                {unreconciled.map((row) => (
                  <li key={row.payment.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-ink">Unreconciled payment</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {row.payment.reference} · {formatKES(row.payment.grossAmount)} · ref “
                      {row.payment.accountReference || '—'}”
                    </p>
                    <Link href={`/payments/${row.payment.id}`} className="mt-1 inline-block text-xs text-brand hover:underline">
                      Reconcile it
                    </Link>
                  </li>
                ))}
                {exceptions.map((exception) => (
                  <li key={exception.id} className="px-4 py-3">
                    <p className="text-sm font-medium text-ink">{exception.title}</p>
                    <p className="mt-0.5 text-xs text-muted">{exception.detail}</p>
                    <p className="mt-1 text-2xs text-faint">{exception.recommendedAction}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <div className="mt-4">
        <Card title="Rental income by property" padded={false}>
          <DataTable
            rows={breakdown}
            rowKey={(row) => row.row.id}
            rowHref={(row) => `/properties/${row.propertyId}?tab=tax`}
            columns={[
              {
                key: 'property',
                header: 'Property',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.propertyName}</p>
                    <p className="truncate text-2xs text-faint">{row.propertyCode}</p>
                  </div>
                ),
              },
              {
                key: 'ref',
                header: 'eRITS reference',
                render: (row) =>
                  row.eritsRef ? (
                    <span className="font-mono text-xs text-muted">{row.eritsRef}</span>
                  ) : (
                    <span className="text-xs text-warning">Not issued</span>
                  ),
              },
              { key: 'payments', header: 'Payments', align: 'right', render: (row) => <span className="tabular-nums text-sm text-muted">{row.row.paymentCount}</span> },
              { key: 'income', header: 'Gross rental income', align: 'right', render: (row) => <Money value={row.row.grossRentalIncome} /> },
            ]}
            empty={<EmptyState title="No rental income recorded for this period" />}
            footer={
              <tr className="text-sm font-medium">
                <td className="px-4 py-2.5 text-ink">Total</td>
                <td />
                <td className="px-4 py-2.5 text-right tabular-nums text-ink">{period.paymentCount}</td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={period.grossRentalIncome} />
                </td>
              </tr>
            }
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Transactions in this period"
          description="Every confirmed receipt that makes up the reported income."
          padded={false}
        >
          <DataTable
            dense
            rows={transactions}
            rowKey={(row) => row.payment.id}
            rowHref={(row) => `/payments/${row.payment.id}`}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.payment.reference}</span> },
              { key: 'external', header: 'M-Pesa ref', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-muted">{row.payment.externalReference ?? '—'}</span> },
              { key: 'tenant', header: 'Tenant', render: (row) => <span className="text-sm">{row.tenantName ?? '—'}</span> },
              { key: 'property', header: 'Property', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.propertyName ?? '—'}</span> },
              { key: 'paid', header: 'Paid', render: (row) => <span className="text-xs text-muted">{fmtDate(row.payment.paidAt)}</span> },
              { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.payment.grossAmount} /> },
            ]}
            empty={<EmptyState title="No transactions in this window" />}
            footer={
              <tr className="text-sm font-medium">
                <td className="px-4 py-2.5 text-ink" colSpan={5}>
                  Total received
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Money value={transactions.reduce((sum, row) => sum + cents(row.payment.grossAmount), 0) / 100} />
                </td>
              </tr>
            }
          />
        </Card>
      </div>

      {submissions.length > 0 && (
        <div className="mt-4">
          <Card title="Submission history" padded={false}>
            <DataTable
              dense
              rows={submissions}
              rowKey={(row) => row.id}
              columns={[
                { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
                { key: 'mode', header: 'Mode', render: (row) => <StatusBadge status={row.mode} /> },
                { key: 'submitted', header: 'Submitted', render: (row) => <span className="text-xs text-muted">{fmtDateTime(row.submittedAt)}</span> },
                { key: 'ack', header: 'Acknowledgement', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-muted">{row.acknowledgementRef ?? '—'}</span> },
                { key: 'by', header: 'By', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.submittedByName ?? '—'}</span> },
                { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
              ]}
              empty={<EmptyState title="No submissions" />}
            />
            <div className="border-t border-line px-5 py-3">
              <p className="text-2xs leading-relaxed text-faint">
                {submissions[0].responseMessage}
              </p>
            </div>
          </Card>
        </div>
      )}
    </>
  )
}
