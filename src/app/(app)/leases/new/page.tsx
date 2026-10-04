import Link from 'next/link'
import { asc, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { properties, tenants, units } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { formatKES } from '@/lib/money'
import { one, type SearchParamsPromise } from '@/lib/search-params'
import { ActionForm } from '@/components/action-form'
import { Card, EmptyState, PageHeader } from '@/components/ui'
import { createLeaseAction } from '../../onboarding-actions'

export const metadata = { title: 'New lease' }
export const dynamic = 'force-dynamic'

export default async function NewLeasePage({ searchParams }: { searchParams: SearchParamsPromise }) {
  const params = await searchParams
  const session = await requirePermission('leases.create')
  const scope = scopeFromSession(session)

  const [tenantOptions, unitOptions] = await Promise.all([
    db
      .select({ id: tenants.id, name: tenants.fullName, code: tenants.code })
      .from(tenants)
      .where(scoped(tenants, scope, ne(tenants.status, 'BLACKLISTED')))
      .orderBy(asc(tenants.fullName))
      .limit(1000),
    db
      .select({
        id: units.id,
        unitNumber: units.unitNumber,
        monthlyRent: units.monthlyRent,
        propertyName: properties.name,
      })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(scoped(units, scope, eq(units.status, 'VACANT')))
      .orderBy(asc(properties.name), asc(units.unitNumber)),
  ])

  const header = (
    <PageHeader
      breadcrumb={[{ label: 'Leases', href: '/leases' }, { label: 'New' }]}
      title="New lease"
      description="Signing a lease reserves the unit and schedules the move-in. Completing the move-in marks it occupied."
    />
  )

  if (unitOptions.length === 0) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            title="No vacant units"
            description="Add units to a property, or end a lease, before signing a new one."
            action={
              can(session, 'properties.view') ? (
                <Link href="/properties" className="btn-secondary">
                  Go to properties
                </Link>
              ) : undefined
            }
          />
        </Card>
      </>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      {header}
      <Card>
        <ActionForm action={createLeaseAction} label="Sign lease" pendingLabel="Saving…">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Tenant
              <select name="tenantId" className="field mt-1" defaultValue={one(params, 'tenant') ?? ''} required>
                <option value="">Choose a tenant…</option>
                {tenantOptions.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name} ({tenant.code})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted sm:col-span-2">
              Vacant unit
              <select name="unitId" className="field mt-1" defaultValue={one(params, 'unit') ?? ''} required>
                <option value="">Choose a unit…</option>
                {unitOptions.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.propertyName} · {unit.unitNumber} · {formatKES(unit.monthlyRent)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Start date
              <input name="startDate" type="date" className="field mt-1" defaultValue={today} required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Length (months)
              <input name="months" type="number" min="1" max="120" className="field mt-1" defaultValue="12" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Rent due on day
              <input name="dueDay" type="number" min="1" max="28" className="field mt-1" defaultValue="5" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Monthly rent (KES)
              <input name="monthlyRent" type="number" min="0" step="1" className="field mt-1" placeholder="Unit's rent" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Deposit (KES)
              <input name="deposit" type="number" min="0" step="1" className="field mt-1" placeholder="Unit's deposit" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Service charge (KES)
              <input name="serviceCharge" type="number" min="0" step="1" className="field mt-1" placeholder="Unit's charge" />
            </label>
          </div>
          <p className="text-2xs text-faint">Leave rent, deposit or service charge blank to use the unit’s own figures.</p>
        </ActionForm>
      </Card>
    </>
  )
}
