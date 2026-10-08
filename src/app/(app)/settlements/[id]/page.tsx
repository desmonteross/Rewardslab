import Link from 'next/link'
import { notFound } from 'next/navigation'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, ledgerEntries, properties, settlementItems, settlements } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, fmtDateTime } from '@/lib/dates'
import { Card, DataTable, DetailList, EmptyState, Money, MoneyKpi, Notice, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { PrintButton } from '@/components/print-button'
import { approveSettlementAction, processSettlementAction } from '../actions'

export const dynamic = 'force-dynamic'

export default async function SettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('settlements.view')
  const scope = scopeFromSession(session)

  const [record] = await db
    .select({
      settlement: settlements,
      landlordId: landlords.id,
      landlordName: landlords.fullName,
      landlordCompany: landlords.companyName,
      landlordKraPin: landlords.kraPin,
      payoutMethod: landlords.payoutMethod,
    })
    .from(settlements)
    .innerJoin(landlords, eq(landlords.id, settlements.landlordId))
    .where(landlordScoped(settlements, scope, eq(settlements.id, id)))
    .limit(1)

  if (!record) notFound()
  const { settlement } = record

  const [items, ledger] = await Promise.all([
    db
      .select({
        item: settlementItems,
        propertyName: properties.name,
      })
      .from(settlementItems)
      .leftJoin(properties, eq(properties.id, settlementItems.propertyId))
      .where(scoped(settlementItems, scope, eq(settlementItems.settlementId, id)))
      .orderBy(asc(settlementItems.type), asc(settlementItems.description)),
    db
      .select()
      .from(ledgerEntries)
      .where(scoped(ledgerEntries, scope, eq(ledgerEntries.sourceId, id)))
      .orderBy(asc(ledgerEntries.entryType)),
  ])

  const byProperty = new Map<string, number>()
  for (const row of items) {
    if (row.item.type !== 'RENT') continue
    const key = row.propertyName ?? 'Unallocated'
    byProperty.set(key, (byProperty.get(key) ?? 0) + cents(row.item.grossAmount))
  }

  const canApprove = can(session, 'settlements.approve')
  const canProcess = can(session, 'settlements.process')

  return (
    <>
      <div className="no-print">
        <PageHeader
          breadcrumb={[{ label: 'Settlements', href: '/settlements' }, { label: settlement.reference }]}
          title={settlement.reference}
          description={`${record.landlordCompany ?? record.landlordName} · ${fmtDate(settlement.periodStart)} to ${fmtDate(settlement.periodEnd)}`}
          actions={
            <>
              <Link href={`/landlords/${record.landlordId}`} className="btn-secondary">
                Landlord
              </Link>
              <PrintButton label="Print" />
            </>
          }
        />
      </div>

      {settlement.status === 'FAILED' && (
        <div className="mb-4 no-print">
          <Notice tone="negative" title="This payout failed">
            {settlement.failureReason ?? 'The provider rejected the payout.'} Correct the landlord’s payout
            details and process the batch again.
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MoneyKpi label="Gross rent" amount={settlement.grossAmount} />
        <MoneyKpi label="Platform commission" amount={settlement.commissionAmount} tone="brand" />
        <MoneyKpi label="Management fee" amount={settlement.managementFee} />
        <MoneyKpi label="Expenses recovered" amount={settlement.expenseAmount} tone="serious" />
        <MoneyKpi label="Adjustments" amount={settlement.adjustmentAmount} />
        <MoneyKpi label="Net settlement" amount={settlement.netAmount} tone="positive" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" title="Settlement summary" padded={false}>
          <div className="px-5 py-4">
            <DetailList
              columns={3}
              items={[
                { label: 'Reference', value: <span className="font-mono">{settlement.reference}</span> },
                { label: 'Status', value: <StatusBadge status={settlement.status} /> },
                { label: 'Period', value: `${fmtDate(settlement.periodStart)} – ${fmtDate(settlement.periodEnd)}` },
                { label: 'Payout method', value: humanise(settlement.method) },
                { label: 'Destination', value: settlement.destination ?? '—' },
                { label: 'Provider reference', value: settlement.externalReference ?? '—' },
                { label: 'Created by', value: settlement.createdByName ?? 'System' },
                { label: 'Approved by', value: settlement.approvedByName ?? '—' },
                { label: 'Processed at', value: settlement.processedAt ? fmtDateTime(settlement.processedAt) : '—' },
              ]}
            />
          </div>

          <div className="border-t border-line">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="px-5 py-2 text-muted">Gross rent collected</td>
                  <td className="px-5 py-2 text-right tabular-nums text-ink">{formatKES(settlement.grossAmount)}</td>
                </tr>
                <tr>
                  <td className="px-5 py-2 text-muted">Less platform commission</td>
                  <td className="px-5 py-2 text-right tabular-nums text-ink">
                    ({formatKES(settlement.commissionAmount)})
                  </td>
                </tr>
                {cents(settlement.managementFee) > 0 && (
                  <tr>
                    <td className="px-5 py-2 text-muted">Less management fee</td>
                    <td className="px-5 py-2 text-right tabular-nums text-ink">({formatKES(settlement.managementFee)})</td>
                  </tr>
                )}
                {cents(settlement.expenseAmount) > 0 && (
                  <tr>
                    <td className="px-5 py-2 text-muted">Less approved expenses</td>
                    <td className="px-5 py-2 text-right tabular-nums text-ink">({formatKES(settlement.expenseAmount)})</td>
                  </tr>
                )}
                {cents(settlement.adjustmentAmount) !== 0 && (
                  <tr>
                    <td className="px-5 py-2 text-muted">Adjustments</td>
                    <td className="px-5 py-2 text-right tabular-nums text-ink">{formatKES(settlement.adjustmentAmount)}</td>
                  </tr>
                )}
                <tr className="border-t border-line">
                  <td className="px-5 py-3 font-medium text-ink">Net settlement</td>
                  <td className="px-5 py-3 text-right text-lg font-semibold tabular-nums text-ink">
                    {formatKES(settlement.netAmount)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {byProperty.size > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="label mb-3">By property</p>
              <ul className="space-y-1.5">
                {Array.from(byProperty.entries()).map(([name, value]) => (
                  <li key={name} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-muted">{name}</span>
                    <span className="shrink-0 tabular-nums text-ink">{formatKES(value / 100)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <div className="space-y-4 no-print">
          {settlement.status === 'PENDING' && canApprove && (
            <Card title="Approve" description="Approval schedules the batch for payout.">
              <ActionForm action={approveSettlementAction} label="Approve settlement" pendingLabel="Approving…">
                <input type="hidden" name="settlementId" value={id} />
              </ActionForm>
            </Card>
          )}

          {(settlement.status === 'SCHEDULED' || settlement.status === 'FAILED') && canProcess && (
            <Card title="Process payout" description={`Disburses ${formatKES(settlement.netAmount)} to the landlord.`}>
              <ActionForm
                action={processSettlementAction}
                label={settlement.status === 'FAILED' ? 'Retry payout' : 'Process payout'}
                pendingLabel="Processing…"
                confirm={`Pay out ${formatKES(settlement.netAmount)} to ${record.landlordCompany ?? record.landlordName}?`}
              >
                <input type="hidden" name="settlementId" value={id} />
                <p className="text-2xs leading-relaxed text-faint">
                  Phase 1 uses the mock payout provider — no money moves, but the ledger entries, statuses and
                  audit trail are all produced exactly as they would be in production.
                </p>
              </ActionForm>
            </Card>
          )}

          <Card title="Payout details">
            <DetailList
              columns={1}
              items={[
                { label: 'Landlord', value: <Link href={`/landlords/${record.landlordId}`} className="link">{record.landlordCompany ?? record.landlordName}</Link> },
                { label: 'KRA PIN', value: record.landlordKraPin ?? '—' },
                { label: 'Method', value: humanise(record.payoutMethod) },
                { label: 'Destination', value: settlement.destination ?? '—' },
              ]}
            />
          </Card>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Settlement items" padded={false}>
          <DataTable
            dense
            rows={items}
            rowKey={(row) => row.item.id}
            columns={[
              { key: 'type', header: 'Type', render: (row) => <span className="text-xs text-muted">{humanise(row.item.type)}</span> },
              { key: 'description', header: 'Description', render: (row) => <span className="text-sm">{row.item.description}</span> },
              { key: 'property', header: 'Property', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.propertyName ?? '—'}</span> },
              { key: 'gross', header: 'Gross', align: 'right', render: (row) => <Money value={row.item.grossAmount} muted /> },
              { key: 'net', header: 'Net effect', align: 'right', render: (row) => <Money value={row.item.netAmount} tone={cents(row.item.netAmount) < 0 ? 'negative' : 'neutral'} /> },
            ]}
            empty={<EmptyState title="No items in this batch" />}
          />
        </Card>

        <Card title="Accounting entries" description="Posted when the payout is processed." padded={false}>
          {ledger.length === 0 ? (
            <EmptyState title="Not yet posted" description="Entries are written when the settlement is processed." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-b border-line/70 last:border-0">
                    <td className="px-4 py-2 text-muted">{humanise(entry.account)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                      {entry.entryType === 'DEBIT' ? formatKES(entry.amount) : ''}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-ink">
                      {entry.entryType === 'CREDIT' ? formatKES(entry.amount) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </>
  )
}
