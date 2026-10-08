'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { properties, users } from '@/db/schema'
import { requestContext, requirePermission, startSession } from '@/lib/session'
import { homePathFor } from '@/lib/home-path'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { audit } from '@/lib/audit'
import { signIn } from '@/server/services/accounts'
import {
  acceptUserInvite,
  inviteLandlord,
  invitePropertyManager,
  revokeUserInvite,
} from '@/server/services/user-invites'
import type { ActionState } from '@/components/action-form'

/** The origin this request arrived on, so the invite link is clickable. */
async function origin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  if (!host) return ''
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}`
}

const field = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()

export async function inviteLandlordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const scope = scopeFromSession(await requirePermission('landlords.update'))
  const landlordId = field(formData, 'landlordId')
  const result = await inviteLandlord(scope, landlordId, { email: field(formData, 'email') || null, baseUrl: await origin() })
  if (!result.ok) return { ok: false, message: result.error ?? 'The invitation could not be created.' }
  revalidatePath(`/landlords/${landlordId}`)
  // Shown once because there is no real mail transport yet: the console
  // notification provider only logs the email.
  return { ok: true, message: `Invitation sent. One-time link (valid 72 hours): ${result.inviteUrl}` }
}

export async function inviteManagerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const scope = scopeFromSession(await requirePermission('users.manage'))
  const result = await invitePropertyManager(scope, {
    fullName: field(formData, 'fullName'),
    email: field(formData, 'email'),
    baseUrl: await origin(),
  })
  if (!result.ok) return { ok: false, message: result.error ?? 'The invitation could not be created.' }
  revalidatePath('/users')
  return {
    ok: true,
    message: `Invitation sent. One-time link (valid 72 hours): ${result.inviteUrl}\nNext, assign them properties from each property's page.`,
  }
}

export async function revokeUserInviteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const role = field(formData, 'role')
  const scope = scopeFromSession(await requirePermission(role === 'LANDLORD' ? 'landlords.update' : 'users.manage'))
  try {
    await revokeUserInvite(scope, field(formData, 'inviteId'))
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not revoke the invitation.' }
  }
  revalidatePath('/users')
  revalidatePath('/landlords')
  return { ok: true, message: 'Invitation revoked. The link no longer works.' }
}

/** Assign (or clear) the property manager for a property. Admin-only. */
export async function assignManagerAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const scope = scopeFromSession(await requirePermission('users.manage'))
  const propertyId = field(formData, 'propertyId')
  const managerId = field(formData, 'managerId') || null
  try {
    if (managerId) {
      const [manager] = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(scoped(users, scope, eq(users.id, managerId)))
        .limit(1)
      if (!manager || (manager.role !== 'PROPERTY_MANAGER' && manager.role !== 'ORG_ADMIN')) {
        return { ok: false, message: 'Choose a property manager from this organization.' }
      }
    }
    await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(properties)
        .set({ managerId, updatedAt: new Date() })
        .where(scoped(properties, scope, eq(properties.id, propertyId)))
        .returning({ id: properties.id, code: properties.code })
      if (!updated) throw new Error('That property does not exist.')
      await audit(tx, scope, {
        action: 'Property Updated',
        entityType: 'Property',
        entityId: updated.id,
        reference: updated.code,
        newValue: { managerId },
      })
    })
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not assign the manager.' }
  }
  revalidatePath(`/properties/${propertyId}`)
  return { ok: true, message: managerId ? 'Manager assigned. They now see this property.' : 'Manager removed.' }
}

export async function acceptUserInviteAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  if (password !== String(formData.get('confirm') ?? '')) return { ok: false, message: 'The two passwords do not match.' }

  const result = await acceptUserInvite(field(formData, 'token'), password)
  if (!result.ok || !result.email) return { ok: false, message: result.error ?? 'That invitation could not be used.' }

  const signedIn = await signIn(result.email, password, await requestContext())
  if (!signedIn.ok || !signedIn.session) return { ok: true, message: 'Your account is ready. Please sign in.' }
  await startSession(signedIn.session)
  redirect(homePathFor(signedIn.session.role))
}
