import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  commissions,
  landlords,
  ledgerEntries,
  paymentAllocations,
  payments,
  properties,
  receipts,
  rentInvoices,
  settlements,
  tenants,
  units,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { Card, DataTable, DetailList, EmptyState, Money, MoneyKpi, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { reconcilePaymentAction, reversePaymentAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function PaymentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('payments.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      payment: payments,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
      unitNumber: units.unitNumber,
      propertyId: properties.id,
      propertyName: properties.name,
      landlordId: landlords.id,
      landlordName: landlords.fullName,
      landlordCompany: landlords.companyName,
    })
    .from(payments)
    .leftJoin(tenants, eq(tenants.id, payments.tenantId))
    .leftJoin(units, eq(units.id, payments.unitId))
    .leftJoin(properties, eq(properties.id, payments.propertyId))
    .leftJoin(landlords, eq(landlords.id, payments.landlordId))
    .where(landlordScoped(payments, scope, eq(payments.id, id)))
    .limit(1)

  if (!record) notFound()
  const { payment } = record

  const [allocations, commission, receipt, ledger, settlement, activeTenants] = await Promise.all([
    db
      .select({
        allocation: paymentAllocations,
        invoiceId: rentInvoices.id,
        number: rentInvoices.number,
        periodLabel: rentInvoices.periodLabel,
        invoiceTotal: rentInvoices.total,
        balance: rentInvoices.balance,
        status: rentInvoices.status,
      })
      .from(paymentAllocations)
      .innerJoin(rentInvoices, eq(rentInvoices.id, paymentAllocations.invoiceId))
      .where(scoped(paymentAllocations, scope, eq(paymentAllocations.paymentId, id)))
      .orderBy(asc(rentInvoices.dueDate)),
    db.select().from(commissions).where(scoped(commissions, scope, eq(commissions.paymentId, id))).limit(1).then((rows) => rows[0]),
    db.select().from(receipts).where(scoped(receipts, scope, eq(receipts.paymentId, id))).limit(1).then((rows) => rows[0]),
    db
      .select()
      .from(ledgerEntries)
      .where(scoped(ledgerEntries, scope, eq(ledgerEntries.sourceId, id)))
      .orderBy(asc(ledgerEntries.entryGroupId), desc(ledgerEntries.entryType)),
    payment.settlementId
      ? db.select().from(settlements).where(scoped(settlements, scope, eq(settlements.id, payment.settlementId))).limit(1).then((rows) => rows[0])
      : Promise.resolve(undefined),
    payment.status === 'UNMATCHED' && can(session, 'payments.reconcile')
      ? db
          .select({ id: tenants.id, name: tenants.fullName, code: tenants.code })
          .from(tenants)
          .where(scoped(tenants, scope, eq(tenants.status, 'ACTIVE')))
          .orderBy(asc(tenants.fullName))
          .limit(500)
      : Promise.resolve([]),
  ])

  const grouped = new Map<string, typeof ledger>()
  for (const entry of ledger) {
    const bucket = grouped.get(entry.entryGroupId)
    if (bucket) bucket.push(entry)
    else grouped.set(entry.entryGroupId, [entry])
  }

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Payments', href: '/payments' }, { label: payment.reference }]}
        title={payment.reference}
        description={`${formatKES(payment.grossAmount)} · ${humanise(payment.method)} · ${fmtDate(payment.paidAt)}`}
        actions={
          <>
            {record.tenantId && (
              <Link href={`/tenants/${record.tenantId}`} className="btn-secondary">
                Tenant
              </Link>
            )}
            {receipt && (
              <Link href={`/receipts/${receipt.id}`} className="btn-primary">
                View receipt
              </Link>
            )}
          </>
        }
      />

      {payment.status === 'UNMATCHED' && (
        <div className="mb-4">
          <Notice tone="negative" title="This payment has not been matched to a tenant">
            The payer typed “{payment.accountReference || '—'}” as the account number, which does not
            correspond to any active tenancy. The money is held in the suspense account and is excluded from
            rental income reporting until it is reconciled.
          </Notice>
        </div>
      )}

      {payment.status === 'REVERSED' && (
        <div className="mb-4">
          <Notice tone="warning" title="This payment was reversed">
            {payment.reversalReason ?? 'No reason recorded.'} Reversed on {fmtDateTime(payment.reversedAt)}. The
            original ledger entries were left in place and balancing entries posted against them.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <MoneyKpi label="Gross received" amount={payment.grossAmount} />
        <MoneyKpi label="Platform commission" amount={payment.commissionAmount} tone="brand" sub={commission ? `${commission.rate}% · ${humanise(commission.scope)}` : undefined} />
        <MoneyKpi label="Net to landlord" amount={payment.netAmount} tone="positive" />
        <MoneyKpi label="Allocated to invoices" amount={payment.allocatedAmount} />
        <MoneyKpi
          label="Unallocated credit"
          amount={payment.unallocatedAmount}
          tone={cents(payment.unallocatedAmount) > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Transaction">
          <DetailList
            columns={3}
            items={[
              { label: 'Transaction ID', value: <span className="font-mono">{payment.reference}</span> },
              { label: 'External reference', value: payment.externalReference ? <span className="font-mono">{payment.externalReference}</span> : '—' },
              { label: 'Type', value: humanise(payment.method) },
              { label: 'Phone number', value: payment.payerPhone ?? '—' },
              { label: 'Payer name', value: payment.payerName ?? '—' },
              { label: 'Account reference', value: payment.accountReference ?? '—' },
              { label: 'Property', value: record.propertyName ? <Link href={`/properties/${record.propertyId}`} className="link">{record.propertyName}</Link> : '—' },
              { label: 'Unit', value: record.unitNumber ?? '—' },
              { label: 'Tenant', value: record.tenantId ? <Link href={`/tenants/${record.tenantId}`} className="link">{record.tenantName}</Link> : '—' },
              { label: 'Landlord', value: record.landlordId ? <Link href={`/landlords/${record.landlordId}`} className="link">{record.landlordCompany ?? record.landlordName}</Link> : '—' },
              { label: 'Payment status', value: <StatusBadge status={payment.status} /> },
              { label: 'Reconciliation', value: <StatusBadge status={payment.reconciliationStatus} /> },
              { label: 'Settlement status', value: <StatusBadge status={payment.settlementStatus} /> },
              { label: 'Settlement', value: settlement ? <Link href={`/settlements/${settlement.id}`} className="link">{settlement.reference}</Link> : '—' },
              { label: 'Received at', value: fmtDateTime(payment.receivedAt) },
              { label: 'Recorded by', value: payment.createdByName ?? 'System' },
            ]}
          />
        </Card>

        <div className="space-y-4">
          {payment.status === 'UNMATCHED' && can(session, 'payments.reconcile') && (
            <Card title="Reconcile manually" description="Attach this receipt to the right tenant and re-run allocation.">
              <ActionForm action={reconcilePaymentAction} label="Reconcile" pendingLabel="Reconciling…">
                <input type="hidden" name="paymentId" value={id} />
                <label className="block text-xs font-medium text-muted">
                  Tenant
                  <select name="tenantId" className="field mt-1" defaultValue="">
                    <option value="">Choose a tenant…</option>
                    {activeTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name} ({tenant.code})
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-2xs leading-relaxed text-faint">
                  The suspense entry is reversed and the payment is replayed through the normal pipeline, so
                  commission, receipt and landlord payable all fall out correctly.
                </p>
              </ActionForm>
            </Card>
          )}

          {payment.status === 'CONFIRMED' && can(session, 'payments.reverse') && (
            <Card title="Reverse payment" description="For an M-Pesa reversal or a receipt captured in error.">
              <ActionForm
                action={reversePaymentAction}
                label="Reverse payment"
                variant="danger"
                pendingLabel="Reversing…"
                confirm="Reverse this payment? Allocations will be undone and balancing ledger entries posted."
              >
                <input type="hidden" name="paymentId" value={id} />
                <label className="block text-xs font-medium text-muted">
                  Reason
                  <textarea name="reason" rows={2} className="field mt-1" placeholder="M-Pesa reversal requested by the payer" />
                </label>
              </ActionForm>
            </Card>
          )}

          {receipt && (
            <Card title="Receipt issued">
              <DetailList
                columns={1}
                items={[
                  { label: 'Receipt number', value: <Link href={`/receipts/${receipt.id}`} className="link font-mono">{receipt.number}</Link> },
                  { label: 'Period', value: receipt.periodLabel },
                  { label: 'Balance after', value: formatKES(receipt.balanceAfter) },
                  { label: 'Issued by', value: receipt.issuedByName ?? 'System' },
                ]}
              />
            </Card>
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Allocated to invoices" padded={false}>
          <DataTable
            dense
            rows={allocations}
            rowKey={(row) => row.allocation.id}
            rowHref={(row) => `/invoices/${row.invoiceId}`}
            columns={[
              { key: 'number', header: 'Invoice', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
              { key: 'period', header: 'Period', render: (row) => <span className="text-sm">{row.periodLabel}</span> },
              { key: 'applied', header: 'Applied', align: 'right', render: (row) => <Money value={row.allocation.amount} /> },
              { key: 'balance', header: 'Balance left', align: 'right', render: (row) => <Money value={row.balance} tone={cents(row.balance) > 0 ? 'negative' : 'neutral'} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={
              <EmptyState
                title="Not allocated to any invoice"
                description={
                  payment.status === 'UNMATCHED'
                    ? 'This payment has not been matched to a tenant yet.'
                    : 'The tenant had no open invoices, so the whole amount is sitting as credit.'
                }
              />
            }
          />
        </Card>

        <Card title="Accounting entries" description="The double-entry postings this payment produced." padded={false}>
          {grouped.size === 0 ? (
            <EmptyState title="No ledger entries" />
          ) : (
            <div className="divide-y divide-line">
              {Array.from(grouped.entries()).map(([groupId, entries]) => (
                <div key={groupId} className="px-4 py-3">
                  <p className="mb-2 text-xs text-faint">
                    {entries[0].narrative} · {fmtDate(entries[0].transactionDate)}
                  </p>
                  <table className="w-full text-sm">
                    <tbody>
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="py-1 text-muted">{humanise(entry.account)}</td>
                          <td className="py-1 text-right tabular-nums text-ink">
                            {entry.entryType === 'DEBIT' ? formatKES(entry.amount) : ''}
                          </td>
                          <td className="py-1 text-right tabular-nums text-ink">
                            {entry.entryType === 'CREDIT' ? formatKES(entry.amount) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-line text-2xs text-faint">
                        <td className="pt-1">Debit / Credit</td>
                        <td className="pt-1 text-right">Dr</td>
                        <td className="pt-1 text-right">Cr</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
