import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Download } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { formatKES } from '@/lib/money'
import { Card, DetailList, PageHeader } from '@/components/ui'
import { portalReceipt } from '@/server/queries/portal'

export const dynamic = 'force-dynamic'

export default async function PortalReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const session = await requireSession()
  const { id } = await params

  // The query is tenant-scoped, so another tenant's receipt id simply does not
  // resolve — the same answer as an id that never existed, which is what stops
  // this page being used to discover what receipts exist.
  const row = await portalReceipt(scopeFromSession(session), id)
  if (!row) notFound()

  const { receipt } = row

  return (
    <div className="space-y-5">
      <PageHeader
        title={receipt.number}
        description={`Receipt issued ${fmtDate(receipt.paidAt)}.`}
        breadcrumb={[{ label: 'Receipts', href: '/portal/receipts' }, { label: receipt.number }]}
        actions={
          <>
            <Link href="/portal/receipts" className="btn-secondary">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              All receipts
            </Link>
            <a href={`/portal/receipts/${receipt.id}/pdf`} className="btn-primary">
              <Download className="h-4 w-4" aria-hidden />
              Download PDF
            </a>
          </>
        }
      />

      <Card>
        <DetailList
          columns={2}
          items={[
            { label: 'Amount', value: formatKES(Number(receipt.amount)) },
            { label: 'Paid on', value: fmtDate(receipt.paidAt) },
            { label: 'Method', value: receipt.method },
            { label: 'Reference', value: row.externalReference ?? receipt.number },
            { label: 'Property', value: row.propertyName ?? '—' },
            { label: 'Unit', value: row.unitNumber ?? '—' },
            { label: 'Tenant', value: `${row.tenantName} · ${row.tenantCode}` },
            { label: 'Issued by', value: row.organizationName },
          ]}
        />
      </Card>
    </div>
  )
}
