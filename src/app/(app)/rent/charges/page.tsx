import Link from 'next/link'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, properties, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { billingPeriods, periodOf } from '@/lib/dates'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { Card, PageHeader } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { ChargeLines } from '@/components/charge-lines'
import { raiseChargesAction } from '../actions'

export const metadata = { title: 'Raise charges' }
export const dynamic = 'force-dynamic'

/**
 * Raise rent plus one-off charges across a property, or a single unit.
 *
 * The screen has to answer one question before the manager commits: how many
 * tenants will this hit? Everything else — the split, the totals — follows
 * from that number, so it is worked out on the server and shown up front.
 */
export default async function RaiseChargesPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('billing.run')
  const scope = scopeFromSession(session)

  const propertyId = one(params, 'property') ?? ''
  const unitId = one(params, 'unit') ?? ''
  const period = periodOf(new Date())
  const periods = billingPeriods(new Date())

  const propertyRows = await db
    .select({ id: properties.id, code: properties.code, name: properties.name })
    .from(properties)
    .where(landlordScoped(properties, scope))
    .orderBy(asc(properties.name))

  const unitRows = propertyId
    ? await db
        .select({ id: units.id, unitNumber: units.unitNumber })
        .from(units)
        .where(and(eq(units.organizationId, scope.organizationId), eq(units.propertyId, propertyId)))
        .orderBy(asc(units.unitNumber))
    : []

  // The leases this selection would bill — the denominator for every split.
  const targets = propertyId || unitId
    ? await db
        .select({ count: sql<number>`count(*)::int` })
        .from(leases)
        .where(
          and(
            eq(leases.organizationId, scope.organizationId),
            inArray(leases.status, ['ACTIVE', 'EXPIRING']),
            propertyId ? eq(leases.propertyId, propertyId) : undefined,
            unitId ? eq(leases.unitId, unitId) : undefined,
          ),
        )
        .then((rows) => rows[0]?.count ?? 0)
    : 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Raise charges"
        description="Bill rent, and divide any shared costs across the tenants it reaches."
        actions={
          <Link href="/rent" className="btn-secondary">
            Back to rent
          </Link>
        }
      />

      <Card title="Who to bill">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <label className="label mb-1.5 block" htmlFor="property-picker">
              Property
            </label>
            <form id="picker" method="get">
              <select
                id="property-picker"
                name="property"
                className="field"
                defaultValue={propertyId}
              >
                <option value="">Choose a property…</option>
                {propertyRows.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.code} · {property.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="btn-secondary mt-2">
                Load units
              </button>
            </form>
          </div>

          <div>
            <label className="label mb-1.5 block" htmlFor="unit-picker">
              Unit (optional)
            </label>
            <select
              id="unit-picker"
              name="unit"
              form="picker"
              className="field"
              defaultValue={unitId}
              disabled={!propertyId}
            >
              <option value="">Every unit in the property</option>
              {unitRows.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.unitNumber}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-faint">
              {propertyId || unitId
                ? `${targets} active lease${targets === 1 ? '' : 's'} in this selection.`
                : 'Pick a property to see how many tenants this would reach.'}
            </p>
          </div>
        </div>
      </Card>

      {(propertyId || unitId) && (
        <ActionForm action={raiseChargesAction} label="Raise the invoices" pendingLabel="Raising…">
          <input type="hidden" name="propertyId" value={propertyId} />
          <input type="hidden" name="unitId" value={unitId} />

          <div className="space-y-4">
            <div className="sm:max-w-xs">
              <label className="label mb-1.5 block" htmlFor="period">
                Period
              </label>
              <select id="period" name="periodKey" className="field" defaultValue={`${period.year}-${period.month}`}>
                {periods.map((item) => (
                  <option key={`${item.year}-${item.month}`} value={`${item.year}-${item.month}`}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="label mb-2 block">Additional charges</p>
              <ChargeLines tenantCount={targets} />
            </div>

            <p className="text-xs leading-relaxed text-faint">
              Rent for a coming month is normally raised before that month starts, so future
              periods are offered here. Each amount is the total for the whole run and divides equally between the tenants
              billed. Rent comes from each lease and is added automatically. A lease already
              invoiced for this period is skipped, and takes no share.
            </p>
          </div>
        </ActionForm>
      )}
    </div>
  )
}
