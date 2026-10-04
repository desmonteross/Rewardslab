// ===========================================================================
//  Landlord portal access checks
//
//  Leases, tickets and tenants carry no landlord_id of their own, so a
//  landlord's right to see one is derived from the property it belongs to.
//  Staff sessions (no landlordId on the scope) always pass.
// ===========================================================================

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { properties } from '@/db/schema'
import type { Scope } from '@/lib/tenancy'

/** True when the scope may see records on this property. */
export async function landlordOwnsProperty(scope: Scope, propertyId: string | null | undefined): Promise<boolean> {
  if (!scope.landlordId) return true
  if (!propertyId) return false
  const [row] = await db
    .select({ id: properties.id })
    .from(properties)
    .where(
      and(
        eq(properties.organizationId, scope.organizationId),
        eq(properties.id, propertyId),
        eq(properties.landlordId, scope.landlordId),
      ),
    )
    .limit(1)
  return Boolean(row)
}

/** True when the tenant has ever leased a unit on one of the scope's properties. */
export async function landlordHasTenant(scope: Scope, tenantId: string): Promise<boolean> {
  if (!scope.landlordId) return true
  const result = await db.execute(
    sql`select 1 from leases l join properties p on p.id = l.property_id
        where l.organization_id = ${scope.organizationId}
          and l.tenant_id = ${tenantId}
          and p.landlord_id = ${scope.landlordId}
        limit 1`,
  )
  return result.rows.length > 0
}
