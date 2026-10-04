'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { inviteTenant, revokeInvite } from '@/server/services/portal-accounts'
import type { ActionState } from '@/components/action-form'

/** The origin this request arrived on, so the invite link is clickable. */
async function origin(): Promise<string> {
  const headerList = await headers()
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host')
  if (!host) return ''
  const protocol = headerList.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  return `${protocol}://${host}`
}

export async function inviteTenantAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('tenants.invite')
  const tenantId = String(formData.get('tenantId') ?? '')
  const email = String(formData.get('email') ?? '').trim() || null

  const result = await inviteTenant(scopeFromSession(session), tenantId, {
    email,
    baseUrl: await origin(),
  })

  if (!result.ok) return { ok: false, message: result.error ?? 'The invitation could not be created.' }

  revalidatePath(`/tenants/${tenantId}`)

  // The link is shown once here because this prototype has no real mail
  // transport — the console notification provider only logs it.
  return { ok: true, message: `Invitation sent. One-time link: ${result.inviteUrl}` }
}

export async function revokeInviteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requirePermission('tenants.invite')
  const inviteId = String(formData.get('inviteId') ?? '')
  const tenantId = String(formData.get('tenantId') ?? '')

  const result = await revokeInvite(scopeFromSession(session), inviteId)
  if (!result.ok) return { ok: false, message: result.error ?? 'That invitation could not be revoked.' }

  revalidatePath(`/tenants/${tenantId}`)
  return { ok: true, message: 'Invitation revoked. The link no longer works.' }
}
