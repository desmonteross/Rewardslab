import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { formatKES } from '@/lib/money'
import { PdfBuilder, pdfResponse, slugForFile } from '@/lib/pdf'
import { portalStatement, portalTenancy } from '@/server/queries/portal'

export const runtime = 'nodejs'

/** Amounts inside the table: the column header carries the currency. */
const plain = (valueInCents: number) => formatKES(valueInCents / 100, { currency: false })

export async function GET() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'TENANT' || !can(session, 'portal.documents.download')) notFound()

  const scope = scopeFromSession(session)
  const [tenancy, lines] = await Promise.all([portalTenancy(scope), portalStatement(scope)])
  if (!tenancy) notFound()

  const closing = lines.length > 0 ? lines[lines.length - 1].balanceCents : 0
  const charged = lines.reduce((sum, line) => sum + line.chargeCents, 0)
  const paid = lines.reduce((sum, line) => sum + line.paymentCents, 0)

  const pdf = await PdfBuilder.create({
    title: 'Tenant statement',
    subtitle: `${tenancy.fullName} · ${tenancy.code} · as at ${fmtDate(new Date())}`,
    organizationName: tenancy.organizationName,
    footNote: 'Demonstration environment. Figures are drawn from the live rent ledger for this tenancy.',
  })

  pdf.facts(
    [
      { label: 'Tenant', value: tenancy.fullName },
      { label: 'Reference', value: tenancy.code },
      { label: 'Property', value: tenancy.lease?.propertyName ?? '—' },
      { label: 'Unit', value: tenancy.lease?.unitNumber ?? '—' },
      {
        label: 'Monthly rent',
        value: tenancy.lease ? formatKES(tenancy.lease.monthlyRentCents / 100) : '—',
      },
      { label: 'Statement date', value: fmtDate(new Date()) },
    ],
    3,
  )

  pdf.divider()
  pdf.heading('Account activity')

  if (lines.length === 0) {
    pdf.paragraph('There is nothing on this account yet.', { muted: true })
  } else {
    pdf.table(
      [
        { header: 'Date', width: 13 },
        { header: 'Reference', width: 16 },
        { header: 'Description', width: 29 },
        { header: 'Charge (KES)', width: 14, align: 'right' },
        { header: 'Paid (KES)', width: 14, align: 'right' },
        { header: 'Balance (KES)', width: 14, align: 'right' },
      ],
      lines.map((line) => [
        { text: fmtDate(line.date), tone: 'muted' as const },
        { text: line.reference, tone: 'muted' as const },
        { text: line.description },
        { text: line.chargeCents > 0 ? plain(line.chargeCents) : '—', align: 'right' as const },
        {
          text: line.paymentCents > 0 ? plain(line.paymentCents) : '—',
          align: 'right' as const,
          tone: line.paymentCents > 0 ? ('positive' as const) : undefined,
        },
        { text: plain(line.balanceCents), align: 'right' as const },
      ]),
      {
        totalRow: [
          { text: 'Totals' },
          { text: '' },
          { text: '' },
          { text: plain(charged), align: 'right' },
          { text: plain(paid), align: 'right' },
          { text: plain(closing), align: 'right' },
        ],
      },
    )
  }

  pdf.paragraph(
    closing > 0
      ? `The balance outstanding on this account is ${formatKES(closing / 100)}.`
      : 'There is nothing outstanding on this account.',
  )

  return pdfResponse(await pdf.bytes(), `statement-${slugForFile(tenancy.code)}.pdf`)
}
