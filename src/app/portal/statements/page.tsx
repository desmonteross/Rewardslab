import { Download, FileSpreadsheet } from 'lucide-react'
import { requireTenantSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, DataTable, EmptyState, Money, PageHeader } from '@/components/ui'
import { portalStatement } from '@/server/queries/portal'

export const metadata = { title: 'Statements' }
export const dynamic = 'force-dynamic'

export default async function PortalStatementsPage() {
  const session = await requireTenantSession()
  const statement = await portalStatement(scopeFromSession(session))

  const closingBalance = statement.length > 0 ? statement[statement.length - 1].balanceCents : 0
  // Newest first on screen; the downloads stay in date order, which is what a
  // statement is for.
  const rows = [...statement].reverse()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Statements"
        description="Every charge and every payment on your tenancy, oldest to newest in the download."
        actions={
          <>
            <a href="/portal/statement/pdf" className="btn-primary">
              <Download className="h-4 w-4" aria-hidden />
              Download PDF
            </a>
            <a href="/portal/statement/csv" className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              CSV
            </a>
          </>
        }
      />

      <Card>
        <p className="text-xs font-medium uppercase tracking-wide text-faint">Balance today</p>
        <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink">
          <Money value={closingBalance / 100} tone={closingBalance > 0 ? 'negative' : 'positive'} />
        </p>
        <p className="mt-1 text-xs text-muted">
          {closingBalance > 0
            ? 'This is what is still owed across every period.'
            : 'Nothing is outstanding on your tenancy.'}
        </p>
      </Card>

      <Card padded={false}>
        <DataTable
          dense
          rows={rows}
          rowKey={(row) => `${row.date.toISOString()}-${row.reference}-${row.description}`}
          columns={[
            { key: 'date', header: 'Date', render: (row) => fmtDate(row.date) },
            {
              key: 'detail',
              header: 'Detail',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{row.description}</p>
                  <p className="truncate text-2xs text-faint">{row.reference}</p>
                </div>
              ),
            },
            {
              key: 'charge',
              header: 'Charged',
              align: 'right',
              render: (row) =>
                row.chargeCents > 0 ? <Money value={row.chargeCents / 100} /> : <span className="text-faint">—</span>,
            },
            {
              key: 'paid',
              header: 'Paid',
              align: 'right',
              render: (row) =>
                row.paymentCents > 0 ? (
                  <Money value={row.paymentCents / 100} tone="positive" />
                ) : (
                  <span className="text-faint">—</span>
                ),
            },
            {
              key: 'balance',
              header: 'Balance',
              align: 'right',
              render: (row) => <Money value={row.balanceCents / 100} />,
            },
          ]}
          empty={
            <EmptyState
              title="Nothing on the statement yet"
              description="Charges and payments appear here as they are recorded."
            />
          }
        />
      </Card>
    </div>
  )
}
