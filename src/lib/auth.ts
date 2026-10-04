// ===========================================================================
//  Authentication primitives — password hashing and signed session tokens.
//  Kept free of next/headers so the logic is unit-testable in isolation.
// ===========================================================================

import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { env } from './env'
import type { AppRole } from './rbac'

export const SESSION_COOKIE = 'pms_session'

export interface SessionPayload {
  userId: string
  email: string
  fullName: string
  role: AppRole
  organizationId: string | null
  organizationName: string | null
  organizationSlug: string | null
  /** Set for landlord portal users — restricts every query to this landlord. */
  landlordId: string | null
  /** Set for tenant portal users — restricts every query to this tenancy. */
  tenantId: string | null
  permissions: string[]
  sessionId: string
}

const ROUNDS = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false
  return bcrypt.compare(plain, hash)
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(env.authSecret)
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const ttlSeconds = Math.round(env.sessionTtlHours * 3600)
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer('kenya-pms')
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secretKey())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'kenya-pms' })
    if (!payload.userId || !payload.role) return null
    return {
      userId: String(payload.userId),
      email: String(payload.email ?? ''),
      fullName: String(payload.fullName ?? ''),
      role: payload.role as AppRole,
      organizationId: (payload.organizationId as string | null) ?? null,
      organizationName: (payload.organizationName as string | null) ?? null,
      organizationSlug: (payload.organizationSlug as string | null) ?? null,
      landlordId: (payload.landlordId as string | null) ?? null,
      tenantId: (payload.tenantId as string | null) ?? null,
      permissions: Array.isArray(payload.permissions) ? (payload.permissions as string[]) : [],
      sessionId: String(payload.sessionId ?? ''),
    }
  } catch {
    return null
  }
}

/** Password policy — deliberately simple, and enforced in one place. */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters long.'
  if (!/[a-zA-Z]/.test(password)) return 'Password must contain a letter.'
  if (!/[0-9]/.test(password)) return 'Password must contain a number.'
  return null
}
