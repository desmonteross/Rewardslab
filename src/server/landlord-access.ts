// ===========================================================================
//  Portfolio access checks (landlords and property managers)
//
//  Leases, tickets and tenants carry no landlord_id of their own, so a
//  landlord's right to see one is derived from the property it belongs to.
//  A property manager's right comes the same way, from properties.manager_id.
//  Unrestricted staff (no landlordId or managerId on the scope) always pass.
// ===========================================================================

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { properties } from '@/db/schema'
import { portfolioTenantFilter, type Scope } from '@/lib/tenancy'

/** True when the scope may see records on this property. */
export async function landlordOwnsProperty(scope: Scope, propertyId: string | null | undefined): Promise<boolean> {
  if (!scope.landlordId && !scope.managerId) return true
  if (!propertyId) return false
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, scope.organizationId),
        eq(properties.id, propertyId),
        scope.landlordId ? eq(properties.landlordId, scope.landlordId) : undefined,
        scope.managerId ? eq(properties.managerId, scope.managerId) : undefined,
      ),
    )
    .limit(1)
  return Boolean(row)
}

/** True when the tenant has ever leased a unit on one of the scope's properties. */
export async function landlordHasTenant(scope: Scope, tenantId: string): Promise<boolean> {
  const filter = portfolioTenantFilter(scope)
  if (!filter) return true
  const result = await db.execute(
    sql`select 1 from tenants where tenants.organization_id = ${scope.organizationId} and tenants.id = ${tenantId} and ${filter} limit 1`,
  )
  return result.rows.length > 0
}
