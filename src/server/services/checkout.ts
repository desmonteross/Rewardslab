// ===========================================================================
//  Tenant-initiated payment (STK push)
//
//  The tenant taps Pay, the provider prompts them on their handset, and the
//  result comes back asynchronously. Nothing about that is synchronous, so
//  the request is written down BEFORE the prompt goes out and the screen
//  polls for the outcome.
//
//  SIMULATION
//  Against the mock provider there is no Safaricom to call back, so the poll
//  itself raises the confirmation once the simulated delay has elapsed. That
//  confirmation goes through `ingestMpesaTransaction` — the exact function
//  the live webhook route calls after parsing — so matching, allocation,
//  receipting, the ledger and the reward award all run the production path.
//  Nothing is skipped; only Safaricom is absent.
//
//  Every simulated request is flagged in the database and on screen. A mock
//  payment must never be mistaken for a real one.
// ===========================================================================

import { and, eq, gt, ne } from 'drizzle-orm'
import { paymentAllocations, payments, rentInvoices, rewardEntries, stkRequests, tenants } from '@/db/schema'
import { db } from '@/db'
import { amount, cents } from '@/lib/money'
import { assertInScope, requireTenantId, scoped, type Scope } from '@/lib/tenancy'
import { getPaymentProvider } from '@/server/adapters'
import { ingestMpesaTransaction } from './mpesa'

/** How long the mock waits before confirming, so the waiting state is real. */
export const SIMULATED_DELAY_MS = 4_000

/** A request older than this is abandoned rather than left hanging forever. */
const EXPIRY_MS = 5 * 60 * 1_000

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CheckoutError'
  }
}

export interface OutstandingInvoice {
  id: string
  number: string
  periodLabel: string
  dueDate: Date
  totalCents: number
  balanceCents: number
  status: string
}

/** What the tenant can pay right now, oldest first. */
export async function outstandingInvoices(scope: Scope): Promise<OutstandingInvoice[]> {
  const tenantId = requireTenantId(scope)
  const rows = await db
    .select()
    .from(rentInvoices)
    .where(
      scoped(
        rentInvoices,
        scope,
        eq(rentInvoices.tenantId, tenantId),
        gt(rentInvoices.balance, '0'),
        ne(rentInvoices.status, 'CANCELLED'),
        ne(rentInvoices.status, 'DRAFT'),
      ),
    )
    .orderBy(rentInvoices.dueDate)

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    periodLabel: row.periodLabel,
    dueDate: row.dueDate,
    totalCents: cents(row.total),
    balanceCents: cents(row.balance),
    status: row.status,
  }))
}

export interface InitiateInput {
  invoiceId: string
  /** What the tenant chose to pay. Defaults to the whole balance. */
  amountCents?: number
}

export interface InitiateResult {
  requestId: string
  checkoutRequestId: string
  message: string
  isSimulated: boolean
  amountCents: number
  /** True when this payment will not settle the invoice, and so earns nothing. */
  isPartial: boolean
}

/**
 * Ask the provider to prompt the tenant. The row is written first: a
 * confirmation that arrives before this function returns still has something
 * to land against.
 */
