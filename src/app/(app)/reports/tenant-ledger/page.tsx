import Link from 'next/link'
import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { invoiceItems, leases, organizations, payments, properties, rentInvoices, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped, portfolioTenantFilter } from '@/lib/tenancy'
import { landlordHasTenant } from '@/server/landlord-access'
import { cents, formatKES } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, EmptyState, KpiCard, PageHeader } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { PrintButton } from '@/components/print-button'

export const metadata = { title: 'Tenant ledger' }
export const dynamic = 'force-dynamic'

interface LedgerRow {
  date: Date
  reference: string
  description: string
  chargeCents: number
  creditCents: number
}

export default async function TenantLedgerPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('reports.view')
  const scope = scopeFromSession(session)

  const tenantOptions = await db
    .select({ id: tenants.id, name: sql<string>`${tenants.fullName} || ' (' || ${tenants.code} || ')'` })
    .from(tenants)
    .where(
      scoped(
        tenants,
        scope,
        portfolioTenantFilter(scope),
      ),
    )
    .orderBy(asc(tenants.fullName))
    .limit(1000)

  const tenantId = one(params, 'tenant') ?? tenantOptions[0]?.id

  const filters = (
    <FilterBar
      showSearch={false}
      selects={[
        { name: 'tenant', label: 'Choose a tenant', options: tenantOptions.map((row) => ({ value: row.id, label: row.name })) },
      ]}
    />
  )

  if (!tenantId) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Reports', href: '/reports' }]} title="Tenant ledger" />
        {filters}
        <Card>
          <EmptyState title="No tenants available" />
        </Card>
      </>
    )
  }

  const [tenant] = await db.select().from(tenants).where(scoped(tenants, scope, eq(tenants.id, tenantId))).limit(1)

  if (!tenant || !(await landlordHasTenant(scope, tenant.id))) {
    return (
      <>
        <PageHeader breadcrumb={[{ label: 'Reports', href: '/reports' }]} title="Tenant ledger" />
        {filters}
        <Card>
          <EmptyState title="That tenant is not in your organization" />
        </Card>
      </>
    )
  }

  const [organization] = await db.select().from(organizations).where(eq(organizations.id, scope.organizationId)).limit(1)

  const [currentLease, invoices, items, paymentRows] = await Promise.all([
    db
      .select({ lease: leases, unitNumber: units.unitNumber, propertyName: properties.name })
      .from(leases)
      .innerJoin(units, eq(units.id, leases.unitId))
      .innerJoin(properties, eq(properties.id, leases.propertyId))
      .where(scoped(leases, scope, eq(leases.tenantId, tenantId)))
      .orderBy(sql`${leases.startDate} desc`)
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select()
      .from(rentInvoices)
      .where(scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId)))
      .orderBy(asc(rentInvoices.issueDate)),
    db
      .select({ item: invoiceItems, invoiceNumber: rentInvoices.number, issueDate: rentInvoices.issueDate })
      .from(invoiceItems)
      .innerJoin(rentInvoices, eq(rentInvoices.id, invoiceItems.invoiceId))
      .where(scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId)))
      .orderBy(asc(rentInvoices.issueDate)),
    db
      .select()
      .from(payments)
      .where(scoped(payments, scope, eq(payments.tenantId, tenantId), eq(payments.status, 'CONFIRMED')))
      .orderBy(asc(payments.paidAt)),
  ])

  const entries: LedgerRow[] = [
    ...items.map((row) => ({
      date: row.issueDate,
      reference: row.invoiceNumber,
      description: row.item.description,
      chargeCents: cents(row.item.amount),
      creditCents: 0,
    })),
    ...paymentRows.map((payment) => ({
      date: payment.paidAt,
      reference: payment.reference,
      description: `Payment received — ${payment.method.toLowerCase().replace(/_/g, ' ')}${
        payment.externalReference ? ` (${payment.externalReference})` : ''
      }`,
      chargeCents: 0,
      creditCents: cents(payment.grossAmount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || b.chargeCents - a.chargeCents)

  let running = 0
  const withBalance = entries.map((entry) => {
    running += entry.chargeCents - entry.creditCents
    return { ...entry, balanceCents: running }
  })

  const chargedCents = entries.reduce((sum, entry) => sum + entry.chargeCents, 0)
  const paidCents = entries.reduce((sum, entry) => sum + entry.creditCents, 0)
  const outstandingCents = invoices
    .filter((invoice) => invoice.status !== 'CANCELLED')
    .reduce((sum, invoice) => sum + cents(invoice.balance), 0)

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[{ label: 'Reports', href: '/reports' }, { label: 'Tenant ledger' }]}
          title="Tenant ledger"
          description={`${tenant.fullName} · ${tenant.code}`}
          actions={
            <>
              <Link href={`/tenants/${tenantId}`} className="btn-secondary">
                Tenant
              </Link>
              <PrintButton label="Print / PDF" />
            </>
          }
        />
        {filters}

        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total charged" value={formatKES(chargedCents / 100)} />
          <KpiCard label="Total paid" value={formatKES(paidCents / 100)} tone="positive" />
          <KpiCard
            label="Balance"
            value={formatKES(outstandingCents / 100)}
            tone={outstandingCents > 0 ? 'negative' : 'positive'}
          />
          <KpiCard label="Entries" value={String(withBalance.length)} />
        </div>
      </div>

      <div className="card p-8 print:border-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
          <div>
            <p className="text-lg font-semibold text-ink">{organization?.name}</p>
            {organization?.address && <p className="mt-1 text-xs text-muted">{organization.address}</p>}
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-faint">Tenant ledger</p>
            <p className="mt-1 text-lg font-semibold text-ink">{tenant.fullName}</p>
            <p className="text-xs text-muted">
              {tenant.code} · {tenant.phone}
            </p>
            {currentLease && (
              <p className="text-xs text-muted">
                {currentLease.propertyName} · Unit {currentLease.unitNumber}
              </p>
            )}
          </div>
        </header>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="py-2">Date</th>
              <th className="py-2">Reference</th>
              <th className="py-2">Description</th>
              <th className="py-2 text-right">Charge</th>
              <th className="py-2 text-right">Payment</th>
              <th className="py-2 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {withBalance.map((entry, index) => (
              <tr key={`${entry.reference}-${index}`} className="border-b border-line/70 last:border-0">
                <td className="whitespace-nowrap py-2 text-muted">{fmtDate(entry.date)}</td>
                <td className="whitespace-nowrap py-2 font-mono text-xs text-muted">{entry.reference}</td>
                <td className="py-2 text-ink">{entry.description}</td>
                <td className="py-2 text-right tabular-nums text-ink">
                  {entry.chargeCents > 0 ? formatKES(entry.chargeCents / 100) : ''}
                </td>
                <td className="py-2 text-right tabular-nums text-positive">
                  {entry.creditCents > 0 ? formatKES(entry.creditCents / 100) : ''}
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-ink">
                  {formatKES(entry.balanceCents / 100)}
                </td>
              </tr>
            ))}
            {withBalance.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-muted">
                  Nothing has been charged or paid on this tenancy yet.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot className="border-t border-line">
            <tr className="text-sm font-medium">
              <td className="py-3 text-ink" colSpan={3}>
                Closing balance
              </td>
              <td className="py-3 text-right tabular-nums text-ink">{formatKES(chargedCents / 100)}</td>
              <td className="py-3 text-right tabular-nums text-positive">{formatKES(paidCents / 100)}</td>
              <td className="py-3 text-right text-base tabular-nums text-ink">
                {formatKES((chargedCents - paidCents) / 100)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-6 text-xs leading-relaxed text-faint">
          A positive balance is rent owed by the tenant; a negative balance is rent paid in advance. Prepared on{' '}
          {fmtDate(new Date())}.
        </p>
      </div>
    </>
  )
}
