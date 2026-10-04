// ===========================================================================
//  Multi-tenant isolation (spec §3)
//
//  Every query against a tenant-scoped table must be built through `scoped()`
//  or `orgWhere()`. Passing a Scope around instead of a bare organization id
//  makes it impossible to "forget" the filter: the helpers take the Scope,
//  not the id, and the landlord portal narrowing rides along with it.
// ===========================================================================

import { and, eq, type SQL } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import type { Session } from './session'
import type { AppRole } from './rbac'

export class TenancyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TenancyError'
  }
}

export interface Scope {
  organizationId: string
  /** Non-null for landlord portal users — narrows every read to their own portfolio. */
  landlordId: string | null
  /** Non-null for tenant portal users — narrows every read to their own tenancy. */
  tenantId: string | null
  userId: string
  userName: string
  role: AppRole
  permissions: string[]
  sessionId: string
}

export interface Actor {
  id: string | null
  name: string | null
  role: string | null
  sessionId: string | null
}

export function scopeFromSession(session: Session): Scope {
  if (!session.organizationId) {
    throw new TenancyError(
      'This session is not bound to an organization. Platform staff must select an organization first.',
    )
  }
  return {
    organizationId: session.organizationId,
    landlordId: session.role === 'LANDLORD' ? session.landlordId : null,
    tenantId: session.role === 'TENANT' ? session.tenantId : null,
    userId: session.userId,
    userName: session.fullName,
    role: session.role,
    permissions: session.permissions,
    sessionId: session.sessionId,
  }
}

export function actorFromScope(scope: Scope): Actor {
  return { id: scope.userId, name: scope.userName, role: scope.role, sessionId: scope.sessionId }
}

/** Build a scope directly — used by background jobs and the seed script. */
export function systemScope(organizationId: string, label = 'System'): Scope {
  return {
    organizationId,
    landlordId: null,
    tenantId: null,
    userId: 'system',
    userName: label,
    role: 'ORG_ADMIN',
    permissions: ['*'],
    sessionId: 'system',
  }
}

type OrgTable = { organizationId: PgColumn }
type LandlordScopedTable = OrgTable & { landlordId: PgColumn }

/** `WHERE organization_id = $scope` — the minimum filter for any tenant table. */
export function orgWhere(table: OrgTable, scope: Scope): SQL {
  return eq(table.organizationId, scope.organizationId)
}

/**
 * Combine the organization filter with any additional conditions. Undefined
 * conditions are dropped, so callers can pass optional filters inline.
 */
export function scoped(table: OrgTable, scope: Scope, ...conditions: (SQL | undefined)[]): SQL {
  const parts = [orgWhere(table, scope), ...conditions.filter(Boolean)] as SQL[]
  return parts.length === 1 ? parts[0] : (and(...parts) as SQL)
}

/**
 * As `scoped()`, and additionally narrows to the signed-in landlord's own
 * records when the session belongs to a landlord portal user.
 */
export function landlordScoped(
  table: LandlordScopedTable,
  scope: Scope,
  ...conditions: (SQL | undefined)[]
): SQL {
  const extra = scope.landlordId ? [eq(table.landlordId, scope.landlordId), ...conditions] : conditions
  return scoped(table, scope, ...extra)
}

/**
 * For the `landlords` table itself, where the landlord is identified by its
 * own primary key rather than a foreign key.
 */
export function ownLandlordScoped(
  table: OrgTable & { id: PgColumn },
  scope: Scope,
  ...conditions: (SQL | undefined)[]
): SQL {
  const extra = scope.landlordId ? [eq(table.id, scope.landlordId), ...conditions] : conditions
  return scoped(table, scope, ...extra)
}

type TenantScopedTable = OrgTable & { tenantId: PgColumn }

/**
 * As `scoped()`, and additionally narrows to the signed-in tenant's own rows
 * when the session belongs to a tenant portal user. Use this for every table
 * carrying `tenant_id` — invoices, payments, receipts, leases, tickets — so a
 * tenant screen cannot widen past its own tenancy even if a handler forgets.
 */
export function tenantScoped(
  table: TenantScopedTable,
  scope: Scope,
  ...conditions: (SQL | undefined)[]
): SQL {
  const extra = scope.tenantId ? [eq(table.tenantId, scope.tenantId), ...conditions] : conditions
  return scoped(table, scope, ...extra)
}

/**
 * For the `tenants` table itself, where the tenant is identified by its own
 * primary key rather than a foreign key.
 */
export function ownTenantScoped(
  table: OrgTable & { id: PgColumn },
  scope: Scope,
  ...conditions: (SQL | undefined)[]
): SQL {
  const extra = scope.tenantId ? [eq(table.id, scope.tenantId), ...conditions] : conditions
  return scoped(table, scope, ...extra)
}

/**
 * The tenant a portal request is allowed to read. Throws rather than falling
 * back to "all tenants", so a missing link can never turn into a data leak.
 */
export function requireTenantId(scope: Scope): string {
  if (!scope.tenantId) {
    throw new TenancyError('This session is not linked to a tenant record.')
  }
  return scope.tenantId
}

/**
 * Last line of defence: throw if a row fetched by id belongs to another
 * organization. Call this after any lookup that was not built with `scoped()`.
 */
export function assertInScope<T extends { organizationId: string | null }>(
  row: T | null | undefined,
  scope: Scope,
  entity = 'record',
): T {
  if (!row) throw new TenancyError(`The requested ${entity} does not exist.`)
  if (row.organizationId !== scope.organizationId) {
    throw new TenancyError(`The requested ${entity} does not exist.`)
  }
  return row
}

/** Values every insert into a tenant-scoped table must carry. */
export function withOrg<T extends Record<string, unknown>>(scope: Scope, values: T) {
  return { ...values, organizationId: scope.organizationId }
}
