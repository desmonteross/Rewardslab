import Link from 'next/link'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  commissions,
  expenses,
  landlords,
  organizations,
  payments,
  properties,
  rentInvoices,
  settlementItems,
  settlements,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { ownLandlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, formatKES, percent, formatPercent } from '@/lib/money'
import { fmtDate, periodFrom, periodOf, recentPeriods } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: 'Landlord statement' }
export const dynamic = 'force-dynamic'

export default async function LandlordStatementPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('reports.view')
  const scope = scopeFromSession(session)

  const monthParam = one(params, 'month')
  const period = monthParam
    ? periodFrom(Number(monthParam.split('-')[0]), Number(monthParam.split('-')[1]))
    : periodOf(new Date())

  const landlordOptions = await db
    .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
    .from(landlords)
    .where(ownLandlordScoped(landlords, scope, eq(landlords.isActive, true)))
    .orderBy(asc(landlords.code))

  const landlordId = one(params, 'landlord') ?? scope.landlordId ?? landlordOptions[0]?.id

  const filters = (
    <FilterBar
      showSearch={false}
      selects={[
        { name: 'landlord', label: 'Choose a landlord', options: landlordOptions.map((row) => ({ value: row.id, label: row.name })) },
        {
          name: 'month',
          label: 'This month',
          options: recentPeriods(new Date(), 18)
            .reverse()
            .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
        },
      ]}
    />
  )

  if (!landlordId) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Reports', href: '/reports' }]} title="Landlord statement" />
        {filters}
        <Card>
          <EmptyState title="No landlords available" />
        </Card>
      </>
    )
  }

  const [landlord] = await db
    .select()
    .from(landlords)
    .where(ownLandlordScoped(landlords, scope, eq(landlords.id, landlordId)))
    .limit(1)

  if (!landlord) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Reports', href: '/reports' }]} title="Landlord statement" />
        {filters}
        <Card>
          <EmptyState title="That landlord is not in your organization" />
        </Card>
      </>
    )
  }

  const [organization] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.id, scope.organizationId))
    .limit(1)

  const [byProperty, paymentRows, expenseRows, settlementRows, [outstanding]] = await Promise.all([
    db
      .select({
        propertyId: properties.id,
        property: properties.name,
        collected: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.property_id = properties.id and p.status = 'CONFIRMED' and p.paid_at >= ${period.start} and p.paid_at <= ${period.end})`,
        commission: sql<string>`(select coalesce(sum(c.commission_amount), 0) from commissions c join payments p on p.id = c.payment_id where c.property_id = properties.id and p.status = 'CONFIRMED' and p.paid_at >= ${period.start} and p.paid_at <= ${period.end})`,
        expenses: sql<string>`(select coalesce(sum(e.amount), 0) from expenses e where e.property_id = properties.id and e.approval_status = 'APPROVED' and e.expense_date >= ${period.start} and e.expense_date <= ${period.end})`,
        arrears: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.property_id = properties.id and i.status <> 'CANCELLED')`,
      })
      .from(properties)
      .where(scoped(properties, scope, eq(properties.landlordId, landlordId)))
      .orderBy(asc(properties.name)),
    db
      .select({
        payment: payments,
        property: properties.name,
        commission: commissions.commissionAmount,
      })
      .from(payments)
      .leftJoin(properties, eq(properties.id, payments.propertyId))
      .leftJoin(commissions, eq(commissions.paymentId, payments.id))
      .where(
        scoped(
          payments,
          scope,
          eq(payments.landlordId, landlordId),
          eq(payments.status, 'CONFIRMED'),
          sql`${payments.paidAt} >= ${period.start}`,
          sql`${payments.paidAt} <= ${period.end}`,
        ),
      )
      .orderBy(asc(payments.paidAt)),
    db
      .select({ expense: expenses, property: properties.name })
      .from(expenses)
      .innerJoin(properties, eq(properties.id, expenses.propertyId))
      .where(
        scoped(
          expenses,
          scope,
          eq(expenses.landlordId, landlordId),
          eq(expenses.approvalStatus, 'APPROVED'),
          sql`${expenses.expenseDate} >= ${period.start}`,
          sql`${expenses.expenseDate} <= ${period.end}`,
        ),
      )
      .orderBy(asc(expenses.expenseDate)),
    db
      .select()
      .from(settlements)
      .where(
        scoped(
          settlements,
          scope,
          eq(settlements.landlordId, landlordId),
          sql`${settlements.periodEnd} >= ${period.start}`,
          sql`${settlements.periodStart} <= ${period.end}`,
        ),
      )
      .orderBy(asc(settlements.periodStart)),
    db
      .select({ balance: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)` })
      .from(rentInvoices)
      .where(scoped(rentInvoices, scope, eq(rentInvoices.landlordId, landlordId))),
  ])

  const grossCents = paymentRows.reduce((sum, row) => sum + cents(row.payment.grossAmount), 0)
  const commissionCents = paymentRows.reduce((sum, row) => sum + cents(row.commission), 0)
  const expenseCents = expenseRows.reduce((sum, row) => sum + cents(row.expense.amount), 0)
  const managementFeeCents = settlementRows.reduce((sum, row) => sum + cents(row.managementFee), 0)
  const adjustmentCents = settlementRows.reduce((sum, row) => sum + cents(row.adjustmentAmount), 0)
  const netCents = grossCents - commissionCents - managementFeeCents - expenseCents + adjustmentCents
  const settledCents = settlementRows
    .filter((row) => row.status === 'SETTLED')
    .reduce((sum, row) => sum + cents(row.netAmount), 0)

  const displayName = landlord.companyName ?? landlord.fullName

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[{ label: 'Reports', href: '/reports' }, { label: 'Landlord statement' }]}
          title="Landlord statement"
          description={`${displayName} · ${period.label}`}
          actions={
            <>
              <Link href={`/landlords/${landlordId}`} className="btn-secondary">
                Landlord
              </Link>
              <PrintButton label="Print / PDF" />
            </>
          }
        />
        {filters}
      </div>

      <div className="card p-8 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="text-lg font-semibold text-ink">{organization?.name}</p>
            {organization?.address && <p className="mt-1 text-xs text-muted">{organization.address}</p>}
            <p className="mt-0.5 text-xs text-muted">
              {[organization?.contactPhone, organization?.contactEmail].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Owner statement</p>
            <p className="mt-1 text-lg font-semibold text-ink">{displayName}</p>
            <p className="text-xs text-muted">{period.label}</p>
            {landlord.kraPin && <p className="mt-0.5 text-xs text-muted">KRA PIN {landlord.kraPin}</p>}
          </div>
        </header>

        <table className="mt-6 w-full text-sm">
          <tbody>
            <tr>
              <td className="py-2 text-muted">Gross rent collected</td>
              <td className="py-2 text-right tabular-nums text-ink">{formatKES(grossCents / 100)}</td>
            </tr>
            <tr>
              <td className="py-2 text-muted">Less platform commission</td>
              <td className="py-2 text-right tabular-nums text-ink">({formatKES(commissionCents / 100)})</td>
            </tr>
            {managementFeeCents > 0 && (
              <tr>
                <td className="py-2 text-muted">Less management fee</td>
                <td className="py-2 text-right tabular-nums text-ink">({formatKES(managementFeeCents / 100)})</td>
              </tr>
            )}
            <tr>
              <td className="py-2 text-muted">Less approved expenses</td>
              <td className="py-2 text-right tabular-nums text-ink">({formatKES(expenseCents / 100)})</td>
            </tr>
            <tr>
              <td className="py-2 text-muted">Adjustments</td>
              <td className="py-2 text-right tabular-nums text-ink">{formatKES(adjustmentCents / 100)}</td>
            </tr>
            <tr className="border-t border-line">
              <td className="py-3 text-base font-medium text-ink">Net payable</td>
              <td className="py-3 text-right text-xl font-semibold tabular-nums text-ink">
                {formatKES(netCents / 100)}
              </td>
            </tr>
            <tr>
              <td className="py-2 text-xs text-faint">Already settled in this period</td>
              <td className="py-2 text-right text-xs tabular-nums text-faint">{formatKES(settledCents / 100)}</td>
            </tr>
          </tbody>
        </table>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">Properties</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="py-2">Property</th>
                <th className="py-2 text-right">Collected</th>
                <th className="py-2 text-right">Commission</th>
                <th className="py-2 text-right">Expenses</th>
                <th className="py-2 text-right">Outstanding rent</th>
              </tr>
            </thead>
            <tbody>
              {byProperty.map((row) => (
                <tr key={row.propertyId} className="border-b border-line/70 last:border-0">
                  <td className="py-2 text-ink">{row.property}</td>
                  <td className="py-2 text-right tabular-nums text-ink">{formatKES(row.collected)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{formatKES(row.commission)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{formatKES(row.expenses)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{formatKES(row.arrears)}</td>
                </tr>
              ))}
              {byProperty.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted">
                    No properties on this landlord.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">Payments received</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="py-2">Date</th>
                <th className="py-2">Reference</th>
                <th className="py-2">Property</th>
                <th className="py-2 text-right">Gross</th>
                <th className="py-2 text-right">Commission</th>
                <th className="py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {paymentRows.slice(0, 80).map((row) => (
                <tr key={row.payment.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2 text-muted">{fmtDate(row.payment.paidAt)}</td>
                  <td className="py-2 font-mono text-xs text-muted">{row.payment.reference}</td>
                  <td className="py-2 text-muted">{row.property ?? '—'}</td>
                  <td className="py-2 text-right tabular-nums text-ink">{formatKES(row.payment.grossAmount)}</td>
                  <td className="py-2 text-right tabular-nums text-muted">{formatKES(row.commission)}</td>
                  <td className="py-2 text-right tabular-nums text-ink">{formatKES(row.payment.netAmount)}</td>
                </tr>
              ))}
              {paymentRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm text-muted">
                    No rent was received in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {paymentRows.length > 80 && (
            <p className="mt-2 text-xs text-faint">Showing the first 80 of {paymentRows.length} payments.</p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">Expenses</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                <th className="py-2">Date</th>
                <th className="py-2">Reference</th>
                <th className="py-2">Property</th>
                <th className="py-2">Description</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map((row) => (
                <tr key={row.expense.id} className="border-b border-line/70 last:border-0">
                  <td className="py-2 text-muted">{fmtDate(row.expense.expenseDate)}</td>
                  <td className="py-2 font-mono text-xs text-muted">{row.expense.reference}</td>
                  <td className="py-2 text-muted">{row.property}</td>
                  <td className="py-2 text-ink">{row.expense.description}</td>
                  <td className="py-2 text-right tabular-nums text-ink">{formatKES(row.expense.amount)}</td>
                </tr>
              ))}
              {expenseRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm text-muted">
                    No approved expenses in this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-ink">Settlements</h2>
          <DataTable
            dense
            rows={settlementRows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
              { key: 'period', header: 'Period', render: (row) => <span className="text-xs text-muted">{fmtDate(row.periodStart)} – {fmtDate(row.periodEnd)}</span> },
              { key: 'method', header: 'Method', render: (row) => <span className="text-xs text-muted">{humanise(row.method)}</span> },
              { key: 'net', header: 'Net', align: 'right', render: (row) => <Money value={row.netAmount} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No settlements covering this period" />}
          />
        </section>

        <footer className="mt-8 border-t border-line pt-4 text-xs leading-relaxed text-faint">
          <p>
            Outstanding rent across this landlord’s portfolio is {formatKES(outstanding?.balance ?? 0)}, and
            {' '}
            {formatPercent(percent(grossCents, grossCents + cents(outstanding?.balance)))} of billed rent has been
            collected to date.
          </p>
          <p className="mt-1">
            Prepared by {organization?.name} on {fmtDate(new Date())}. Figures are drawn from reconciled receipts
            and approved expenses only.
          </p>
        </footer>
      </div>
    </>
  )
}
