import { z } from 'zod'
import { authorize, created, handler, unprocessable } from '@/lib/api'
import { CheckoutError, initiateStkPush } from '@/server/services/checkout'

const schema = z.object({
  invoiceId: z.string().min(1),
  /** KES, as the tenant typed it. Omit to pay the whole balance. */
  amount: z.number().positive().optional(),
})

/**
 * POST /api/v1/me/pay
 *
 * Ask the payment provider to prompt this tenant on their handset. Returns
 * immediately with a request id — the result arrives asynchronously and is
 * read back through GET /api/v1/me/pay/{id}.
 */
export const POST = handler(async (request: Request) => {
  const { scope } = await authorize('portal.view')
  const body = schema.parse(await request.json())

  try {
    const result = await initiateStkPush(scope, {
      invoiceId: body.invoiceId,
      amountCents: body.amount === undefined ? undefined : Math.round(body.amount * 100),
    })
    return created(result)
  } catch (error) {
    if (error instanceof CheckoutError) throw unprocessable(error.message)
    throw error
  }
})
