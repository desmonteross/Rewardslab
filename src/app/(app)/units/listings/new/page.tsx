import Link from 'next/link'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { properties, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { landlordScoped, scopeFromSession } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { ActionForm } from '@/components/action-form'
import { Card, EmptyState, PageHeader, humanise } from '@/components/ui'
import { listUnitAction } from '../actions'

export const metadata = { title: 'List a unit' }
export const dynamic = 'force-dynamic'

export default async function NewListingPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const scope = scopeFromSession(await requirePermission('units.update'))
  const unitId = one(params, 'unit') ?? ''

  const [row] = unitId
    ? await db
        .select({ unit: units, propertyName: properties.name, town: properties.town, area: properties.area })
        .from(units)
        .innerJoin(properties, eq(properties.id, units.propertyId))
        .where(landlordScoped(properties, scope, eq(units.id, unitId)))
        .limit(1)
    : []

  const header = (
    <PageHeader
      breadcrumb={[{ label: 'Units', href: '/units' }, { label: 'Listings', href: '/units/listings' }, { label: 'List a unit' }]}
      title={row ? `List ${row.propertyName} ${row.unit.unitNumber}` : 'List a unit'}
      description="What house seekers will see on Find a Home. Everything is optional except what is already filled in."
    />
  )

  if (!row || row.unit.status !== 'VACANT') {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title={row ? `Unit ${row.unit.unitNumber} is ${row.unit.status.toLowerCase()}` : 'Choose a unit to list'}
            description="Only vacant units can be listed. Pick one from Ready to list."
            action={
              <Link href="/units/listings" className="btn-secondary">
                Go to listings
              </Link>
            }
          />
        </Card>
      </>
    )
  }

  const { unit } = row
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      {header}
      <Card>
        <ActionForm action={listUnitAction} label="List on Find a Home" pendingLabel="Listing…">
          <input type="hidden" name="unitId" value={unit.id} />
          <p className="text-sm text-muted">
            {humanise(unit.type)} · {unit.bedrooms} bed · {unit.bathrooms} bath · deposit {formatKES(unit.deposit)}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted sm:col-span-3">
              Headline
              <input
                name="headline"
                className="field mt-1"
                defaultValue={`${humanise(unit.type)} at ${row.propertyName}, ${row.area ?? row.town}`}
                maxLength={120}
              />
            </label>
            <label className="block text-xs font-medium text-muted">
              Asking rent (KES)
              <input name="askingRent" type="number" min="1" step="1" className="field mt-1" defaultValue={cents(unit.monthlyRent) / 100} />
            </label>
            <label className="block text-xs font-medium text-muted">
              Available from
              <input name="availableFrom" type="date" className="field mt-1" defaultValue={today} />
            </label>
            <label className="block text-xs font-medium text-muted sm:col-span-3">
              Description
              <textarea
                name="description"
                rows={4}
                className="field mt-1"
                placeholder="What a house seeker would want to know: parking, water, security, nearby schools and transport…"
                maxLength={2000}
              />
            </label>
          </div>
        </ActionForm>
      </Card>
    </>
  )
}
