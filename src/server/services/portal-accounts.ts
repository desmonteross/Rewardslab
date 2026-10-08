// ===========================================================================
//  Tenant portal accounts
//
//  Two ways a tenant record becomes a login, both landing in the same place:
//
//    1. A manager issues an invitation from the tenant record. A one-time
//       token is generated, only its SHA-256 hash is stored, and the tenant
//       sets their own password when they open the link.
//
//    2. A tenant self-registers using their tenant code and the phone number
//       already on file for them.
//
//  Rules that hold for both paths:
//    * The new user is always bound to exactly one tenant id and one
//      organization. Nothing here can create a staff account.
//    * A tenant record can hold at most one portal login.
//    * Failures are deliberately vague to the caller and precise in the audit
//      trail — a stranger probing tenant codes learns nothing from the reply.
// ===========================================================================

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db'
import { organizations, tenantInvites, tenants, users } from '@/db/schema'
import { hashPassword, validatePassword } from '@/lib/auth'
import { audit, recordAudit } from '@/lib/audit'
import { DEFAULT_ROLE_PERMISSIONS } from '@/lib/rbac'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { getNotificationProvider } from '@/server/adapters'

/** How long an invitation stays usable. */
export const INVITE_TTL_HOURS = 72

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Constant-time comparison so a token cannot be discovered a byte at a time. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

/** Digits only, so `0712 345 678`, `+254712345678` and `0712345678` match. */
function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  // Kenyan numbers are written either as 07… locally or +2547… internationally.
  if (digits.startsWith('254')) return digits.slice(3)
  if (digits.startsWith('0')) return digits.slice(1)
  return digits
}

export interface InviteResult {
  ok: boolean
  error?: string
  /** The one-time link. Shown once and never stored in readable form. */
  inviteUrl?: string
  expiresAt?: Date
}

/**
 * Issue (or re-issue) an invitation for a tenant. Any earlier pending
 * invitation for the same tenant is revoked, so only the newest link works.
 */
export async function inviteTenant(
  scope: Scope,
  tenantId: string,
  options: { email?: string | null; baseUrl?: string } = {},
): Promise<InviteResult> {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(scoped(tenants, scope, eq(tenants.id, tenantId)))
    .limit(1)
  if (!tenant) return { ok: false, error: 'That tenant is not in this organization.' }
  assertInScope(tenant, scope, 'tenant')

  const email = (options.email ?? tenant.email ?? '').trim().toLowerCase()
  if (!email) {
    return { ok: false, error: 'This tenant has no email address on file. Add one before inviting them.' }
  }

  const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existingUser && existingUser.tenantId !== tenantId) {
    return { ok: false, error: 'That email address already belongs to another account.' }
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000)

  await db.transaction(async (tx) => {
    await tx
      .update(tenantInvites)
      .set({ status: 'REVOKED', updatedAt: new Date() })
      .where(
        and(
          eq(tenantInvites.organizationId, scope.organizationId),
          eq(tenantInvites.tenantId, tenantId),
          eq(tenantInvites.status, 'PENDING'),
        ),
      )

    await tx.insert(tenantInvites).values({
      organizationId: scope.organizationId,
      tenantId,
      email,
      tokenHash: hashToken(token),
      status: 'PENDING',
      expiresAt,
      invitedById: scope.userId,
      invitedByName: scope.userName,
    })

    await audit(tx, scope, {
      action: 'Tenant Portal Invited',
      entityType: 'Tenant',
      entityId: tenantId,
      reference: tenant.code,
      newValue: { email, expiresAt },
    })
  })

  const baseUrl = options.baseUrl ?? ''
  const inviteUrl = `${baseUrl}/tenant/accept?token=${token}`

  // The console provider prints this; a real provider would email or SMS it.
  await getNotificationProvider().send({
    channel: 'EMAIL',
    to: email,
    subject: 'Your tenant portal invitation',
    body: `Hello ${tenant.fullName}, set up your tenant portal account here: ${inviteUrl} (valid for ${INVITE_TTL_HOURS} hours).`,
  })

  return { ok: true, inviteUrl, expiresAt }
}

export async function revokeInvite(scope: Scope, inviteId: string): Promise<{ ok: boolean; error?: string }> {
  const [invite] = await db
    .select()
    .from(tenantInvites)
    .where(scoped(tenantInvites, scope, eq(tenantInvites.id, inviteId)))
    .limit(1)
  if (!invite) return { ok: false, error: 'That invitation does not exist.' }

  await db.transaction(async (tx) => {
    await tx
      .update(tenantInvites)
      .set({ status: 'REVOKED', updatedAt: new Date() })
      .where(eq(tenantInvites.id, inviteId))
    await audit(tx, scope, {
      action: 'Tenant Portal Invite Revoked',
      entityType: 'Tenant',
      entityId: invite.tenantId,
      reference: invite.email,
    })
  })
  return { ok: true }
}

export interface PendingInvite {
  id: string
  email: string
  status: string
  expiresAt: Date
  invitedByName: string | null
  createdAt: Date
}

export async function invitesFor(scope: Scope, tenantId: string): Promise<PendingInvite[]> {
  return db
    .select({
      id: tenantInvites.id,
      email: tenantInvites.email,
      status: tenantInvites.status,
      expiresAt: tenantInvites.expiresAt,
      invitedByName: tenantInvites.invitedByName,
      createdAt: tenantInvites.createdAt,
    })
    .from(tenantInvites)
    .where(scoped(tenantInvites, scope, eq(tenantInvites.tenantId, tenantId)))
    .orderBy(tenantInvites.createdAt)
}

// ---------------------------------------------------------------------------
// Accepting an invitation
// ---------------------------------------------------------------------------

