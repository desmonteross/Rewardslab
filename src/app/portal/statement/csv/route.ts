import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { slugForFile } from '@/lib/pdf'
import { portalStatement, portalTenancy } from '@/server/queries/portal'

export const runtime = 'nodejs'

/** RFC 4180 quoting, so a description containing a comma cannot shift columns. */
function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function GET() {
  const session = await getSession()
  if (!session) redirect('/login')
  if (session.role !== 'TENANT' || !can(session, 'portal.documents.download')) notFound()

  const scope = scopeFromSession(session)
  const [tenancy, lines] = await Promise.all([portalTenancy(scope), portalStatement(scope)])
  if (!tenancy) notFound()

  const rows = [
    ['Date', 'Reference', 'Description', 'Charge (KES)', 'Paid (KES)', 'Balance (KES)'],
    ...lines.map((line) => [
      fmtDate(line.date),
      line.reference,
      line.description,
      (line.chargeCents / 100).toFixed(2),
      (line.paymentCents / 100).toFixed(2),
      (line.balanceCents / 100).toFixed(2),
    ]),
  ]

  // A leading BOM so Excel opens it as UTF-8 rather than mangling names.
  const csv = `﻿${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="statement-${slugForFile(tenancy.code)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
