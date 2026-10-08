import { authorize, forbidden, handler, notFound } from '@/lib/api'
import { canRunReport, findReport, toCsv, type ReportFilters } from '@/server/reports'

/**
 * GET /api/v1/reports/:slug/export?format=csv
 * Produces exactly the rows the report screen shows, from the same query.
 */
export const GET = handler(async (request: Request, context: { params: Promise<{ slug: string }> }) => {
  const { slug } = await context.params
  const { scope } = await authorize('reports.export')

  const report = findReport(slug)
  if (!report) throw notFound('That report does not exist.')
  if (!canRunReport(scope, report)) throw forbidden('Your role cannot run this report.')

  const url = new URL(request.url)
  const format = url.searchParams.get('format') ?? 'csv'
  if (format !== 'csv') throw forbidden('Only CSV export is available in Phase 1.')

  const monthParam = url.searchParams.get('month')
  const [year, month] = monthParam ? monthParam.split('-').map(Number) : [undefined, undefined]

  const filters: ReportFilters = {
    year,
    month,
    propertyId: url.searchParams.get('property') ?? undefined,
    landlordId: url.searchParams.get('landlord') ?? undefined,
    tenantId: url.searchParams.get('tenant') ?? undefined,
    from: url.searchParams.get('from') ? new Date(String(url.searchParams.get('from'))) : undefined,
    to: url.searchParams.get('to') ? new Date(`${url.searchParams.get('to')}T23:59:59`) : undefined,
  }

  const result = await report.run(scope, filters)
  const csv = toCsv(result)
  const stamp = new Date().toISOString().slice(0, 10)

  return new Response(`﻿${csv}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${slug}-${stamp}.csv"`,
      'cache-control': 'no-store',
    },
  })
})
