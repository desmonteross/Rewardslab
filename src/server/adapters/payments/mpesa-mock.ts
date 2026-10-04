// ===========================================================================
//  M-Pesa — MOCK provider (Phase 1)
//
//  Produces realistic Safaricom-shaped payloads without contacting Safaricom.
//  Transaction ids look like real M-Pesa receipts (SLP4TG9XQ2) so screens,
//  receipts and reconciliation can be exercised end to end.
//
//  Production note: a live deployment must use the officially provisioned
//  Safaricom Daraja APIs with credentials issued to that organization. This
//  file is never the production path — see ./mpesa.ts.
// ===========================================================================

import { randomInt } from 'node:crypto'
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

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const DIGITS = '0123456789'

export function mockReceiptNumber(): string {
  let out = ''
  for (let i = 0; i < 3; i++) out += LETTERS[randomInt(LETTERS.length)]
  for (let i = 0; i < 2; i++) out += DIGITS[randomInt(DIGITS.length)]
  for (let i = 0; i < 5; i++) {
    out += randomInt(2) === 0 ? LETTERS[randomInt(LETTERS.length)] : DIGITS[randomInt(DIGITS.length)]
  }
  return out
}

/** 254722123456 — the format Safaricom uses in callbacks. */
export function toMsisdn(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('254')) return digits
  if (digits.startsWith('0')) return `254${digits.slice(1)}`
  if (digits.length === 9) return `254${digits}`
  return digits
}

function kesFromCents(amountCents: number) {
  return (amountCents / 100).toFixed(2)
}

export class MpesaMockProvider implements PaymentProvider, PayoutProvider {
  info(): ProviderInfo {
    return {
      key: 'mpesa-mock',
      name: 'M-Pesa (Mock)',
      mode: 'mock',
      notice:
        'Simulated M-Pesa. No request ever reaches Safaricom. Configure authorised Daraja credentials and set PAYMENTS_PROVIDER=mpesa to go live.',
    }
  }

  async requestCollection(request: CollectionRequest): Promise<CollectionResponse> {
    const requestId = `ws_CO_${Date.now()}${randomInt(1000, 9999)}`
    return {
      success: true,
      requestId,
      transactionId: null,
      status: 'PENDING',
      message: `Simulated STK push for KES ${kesFromCents(request.amountCents)} to ${toMsisdn(request.phone)}.`,
    }
  }

  /**
   * Build the C2B confirmation payload Safaricom would post, so the webhook
   * route and the reconciliation pipeline can be exercised realistically.
   */
  buildConfirmation(args: {
    amountCents: number
    phone: string
    billRefNumber: string
    shortCode: string
    payerName?: string
    when?: Date
  }) {
    const when = args.when ?? new Date()
    const stamp =
      `${when.getFullYear()}` +
      `${String(when.getMonth() + 1).padStart(2, '0')}` +
      `${String(when.getDate()).padStart(2, '0')}` +
      `${String(when.getHours()).padStart(2, '0')}` +
      `${String(when.getMinutes()).padStart(2, '0')}` +
      `${String(when.getSeconds()).padStart(2, '0')}`
    const [firstName = 'JOHN', middleName = '', lastName = 'DOE'] = (args.payerName ?? 'JOHN DOE')
      .toUpperCase()
      .split(' ')

    return {
      TransactionType: 'Pay Bill',
      TransID: mockReceiptNumber(),
      TransTime: stamp,
      TransAmount: kesFromCents(args.amountCents),
      BusinessShortCode: args.shortCode,
      BillRefNumber: args.billRefNumber,
      InvoiceNumber: '',
      OrgAccountBalance: '0.00',
      ThirdPartyTransID: '',
      MSISDN: toMsisdn(args.phone),
      FirstName: firstName,
      MiddleName: middleName,
      LastName: lastName,
    }
  }

  parseWebhook(body: unknown): InboundTransaction | null {
    return parseC2BConfirmation(body)
  }

  async verify(transactionId: string) {
    return { found: true, status: 'Completed', amountCents: undefined, transactionId } as {
      found: boolean
      status: string
      amountCents?: number
    }
  }

  async disburse(request: PayoutRequest): Promise<PayoutResponse> {
    // A deterministic, visible failure mode so the FAILED settlement path is
    // reachable in a demo: payouts to an unknown destination do not go out.
    if (!request.destination || request.destination === '—') {
      return {
        success: false,
        reference: '',
        message: 'No payout destination on file for this landlord.',
      }
    }
    return {
      success: true,
      reference: `B2C_${mockReceiptNumber()}`,
      message: `Simulated ${request.method} payout of KES ${kesFromCents(request.amountCents)} to ${request.destination}.`,
    }
  }
}

/**
 * Normalise Safaricom's C2B confirmation body. Shared by the mock and the live
 * adapter — the payload shape is the same either way.
 */
export function parseC2BConfirmation(body: unknown): InboundTransaction | null {
  if (!body || typeof body !== 'object') return null
  const payload = body as Record<string, unknown>
  const transactionId = String(payload.TransID ?? '')
  const amountRaw = String(payload.TransAmount ?? '')
  if (!transactionId || !amountRaw) return null

  const names = [payload.FirstName, payload.MiddleName, payload.LastName]
    .filter((part) => typeof part === 'string' && part.trim())
    .join(' ')

  return {
    transactionId,
    transactionType: String(payload.TransactionType ?? 'Pay Bill'),
    amountCents: Math.round(Number(amountRaw) * 100),
    msisdn: String(payload.MSISDN ?? ''),
    payerName: names || null,
    billRefNumber: String(payload.BillRefNumber ?? ''),
    shortCode: String(payload.BusinessShortCode ?? ''),
    transactionTime: parseTransTime(String(payload.TransTime ?? '')),
    raw: body,
  }
}

/** Safaricom sends yyyyMMddHHmmss in East Africa Time. */
export function parseTransTime(value: string): Date {
  if (!/^\d{14}$/.test(value)) return new Date()
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6)) - 1
  const day = Number(value.slice(6, 8))
  const hour = Number(value.slice(8, 10))
  const minute = Number(value.slice(10, 12))
  const second = Number(value.slice(12, 14))
  return new Date(year, month, day, hour, minute, second)
}
