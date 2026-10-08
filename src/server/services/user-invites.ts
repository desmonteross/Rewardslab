// ===========================================================================
//  Landlord and property manager invitations
//
//  The staff-side counterpart of tenant portal invitations:
//
//    * A landlord is invited from their landlord record. The login they create
//      is bound to that landlord, so every screen shows only the properties
//      they own (src/lib/tenancy.ts narrows by landlordId).
//    * A property manager is invited from Users. Their login sees only the
//      properties where they are the assigned manager (narrowed by managerId).
//
//  Same rules as tenant invites: a one-time token, only its SHA-256 hash is
//  stored, 72 hours to use it, a new invitation revokes the old one, and
//  accepting it burns it.
// ===========================================================================

import { randomBytes } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, organizations, userInvites, users } from '@/db/schema'
import { hashPassword, validatePassword } from '@/lib/auth'
import { audit, recordAudit } from '@/lib/audit'
import { scoped, type Scope } from '@/lib/tenancy'
import { getNotificationProvider } from '@/server/adapters'
import { INVITE_TTL_HOURS, hashToken } from './portal-accounts'

type InviteRole = 'LANDLORD' | 'PROPERTY_MANAGER'

export interface UserInviteResult {
  ok: boolean
  error?: string
  /** The one-time link. Shown once to the person who sent it, never stored. */
  inviteUrl?: string
  expiresAt?: Date
}

const ROLE_WORDS: Record<InviteRole, { portal: string; subject: string }> = {
  LANDLORD: { portal: 'landlord portal', subject: 'Your landlord portal invitation' },
  PROPERTY_MANAGER: { portal: 'property management workspace', subject: 'Your RentRewards invitation' },
}

async function issue(
  scope: Scope,
  input: { role: InviteRole; email: string; fullName: string; landlordId?: string | null; baseUrl?: string },
): Promise<UserInviteResult> {
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, error: 'Give a valid email address.' }
  if (!input.fullName.trim()) return { ok: false, error: 'Give the person’s name.' }

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (taken) return { ok: false, error: 'That email address already has a RentRewards login.' }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 3600 * 1000)

  await db.transaction(async (tx) => {
    // Only the newest invitation for the same person works.
    await tx
      .update(userInvites)
      .set({ status: 'REVOKED', updatedAt: new Date() })
      .where(
        and(
          eq(userInvites.organizationId, scope.organizationId),
          eq(userInvites.status, 'PENDING'),
          input.landlordId ? eq(userInvites.landlordId, input.landlordId) : eq(userInvites.email, email),
        ),
      )

    await tx.insert(userInvites).values({
      organizationId: scope.organizationId,
      role: input.role,
      landlordId: input.landlordId ?? null,
      email,
      fullName: input.fullName.trim(),
      tokenHash: hashToken(token),
      status: 'PENDING',
      expiresAt,
      invitedById: scope.userId,
      invitedByName: scope.userName,
    })

    await audit(tx, scope, {
      action: 'User Invited',
      entityType: input.role === 'LANDLORD' ? 'Landlord' : 'User',
      entityId: input.landlordId ?? email,
      reference: email,
      newValue: { role: input.role, expiresAt },
    })
  })

  const inviteUrl = `${input.baseUrl ?? ''}/invite/accept?token=${token}`
  const words = ROLE_WORDS[input.role]
  // The console provider prints this; a real provider would email it.
  await getNotificationProvider().send({
    channel: 'EMAIL',
    to: email,
    subject: words.subject,
    body: `Hello ${input.fullName.trim()}, you have been invited to the RentRewards ${words.portal}. Set your password here: ${inviteUrl} (valid for ${INVITE_TTL_HOURS} hours).`,
  })

  return { ok: true, inviteUrl, expiresAt }
}

/** Invite a landlord to the landlord portal, bound to their own landlord record. */
export async function inviteLandlord(
  scope: Scope,
  landlordId: string,
  options: { email?: string | null; baseUrl?: string } = {},
): Promise<UserInviteResult> {
  const [landlord] = await db
    .select()
    .from(landlords)
    .where(scoped(landlords, scope, eq(landlords.id, landlordId)))
    .limit(1)
  if (!landlord) return { ok: false, error: 'That landlord is not in this organization.' }

  const [existing] = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.organizationId, scope.organizationId), eq(users.landlordId, landlordId)))
    .limit(1)
  if (existing) return { ok: false, error: `This landlord already has a portal login (${existing.email}).` }

  const email = (options.email ?? landlord.email ?? '').trim()
  if (!email) return { ok: false, error: 'Add an email address for this landlord first.' }

  return issue(scope, {
    role: 'LANDLORD',
    email,
    fullName: landlord.companyName ?? landlord.fullName,
    landlordId,
    baseUrl: options.baseUrl,
  })
}