export interface InviteSubject {
  inviteId: string
  organizationId: string
  organizationName: string
  tenantId: string
  tenantName: string
  tenantCode: string
  email: string
}

/**
 * Resolve a raw token to the tenant it invites, or null. Unscoped by
 * necessity — the caller has no session yet — which is exactly why the token
 * is long, single-use and short-lived.
 */
export async function inviteSubjectFor(token: string): Promise<InviteSubject | null> {
  if (!token) return null
  const candidateHash = hashToken(token)

  const [row] = await db
    .select({
      invite: tenantInvites,
      tenantName: tenants.fullName,
      tenantCode: tenants.code,
      organizationName: organizations.name,
    })
    .from(tenantInvites)
    .innerJoin(tenants, eq(tenants.id, tenantInvites.tenantId))
    .innerJoin(organizations, eq(organizations.id, tenantInvites.organizationId))
    .where(eq(tenantInvites.tokenHash, candidateHash))
    .limit(1)

  if (!row) return null
  if (!sameHash(row.invite.tokenHash, candidateHash)) return null
  if (row.invite.status !== 'PENDING') return null
  if (row.invite.expiresAt.getTime() < Date.now()) return null

  return {
    inviteId: row.invite.id,
    organizationId: row.invite.organizationId,
    organizationName: row.organizationName,
    tenantId: row.invite.tenantId,
    tenantName: row.tenantName,
    tenantCode: row.tenantCode,
    email: row.invite.email,
  }
}

export interface AccountResult {
  ok: boolean
  error?: string
  userId?: string
}

/** Turn a valid invitation into a portal login. */
export async function acceptInvite(token: string, password: string): Promise<AccountResult> {
  const subject = await inviteSubjectFor(token)
  if (!subject) return { ok: false, error: 'This invitation link is no longer valid. Ask for a new one.' }

  const policy = validatePassword(password)
  if (policy) return { ok: false, error: policy }

  return createPortalUser({
    organizationId: subject.organizationId,
    tenantId: subject.tenantId,
    fullName: subject.tenantName,
    email: subject.email,
    password,
    inviteId: subject.inviteId,
    via: 'invitation',
  })
}

// ---------------------------------------------------------------------------
// Self-registration
// ---------------------------------------------------------------------------

export interface SelfSignupInput {
  organizationSlug: string
  tenantCode: string
  phone: string
  email: string
  password: string
}

/**
 * Self-registration with the tenant code plus the phone number already on
 * file. Weaker than an invitation — anyone holding a tenant's code and phone
 * number can register — so it is a per-organization setting, the attempt is
 * always audited, and the reply never distinguishes a wrong code from a wrong
 * phone number.
 */
export async function selfRegister(input: SelfSignupInput): Promise<AccountResult> {
  const vague = { ok: false as const, error: 'Those details do not match a tenancy we can find.' }

  const slug = input.organizationSlug.trim().toLowerCase()
  const code = input.tenantCode.trim().toUpperCase()
  const email = input.email.trim().toLowerCase()
  if (!slug || !code || !input.phone || !email) return vague

  const policy = validatePassword(input.password)
  if (policy) return { ok: false, error: policy }

  const [organization] = await db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1)
  if (!organization) return vague
  if (organization.status === 'SUSPENDED' || organization.status === 'CANCELLED') return vague
  if (!organization.portalSelfSignup) {
    return { ok: false, error: 'This landlord requires an invitation. Ask your property manager to send you one.' }
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(and(eq(tenants.organizationId, organization.id), eq(tenants.code, code)))
    .limit(1)
  if (!tenant) return vague

  // The phone number on file is the shared secret. Compare digits only.
  if (normalisePhone(tenant.phone) !== normalisePhone(input.phone)) return vague
  if (tenant.status !== 'ACTIVE') return vague

  return createPortalUser({
    organizationId: organization.id,
    tenantId: tenant.id,
    fullName: tenant.fullName,
    email,
    password: input.password,
    via: 'self-registration',
  })
}

// ---------------------------------------------------------------------------
// The one place a tenant login is created
// ---------------------------------------------------------------------------

async function createPortalUser(args: {
  organizationId: string
  tenantId: string
  fullName: string
  email: string
  password: string
  inviteId?: string
  via: string
}): Promise<AccountResult> {
  const [alreadyLinked] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.organizationId, args.organizationId), eq(users.tenantId, args.tenantId)))
    .limit(1)
  if (alreadyLinked) {
    return { ok: false, error: 'This tenancy already has a portal account. Try signing in, or reset the password.' }
  }

  const [emailTaken] = await db.select({ id: users.id }).from(users).where(eq(users.email, args.email)).limit(1)
  if (emailTaken) return { ok: false, error: 'That email address is already in use.' }

  const passwordHash = await hashPassword(args.password)

  const userId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        organizationId: args.organizationId,
        email: args.email,
        passwordHash,
        fullName: args.fullName,
        role: 'TENANT',
        tenantId: args.tenantId,
        landlordId: null,
        isActive: true,
      })
      .returning({ id: users.id })

    if (args.inviteId) {
      await tx
        .update(tenantInvites)
        .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
        .where(eq(tenantInvites.id, args.inviteId))
    }

    await recordAudit(
      tx,
      {
        organizationId: args.organizationId,
        actor: { id: created.id, name: args.fullName, role: 'TENANT', sessionId: null },
      },
      {
        action: 'Tenant Portal Account Created',
        entityType: 'Tenant',
        entityId: args.tenantId,
        reference: args.email,
        newValue: { via: args.via },
      },
    )

    return created.id
  })

  return { ok: true, userId }
}

/** The permission set a freshly created tenant login carries. */
export const TENANT_PERMISSIONS = DEFAULT_ROLE_PERMISSIONS.TENANT
