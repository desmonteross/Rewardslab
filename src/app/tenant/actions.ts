'use server'

import { redirect } from 'next/navigation'
import { signIn } from '@/server/services/accounts'
import { acceptInvite, selfRegister } from '@/server/services/portal-accounts'
import { requestContext, startSession } from '@/lib/session'
import type { ActionState } from '@/components/action-form'

/**
 * Both paths end the same way: the account is created, the tenant is signed in
 * immediately, and they land in the portal. Signing in through the normal
 * `signIn` path means the session is built exactly as it would be on a later
 * visit — no special-cased session construction to drift out of step.
 */
async function signInAndEnterPortal(email: string, password: string): Promise<never | ActionState> {
  const context = await requestContext()
  const result = await signIn(email, password, context)
  if (!result.ok || !result.session) {
    return { ok: true, message: 'Your account is ready. Please sign in.' }
  }
  await startSession(result.session)
  redirect('/portal')
}

export async function acceptInviteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const token = String(formData.get('token') ?? '')
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (password !== confirm) return { ok: false, message: 'The two passwords do not match.' }

  const result = await acceptInvite(token, password)
  if (!result.ok) return { ok: false, message: result.error ?? 'That invitation could not be used.' }

  const email = String(formData.get('email') ?? '')
  return signInAndEnterPortal(email, password)
}

export async function selfRegisterAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')
  if (password !== confirm) return { ok: false, message: 'The two passwords do not match.' }

  const email = String(formData.get('email') ?? '')
  const result = await selfRegister({
    organizationSlug: String(formData.get('organization') ?? ''),
    tenantCode: String(formData.get('tenantCode') ?? ''),
    phone: String(formData.get('phone') ?? ''),
    email,
    password,
  })

  if (!result.ok) return { ok: false, message: result.error ?? 'That registration could not be completed.' }

  return signInAndEnterPortal(email, password)
}
