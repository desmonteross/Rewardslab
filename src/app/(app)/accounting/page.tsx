import Link from 'next/link'
import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { ledgerAccountEnum, ledgerEntries, ledgerSourceTypeEnum } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { fmtDate, periodOf, recentPeriods } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Notice, PageHeader, Pagination, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ACCOUNT_KIND, ACCOUNT_LABELS, trialBalance, type LedgerAccountName } from '@/server/services/ledger'

export const metadata = { title: 'Accounting' }
export const dynamic = 'force-dynamic'

const KIND_ORDER: Record<string, number> = { ASSET: 1, LIABILITY: 2, INCOME: 3, EXPENSE: 4 }

export default async function AccountingPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('accounting.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const account = one(params, 'account')
  const source = one(params, 'source')
  const monthParam = one(params, 'month')
  const period = monthParam ? recentPeriods(new Date(), 24).find((entry) => `${entry.year}-${entry.month}` === monthParam) : undefined

  const where = scoped(
    ledgerEntries,
    scope,
    account ? eq(ledgerEntries.account, account as 'CASH_MPESA') : undefined,
    source ? eq(ledgerEntries.sourceType, source as 'PAYMENT') : undefined,
    period ? sql`${ledgerEntries.transactionDate} >= ${period.start}` : undefined,
    period ? sql`${ledgerEntries.transactionDate} <= ${period.end}` : undefined,
  )

  const [balances, rows, [{ total }]] = await Promise.all([
    trialBalance(scope, period ? { from: period.start, to: period.end } : {}),
    db
      .select()
      .from(ledgerEntries)
      .where(where)
      .orderBy(desc(ledgerEntries.transactionDate), desc(ledgerEntries.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(ledgerEntries).where(where),
  ])

  const totalDebits = balances.reduce((sum, row) => sum + row.debits, 0)
  const totalCredits = balances.reduce((sum, row) => sum + row.credits, 0)
  const balanced = totalDebits === totalCredits

  const grouped = balances
    .map((row) => ({ ...row, kind: ACCOUNT_KIND[row.account] }))
    .sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.account.localeCompare(b.account))

  return (
    <>
      <PageHeader
        title="Accounting"
        description="The double-entry ledger every payment, invoice, expense and settlement writes to."
        actions={
          <Link href="/reports" className="btn-secondary">
            Financial reports
          </Link>
        }
      />

      <div className="mb-4">
        <Notice tone={balanced ? 'positive' : 'negative'} title={balanced ? 'The ledger balances' : 'The ledger does not balance'}>
          {balanced ? (
            <>
              Debits and credits both total {formatKES(totalDebits / 100)}
              {period ? ` for ${period.label}` : ' across every posting'}. Entries are append-only: a correction
              is posted as a balancing reversal, never as an edit.
            </>
          ) : (
            <>
              Debits total {formatKES(totalDebits / 100)} against credits of {formatKES(totalCredits / 100)}. This
              should never happen — every posting is validated before it is written.
            </>
          )}
        </Notice>
      </div>

      <Card title="Trial balance" description={period ? period.label : 'All time'} padded={false}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-faint">
              <th className="px-4 py-2.5">Account</th>
              <th className="px-4 py-2.5">Type</th>
              <th className="px-4 py-2.5 text-right">Debits</th>
              <th className="px-4 py-2.5 text-right">Credits</th>
              <th className="px-4 py-2.5 text-right">Balance</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState title="No postings yet" />
                </td>
              </tr>
            )}
            {grouped.map((row) => (
              <tr key={row.account} className="border-b border-line/70 last:border-0">
                <td className="px-4 py-2.5">
                  <Link href={withParams('/accounting', params, { account: row.account, page: undefined })} className="text-ink hover:text-brand">
                    {ACCOUNT_LABELS[row.account as LedgerAccountName] ?? humanise(row.account)}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-xs text-muted">{humanise(row.kind)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatKES(row.debits / 100)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatKES(row.credits / 100)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium text-ink">
                  {formatKES(Math.abs(row.balance) / 100)}
                  <span className="ml-1 text-2xs text-faint">{row.balance >= 0 ? 'Dr' : 'Cr'}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-line bg-canvas/60">
            <tr className="text-sm font-medium">
              <td className="px-4 py-2.5 text-ink">Total</td>
              <td />
              <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatKES(totalDebits / 100)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink">{formatKES(totalCredits / 100)}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-ink">{balanced ? 'Balanced' : 'Out of balance'}</td>
            </tr>
          </tfoot>
        </table>
      </Card>

      <div className="mt-6">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Postings" value={total.toLocaleString()} />
          <KpiCard label="Accounts in use" value={String(balances.length)} />
          <KpiCard label="Total debits" value={formatKES(totalDebits / 100)} />
          <KpiCard label="Total credits" value={formatKES(totalCredits / 100)} />
        </div>

        <FilterBar
          showSearch={false}
          selects={[
            {
              name: 'account',
              label: 'All accounts',
              options: ledgerAccountEnum.enumValues.map((value) => ({
                value,
                label: ACCOUNT_LABELS[value as LedgerAccountName] ?? humanise(value),
              })),
            },
            { name: 'source', label: 'All sources', options: ledgerSourceTypeEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
            {
              name: 'month',
              label: 'All periods',
              options: recentPeriods(new Date(), 12)
                .reverse()
                .map((entry) => ({ value: `${entry.year}-${entry.month}`, label: entry.label })),
            },
          ]}
        />

        <Card padded={false} title="Ledger entries" description="Append-only. Rows are never updated or deleted.">
          <DataTable
            dense
            rows={rows}
            rowKey={(row) => row.id}
            columns={[
              { key: 'date', header: 'Date', render: (row) => <span className="text-xs tabular-nums text-muted">{fmtDate(row.transactionDate)}</span> },
              {
                key: 'narrative',
                header: 'Narrative',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.narrative}</p>
                    <p className="truncate text-2xs text-faint">
                      {humanise(row.sourceType)}
                      {row.sourceReference ? ` · ${row.sourceReference}` : ''}
                    </p>
                  </div>
                ),
              },
              {
                key: 'account',
                header: 'Account',
                render: (row) => (
                  <span className="text-xs text-muted">{ACCOUNT_LABELS[row.account as LedgerAccountName] ?? humanise(row.account)}</span>
                ),
              },
              {
                key: 'debit',
                header: 'Debit',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums text-sm text-ink">
                    {row.entryType === 'DEBIT' ? formatKES(row.amount) : ''}
                  </span>
                ),
              },
              {
                key: 'credit',
                header: 'Credit',
                align: 'right',
                render: (row) => (
                  <span className="tabular-nums text-sm text-ink">
                    {row.entryType === 'CREDIT' ? formatKES(row.amount) : ''}
                  </span>
                ),
              },
              { key: 'group', header: 'Group', align: 'right', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-faint">{row.entryGroupId.slice(-8)}</span> },
            ]}
            empty={<EmptyState title="No entries match these filters" />}
          />
          <Pagination
            page={page}
            pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            buildHref={(next) => withParams('/accounting', params, { page: next })}
          />
        </Card>
      </div>
    </>
  )
}
