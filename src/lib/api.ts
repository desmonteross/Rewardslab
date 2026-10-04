// ===========================================================================
//  REST API helpers
//
//  Every /api/v1 route handler goes through these so that authentication,
//  organization scoping, permission checks, validation and error shape are
//  identical across the surface the Phase 2 tenant mobile app will consume.
// ===========================================================================

import { NextResponse } from 'next/server'
import { ZodError, type ZodSchema } from 'zod'
import { getSession } from './session'
import { can, type Permission } from './rbac'
import { TenancyError, scopeFromSession, type Scope } from './tenancy'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code = 'error',
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, 'bad_request', details)
export const unauthorized = (message = 'Authentication required.') =>
  new ApiError(401, message, 'unauthorized')
export const forbidden = (message = 'You do not have permission to do that.') =>
  new ApiError(403, message, 'forbidden')
export const notFound = (message = 'Not found.') => new ApiError(404, message, 'not_found')
export const conflict = (message: string) => new ApiError(409, message, 'conflict')
export const unprocessable = (message: string, details?: unknown) =>
  new ApiError(422, message, 'unprocessable', details)

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init)
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 })
}

export function paginated<T>(data: T[], meta: { page: number; pageSize: number; total: number }) {
  return NextResponse.json({
    data,
    meta: { ...meta, pageCount: Math.max(1, Math.ceil(meta.total / meta.pageSize)) },
  })
}

export function fail(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message, details: error.details ?? undefined } },
      { status: error.status },
    )
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: { code: 'validation_failed', message: 'Validation failed.', details: error.flatten() } },
      { status: 422 },
    )
  }
  if (error instanceof TenancyError) {
    return NextResponse.json({ error: { code: 'not_found', message: error.message } }, { status: 404 })
  }
  console.error('[api] unhandled error', error)
  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Something went wrong on our side.' } },
    { status: 500 },
  )
}

/**
 * Wrap a handler so thrown ApiErrors become well-formed JSON responses.
 * The return type allows a plain Response too, for the CSV export routes.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<NextResponse | Response> | NextResponse | Response,
) {
  return async (...args: Args) => {
    try {
      return await fn(...args)
    } catch (error) {
      return fail(error)
    }
  }
}

export interface ApiContext {
  scope: Scope
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>
}

export async function authenticate(): Promise<ApiContext> {
  const session = await getSession()
  if (!session) throw unauthorized()
  return { session, scope: scopeFromSession(session) }
}

export async function authorize(permission: Permission): Promise<ApiContext> {
  const context = await authenticate()
  if (!can(context.session, permission)) throw forbidden()
  return context
}

export async function parseBody<T>(request: Request, schema: ZodSchema<T>): Promise<T> {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    throw badRequest('Request body must be valid JSON.')
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw unprocessable('Validation failed.', result.error.flatten())
  return result.data
}

export function parseQuery<T>(request: Request, schema: ZodSchema<T>): T {
  const url = new URL(request.url)
  const entries: Record<string, string> = {}
  url.searchParams.forEach((value, key) => {
    entries[key] = value
  })
  const result = schema.safeParse(entries)
  if (!result.success) throw unprocessable('Invalid query parameters.', result.error.flatten())
  return result.data
}

export function pagination(request: Request, defaultPageSize = 25) {
  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSizeRaw = Number(url.searchParams.get('pageSize') ?? defaultPageSize) || defaultPageSize
  const pageSize = Math.min(200, Math.max(1, pageSizeRaw))
  return { page, pageSize, offset: (page - 1) * pageSize, limit: pageSize }
}
