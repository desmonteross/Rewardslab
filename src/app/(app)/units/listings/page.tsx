import Link from 'next/link'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { properties, unitListings, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { fmtDate } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { ActionForm } from '@/components/action-form'
import { Card, DataTable, EmptyState, KpiCard, Money, Notice, PageHeader, SectionTabs, humanise } from '@/components/ui'
import { getListingProvider } from '@/server/adapters'
import { delistUnitAction } from './actions'

export const metadata = { title: 'Listings' }
export const dynamic = 'force-dynamic'

const SYNC_LABEL: Record<string, string> = {
  QUEUED: 'Queued for Find a Home',
  SYNCED: 'Live on Find a Home',
  FAILED: 'Portal error',
}

export default async function ListingsPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('units.view')
  const scope = scopeFromSession(session)
  const canManage = can(session, 'units.update')
  const view = one(params, 'view') ?? 'ready'
  const provider = getListingProvider().info()

  // Written out in full: an interpolated column renders as a bare "id", which
  // would bind to the subquery's own table.
  const live = sql`exists (select 1 from unit_listings ul where ul.unit_id = units.id and ul.status = 'LISTED')`

  const [ready, listed, history, [counts]] = await Promise.all([
    db
      .select({
        id: units.id,
        unitNumber: units.unitNumber,
        type: units.type,
        bedrooms: units.bedrooms,
        monthlyRent: units.monthlyRent,
        propertyId: properties.id,
        propertyName: properties.name,
      })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(landlordScoped(properties, scope, eq(units.status, 'VACANT'), sql`not ${live}`))
      .orderBy(asc(properties.name), asc(units.unitNumber)),
    db
      .select({
        listing: unitListings,
        unitNumber: units.unitNumber,
        type: units.type,
        propertyName: properties.name,
      })
      .from(unitListings)
      .innerJoin(units, eq(units.id, unitListings.unitId))
      .innerJoin(properties, eq(properties.id, unitListings.propertyId))
      .where(landlordScoped(properties, scope, eq(unitListings.status, 'LISTED')))
      .orderBy(desc(unitListings.listedAt)),
    db
      .select({
        listing: unitListings,
        unitNumber: units.unitNumber,
        propertyName: properties.name,
      })
      .from(unitListings)
      .innerJoin(units, eq(units.id, unitListings.unitId))
      .innerJoin(properties, eq(properties.id, unitListings.propertyId))
      .where(landlordScoped(properties, scope, eq(unitListings.status, 'DELISTED')))
      .orderBy(desc(unitListings.delistedAt))
      .limit(100),
    db
      .select({ vacant: sql<number>`count(*)::int` })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(and(landlordScoped(properties, scope, eq(units.status, 'VACANT')))),
  ])

  const href = (next: string) => `/units/listings?view=${next}`

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Units', href: '/units' }, { label: 'Listings' }]}
        title="Listings"
        description="Put vacant units on the Find a Home portal so house seekers can find them, and take them off again."
      />

      {provider.mode === 'mock' && (
        <div className="mb-4">
          <Notice tone="brand" title="Find a Home is not connected yet">
            Listing and de-listing work here already. Listed units are queued and will appear on the portal
            once it is integrated, and de-listed ones will be pulled from it.
          </Notice>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard label="Vacant units" value={String(counts?.vacant ?? 0)} />
        <KpiCard label="Ready to list" value={String(ready.length)} tone={ready.length > 0 ? 'warning' : 'positive'} sub="Vacant and not on the portal" />
        <KpiCard label="Listed" value={String(listed.length)} tone="brand" />
      </div>

      <SectionTabs
        current={href(view)}
        tabs={[
          { label: 'Ready to list', href: href('ready'), count: ready.length },
          { label: 'Listed', href: href('listed'), count: listed.length },
          { label: 'De-listed', href: href('history'), count: history.length },
        ]}
      />

      {view === 'ready' && (
        <Card padded={false}>
          <DataTable
            rows={ready}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'unit',
                header: 'Unit',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.unitNumber}</p>
                    <Link href={`/properties/${row.propertyId}?tab=units`} className="truncate text-2xs text-faint hover:text-brand">
                      {row.propertyName}
                    </Link>
                  </div>
                ),
              },
              { key: 'type', header: 'Type', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.type)}</span> },
              { key: 'rent', header: 'Rent', align: 'right', render: (row) => <Money value={row.monthlyRent} /> },
              ...(canManage
                ? [
                    {
                      key: 'action',
                      header: '',
                      align: 'right' as const,
                      render: (row: (typeof ready)[number]) => (
                        <Link href={`/units/listings/new?unit=${row.id}`} className="btn-primary">
                          List
                        </Link>
                      ),
                    },
                  ]
                : []),
            ]}
            empty={<EmptyState title="Nothing waiting" description="Every vacant unit is already listed, or there are no vacant units." />}
          />
        </Card>
      )}

      {view === 'listed' && (
        <Card padded={false}>
          <DataTable
            rows={listed}
            rowKey={(row) => row.listing.id}
            columns={[
              {
                key: 'unit',
                header: 'Listing',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.listing.headline}</p>
                    <p className="truncate text-2xs text-faint">
                      {row.propertyName} · {row.unitNumber} · {humanise(row.type)}
                    </p>
                  </div>
                ),
              },
              { key: 'rent', header: 'Asking', align: 'right', render: (row) => <Money value={row.listing.askingRent} /> },
              { key: 'from', header: 'Available', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.listing.availableFrom)}</span> },
              {
                key: 'sync',
                header: 'Portal',
                hideOnMobile: true,
                render: (row) => (
                  <span className={row.listing.syncStatus === 'FAILED' ? 'text-xs text-negative' : 'text-xs text-muted'} title={row.listing.syncMessage ?? undefined}>
                    {SYNC_LABEL[row.listing.syncStatus]}
                  </span>
                ),
              },
              { key: 'by', header: 'Listed', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.listing.listedAt)} · {row.listing.listedByName ?? '—'}</span> },
              ...(canManage
                ? [
                    {
                      key: 'action',
                      header: '',
                      align: 'right' as const,
                      render: (row: (typeof listed)[number]) => (
                        <ActionForm
                          action={delistUnitAction}
                          label="De-list"
                          pendingLabel="De-listing…"
                          variant="secondary"
                          confirm={`Take ${row.propertyName} ${row.unitNumber} off Find a Home?`}
                        >
                          <input type="hidden" name="unitId" value={row.listing.unitId} />
                        </ActionForm>
                      ),
                    },
                  ]
                : []),
            ]}
            empty={<EmptyState title="No units listed" description="List a vacant unit from the Ready to list tab." />}
          />
        </Card>
      )}

      {view === 'history' && (
        <Card padded={false}>
          <DataTable
            rows={history}
            rowKey={(row) => row.listing.id}
            columns={[
              {
                key: 'unit',
                header: 'Listing',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.listing.headline}</p>
                    <p className="truncate text-2xs text-faint">
                      {row.propertyName} · {row.unitNumber}
                    </p>
                  </div>
                ),
              },
              { key: 'listed', header: 'Listed', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.listing.listedAt)}</span> },
              { key: 'delisted', header: 'De-listed', render: (row) => <span className="text-xs text-muted">{row.listing.delistedAt ? fmtDate(row.listing.delistedAt) : '—'}</span> },
              { key: 'reason', header: 'Why', render: (row) => <span className="text-xs text-muted">{row.listing.delistReason ?? '—'}</span> },
            ]}
            empty={<EmptyState title="Nothing de-listed yet" />}
          />
        </Card>
      )}
    </>
  )
}
