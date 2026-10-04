import Link from 'next/link'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, settlements, settlementStatusEnum } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, ownLandlordScoped, scopeFromSession } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents } from '@/lib/money'
import { addDays, fmtDate, fmtDayMonth } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, MoneyKpi, Notice, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { createSettlementAction } from './actions'

export const metadata = { title: 'Settlements' }
export const dynamic = 'force-dynamic'

export default async function SettlementsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('settlements.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const status = one(params, 'status')
  const landlordId = one(params, 'landlord')

  const where = landlordScoped(
    settlements,
    scope,
    status ? eq(settlements.status, status as 'PENDING') : undefined,
    landlordId ? eq(settlements.landlordId, landlordId) : undefined,
  )

  const [rows, [{ total }], [totals], landlordOptions, unsettled] = await Promise.all([
    db
      .select({
        id: settlements.id,
        reference: settlements.reference,
        periodStart: settlements.periodStart,
        periodEnd: settlements.periodEnd,
        grossAmount: settlements.grossAmount,
        commissionAmount: settlements.commissionAmount,
        managementFee: settlements.managementFee,
        expenseAmount: settlements.expenseAmount,
        netAmount: settlements.netAmount,
        status: settlements.status,
        method: settlements.method,
        destination: settlements.destination,
        processedAt: settlements.processedAt,
        landlordId: landlords.id,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
      })
      .from(settlements)
      .innerJoin(landlords, eq(landlords.id, settlements.landlordId))
      .where(where)
      .orderBy(desc(settlements.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(settlements)
      .innerJoin(landlords, eq(landlords.id, settlements.landlordId))
      .where(where),
    db
      .select({
        settled: sql<string>`coalesce(sum(${settlements.netAmount}) filter (where ${settlements.status} = 'SETTLED'), 0)`,
        pending: sql<string>`coalesce(sum(${settlements.netAmount}) filter (where ${settlements.status} in ('PENDING','SCHEDULED')), 0)`,
        pendingCount: sql<number>`count(*) filter (where ${settlements.status} in ('PENDING','SCHEDULED'))::int`,
        failed: sql<number>`count(*) filter (where ${settlements.status} = 'FAILED')::int`,
        commission: sql<string>`coalesce(sum(${settlements.commissionAmount}), 0)`,
      })
      .from(settlements)
      .where(landlordScoped(settlements, scope)),
    db
      .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
      .from(landlords)
      .where(ownLandlordScoped(landlords, scope, eq(landlords.isActive, true)))
      .orderBy(asc(landlords.code)),
    db
      .select({
        landlordId: landlords.id,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
        amount: sql<string>`coalesce(sum(p.gross_amount), 0)`,
        count: sql<number>`count(p.id)::int`,
      })
      .from(landlords)
      .innerJoin(
        sql`payments p`,
        sql`p.landlord_id = landlords.id and p.status = 'CONFIRMED' and p.settlement_status = 'PENDING' and p.settlement_id is null`,
      )
      .where(ownLandlordScoped(landlords, scope))
      .groupBy(landlords.id, landlords.companyName, landlords.fullName),
  ])

  const canCreate = can(session, 'settlements.create')
  const today = new Date()

  return (
    <>
      <PageHeader
        title="Settlements"
        description="Money owed onward to landlords — gross rent less commission, management fees and approved expenses."
        actions={
          <Link href="/reports/settlement-report" className="btn-secondary">
            Settlement report
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyKpi label="Settled all time" amount={totals?.settled ?? 0} tone="positive" />
        <MoneyKpi
          label="Awaiting payout"
          amount={totals?.pending ?? 0}
          tone={cents(totals?.pending) > 0 ? 'warning' : 'positive'}
          sub={`${totals?.pendingCount ?? 0} batches`}
        />
        <MoneyKpi label="Commission retained" amount={totals?.commission ?? 0} tone="brand" />
        <MoneyKpi
          label="Unsettled receipts"
          amount={unsettled.reduce((sum, row) => sum + Number(row.amount), 0).toFixed(2)}
          sub={`${unsettled.reduce((sum, row) => sum + row.count, 0)} payments across ${unsettled.length} landlords`}
        />
      </div>

      {(totals?.failed ?? 0) > 0 && (
        <div className="mb-4">
          <Notice tone="negative" title={`${totals?.failed} failed payouts`}>
            A payout was rejected by the provider — most often because the landlord has no M-Pesa number or bank
            account on file.{' '}
            <Link href="/settlements?status=FAILED" className="link">
              Review them
            </Link>
            .
          </Notice>
        </div>
      )}

      {canCreate && (
        <div className="mb-4 grid gap-4 lg:grid-cols-3">
          <Card
            className="lg:col-span-2"
            title="Create a settlement batch"
            description="Collects every confirmed, unsettled receipt for a landlord in the period."
          >
            <ActionForm action={createSettlementAction} label="Create batch" pendingLabel="Building…">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-muted sm:col-span-2">
                  Landlord
                  <select name="landlordId" className="field mt-1" defaultValue="" required>
                    <option value="">Choose a landlord…</option>
                    {landlordOptions.map((landlord) => (
                      <option key={landlord.id} value={landlord.id}>
                        {landlord.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Period start
                  <input
                    name="periodStart"
                    type="date"
                    className="field mt-1"
                    defaultValue={addDays(today, -7).toISOString().slice(0, 10)}
                    required
                  />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Period end
                  <input name="periodEnd" type="date" className="field mt-1" defaultValue={today.toISOString().slice(0, 10)} required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Adjustment (KES, may be negative)
                  <input name="adjustment" type="number" step="1" className="field mt-1" defaultValue="0" />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Adjustment note
                  <input name="adjustmentNote" className="field mt-1" placeholder="Reason for the adjustment" />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
                  <input type="checkbox" name="includeExpenses" defaultChecked className="rounded border-line" />
                  Deduct approved, recoverable expenses falling in the period
                </label>
              </div>
            </ActionForm>
          </Card>

          <Card title="Ready to settle" description="Confirmed receipts not yet in a batch." padded={false}>
            {unsettled.length === 0 ? (
              <EmptyState title="Everything is settled" description="No confirmed receipts are waiting." />
            ) : (
              <ul className="divide-y divide-line">
                {unsettled.map((row) => (
                  <li key={row.landlordId} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-ink">{row.landlordName}</p>
                      <p className="text-2xs text-faint">{row.count} payments</p>
                    </div>
                    <Money value={row.amount} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <FilterBar
        showSearch={false}
        selects={[
          { name: 'status', label: 'All statuses', options: settlementStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'landlord', label: 'All landlords', options: landlordOptions.map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          rowHref={(row) => `/settlements/${row.id}`}
          columns={[
            { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
            {
              key: 'landlord',
              header: 'Landlord',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{row.landlordName}</p>
                  <p className="truncate text-2xs text-faint">
                    {humanise(row.method)} · {row.destination ?? '—'}
                  </p>
                </div>
              ),
            },
            { key: 'period', header: 'Period', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDayMonth(row.periodStart)} – {fmtDayMonth(row.periodEnd)}</span> },
            { key: 'gross', header: 'Gross rent', align: 'right', render: (row) => <Money value={row.grossAmount} muted /> },
            { key: 'commission', header: 'Commission', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.commissionAmount} muted /> },
            { key: 'expenses', header: 'Expenses', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.expenseAmount} muted /> },
            { key: 'net', header: 'Net settlement', align: 'right', render: (row) => <Money value={row.netAmount} /> },
            { key: 'processed', header: 'Paid', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.processedAt ? fmtDate(row.processedAt) : '—'}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
          ]}
          empty={<EmptyState title="No settlements match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/settlements', params, { page: next })}
        />
      </Card>
    </>
  )
}
