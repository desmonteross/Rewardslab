import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq, sql } from 'drizzle-orm'
import { Download } from 'lucide-react'
import { db } from '@/db'
import { landlords, properties } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { landlordScoped, ownLandlordScoped, scopeFromSession } from '@/lib/tenancy'
import { recentPeriods } from '@/lib/dates'
import { one, withParams, type SearchParamsPromise } from '@/lib/search-params'
import { Card, EmptyState, KpiCard, Notice, PageHeader } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { PrintButton } from '@/components/print-button'
import { findReport, formatCell, type ReportFilters } from '@/server/reports'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return { title: findReport(slug)?.name ?? 'Report' }
}

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>
  searchParams: SearchParamsPromise
}) {
  const { slug } = await params
  const query = await searchParams
  const session = await requirePermission('reports.view')
  const scope = scopeFromSession(session)

  const report = findReport(slug)
  if (!report) notFound()

  const monthParam = one(query, 'month')
  const [year, month] = monthParam ? monthParam.split('-').map(Number) : [undefined, undefined]

  const filters: ReportFilters = {
    year,
    month,
    propertyId: one(query, 'property'),
    landlordId: one(query, 'landlord'),
    from: one(query, 'from') ? new Date(String(one(query, 'from'))) : undefined,
    to: one(query, 'to') ? new Date(`${one(query, 'to')}T23:59:59`) : undefined,
  }

  const [result, propertyOptions, landlordOptions] = await Promise.all([
    report.run(scope, filters),
    report.filters.includes('property')
      ? db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name))
      : Promise.resolve([]),
    report.filters.includes('landlord')
      ? db
          .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
          .from(landlords)
          .where(ownLandlordScoped(landlords, scope))
          .orderBy(asc(landlords.code))
      : Promise.resolve([]),
  ])

  const selects = []
  if (report.filters.includes('period')) {
    selects.push({
      name: 'month',
      label: 'This month',
      options: recentPeriods(new Date(), 18)
        .reverse()
        .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
    })
  }
  if (report.filters.includes('property')) {
    selects.push({
      name: 'property',
      label: 'All properties',
      options: propertyOptions.map((row) => ({ value: row.id, label: row.name })),
    })
  }
  if (report.filters.includes('landlord')) {
    selects.push({
      name: 'landlord',
      label: 'All landlords',
      options: landlordOptions.map((row) => ({ value: row.id, label: row.name })),
    })
  }

  const exportHref = withParams(`/api/v1/reports/${slug}/export`, query, { format: 'csv' })

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[{ label: 'Reports', href: '/reports' }, { label: report.name }]}
          title={report.name}
          description={report.description}
          actions={
            <>
              <PrintButton label="Print / PDF" />
              {can(session, 'reports.export') && (
                <a href={exportHref} className="btn-primary" download>
                  <Download className="h-4 w-4" aria-hidden />
                  Export CSV
                </a>
              )}
            </>
          }
        />
      </div>

      {report.filters.includes('dateRange') && (
        <form method="get" className="mb-4 flex flex-wrap items-end gap-2 no-print">
          <label className="text-xs font-medium text-muted">
            From
            <input type="date" name="from" defaultValue={one(query, 'from') ?? ''} className="field mt-1" />
          </label>
          <label className="text-xs font-medium text-muted">
            To
            <input type="date" name="to" defaultValue={one(query, 'to') ?? ''} className="field mt-1" />
          </label>
          {one(query, 'property') && <input type="hidden" name="property" value={one(query, 'property')} />}
          {one(query, 'landlord') && <input type="hidden" name="landlord" value={one(query, 'landlord')} />}
          <button type="submit" className="btn-secondary">
            Apply
          </button>
        </form>
      )}

      {selects.length > 0 && (
        <div className="no-print">
          <FilterBar showSearch={false} selects={selects} />
        </div>
      )}

      {result.summary && result.summary.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {result.summary.map((item) => (
            <KpiCard key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      )}

      {result.note && (
        <div className="mb-4">
          <Notice tone="brand">{result.note}</Notice>
        </div>
      )}

      <Card padded={false}>
        {result.rows.length === 0 ? (
          <EmptyState title="Nothing to report" description="No records match the filters you have chosen." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  {result.columns.map((column) => (
                    <th
                      key={column.key}
                      className={`whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-faint ${
                        column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : ''
                      }`}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, index) => (
                  <tr key={index} className="border-b border-line/70 last:border-0 hover:bg-canvas/70">
                    {result.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`whitespace-nowrap px-4 py-2.5 text-ink ${
                          column.align === 'right'
                            ? 'text-right tabular-nums'
                            : column.align === 'center'
                              ? 'text-center'
                              : ''
                        }`}
                      >
                        {formatCell(row[column.key], column.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {result.totals && (
                <tfoot className="border-t border-line bg-canvas/60">
                  <tr className="text-sm font-medium">
                    {result.columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-4 py-2.5 text-ink ${column.align === 'right' ? 'text-right tabular-nums' : ''}`}
                      >
                        {result.totals?.[column.key] ?? ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-faint">
          {result.rows.length.toLocaleString()} rows · generated {new Date().toLocaleString('en-KE')} ·{' '}
          <Link href="/reports" className="link">
            all reports
          </Link>
        </p>
      </Card>
    </>
  )
}
