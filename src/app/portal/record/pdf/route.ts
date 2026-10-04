import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { formatKES } from '@/lib/money'
import { PdfBuilder, pdfResponse, slugForFile } from '@/lib/pdf'
import { portalPaymentSummary, portalTenancy, portalTenancyHistory } from '@/server/queries/portal'
import { BAND_BLURBS, rentalRecordFor } from '@/server/services/rental-record'

export const runtime = 'nodejs'

/** Amounts inside tables: the column header carries the currency. */
const plain = (valueInCents: number) => formatKES(valueInCents / 100, { currency: false })

const OUTCOME_LABEL: Record<string, string> = {
  ON_TIME: 'On time',
  WITHIN_GRACE: 'Just late',
  LATE: 'Late',
  OUTSTANDING: 'Unpaid',
  NOT_YET_DUE: 'Not due yet',
}

/**
 * The rental passport: a tenancy history and payment record the tenant can
 * hand to a future landlord. Deliberately states what it is and is not.
 */
export async function GET() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'TENANT' || !session.tenantId || !can(session, 'portal.documents.download')) {
    notFound()
  }

  const scope = scopeFromSession(session)
  const [tenancy, record, history, summary] = await Promise.all([
    portalTenancy(scope),
    rentalRecordFor(scope, session.tenantId),
    portalTenancyHistory(scope),
    portalPaymentSummary(scope),
  ])
  if (!tenancy) notFound()

  const pdf = await PdfBuilder.create({
    title: 'Rental record',
    subtitle: `${tenancy.fullName} · ${tenancy.code} · issued ${fmtDate(new Date())}`,
    organizationName: tenancy.organizationName,
    footNote:
      'Not a credit bureau score. Calculated within this property management system from rent invoices and payments only.',
  })

  pdf.hero(
    record.hasEnoughHistory ? `Rental record — ${record.score} / 100` : 'Rental record',
    record.bandLabel,
  )
  pdf.paragraph(BAND_BLURBS[record.band], { muted: true })

  pdf.heading('At a glance')
  pdf.facts(
    [
      { label: 'Months assessed', value: String(record.invoicesAssessed) },
      { label: 'Paid on time', value: `${Math.round(record.onTimeRate * 100)}%` },
      { label: 'Longest unbroken run', value: `${record.longestOnTimeStreak} months` },
      { label: 'Average days late', value: `${record.averageDaysLate}` },
      {
        label: 'Currently outstanding',
        value: record.currentArrearsCents > 0 ? formatKES(record.currentArrearsCents / 100) : 'Nothing',
      },
      { label: 'Time renting', value: `${record.monthsOnRecord} months` },
    ],
    3,
  )

  pdf.heading('How the record is calculated')
  for (const factor of record.factors) {
    pdf.bar(factor.label, factor.earned, factor.weight, factor.detail)
  }

  pdf.divider()
  pdf.heading('Tenancy history')
  if (history.length === 0) {
    pdf.paragraph('No tenancies on record.', { muted: true })
  } else {
    pdf.table(
      [
        { header: 'Property', width: 30 },
        { header: 'Unit', width: 10 },
        { header: 'From', width: 14 },
        { header: 'To', width: 14 },
        { header: 'Months', width: 10, align: 'right' },
        { header: 'Rent (KES)', width: 16, align: 'right' },
      ],
      history.map((entry) => [
        { text: entry.propertyName },
        { text: entry.unitNumber, tone: 'muted' as const },
        { text: fmtDate(entry.startDate), tone: 'muted' as const },
        { text: entry.endDate ? fmtDate(entry.endDate) : 'present', tone: 'muted' as const },
        { text: String(entry.months), align: 'right' as const },
        { text: plain(entry.monthlyRentCents), align: 'right' as const },
      ]),
    )
  }

  pdf.heading('Payment record')
  pdf.facts(
    [
      { label: 'Payments made', value: String(summary.paymentCount) },
      { label: 'Total rent paid', value: formatKES(summary.totalPaidCents / 100) },
      { label: 'First payment', value: fmtDate(summary.firstPaymentAt) },
      { label: 'Most recent payment', value: fmtDate(summary.lastPaymentAt) },
    ],
    2,
  )

  if (record.history.length > 0) {
    pdf.heading('Month by month')
    pdf.table(
      [
        { header: 'Period', width: 26 },
        { header: 'Due', width: 18 },
        { header: 'Amount (KES)', width: 20, align: 'right' },
        { header: 'Days late', width: 16, align: 'right' },
        { header: 'Outcome', width: 20 },
      ],
      record.history.map((row) => [
        { text: row.periodLabel },
        { text: fmtDate(row.dueDate), tone: 'muted' as const },
        { text: plain(row.totalCents), align: 'right' as const },
        { text: row.daysLate > 0 ? String(row.daysLate) : '—', align: 'right' as const },
        {
          text: OUTCOME_LABEL[row.outcome] ?? row.outcome,
          tone:
            row.outcome === 'ON_TIME'
              ? ('positive' as const)
              : row.outcome === 'LATE' || row.outcome === 'OUTSTANDING'
                ? ('negative' as const)
                : ('muted' as const),
        },
      ]),
    )
  }

  pdf.divider()
  pdf.paragraph(
    'This document is produced by the property management system that holds this tenancy. It summarises rent invoices raised and payments received within that system. It is not a credit reference, is not supplied to any credit reference bureau, and uses no employment, demographic or identity information.',
    { muted: true },
  )

  return pdfResponse(await pdf.bytes(), `rental-record-${slugForFile(tenancy.code)}.pdf`)
}
