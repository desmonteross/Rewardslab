import Link from 'next/link'
import { asc, eq, inArray } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, propertyTypeEnum, users } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { ActionForm } from '@/components/action-form'
import { Card, EmptyState, PageHeader, humanise } from '@/components/ui'
import { createPropertyAction } from '../../onboarding-actions'

export const metadata = { title: 'Add property' }
export const dynamic = 'force-dynamic'

export default async function NewPropertyPage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('properties.create')
  const scope = scopeFromSession(session)

  const [landlordOptions, managerOptions] = await Promise.all([
    db
      .select({ id: landlords.id, name: landlords.fullName, company: landlords.companyName })
      .from(landlords)
      .where(scoped(landlords, scope, eq(landlords.isActive, true)))
      .orderBy(asc(landlords.fullName)),
    db
      .select({ id: users.id, name: users.fullName })
      .from(users)
      .where(scoped(users, scope, eq(users.isActive, true), inArray(users.role, ['PROPERTY_MANAGER', 'ORG_ADMIN'])))
      .orderBy(asc(users.fullName)),
  ])

  const header = (
    <PageHeader
      breadcrumb={[{ label: 'Properties', href: '/properties' }, { label: 'New' }]}
      title="Add a property"
      description="Save the building first, then add its units from the property page."
    />
  )

  if (landlordOptions.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title="Add a landlord first"
            description="Every property belongs to a landlord, who receives its settlements."
            action={
              can(session, 'landlords.create') ? (
                <Link href="/landlords/new" className="btn-primary">
                  Add landlord
                </Link>
              ) : undefined
            }
          />
        </Card>
      </>
    )
  }

  return (
    <>
      {header}
      <Card>
        <ActionForm action={createPropertyAction} label="Save property" pendingLabel="Saving…">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Landlord
              <select name="landlordId" className="field mt-1" defaultValue={one(params, 'landlord') ?? ''} required>
                <option value="">Choose the owner…</option>
                {landlordOptions.map((landlord) => (
                  <option key={landlord.id} value={landlord.id}>
                    {landlord.company ?? landlord.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Name
              <input name="name" className="field mt-1" placeholder="Riverside Apartments" required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Type
              <select name="type" className="field mt-1" defaultValue="APARTMENT">
                {propertyTypeEnum.enumValues.map((value) => (
                  <option key={value} value={value}>
                    {humanise(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              County
              <input name="county" className="field mt-1" placeholder="Nairobi" required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Town
              <input name="town" className="field mt-1" placeholder="Nairobi" required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Area
              <input name="area" className="field mt-1" placeholder="Kilimani" />
            </label>
            <label className="block text-xs font-medium text-muted sm:col-span-2">
              Address
              <input name="address" className="field mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Property manager
              <select name="managerId" className="field mt-1" defaultValue="">
                <option value="">Unassigned</option>
                {managerOptions.map((manager) => (
                  <option key={manager.id} value={manager.id}>
                    {manager.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              KRA PIN (if different from the landlord)
              <input name="kraPin" className="field mt-1" />
            </label>
          </div>
        </ActionForm>
      </Card>
    </>
  )
}
