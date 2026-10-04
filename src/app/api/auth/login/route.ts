import { z } from 'zod'
import { signIn } from '@/server/services/accounts'
import { startSession, requestContext } from '@/lib/session'
import { handler, ok, parseBody, unauthorized } from '@/lib/api'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

/**
 * POST /api/auth/login
 * Used by the web app and, in Phase 2, by the tenant mobile application.
 */
export const POST = handler(async (request: Request) => {
  const body = await parseBody(request, schema)
  const context = await requestContext()
  const result = await signIn(body.email, body.password, context)

  if (!result.ok || !result.session) throw unauthorized(result.error)

  await startSession(result.session)

  return ok({
    user: {
      id: result.session.userId,
      email: result.session.email,
      fullName: result.session.fullName,
      role: result.session.role,
    },
    organization: result.session.organizationId
      ? {
          id: result.session.organizationId,
          name: result.session.organizationName,
          slug: result.session.organizationSlug,
        }
      : null,
    permissions: result.session.permissions,
  })
})
