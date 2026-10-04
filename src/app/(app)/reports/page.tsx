import Link from 'next/link'
import { FileSpreadsheet } from 'lucide-react'
import { requirePermission } from '@/lib/session'
import { Card, PageHeader } from '@/components/ui'
import { REPORTS } from '@/server/reports'

export const metadata = { title: 'Reports' }

const GROUPS = ['Rent', 'Portfolio', 'Finance', 'Operations', 'Compliance'] as const

const SPECIALS = [
  {
    slug: 'landlord-statement',
    name: 'Landlord Statement',
    group: 'Finance',
    description: 'A month’s gross rent, commission, expenses and net payable for one owner.',
  },
  {
    slug: 'tenant-ledger',
    name: 'Tenant Ledger',
    group: 'Rent',
    description: 'Every charge and payment on one tenancy, with a running balance.',
  },
]

export default async function ReportsPage() {
  await requirePermission('reports.view')

  return (
    <>
      <PageHeader
        title="Reports"
        description="Every report reads from the same ledger the screens do, and exports exactly what you see."
      />

      <div className="space-y-6">
        {GROUPS.map((group) => {
          const reports = [
            ...REPORTS.filter((report) => report.group === group),
            ...SPECIALS.filter((report) => report.group === group),
          ]
          if (reports.length === 0) return null

          return (
            <section key={group}>
              <h2 className="mb-3 text-sm font-semibold text-ink">{group}</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {reports.map((report) => (
                  <Link
                    key={report.slug}
                    href={`/reports/${report.slug}`}
                    className="card group p-4 transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                        <FileSpreadsheet className="h-4 w-4" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink group-hover:text-brand">{report.name}</p>
                        <p className="mt-1 text-xs leading-relaxed text-muted">{report.description}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <div className="mt-6">
        <Card title="Exports">
          <p className="text-sm leading-relaxed text-muted">
            Every report exports as CSV, which Excel and Google Sheets open directly, and prints to PDF from the
            report screen with the browser’s print dialog. The export contains the same rows, the same filters and
            the same totals as the screen — there is no second query behind it.
          </p>
        </Card>
      </div>
    </>
  )
}