export async function initiateStkPush(scope: Scope, input: InitiateInput): Promise<InitiateResult> {
  const tenantId = requireTenantId(scope)

  const invoice = await db
    .select()
    .from(rentInvoices)
    .where(scoped(rentInvoices, scope, eq(rentInvoices.id, input.invoiceId), eq(rentInvoices.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows[0])
  assertInScope(invoice, scope, 'invoice')

  const balanceCents = cents(invoice.balance)
  if (balanceCents <= 0) throw new CheckoutError('This invoice is already settled.')

  const requested = input.amountCents ?? balanceCents
  if (requested <= 0) throw new CheckoutError('Enter an amount greater than zero.')
  if (requested > balanceCents) {
    throw new CheckoutError(
      `That is more than this invoice is for. The outstanding balance is ${amount(balanceCents)} KES.`,
    )
  }

  const tenant = await db
    .select()
    .from(tenants)
    .where(scoped(tenants, scope, eq(tenants.id, tenantId)))
    .limit(1)
    .then((rows) => rows[0])
  assertInScope(tenant, scope, 'tenant')
  if (!tenant.phone) throw new CheckoutError('No phone number on file for this tenancy.')

  const provider = getPaymentProvider()
  const info = provider.info()
  const isSimulated = info.mode === 'mock'

  // The tenant code is what the matcher resolves first, so the payment lands
  // on the right tenancy without a guess.
  const accountReference = tenant.code

  const response = await provider.requestCollection({
    amountCents: requested,
    phone: tenant.phone,
    accountReference,
    narrative: `Rent ${invoice.periodLabel} — invoice ${invoice.number}`,
    organizationId: scope.organizationId,
  })

  if (!response.success) {
    throw new CheckoutError(response.message || 'The payment request could not be sent.')
  }

  const [row] = await db
    .insert(stkRequests)
    .values({
      organizationId: scope.organizationId,
      tenantId,
      invoiceId: invoice.id,
      checkoutRequestId: response.requestId,
      phone: tenant.phone,
      accountReference,
      amount: amount(requested),
      status: 'PENDING',
      isSimulated,
      simulateAfter: isSimulated ? new Date(Date.now() + SIMULATED_DELAY_MS) : null,
      providerMessage: response.message,
    })
    .returning()

  return {
    requestId: row.id,
    checkoutRequestId: response.requestId,
    message: response.message,
    isSimulated,
    amountCents: requested,
    isPartial: requested < balanceCents,
  }
}

export interface CheckoutStatus {
  requestId: string
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED'
  isSimulated: boolean
  amountCents: number
  message: string
  mpesaReceipt: string | null
  paymentReference: string | null
  pointsAwarded: number | null
  /** Invoices this payment cleared in full. */
  invoicesSettled: number
  /** Everything still owed across the tenancy once this payment is applied. */
  outstandingAfterCents: number
}

/**
 * Poll a request. Against the mock this is also what raises the simulated
 * confirmation, which keeps the demo working without a background worker:
 * whatever happens to the process, the next poll settles it.
 */
export async function checkoutStatus(scope: Scope, requestId: string): Promise<CheckoutStatus> {
  const tenantId = requireTenantId(scope)

  let row = await db
    .select()
    .from(stkRequests)
    .where(scoped(stkRequests, scope, eq(stkRequests.id, requestId), eq(stkRequests.tenantId, tenantId)))
    .limit(1)
    .then((rows) => rows[0])
  assertInScope(row, scope, 'payment request')

  if (row.status === 'PENDING') {
    const age = Date.now() - row.createdAt.getTime()
    if (row.isSimulated && row.simulateAfter && Date.now() >= row.simulateAfter.getTime()) {
      row = await confirmSimulated(row)
    } else if (age > EXPIRY_MS) {
      row = await markExpired(row)
    }
  }

  const [settled, outstanding] = await Promise.all([
    row.paymentId ? invoicesSettledBy(row.paymentId) : Promise.resolve(0),
    outstandingForTenant(scope, tenantId),
  ])

  return {
    requestId: row.id,
    status: row.status,
    isSimulated: row.isSimulated,
    amountCents: cents(row.amount),
    message: messageFor(row.status, row.providerMessage, row.failureReason),
    mpesaReceipt: row.mpesaReceipt,
    paymentReference: row.paymentReference,
    pointsAwarded: row.pointsAwarded,
    invoicesSettled: settled,
    outstandingAfterCents: outstanding,
  }
}

/**
 * How many invoices this payment cleared outright.
 *
 * A payment does NOT necessarily settle the invoice the tenant was looking at
 * when they tapped Pay: allocation is oldest-due-first, so arrears are
 * cleared before current rent. That is the convention the whole system uses,
 * and having a second rule for portal payments would be worse than the
 * surprise — so the screen reports what actually happened instead.
 */
async function invoicesSettledBy(paymentId: string): Promise<number> {
  const rows = await db
    .select({ balance: rentInvoices.balance })
    .from(paymentAllocations)
    .innerJoin(rentInvoices, eq(rentInvoices.id, paymentAllocations.invoiceId))
    .where(eq(paymentAllocations.paymentId, paymentId))
  return rows.filter((row) => cents(row.balance) <= 0).length
}

async function outstandingForTenant(scope: Scope, tenantId: string): Promise<number> {
  const rows = await db
    .select({ balance: rentInvoices.balance })
    .from(rentInvoices)
    .where(
      scoped(
        rentInvoices,
        scope,
        eq(rentInvoices.tenantId, tenantId),
        ne(rentInvoices.status, 'CANCELLED'),
        ne(rentInvoices.status, 'DRAFT'),
      ),
    )
  return rows.reduce((total, row) => total + Math.max(0, cents(row.balance)), 0)
}

function messageFor(status: string, providerMessage: string | null, failureReason: string | null): string {
  switch (status) {
    case 'PENDING':
      return providerMessage ?? 'Waiting for the payment to be authorised on the handset.'
    case 'CONFIRMED':
      return 'Payment received.'
    case 'FAILED':
      return failureReason ?? 'The payment did not go through.'
    default:
      return 'The request timed out without a response. Nothing was charged.'
  }
}

/**
 * Raise the confirmation the mock provider would have sent, and push it
 * through the same ingest path the live webhook uses.
 */
async function confirmSimulated(row: typeof stkRequests.$inferSelect) {
  try {
    const result = await ingestMpesaTransaction({
      organizationId: row.organizationId,
      amountCents: cents(row.amount),
      phone: row.phone,
      billRefNumber: row.accountReference,
      payerName: 'PORTAL TENANT',
      when: new Date(),
    })

    if (!result.matched || !result.paymentReference) {
      return await update(row.id, {
        status: 'FAILED',
        failureReason: result.reason || 'The payment could not be matched to this tenancy.',
      })
    }

    const payment = await db
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.organizationId, row.organizationId), eq(payments.reference, result.paymentReference)))
      .limit(1)
      .then((rows) => rows[0])

    const points = payment ? await pointsAwardedFor(payment.id) : 0

    return await update(row.id, {
      status: 'CONFIRMED',
      mpesaReceipt: result.transactionId,
      paymentReference: result.paymentReference,
      paymentId: payment?.id ?? null,
      pointsAwarded: points,
    })
  } catch (error) {
    return await update(row.id, {
      status: 'FAILED',
      failureReason: error instanceof Error ? error.message : 'The payment could not be processed.',
    })
  }
}

/** Points this payment produced — the sum of the tenant's positive earnings. */
async function pointsAwardedFor(paymentId: string): Promise<number> {
  const rows = await db
    .select({ points: rewardEntries.points })
    .from(rewardEntries)
    .where(and(eq(rewardEntries.sourcePaymentId, paymentId), eq(rewardEntries.type, 'EARN')))
  return rows.filter((row) => row.points > 0).reduce((total, row) => total + row.points, 0)
}

async function markExpired(row: typeof stkRequests.$inferSelect) {
  return update(row.id, { status: 'EXPIRED' })
}

async function update(id: string, values: Partial<typeof stkRequests.$inferInsert>) {
  const [row] = await db
    .update(stkRequests)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(stkRequests.id, id))
    .returning()
  return row
}
