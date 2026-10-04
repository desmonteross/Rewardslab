import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import {
  invoiceItems,
  landlords,
  leases,
  paymentAllocations,
  payments,
  properties,
  receipts,
  rentInvoices,
  tenants,
  units,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { daysOverdue, fmtDate } from '@/lib/dates'
import { Card, DataTable, DetailList, EmptyState, Money, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('invoices.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      invoice: rentInvoices,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
      unitNumber: units.unitNumber,
      propertyId: properties.id,
      propertyName: properties.name,
      landlordName: landlords.fullName,
      landlordCompany: landlords.companyName,
      leaseId: leases.id,
      leaseCode: leases.code,
      gracePeriodDays: leases.gracePeriodDays,
    })
    .from(rentInvoices)
    .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
    .innerJoin(units, eq(units.id, rentInvoices.unitId))
    .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
    .innerJoin(landlords, eq(landlords.id, rentInvoices.landlordId))
    .innerJoin(leases, eq(leases.id, rentInvoices.leaseId))
    .where(landlordScoped(rentInvoices, scope, eq(rentInvoices.id, id)))
    .limit(1)

  if (!record) notFound()
  const { invoice } = record

  const [items, allocations, receiptRows] = await Promise.all([
    db.select().from(invoiceItems).where(scoped(invoiceItems, scope, eq(invoiceItems.invoiceId, id))).orderBy(asc(invoiceItems.description)),
    db
      .select({
        allocation: paymentAllocations,
        paymentId: payments.id,
        reference: payments.reference,
        method: payments.method,
        paidAt: payments.paidAt,
        externalReference: payments.externalReference,
        status: payments.status,
      })
      .from(paymentAllocations)
      .innerJoin(payments, eq(payments.id, paymentAllocations.paymentId))
      .where(scoped(paymentAllocations, scope, eq(paymentAllocations.invoiceId, id)))
      .orderBy(desc(payments.paidAt)),
    db.select().from(receipts).where(scoped(receipts, scope, eq(receipts.invoiceId, id))).orderBy(desc(receipts.paidAt)),
  ])

  const balanceCents = cents(invoice.balance)
  const late = balanceCents > 0 ? daysOverdue(invoice.dueDate) : 0

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Invoices', href: '/invoices' }, { label: invoice.number }]}
        title={invoice.number}
        description={`${invoice.periodLabel} · ${record.tenantName} · ${record.propertyName} ${record.unitNumber}`}
        actions={
          <>
            <Link href={`/tenants/${record.tenantId}`} className="btn-secondary">
              Tenant
            </Link>
            <Link href={`/leases/${record.leaseId}`} className="btn-secondary">
              Lease
            </Link>
          </>
        }
      />

      {balanceCents > 0 && late > 0 && (
        <div className="mb-4">
          <Notice tone="negative" title={`${late} days past the due date`}>
            {formatKES(invoice.balance)} of this invoice is still outstanding. It was due on {fmtDate(invoice.dueDate)},
            with a grace period of {record.gracePeriodDays} days.
          </Notice>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Invoice" padded={false}>
          <div className="px-5 py-4">
            <DetailList
              columns={3}
              items={[
                { label: 'Invoice number', value: <span className="font-mono">{invoice.number}</span> },
                { label: 'Period', value: invoice.periodLabel },
                { label: 'Status', value: <StatusBadge status={invoice.status} /> },
                { label: 'Issued', value: fmtDate(invoice.issueDate) },
                { label: 'Due', value: fmtDate(invoice.dueDate) },
                { label: 'Lease', value: <Link href={`/leases/${record.leaseId}`} className="link">{record.leaseCode}</Link> },
                { label: 'Tenant', value: <Link href={`/tenants/${record.tenantId}`} className="link">{record.tenantName}</Link> },
                { label: 'Unit', value: `${record.propertyName} · ${record.unitNumber}` },
                { label: 'Landlord', value: record.landlordCompany ?? record.landlordName },
              ]}
            />
          </div>

          <div className="border-t border-line">
            <DataTable
              dense
              rows={items}
              rowKey={(row) => row.id}
              columns={[
                { key: 'description', header: 'Description', render: (row) => <span className="text-sm">{row.description}</span> },
                { key: 'type', header: 'Type', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.type)}</span> },
                { key: 'quantity', header: 'Qty', align: 'center', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.quantity}</span> },
                { key: 'unit', header: 'Unit price', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.unitAmount} muted /> },
                { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
              ]}
              empty={<EmptyState title="No line items" />}
              footer={
                <>
                  <tr className="text-sm">
                    <td className="px-4 py-2 text-right text-muted" colSpan={4}>
                      Subtotal
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money value={invoice.subtotal} />
                    </td>
                  </tr>
                  {cents(invoice.penaltyAmount) > 0 && (
                    <tr className="text-sm">
                      <td className="px-4 py-2 text-right text-muted" colSpan={4}>
                        Late payment penalty
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Money value={invoice.penaltyAmount} tone="serious" />
                      </td>
                    </tr>
                  )}
                  <tr className="text-sm">
                    <td className="px-4 py-2 text-right font-medium text-ink" colSpan={4}>
                      Total
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      <Money value={invoice.total} />
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="px-4 py-2 text-right text-muted" colSpan={4}>
                      Paid
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Money value={invoice.amountPaid} tone="positive" />
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="px-4 py-2.5 text-right font-medium text-ink" colSpan={4}>
                      Balance
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      <Money value={invoice.balance} tone={balanceCents > 0 ? 'negative' : 'positive'} />
                    </td>
                  </tr>
                </>
              }
            />
          </div>
        </Card>

        <div className="space-y-4">
          <Card title="Payments applied" padded={false}>
            <DataTable
              dense
              rows={allocations}
              rowKey={(row) => row.allocation.id}
              rowHref={(row) => `/payments/${row.paymentId}`}
              columns={[
                { key: 'reference', header: 'Payment', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
                { key: 'paid', header: 'Date', render: (row) => <span className="text-xs text-muted">{fmtDate(row.paidAt)}</span> },
                { key: 'amount', header: 'Applied', align: 'right', render: (row) => <Money value={row.allocation.amount} /> },
              ]}
              empty={<EmptyState title="Nothing paid against this invoice yet" />}
            />
          </Card>

          <Card title="Receipts" padded={false}>
            <DataTable
              dense
              rows={receiptRows}
              rowKey={(row) => row.id}
              rowHref={(row) => `/receipts/${row.id}`}
              columns={[
                { key: 'number', header: 'Receipt', render: (row) => <span className="font-mono text-xs">{row.number}</span> },
                { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
              ]}
              empty={<EmptyState title="No receipts issued" />}
            />
          </Card>
        </div>
      </div>
    </>
  )
}
