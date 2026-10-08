import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, organizations, payments, properties, receipts, rentInvoices, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { Card, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { PrintButton } from '@/components/print-button'
import { ActionForm } from '@/components/action-form'
import { emailReceiptAction } from './actions'

export const dynamic = 'force-dynamic'

export default async function ReceiptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('receipts.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      receipt: receipts,
      tenantId: tenants.id,
      tenantName: tenants.fullName,
      tenantPhone: tenants.phone,
      tenantEmail: tenants.email,
      unitNumber: units.unitNumber,
      propertyName: properties.name,
      propertyAddress: properties.address,
      landlordName: landlords.fullName,
      landlordCompany: landlords.companyName,
      paymentId: payments.id,
      paymentReference: payments.reference,
      paymentStatus: payments.status,
      invoiceNumber: rentInvoices.number,
      invoiceId: rentInvoices.id,
      organizationName: organizations.name,
      organizationPhone: organizations.contactPhone,
      organizationEmail: organizations.contactEmail,
      organizationAddress: organizations.address,
      organizationPin: organizations.kraPin,
    })
    .from(receipts)
    .innerJoin(tenants, eq(tenants.id, receipts.tenantId))
    .innerJoin(units, eq(units.id, receipts.unitId))
    .innerJoin(properties, eq(properties.id, receipts.propertyId))
    .innerJoin(landlords, eq(landlords.id, receipts.landlordId))
    .innerJoin(payments, eq(payments.id, receipts.paymentId))
    .innerJoin(organizations, eq(organizations.id, receipts.organizationId))
    .leftJoin(rentInvoices, eq(rentInvoices.id, receipts.invoiceId))
    .where(landlordScoped(receipts, scope, eq(receipts.id, id)))
    .limit(1)

  if (!record) notFound()
  const { receipt } = record

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[{ label: 'Receipts', href: '/receipts' }, { label: receipt.number }]}
          title={receipt.number}
          description={`${formatKES(receipt.amount)} received from ${record.tenantName} on ${fmtDate(receipt.paidAt)}`}
          actions={
            <>
              <Link href={`/payments/${record.paymentId}`} className="btn-secondary">
                Payment
              </Link>
              <PrintButton label="Print / save as PDF" />
            </>
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* The receipt itself — this is what prints. */}
        <div className="lg:col-span-2">
          <div className="card p-8 print:border-0 print:shadow-none">
            <header className="flex items-start justify-between gap-6 border-b border-line pb-6">
              <div>
                <p className="text-lg font-semibold text-ink">{record.organizationName}</p>
                {record.organizationAddress && (
                  <p className="mt-1 text-xs text-muted">{record.organizationAddress}</p>
                )}
                <p className="mt-0.5 text-xs text-muted">
                  {[record.organizationPhone, record.organizationEmail].filter(Boolean).join(' · ')}
                </p>
                {record.organizationPin && (
                  <p className="mt-0.5 text-xs text-muted">KRA PIN {record.organizationPin}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-faint">Rent receipt</p>
                <p className="mt-1 font-mono text-lg font-semibold text-ink">{receipt.number}</p>
                <p className="mt-1 text-xs text-muted">{fmtDate(receipt.paidAt)}</p>
                {record.paymentStatus === 'REVERSED' && (
                  <p className="mt-2">
                    <StatusBadge status="REVERSED" label="Reversed" />
                  </p>
                )}
              </div>
            </header>

            <div className="grid gap-6 border-b border-line py-6 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-faint">Received from</p>
                <p className="mt-1.5 text-sm font-medium text-ink">{record.tenantName}</p>
                <p className="text-xs text-muted">{record.tenantPhone}</p>
                {record.tenantEmail && <p className="text-xs text-muted">{record.tenantEmail}</p>}
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-faint">For</p>
                <p className="mt-1.5 text-sm font-medium text-ink">
                  {record.propertyName} · Unit {record.unitNumber}
                </p>
                {record.propertyAddress && <p className="text-xs text-muted">{record.propertyAddress}</p>}
                <p className="text-xs text-muted">
                  Landlord: {record.landlordCompany ?? record.landlordName}
                </p>
              </div>
            </div>

            <table className="w-full border-b border-line py-6 text-sm">
              <tbody>
                <tr>
                  <td className="py-2 text-muted">Rent period</td>
                  <td className="py-2 text-right font-medium text-ink">{receipt.periodLabel}</td>
                </tr>
                {record.invoiceNumber && (
                  <tr>
                    <td className="py-2 text-muted">Invoice</td>
                    <td className="py-2 text-right font-mono text-ink">{record.invoiceNumber}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 text-muted">Payment method</td>
                  <td className="py-2 text-right text-ink">{humanise(receipt.method)}</td>
                </tr>
                {receipt.mpesaReference && (
                  <tr>
                    <td className="py-2 text-muted">M-Pesa reference</td>
                    <td className="py-2 text-right font-mono text-ink">{receipt.mpesaReference}</td>
                  </tr>
                )}
                <tr>
                  <td className="py-2 text-muted">Payment reference</td>
                  <td className="py-2 text-right font-mono text-ink">{record.paymentReference}</td>
                </tr>
                <tr>
                  <td className="py-2 text-muted">Payment date</td>
                  <td className="py-2 text-right text-ink">{fmtDateTime(receipt.paidAt)}</td>
                </tr>
              </tbody>
            </table>

            <div className="flex items-end justify-between gap-6 py-6">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-faint">Amount received</p>
                <p className="mt-1 text-3xl font-semibold tracking-tight text-ink">{formatKES(receipt.amount)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium uppercase tracking-wide text-faint">Balance after payment</p>
                <p className="mt-1 text-lg font-semibold text-ink">{formatKES(receipt.balanceAfter)}</p>
              </div>
            </div>

            <footer className="border-t border-line pt-4 text-xs leading-relaxed text-faint">
              <p>Issued by {receipt.issuedByName ?? 'the system'} on behalf of {record.organizationName}.</p>
              <p className="mt-1">
                This receipt is computer generated from a reconciled payment record and is valid without a
                signature.
              </p>
            </footer>
          </div>
        </div>

        <div className="space-y-4 no-print">
          {can(session, 'receipts.issue') && (
          <Card title="Send to tenant" description="Delivers the receipt through the configured notification provider.">
            <ActionForm action={emailReceiptAction} label="Send by email" pendingLabel="Sending…">
              <input type="hidden" name="receiptId" value={id} />
              <input type="hidden" name="channel" value="EMAIL" />
              <p className="text-xs text-muted">
                To: {record.tenantEmail ?? <span className="text-negative">no email on file</span>}
              </p>
            </ActionForm>
            <div className="mt-4 border-t border-line pt-4">
              <ActionForm action={emailReceiptAction} label="Send by SMS" variant="secondary" pendingLabel="Sending…">
                <input type="hidden" name="receiptId" value={id} />
                <input type="hidden" name="channel" value="SMS" />
                <p className="text-xs text-muted">To: {record.tenantPhone}</p>
              </ActionForm>
            </div>
          </Card>
          )}

          <Card title="Related records">
            <ul className="space-y-2 text-sm">
              <li>
                <Link href={`/payments/${record.paymentId}`} className="link">
                  Payment {record.paymentReference}
                </Link>
              </li>
              {record.invoiceId && (
                <li>
                  <Link href={`/invoices/${record.invoiceId}`} className="link">
                    Invoice {record.invoiceNumber}
                  </Link>
                </li>
              )}
              <li>
                <Link href={`/tenants/${record.tenantId}`} className="link">
                  Tenant · {record.tenantName}
                </Link>
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  )
}
