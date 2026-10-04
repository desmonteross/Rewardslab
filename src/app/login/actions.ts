'use server'

import { redirect } from 'next/navigation'
import { homePathFor } from '@/lib/home-path'
import { signIn } from '@/server/services/accounts'
import { endSession, requestContext, startSession } from '@/lib/session'

export interface LoginState {
  error: string | null
}

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  const context = await requestContext()
  const result = await signIn(email, password, context)

  if (!result.ok || !result.session) {
    return { error: result.error ?? 'Sign-in failed.' }
  }

  await startSession(result.session)

  redirect(homePathFor(result.session.role))
}

export async function logoutAction() {
  await endSession()
  redirect('/login')
}
