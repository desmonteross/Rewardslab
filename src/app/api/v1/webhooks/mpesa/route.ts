import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { db } from '@/db'
import { integrations } from '@/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { handler } from '@/lib/api'
import { ingestMpesaTransaction } from '@/server/services/mpesa'
import { getPaymentProvider } from '@/server/adapters'
import { env } from '@/lib/env'

/**
 * C2B callbacks are not signed, so the callback URL registered with Safaricom
 * carries a secret token. Without MPESA_WEBHOOK_SECRET the endpoint only
 * accepts posts outside production, which keeps the local mock flow working.
 */
function webhookAuthorised(request: Request): boolean {
  const secret = env.mpesa.webhookSecret
  if (!secret) return process.env.NODE_ENV !== 'production'
  const token = new URL(request.url).searchParams.get('token') ?? ''
  const a = Buffer.from(token)
  const b = Buffer.from(secret)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * POST /api/v1/webhooks/mpesa
 *
 * Safaricom C2B confirmation endpoint. The organization is resolved from the
 * short code the money was paid to, the raw transaction is stored before any
 * matching is attempted, and the response always follows Safaricom's expected
 * acknowledgement shape — a webhook that returns an error gets retried, which
 * for a payment webhook means duplicate processing. Idempotency on the
 * provider's own transaction id is what makes that safe.
 */
export const POST = handler(async (request: Request) => {
  if (!webhookAuthorised(request)) {
    console.warn('[mpesa webhook] rejected: missing or wrong token')
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Rejected' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const parsed = getPaymentProvider().parseWebhook(body)
  if (!parsed) {
    console.warn('[mpesa webhook] unrecognised payload', body)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  const [integration] = await db
    .select({ organizationId: integrations.organizationId })
    .from(integrations)
    .where(and(eq(integrations.key, 'mpesa'), sql`${integrations.config}->>'shortCode' = ${parsed.shortCode}`))
    .limit(1)

  if (!integration?.organizationId) {
    // Unknown short code: acknowledge so Safaricom stops retrying, but leave a
    // loud trace. A real deployment would alert on this.
    console.error('[mpesa webhook] no organization for short code', parsed.shortCode)
    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
  }

  try {
    const result = await ingestMpesaTransaction({
      organizationId: integration.organizationId,
      amountCents: parsed.amountCents,
      phone: parsed.msisdn,
      billRefNumber: parsed.billRefNumber,
      payerName: parsed.payerName ?? undefined,
      transactionId: parsed.transactionId,
      when: parsed.transactionTime,
      rawPayload: body,
    })

    console.info(
      `[mpesa webhook] ${result.transactionId} ${result.duplicate ? 'duplicate' : result.matched ? 'matched' : 'unmatched'}`,
    )
  } catch (error) {
    // Never fail the webhook — the raw row is already persisted, and an
    // accountant can reconcile by hand.
    console.error('[mpesa webhook] processing failed', error)
  }

  return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' })
})

/** Safaricom validation endpoint — accept everything and reconcile later. */
export const GET = handler(async () => NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' }))
