import Link from 'next/link'
import { Download } from 'lucide-react'
import { requireTenantSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, DataTable, EmptyState, Money, PageHeader } from '@/components/ui'
import { portalReceipts } from '@/server/queries/portal'

export const metadata = { title: 'Receipts' }
export const dynamic = 'force-dynamic'

export default async function PortalReceiptsPage() {
  const session = await requireTenantSession()
  const receipts = await portalReceipts(scopeFromSession(session))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Receipts"
        description="Every payment recorded against your tenancy. Each one downloads as a PDF you can keep."
      />

      <Card padded={false}>
        <DataTable
          rows={receipts}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'number',
              header: 'Receipt',
              render: (row) => (
                <Link href={`/portal/receipts/${row.id}`} className="font-medium text-ink hover:text-brand">
                  {row.number}
                </Link>
              ),
            },
            { key: 'date', header: 'Date', render: (row) => fmtDate(row.paidAt) },
            {
              key: 'method',
              header: 'Method',
              hideOnMobile: true,
              render: (row) => <span className="text-muted">{row.method}</span>,
            },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              render: (row) => <Money value={row.amountCents / 100} />,
            },
            {
              key: 'pdf',
              header: 'PDF',
              align: 'right',
              render: (row) => (
                <a
                  href={`/portal/receipts/${row.id}/pdf`}
                  className="inline-flex items-center gap-1.5 text-xs text-brand hover:underline"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  Download
                </a>
              ),
            },
          ]}
          empty={
            <EmptyState
              title="No receipts yet"
              description="A receipt is issued automatically each time a payment is confirmed."
            />
          }
        />
      </Card>
    </div>
  )
}