/** Invite a property manager. They will see only properties assigned to them. */
export async function invitePropertyManager(
  scope: Scope,
  input: { fullName: string; email: string; baseUrl?: string },
): Promise<UserInviteResult> {
  return issue(scope, { role: 'PROPERTY_MANAGER', ...input })
}

export async function revokeUserInvite(scope: Scope, inviteId: string) {
  const [invite] = await db
    .select()
    .from(userInvites)
    .where(scoped(userInvites, scope, eq(userInvites.id, inviteId)))
    .limit(1)
  if (!invite) throw new Error('That invitation does not exist.')
  await db.transaction(async (tx) => {
    await tx.update(userInvites).set({ status: 'REVOKED', updatedAt: new Date() }).where(eq(userInvites.id, inviteId))
    await audit(tx, scope, {
      action: 'User Invite Revoked',
      entityType: invite.role === 'LANDLORD' ? 'Landlord' : 'User',
      entityId: invite.landlordId ?? invite.email,
      reference: invite.email,
    })
  })
}

export interface UserInviteRow {
  id: string
  role: string
  email: string
  fullName: string
  status: string
  expiresAt: Date
  invitedByName: string | null
  createdAt: Date
}

/** Invitations for one landlord, or for property managers when no landlord is given. */
export async function userInvitesFor(scope: Scope, filter: { landlordId?: string; role?: InviteRole }) {
  return db
    .select({
      id: userInvites.id,
      role: userInvites.role,
      email: userInvites.email,
      fullName: userInvites.fullName,
      status: userInvites.status,
      expiresAt: userInvites.expiresAt,
      invitedByName: userInvites.invitedByName,
      createdAt: userInvites.createdAt,
    })
    .from(userInvites)
    .where(
      scoped(
        userInvites,
        scope,
        filter.landlordId ? eq(userInvites.landlordId, filter.landlordId) : undefined,
        filter.role ? eq(userInvites.role, filter.role) : undefined,
      ),
    )
    .orderBy(desc(userInvites.createdAt))
    .limit(20)
}

// ---------------------------------------------------------------------------
// Accepting
// ---------------------------------------------------------------------------

export interface UserInviteSubject {
  inviteId: string
  organizationId: string
  organizationName: string
  role: InviteRole
  landlordId: string | null
  fullName: string
  email: string
}

/** Resolve a raw token, or null when it is unknown, used, revoked or expired. */
export async function userInviteSubjectFor(token: string): Promise<UserInviteSubject | null> {
  if (!token) return null
  const [row] = await db
    .select({ invite: userInvites, organizationName: organizations.name })
    .from(userInvites)
    .innerJoin(organizations, eq(organizations.id, userInvites.organizationId))
    .where(eq(userInvites.tokenHash, hashToken(token)))
    .limit(1)
  if (!row) return null
  if (row.invite.status !== 'PENDING') return null
  if (row.invite.expiresAt.getTime() < Date.now()) return null
  return {
    inviteId: row.invite.id,
    organizationId: row.invite.organizationId,
    organizationName: row.organizationName,
    role: row.invite.role as InviteRole,
    landlordId: row.invite.landlordId,
    fullName: row.invite.fullName,
    email: row.invite.email,
  }
}

/** Turn a valid invitation into a login. */
export async function acceptUserInvite(token: string, password: string): Promise<{ ok: boolean; error?: string; email?: string }> {
  const subject = await userInviteSubjectFor(token)
  if (!subject) return { ok: false, error: 'This invitation link is no longer valid. Ask for a new one.' }

  const policy = validatePassword(password)
  if (policy) return { ok: false, error: policy }

  const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, subject.email)).limit(1)
  if (taken) return { ok: false, error: 'That email address already has a login. Try signing in.' }

  const passwordHash = await hashPassword(password)
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(users)
      .values({
        organizationId: subject.organizationId,
        email: subject.email,
        passwordHash,
        fullName: subject.fullName,
        role: subject.role,
        landlordId: subject.role === 'LANDLORD' ? subject.landlordId : null,
        tenantId: null,
        isActive: true,
      })
      .returning({ id: users.id })

    await tx
      .update(userInvites)
      .set({ status: 'ACCEPTED', acceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(userInvites.id, subject.inviteId))

    await recordAudit(
      tx,
      {
        organizationId: subject.organizationId,
        actor: { id: created.id, name: subject.fullName, role: subject.role, sessionId: null },
      },
      {
        action: 'User Created',
        entityType: 'User',
        entityId: created.id,
        reference: subject.email,
        newValue: { role: subject.role, via: 'invitation', landlordId: subject.landlordId },
      },
    )
  })
  return { ok: true, email: subject.email }
}
