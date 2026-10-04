import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { vendors } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, DataTable, EmptyState, KpiCard, Money, PageHeader } from '@/components/ui'
import { FilterBar } from '@/components/filters'

export const metadata = { title: 'Vendors' }
export const dynamic = 'force-dynamic'

export default async function VendorsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('vendors.view')
  const scope = scopeFromSession(session)

  const query = one(params, 'q')
  const category = one(params, 'category')

  const where = scoped(
    vendors,
    scope,
    query ? or(ilike(vendors.name, `%${query}%`), ilike(vendors.contactName, `%${query}%`), ilike(vendors.phone, `%${query}%`)) : undefined,
    category ? eq(vendors.category, category) : undefined,
  )

  const [rows, categories, [summary]] = await Promise.all([
    db
      .select({
        id: vendors.id,
        name: vendors.name,
        category: vendors.category,
        contactName: vendors.contactName,
        phone: vendors.phone,
        email: vendors.email,
        kraPin: vendors.kraPin,
        rating: vendors.rating,
        isActive: vendors.isActive,
        jobs: sql<number>`(select count(*)::int from maintenance_tickets t where t.vendor_id = vendors.id)`,
        spend: sql<string>`(select coalesce(sum(e.amount), 0) from expenses e where e.vendor_id = vendors.id and e.approval_status = 'APPROVED')`,
      })
      .from(vendors)
      .where(where)
      .orderBy(asc(vendors.name)),
    db.selectDistinct({ category: vendors.category }).from(vendors).where(scoped(vendors, scope)).orderBy(asc(vendors.category)),
    db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${vendors.isActive})::int`,
      })
      .from(vendors)
      .where(scoped(vendors, scope)),
  ])

  const totalSpend = rows.reduce((sum, row) => sum + Number(row.spend), 0)

  return (
    <>
      <PageHeader title="Vendors" description="The contractors who carry out maintenance work across the portfolio." />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Vendors" value={String(summary?.total ?? 0)} sub={`${summary?.active ?? 0} active`} />
        <KpiCard label="Jobs assigned" value={String(rows.reduce((sum, row) => sum + row.jobs, 0))} />
        <KpiCard label="Approved spend" value={`KES ${totalSpend.toLocaleString()}`} />
      </div>

      <FilterBar
        searchPlaceholder="Search vendor, contact or phone…"
        selects={[
          {
            name: 'category',
            label: 'All categories',
            options: categories.filter((row) => row.category).map((row) => ({ value: row.category, label: row.category })),
          },
        ]}
      />

      <Card padded={false}>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Vendor',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                  <p className="truncate text-2xs text-faint">{row.category}</p>
                </div>
              ),
            },
            {
              key: 'contact',
              header: 'Contact',
              hideOnMobile: true,
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm text-muted">{row.contactName ?? '—'}</p>
                  <p className="truncate text-2xs text-faint">{row.phone ?? ''}</p>
                </div>
              ),
            },
            { key: 'email', header: 'Email', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.email ?? '—'}</span> },
            { key: 'kra', header: 'KRA PIN', hideOnMobile: true, render: (row) => <span className="font-mono text-2xs text-muted">{row.kraPin ?? '—'}</span> },
            { key: 'jobs', header: 'Jobs', align: 'right', render: (row) => <span className="tabular-nums text-sm text-ink">{row.jobs}</span> },
            { key: 'spend', header: 'Approved spend', align: 'right', render: (row) => <Money value={row.spend} /> },
            {
              key: 'rating',
              header: 'Rating',
              align: 'right',
              render: (row) => (
                <span className="text-sm text-muted">{row.rating ? `${row.rating}/5` : '—'}</span>
              ),
            },
          ]}
          empty={<EmptyState title="No vendors match these filters" />}
        />
      </Card>
    </>
  )
}
