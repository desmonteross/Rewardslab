import Link from 'next/link'
import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  paymentMethodEnum,
  paymentStatusEnum,
  payments,
  properties,
  reconciliationStatusEnum,
  tenants,
  units,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, MoneyKpi, Notice, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { recordPaymentAction, simulateMpesaAction } from './actions'

export const metadata = { title: 'Payments' }
export const dynamic = 'force-dynamic'

export default async function PaymentsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('payments.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const status = one(params, 'status')
  const method = one(params, 'method')
  const reconciliation = one(params, 'reconciliation')
  const propertyId = one(params, 'property')

  const where = landlordScoped(
    payments,
    scope,
    query
      ? or(
          ilike(payments.reference, `%${query}%`),
          ilike(payments.externalReference, `%${query}%`),
          ilike(payments.accountReference, `%${query}%`),
          ilike(payments.payerName, `%${query}%`),
          ilike(payments.payerPhone, `%${query}%`),
        )
      : undefined,
    status ? eq(payments.status, status as 'CONFIRMED') : undefined,
    method ? eq(payments.method, method as 'MPESA') : undefined,
    reconciliation ? eq(payments.reconciliationStatus, reconciliation as 'AUTO_MATCHED') : undefined,
    propertyId ? eq(payments.propertyId, propertyId) : undefined,
  )

  const [rows, [{ total }], [totals], propertyOptions, unmatchedTenants] = await Promise.all([
    db
      .select({
        id: payments.id,
        reference: payments.reference,
        externalReference: payments.externalReference,
        accountReference: payments.accountReference,
        method: payments.method,
        status: payments.status,
        reconciliationStatus: payments.reconciliationStatus,
        settlementStatus: payments.settlementStatus,
        grossAmount: payments.grossAmount,
        commissionAmount: payments.commissionAmount,
        netAmount: payments.netAmount,
        allocatedAmount: payments.allocatedAmount,
        paidAt: payments.paidAt,
        payerName: payments.payerName,
        payerPhone: payments.payerPhone,
        tenantId: tenants.id,
        tenantName: tenants.fullName,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
      })
      .from(payments)
      .leftJoin(tenants, eq(tenants.id, payments.tenantId))
      .leftJoin(units, eq(units.id, payments.unitId))
      .leftJoin(properties, eq(properties.id, payments.propertyId))
      .where(where)
      .orderBy(desc(payments.paidAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(payments).where(where),
    db
      .select({
        gross: sql<string>`coalesce(sum(${payments.grossAmount}) filter (where ${payments.status} = 'CONFIRMED'), 0)`,
        commission: sql<string>`coalesce(sum(${payments.commissionAmount}) filter (where ${payments.status} = 'CONFIRMED'), 0)`,
        unmatched: sql<string>`coalesce(sum(${payments.grossAmount}) filter (where ${payments.status} = 'UNMATCHED'), 0)`,
        unmatchedCount: sql<number>`count(*) filter (where ${payments.status} = 'UNMATCHED')::int`,
        unallocated: sql<string>`coalesce(sum(${payments.unallocatedAmount}) filter (where ${payments.status} = 'CONFIRMED'), 0)`,
      })
      .from(payments)
      .where(landlordScoped(payments, scope)),
    db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name)),
    db
      .select({ id: tenants.id, name: tenants.fullName, code: tenants.code })
      .from(tenants)
      .where(scoped(tenants, scope, eq(tenants.status, 'ACTIVE')))
      .orderBy(asc(tenants.fullName))
      .limit(500),
  ])

  const canRecord = can(session, 'payments.record')

  return (
    <>
      <PageHeader
        title="Payments"
        description="Every shilling received, where it came from and what it cleared."
        actions={
          <Link href="/receipts" className="btn-secondary">
            Receipts
          </Link>
        }
      />

      {(totals?.unmatchedCount ?? 0) > 0 && (
        <div className="mb-4">
          <Notice tone="negative" title={`${totals?.unmatchedCount} unmatched payments`}>
            Money has arrived that the system could not attribute to a tenant. It is held in the suspense
            account until an accountant reconciles it.{' '}
            <Link href="/payments?status=UNMATCHED" className="link">
              Work through the queue
            </Link>
            .
          </Notice>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyKpi label="Collected all time" amount={totals?.gross ?? 0} tone="positive" />
        <MoneyKpi label="Platform commission" amount={totals?.commission ?? 0} tone="brand" />
        <MoneyKpi label="Unallocated credit" amount={totals?.unallocated ?? 0} sub="Paid ahead by tenants" />
        <MoneyKpi
          label="Unmatched"
          amount={totals?.unmatched ?? 0}
          tone={cents(totals?.unmatched) > 0 ? 'negative' : 'positive'}
          sub={`${totals?.unmatchedCount ?? 0} transactions`}
          href="/payments?status=UNMATCHED"
        />
      </div>

      {canRecord && (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card title="Record a payment" description="Capture a receipt taken by cash, cheque or bank transfer.">
            <ActionForm action={recordPaymentAction} label="Record payment" pendingLabel="Recording…">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-muted">
                  Tenant
                  <select name="tenantId" className="field mt-1" defaultValue="">
                    <option value="">Match by account reference</option>
                    {unmatchedTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Amount (KES)
                  <input name="amount" type="number" min="1" step="1" className="field mt-1" placeholder="25000" required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Method
                  <select name="method" className="field mt-1" defaultValue="CASH">
                    {paymentMethodEnum.enumValues
                      .filter((value) => value !== 'ADJUSTMENT')
                      .map((value) => (
                        <option key={value} value={value}>
                          {humanise(value)}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Account reference
                  <input name="accountReference" className="field mt-1" placeholder="GV-A12" />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Payer name
                  <input name="payerName" className="field mt-1" placeholder="James Mwangi" />
                </label>
                <label className="block text-xs font-medium text-muted">
                  External reference
                  <input name="externalReference" className="field mt-1" placeholder="Bank slip no." />
                </label>
              </div>
            </ActionForm>
          </Card>

          <Card
            title="Simulate an M-Pesa receipt"
            description="Pushes a Safaricom-shaped confirmation through the same webhook path a live deployment uses."
          >
            <ActionForm action={simulateMpesaAction} label="Simulate payment" variant="secondary" pendingLabel="Sending…">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-muted">
                  Amount (KES)
                  <input name="amount" type="number" min="1" step="1" className="field mt-1" defaultValue="25000" required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Account number typed at the till
                  <input name="accountReference" className="field mt-1" placeholder="GV-A12" required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Payer phone
                  <input name="phone" className="field mt-1" defaultValue="0722000111" />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Payer name
                  <input name="payerName" className="field mt-1" defaultValue="JAMES MWANGI" />
                </label>
              </div>
              <p className="text-2xs leading-relaxed text-faint">
                Nothing is sent to Safaricom. Try a wrong reference such as <span className="font-mono">RENT</span> to
                see the unmatched queue in action.
              </p>
            </ActionForm>
          </Card>
        </div>
      )}

      <FilterBar
        searchPlaceholder="Search reference, M-Pesa code, payer…"
        selects={[
          { name: 'status', label: 'All statuses', options: paymentStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'method', label: 'All methods', options: paymentMethodEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'reconciliation', label: 'All reconciliation', options: reconciliationStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/payments/${row.id}`}
          columns={[
            {
              key: 'reference',
              header: 'Reference',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-ink">{row.reference}</p>
                  <p className="truncate font-mono text-2xs text-faint">{row.externalReference ?? '—'}</p>
                </div>
              ),
            },
            {
              key: 'tenant',
              header: 'Tenant',
              render: (row) =>
                row.tenantId ? (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.tenantName}</p>
                    <p className="truncate text-2xs text-faint">{row.propertyName} · {row.unitNumber}</p>
                  </div>
                ) : (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-negative">Unmatched</p>
                    <p className="truncate text-2xs text-faint">
                      ref “{row.accountReference || '—'}” · {row.payerPhone ?? '—'}
                    </p>
                  </div>
                ),
            },
            { key: 'paid', header: 'Paid', render: (row) => <span className="text-xs text-muted">{fmtDate(row.paidAt)}</span> },
            { key: 'method', header: 'Method', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.method)}</span> },
            { key: 'gross', header: 'Gross', align: 'right', render: (row) => <Money value={row.grossAmount} /> },
            { key: 'commission', header: 'Commission', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.commissionAmount} muted /> },
            { key: 'net', header: 'Net to landlord', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.netAmount} /> },
            { key: 'settlement', header: 'Settlement', align: 'right', hideOnMobile: true, render: (row) => <StatusBadge status={row.settlementStatus} /> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={<EmptyState title="No payments match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/payments', params, { page: next })}
        />
      </Card>
    </>
  )
}
