// ===========================================================================
//  Sign-in, users and roles
// ===========================================================================

import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { organizations, roles, users } from '@/db/schema'
import { verifyPassword, type SessionPayload } from '@/lib/auth'
import { DEFAULT_ROLE_PERMISSIONS, type AppRole } from '@/lib/rbac'
import { recordAudit } from '@/lib/audit'
import { newId } from '@/lib/ids'

export interface SignInResult {
  ok: boolean
  error?: string
  session?: SessionPayload
}

export async function signIn(
  email: string,
  password: string,
  context: { ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<SignInResult> {
  const normalised = email.trim().toLowerCase()
  if (!normalised || !password) return { ok: false, error: 'Enter your email address and password.' }

  const [user] = await db.select().from(users).where(eq(users.email, normalised)).limit(1)

  // Same message either way — an attacker learns nothing about which accounts exist.
  const rejection = { ok: false as const, error: 'Those credentials do not match an active account.' }
  if (!user || !user.isActive) return rejection
  if (!(await verifyPassword(password, user.passwordHash))) return rejection

  let organizationName: string | null = null
  let organizationSlug: string | null = null
  if (user.organizationId) {
    const [organization] = await db
      .select({ name: organizations.name, slug: organizations.slug, status: organizations.status })
      .from(organizations)
      .where(eq(organizations.id, user.organizationId))
      .limit(1)

    if (!organization) return rejection
    if (organization.status === 'SUSPENDED' || organization.status === 'CANCELLED') {
      return {
        ok: false,
        error: 'This organization’s account is not active. Please contact your administrator.',
      }
    }
    organizationName = organization.name
    organizationSlug = organization.slug
  }

  const permissions = await permissionsForUser(user.organizationId, user.role as AppRole, user.roleId)

  const session: SessionPayload = {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role as AppRole,
    organizationId: user.organizationId,
    organizationName,
    organizationSlug,
    landlordId: user.landlordId,
    tenantId: user.tenantId,
    permissions,
    sessionId: newId('sess'),
  }

  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id))

  await recordAudit(
    db,
    {
      organizationId: user.organizationId,
      actor: { id: user.id, name: user.fullName, role: user.role, sessionId: session.sessionId },
    },
    {
      action: 'User Signed In',
      entityType: 'User',
      entityId: user.id,
      reference: user.email,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  )

  return { ok: true, session }
}

/**
 * An organization may override any role's permission list; the defaults in
 * src/lib/rbac.ts are only what a new organization starts with.
 */
export async function permissionsForUser(
  organizationId: string | null,
  role: AppRole,
  roleId: string | null,
): Promise<string[]> {
  if (role === 'SUPER_ADMIN') return ['*']

  if (roleId) {
    const [custom] = await db.select().from(roles).where(eq(roles.id, roleId)).limit(1)
    if (custom?.permissions?.length) return custom.permissions
  }

  if (organizationId) {
    const [configured] = await db
      .select()
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.key, role)))
      .limit(1)
    if (configured?.permissions?.length) return configured.permissions
  }

  return DEFAULT_ROLE_PERMISSIONS[role] ?? []
}
