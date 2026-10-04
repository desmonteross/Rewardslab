import { authenticate, handler, ok } from '@/lib/api'

/** GET /api/auth/me — who the caller is and what they may do. */
export const GET = handler(async () => {
  const { session } = await authenticate()
  return ok({
    user: {
      id: session.userId,
      email: session.email,
      fullName: session.fullName,
      role: session.role,
      landlordId: session.landlordId,
      tenantId: session.tenantId,
    },
    organization: session.organizationId
      ? { id: session.organizationId, name: session.organizationName, slug: session.organizationSlug }
      : null,
    permissions: session.permissions,
  })
})
