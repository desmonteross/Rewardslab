// ===========================================================================
//  M-Pesa ingestion (spec §14, §15)
//
//  One path handles both the live webhook and the in-app simulator: a raw
//  transaction is stored exactly as received, deduplicated on the provider's
//  own transaction id, then handed to the reconciliation pipeline.
//
//  Storing the raw row first matters — if matching fails, or the process dies
//  halfway, the money is still on record and can be reconciled by hand.
// ===========================================================================

import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { integrations, mpesaTransactions, organizations, tenants } from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { systemScope, type Actor, type Scope } from '@/lib/tenancy'
import { getPaymentProvider, MpesaMockProvider } from '../adapters'
import { recordPayment } from './payments'

export interface IngestResult {
  transactionId: string
  matched: boolean
  paymentReference: string | null
  receiptNumber: string | null
  tenantName: string | null
  reason: string
  duplicate: boolean
}

/**
 * Accept a normalised inbound transaction and push it through reconciliation.
 * `organizationId` comes from the short code the payment was made to.
 */
export async function ingestMpesaTransaction(input: {
  organizationId: string
  amountCents: number
  phone: string
  billRefNumber: string
  payerName?: string
  transactionId?: string
  when?: Date
  rawPayload?: unknown
  actor?: Actor
}): Promise<IngestResult> {
  const when = input.when ?? new Date()

  // Build a provider-shaped payload so the simulator and the live webhook
  // exercise exactly the same parsing code.
  const mock = new MpesaMockProvider()
  const payload =
    input.rawPayload ??
    mock.buildConfirmation({
      amountCents: input.amountCents,
      phone: input.phone,
      billRefNumber: input.billRefNumber,
      shortCode: await shortCodeFor(input.organizationId),
      payerName: input.payerName,
      when,
    })

  const parsed = getPaymentProvider().parseWebhook(payload) ?? {
    transactionId: input.transactionId ?? `SIM${Date.now()}`,
    transactionType: 'Pay Bill',
    amountCents: input.amountCents,
    msisdn: input.phone,
    payerName: input.payerName ?? null,
    billRefNumber: input.billRefNumber,
    shortCode: '',
    transactionTime: when,
    raw: payload,
  }

  // Idempotency: Safaricom retries confirmations.
  const existing = await db
    .select()
    .from(mpesaTransactions)
    .where(eq(mpesaTransactions.transactionId, parsed.transactionId))
    .limit(1)
    .then((rows) => rows[0])

  if (existing) {
    return {
      transactionId: parsed.transactionId,
      matched: existing.reconciliationStatus === 'AUTO_MATCHED',
      paymentReference: null,
      receiptNumber: null,
      tenantName: null,
      reason: 'This transaction has already been received.',
      duplicate: true,
    }
  }

  const [raw] = await db
    .insert(mpesaTransactions)
    .values({
      organizationId: input.organizationId,
      transactionId: parsed.transactionId,
      transactionType: parsed.transactionType,
      msisdn: parsed.msisdn,
      payerName: parsed.payerName,
      amount: amount(parsed.amountCents),
      billRefNumber: parsed.billRefNumber,
      shortCode: parsed.shortCode,
      transactionTime: parsed.transactionTime,
      status: 'CONFIRMED',
      reconciliationStatus: 'UNRECONCILED',
      rawPayload: parsed.raw as object,
    })
    .returning()

  const scope: Scope = input.actor?.id
    ? {
        organizationId: input.organizationId,
        landlordId: null,
        tenantId: null,
        managerId: null,
        userId: input.actor.id,
        userName: input.actor.name ?? 'M-Pesa',
        role: 'ACCOUNTANT',
        permissions: ['*'],
        sessionId: input.actor.sessionId ?? 'webhook',
      }
    : systemScope(input.organizationId, 'M-Pesa webhook')

  const result = await recordPayment(scope, {
    method: 'MPESA',
    grossCents: parsed.amountCents,
    paidAt: parsed.transactionTime,
    externalReference: parsed.transactionId,
    payerName: parsed.payerName,
    payerPhone: parsed.msisdn,
    accountReference: parsed.billRefNumber,
    narrative: `M-Pesa ${parsed.transactionType} ${parsed.transactionId}`,
    rawPayload: parsed.raw,
  })

  await db
    .update(mpesaTransactions)
    .set({
      reconciliationStatus: result.matched ? 'AUTO_MATCHED' : 'EXCEPTION',
      matchedPaymentId: result.paymentId,
      processedAt: new Date(),
      failureReason: result.matched ? null : result.match.strategy,
    })
    .where(eq(mpesaTransactions.id, raw.id))

  let tenantName: string | null = null
  if (result.match.tenantId) {
    const [tenant] = await db
      .select({ fullName: tenants.fullName })
      .from(tenants)
      .where(eq(tenants.id, result.match.tenantId))
      .limit(1)
    tenantName = tenant?.fullName ?? null
  }

  return {
    transactionId: parsed.transactionId,
    matched: result.matched,
    paymentReference: result.reference,
    receiptNumber: result.receiptNumber,
    tenantName,
    reason: result.match.strategy,
    duplicate: false,
  }
}

async function shortCodeFor(organizationId: string): Promise<string> {
  const [organization] = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1)
  if (!organization) throw new Error('Unknown organization for this short code.')
  return process.env.MPESA_SHORTCODE ?? '400200'
}

/**
 * Resolve which organization a short code belongs to. In production this is
 * the pay bill / till configured on the organization's M-Pesa integration.
 */
export async function organizationForShortCode(shortCode: string): Promise<string | null> {
  // The short code lives in the organization's M-Pesa integration config.
  const [row] = await db
    .select({ organizationId: integrations.organizationId })
    .from(integrations)
    .where(and(eq(integrations.key, 'mpesa'), sql`${integrations.config}->>'shortCode' = ${shortCode}`))
    .limit(1)
  return row?.organizationId ?? null
}

export { cents }
