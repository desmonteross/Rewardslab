import { authorize, handler, ok } from '@/lib/api'
import { checkoutStatus } from '@/server/services/checkout'

/**
 * GET /api/v1/me/pay/{id}
 *
 * The outcome of a payment request. Against the mock provider this call is
 * also what raises the simulated confirmation once the delay has elapsed, so
 * the demo needs no background worker: the next poll settles it.
 */
export const GET = handler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  const { scope } = await authorize('portal.view')
  const { id } = await context.params
  return ok(await checkoutStatus(scope, id))
})
