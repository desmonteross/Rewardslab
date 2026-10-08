import { Download, FileSpreadsheet } from 'lucide-react'
import { requireTenantSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { Card, EmptyState, Money, PageHeader, StatusBadge } from '@/components/ui'
import { portalPaymentSummary, portalReceipts, portalStatement } from '@/server/queries/portal'

export const metadata = { title: 'Payments' }

export default async function PortalPaymentsPage() {
  const session = await requireTenantSession()
  const scope = scopeFromSession(session)

  const [receipts, statement, summary] = await Promise.all([
    portalReceipts(scope),
    portalStatement(scope),
    portalPaymentSummary(scope),
  ])

  const closingBalance = statement.length > 0 ? statement[statement.length - 1].balanceCents : 0
  const recent = [...statement].reverse().slice(0, 40)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        description={`${summary.paymentCount} payment${summary.paymentCount === 1 ? '' : 's'} on record.`}
        actions={
          <>
            <a href="/portal/statement/pdf" className="btn-secondary">
              <Download className="h-4 w-4" aria-hidden />
              Statement (PDF)
            </a>
            <a href="/portal/statement/csv" className="btn-secondary">
              <FileSpreadsheet className="h-4 w-4" aria-hidden />
              CSV
            </a>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">Total paid</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-ink">
            <Money value={summary.totalPaidCents / 100} />
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">Payments</p>
          <p className="mt-2 text-xl font-semibold tracking-tight text-ink">{summary.paymentCount}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">Current balance</p>
          <p
            className={
              closingBalance > 0
                ? 'mt-2 text-xl font-semibold tracking-tight text-negative'
                : 'mt-2 text-xl font-semibold tracking-tight text-positive'
            }
          >
            <Money value={closingBalance / 100} />
          </p>
        </div>
      </div>

      <Card
        title="Receipts"
        description="Every payment we have recorded from you. Download any of them as a PDF."
      >
        {receipts.length === 0 ? (
          <EmptyState
            title="No receipts yet"
            description="Once a payment is received and matched, its receipt appears here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {receipts.map((receipt) => (
              <li key={receipt.id} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {receipt.periodLabel ?? receipt.number}
                  </p>
                  <p className="truncate text-xs text-faint">
                    {fmtDate(receipt.paidAt)} · {receipt.number}
                    {receipt.reference && ` · ${receipt.reference}`}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Money value={receipt.amountCents / 100} />
                  <StatusBadge status={receipt.method} />
                  <a
                    href={`/portal/receipts/${receipt.id}/pdf`}
                    className="btn-secondary px-2.5"
                    aria-label={`Download receipt ${receipt.number}`}
                    title="Download receipt"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card
        title="Statement"
        description="Every charge and every payment, newest first, with the balance after each one."
      >
        {recent.length === 0 ? (
          <EmptyState title="Nothing on your statement yet" />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="pb-2 pr-3 font-medium">Date</th>
                  <th className="pb-2 pr-3 font-medium">Description</th>
                  <th className="pb-2 pr-3 text-right font-medium">Charge</th>
                  <th className="pb-2 pr-3 text-right font-medium">Paid</th>
                  <th className="pb-2 text-right font-medium">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recent.map((line, index) => (
                  <tr key={`${line.reference}-${index}`}>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-muted">{fmtDate(line.date)}</td>
                    <td className="py-2.5 pr-3 text-ink">{line.description}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-ink">
                      {line.chargeCents > 0 ? <Money value={line.chargeCents / 100} /> : '—'}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums text-positive">
                      {line.paymentCents > 0 ? <Money value={line.paymentCents / 100} /> : '—'}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right tabular-nums font-medium text-ink">
                      <Money value={line.balanceCents / 100} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {statement.length > recent.length && (
          <p className="mt-4 text-xs text-faint">
            Showing the most recent {recent.length} of {statement.length} entries. The PDF and CSV contain
            all of them.
          </p>
        )}
      </Card>
    </div>
  )
}
