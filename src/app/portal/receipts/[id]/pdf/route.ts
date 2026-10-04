import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { cents, formatKES } from '@/lib/money'
import { PdfBuilder, pdfResponse, slugForFile } from '@/lib/pdf'
import { portalReceipt } from '@/server/queries/portal'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'TENANT' || !can(session, 'portal.documents.download')) notFound()

  const { id } = await params
  const scope = scopeFromSession(session)

  // Scoped to this tenant — a receipt belonging to anyone else is simply absent.
  const row = await portalReceipt(scope, id)
  if (!row) notFound()

  const receipt = row.receipt
  const amount = cents(receipt.amount)

  const pdf = await PdfBuilder.create({
    title: 'Rent receipt',
    subtitle: `${receipt.number} · issued ${fmtDate(receipt.paidAt)}`,
    organizationName: row.organizationName,
    footNote:
      'Demonstration environment. This receipt records a payment held in this system; it is not a tax invoice.',
  })

  pdf.hero('Amount received', formatKES(amount / 100))

  pdf.heading('Payment')
  pdf.facts([
    { label: 'Receipt number', value: receipt.number },
    { label: 'Received on', value: fmtDateTime(receipt.paidAt) },
    { label: 'Method', value: receipt.method },
    { label: 'Transaction reference', value: row.externalReference ?? '—' },
    { label: 'Paid by', value: row.payerName ?? row.tenantName },
    { label: 'For period', value: receipt.periodLabel },
  ])

  pdf.heading('Tenancy')
  pdf.facts([
    { label: 'Tenant', value: row.tenantName },
    { label: 'Tenant reference', value: row.tenantCode },
    { label: 'Property', value: row.propertyName ?? '—' },
    { label: 'Unit', value: row.unitNumber ?? '—' },
  ])

  pdf.divider()
  pdf.paragraph(
    'This receipt was generated from the payment ledger and reflects a payment that has been received and matched to this tenancy. Keep it for your records.',
    { muted: true },
  )

  return pdfResponse(await pdf.bytes(), `receipt-${slugForFile(receipt.number)}.pdf`)
}
