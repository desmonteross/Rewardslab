import { endSession, getSession } from '@/lib/session'
import { db } from '@/db'
import { recordAudit } from '@/lib/audit'
import { handler, ok } from '@/lib/api'

export const POST = handler(async () => {
  const session = await getSession()
  if (session) {
    await recordAudit(
      db,
      {
        organizationId: session.organizationId,
        actor: { id: session.userId, name: session.fullName, role: session.role, sessionId: session.sessionId },
      },
      { action: 'User Signed Out', entityType: 'User', entityId: session.userId, reference: session.email },
    )
  }
  await endSession()
  return ok({ signedOut: true })
})
