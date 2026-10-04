import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, createSessionToken, verifySessionToken, type SessionPayload } from './auth'
import { can, type Permission } from './rbac'
import { env } from './env'

export type Session = SessionPayload

export async function getSession(): Promise<Session | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null
  return verifySessionToken(token)
}

/** For pages: redirect to the login screen when there is no valid session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) redirect('/login')
  return session
}

/** For pages: 403 unless the session holds the permission. */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireSession()
  if (!can(session, permission)) redirect('/forbidden')
  return session
}

export async function startSession(payload: SessionPayload) {
  const token = await createSessionToken(payload)
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.round(env.sessionTtlHours * 3600),
  })
}

export async function endSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

/** Request metadata recorded on every audited action (spec §29). */
export async function requestContext() {
  const headerList = await headers()
  return {
    ipAddress:
      headerList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? headerList.get('x-real-ip') ?? null,
    userAgent: headerList.get('user-agent'),
  }
}
