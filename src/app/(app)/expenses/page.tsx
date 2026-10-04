import Link from 'next/link'
import { asc, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { approvalStatusEnum, expenseCategoryEnum, expenses, landlords, properties, vendors } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, ownLandlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { can } from '@/lib/rbac'
import { cents } from '@/lib/money'
import { fmtDate } from '@/lib/dates'
import { one, pageOf, withParams, PAGE_SIZE, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, Money, MoneyKpi, PageHeader, Pagination, StatusBadge, humanise } from '@/components/ui'
import { FilterBar } from '@/components/filters'
import { ActionForm } from '@/components/action-form'
import { approveExpenseAction, recordExpenseAction } from './actions'

export const metadata = { title: 'Expenses' }
export const dynamic = 'force-dynamic'

export default async function ExpensesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('expenses.view')
  const scope = scopeFromSession(session)
  const page = pageOf(params)

  const query = one(params, 'q')
  const category = one(params, 'category')
  const approval = one(params, 'approval')
  const propertyId = one(params, 'property')
  const landlordId = one(params, 'landlord')

  const where = landlordScoped(
    expenses,
    scope,
    query ? or(ilike(expenses.description, `%${query}%`), ilike(expenses.reference, `%${query}%`)) : undefined,
    category ? eq(expenses.category, category as 'MAINTENANCE') : undefined,
    approval ? eq(expenses.approvalStatus, approval as 'PENDING') : undefined,
    propertyId ? eq(expenses.propertyId, propertyId) : undefined,
    landlordId ? eq(expenses.landlordId, landlordId) : undefined,
  )

  const [rows, [{ total }], [totals], byCategory, propertyOptions, landlordOptions, vendorOptions] = await Promise.all([
    db
      .select({
        id: expenses.id,
        reference: expenses.reference,
        category: expenses.category,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        description: expenses.description,
        approvalStatus: expenses.approvalStatus,
        paymentStatus: expenses.paymentStatus,
        rechargeToLandlord: expenses.rechargeToLandlord,
        approvedByName: expenses.approvedByName,
        settlementId: expenses.settlementId,
        propertyId: properties.id,
        propertyName: properties.name,
        landlordId: landlords.id,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
        vendorName: vendors.name,
      })
      .from(expenses)
      .innerJoin(properties, eq(properties.id, expenses.propertyId))
      .innerJoin(landlords, eq(landlords.id, expenses.landlordId))
      .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
      .where(where)
      .orderBy(desc(expenses.expenseDate))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(expenses)
      .innerJoin(properties, eq(properties.id, expenses.propertyId))
      .innerJoin(landlords, eq(landlords.id, expenses.landlordId))
      .where(where),
    db
      .select({
        approved: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.approvalStatus} = 'APPROVED'), 0)`,
        pending: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.approvalStatus} = 'PENDING'), 0)`,
        pendingCount: sql<number>`count(*) filter (where ${expenses.approvalStatus} = 'PENDING')::int`,
        recharged: sql<string>`coalesce(sum(${expenses.amount}) filter (where ${expenses.settlementId} is not null), 0)`,
      })
      .from(expenses)
      .where(landlordScoped(expenses, scope)),
    db
      .select({ category: expenses.category, total: sql<string>`coalesce(sum(${expenses.amount}), 0)` })
      .from(expenses)
      .where(landlordScoped(expenses, scope, eq(expenses.approvalStatus, 'APPROVED')))
      .groupBy(expenses.category)
      .orderBy(desc(sql`coalesce(sum(${expenses.amount}), 0)`)),
    db.select({ id: properties.id, name: properties.name }).from(properties).where(landlordScoped(properties, scope)).orderBy(asc(properties.name)),
    db
      .select({ id: landlords.id, name: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})` })
      .from(landlords)
      .where(ownLandlordScoped(landlords, scope))
      .orderBy(asc(landlords.code)),
    db.select({ id: vendors.id, name: vendors.name }).from(vendors).where(scoped(vendors, scope, eq(vendors.isActive, true))).orderBy(asc(vendors.name)),
  ])

  const canCreate = can(session, 'expenses.create')
  const canApprove = can(session, 'expenses.approve')

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Property costs, their approval, and how they flow into landlord settlements."
        actions={
          <Link href="/settlements" className="btn-secondary">
            Settlements
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MoneyKpi label="Approved all time" amount={totals?.approved ?? 0} />
        <MoneyKpi
          label="Awaiting approval"
          amount={totals?.pending ?? 0}
          tone={cents(totals?.pending) > 0 ? 'warning' : 'positive'}
          sub={`${totals?.pendingCount ?? 0} expenses`}
        />
        <MoneyKpi label="Recovered in settlements" amount={totals?.recharged ?? 0} tone="positive" />
        <div className="card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-faint">Top categories</p>
          <ul className="mt-2 space-y-1">
            {byCategory.slice(0, 3).map((row) => (
              <li key={row.category} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="truncate text-muted">{humanise(row.category)}</span>
                <span className="shrink-0 tabular-nums text-ink">{Number(row.total).toLocaleString()}</span>
              </li>
            ))}
            {byCategory.length === 0 && <li className="text-xs text-faint">Nothing approved yet</li>}
          </ul>
        </div>
      </div>

      {canCreate && (
        <div className="mb-4">
          <Card title="Record an expense" description="Costs are held for approval before they reach a landlord statement.">
            <ActionForm action={recordExpenseAction} label="Record expense" pendingLabel="Recording…">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-medium text-muted">
                  Property
                  <select name="propertyId" className="field mt-1" defaultValue="" required>
                    <option value="">Choose a property…</option>
                    {propertyOptions.map((property) => (
                      <option key={property.id} value={property.id}>
                        {property.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Category
                  <select name="category" className="field mt-1" defaultValue="MAINTENANCE">
                    {expenseCategoryEnum.enumValues.map((value) => (
                      <option key={value} value={value}>
                        {humanise(value)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Amount (KES)
                  <input name="amount" type="number" min="1" step="1" className="field mt-1" required />
                </label>
                <label className="block text-xs font-medium text-muted sm:col-span-2">
                  Description
                  <input name="description" className="field mt-1" placeholder="Monthly security guarding" required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Vendor
                  <select name="vendorId" className="field mt-1" defaultValue="">
                    <option value="">No vendor</option>
                    {vendorOptions.map((vendor) => (
                      <option key={vendor.id} value={vendor.id}>
                        {vendor.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-muted">
                  Date
                  <input name="expenseDate" type="date" className="field mt-1" defaultValue={new Date().toISOString().slice(0, 10)} />
                </label>
                <label className="flex items-center gap-2 pt-6 text-xs text-muted">
                  <input type="checkbox" name="recharge" defaultChecked className="rounded border-line" />
                  Recover from the landlord settlement
                </label>
              </div>
            </ActionForm>
          </Card>
        </div>
      )}

      <FilterBar
        searchPlaceholder="Search description or reference…"
        selects={[
          { name: 'category', label: 'All categories', options: expenseCategoryEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'approval', label: 'All approvals', options: approvalStatusEnum.enumValues.map((value) => ({ value, label: humanise(value) })) },
          { name: 'property', label: 'All properties', options: propertyOptions.map((row) => ({ value: row.id, label: row.name })) },
          { name: 'landlord', label: 'All landlords', options: landlordOptions.map((row) => ({ value: row.id, label: row.name })) },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'description',
              header: 'Expense',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.description}</p>
                  <p className="truncate text-2xs text-faint">
                    {row.reference} · {row.propertyName}
                    {row.vendorName ? ` · ${row.vendorName}` : ''}
                  </p>
                </div>
              ),
            },
            { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.category)}</span> },
            { key: 'landlord', header: 'Landlord', hideOnMobile: true, render: (row) => <Link href={`/landlords/${row.landlordId}`} className="text-xs text-muted hover:text-brand">{row.landlordName}</Link> },
            { key: 'date', header: 'Date', render: (row) => <span className="text-xs text-muted">{fmtDate(row.expenseDate)}</span> },
            { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
            {
              key: 'recharge',
              header: 'Recovered',
              align: 'center',
              hideOnMobile: true,
              render: (row) =>
                row.settlementId ? (
                  <Link href={`/settlements/${row.settlementId}`} className="text-xs text-positive hover:underline">
                    Settled
                  </Link>
                ) : row.rechargeToLandlord ? (
                  <span className="text-xs text-muted">Pending</span>
                ) : (
                  <span className="text-xs text-faint">Absorbed</span>
                ),
            },
            { key: 'approval', header: 'Approval', align: 'right', render: (row) => <StatusBadge status={row.approvalStatus} /> },
            {
              key: 'action',
              header: '',
              align: 'right',
              render: (row) =>
                canApprove && row.approvalStatus === 'PENDING' ? (
                  <div className="flex justify-end gap-1.5">
                    <ActionForm action={approveExpenseAction} label="Approve" buttonClassName="px-2 py-1 text-xs" className="space-y-0">
                      <input type="hidden" name="expenseId" value={row.id} />
                      <input type="hidden" name="decision" value="approve" />
                    </ActionForm>
                  </div>
                ) : (
                  <span className="text-2xs text-faint">{row.approvedByName ?? ''}</span>
                ),
            },
          ]}
          empty={<EmptyState title="No expenses match these filters" />}
        />
        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          buildHref={(next) => withParams('/expenses', params, { page: next })}
        />
      </Card>
    </>
  )
}
