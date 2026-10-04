// ===========================================================================
//  M-Pesa — LIVE adapter scaffold
//
//  Phase 1 does not ship a working live integration, and deliberately does not
//  guess at endpoints. What it does ship is the seam: the request/response
//  shapes the rest of the system already speaks, plus explicit failures when
//  credentials are absent, so switching PAYMENTS_PROVIDER=mpesa in production
//  is a configuration change and an implementation of the three marked
//  methods — not a refactor of the PMS.
//
//  Before enabling: obtain Daraja credentials issued to the deploying
//  organization, complete Safaricom's go-live process, and point
//  MPESA_CALLBACK_URL at the /api/v1/webhooks/mpesa route over HTTPS.
// ===========================================================================

import { env } from '@/lib/env'
import type {
  CollectionRequest,
  CollectionResponse,
  InboundTransaction,
  PaymentProvider,
  PayoutProvider,
  PayoutRequest,
  PayoutResponse,
  ProviderInfo,
} from '../types'
import { parseC2BConfirmation } from './mpesa-mock'

export class MpesaNotConfiguredError extends Error {
  constructor() {
    super(
      'The live M-Pesa adapter is selected but no Daraja credentials are configured. ' +
        'Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE and MPESA_PASSKEY, ' +
        'or set PAYMENTS_PROVIDER=mpesa-mock for development.',
    )
    this.name = 'MpesaNotConfiguredError'
  }
}

export class MpesaProvider implements PaymentProvider, PayoutProvider {
  private assertConfigured() {
    const { consumerKey, consumerSecret, shortCode, passkey } = env.mpesa
    if (!consumerKey || !consumerSecret || !shortCode || !passkey) throw new MpesaNotConfiguredError()
  }

  info(): ProviderInfo {
    const configured = Boolean(env.mpesa.consumerKey && env.mpesa.consumerSecret)
    return {
      key: 'mpesa',
      name: 'M-Pesa (Safaricom Daraja)',
      mode: env.mpesa.environment === 'production' ? 'live' : 'sandbox',
      notice: configured
        ? undefined
        : 'Credentials are not configured — live collection and payout calls will fail fast.',
    }
  }

  async requestCollection(_request: CollectionRequest): Promise<CollectionResponse> {
    this.assertConfigured()
    // Implement against the authorised Daraja customer-to-business endpoint
    // provisioned for this deployment, then return the normalised response.
    throw new Error(
      'Live M-Pesa collection is not implemented in Phase 1. Implement MpesaProvider.requestCollection ' +
        'against your organization’s authorised Daraja endpoints before enabling this provider.',
    )
  }

  parseWebhook(body: unknown): InboundTransaction | null {
    // The confirmation payload shape is identical to the mock, so the
    // normaliser is shared and already covered by tests.
    return parseC2BConfirmation(body)
  }

  async verify(_transactionId: string): Promise<{ found: boolean; amountCents?: number; status?: string }> {
    this.assertConfigured()
    throw new Error('Live M-Pesa transaction verification is not implemented in Phase 1.')
  }

  async disburse(_request: PayoutRequest): Promise<PayoutResponse> {
    this.assertConfigured()
    throw new Error(
      'Live M-Pesa payouts are not implemented in Phase 1. Implement MpesaProvider.disburse against your ' +
        'organization’s authorised business-to-customer endpoint before enabling this provider.',
    )
  }
}
