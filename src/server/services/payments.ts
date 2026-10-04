// ===========================================================================
//  Payment pipeline (spec §15, §17, §19)
//
//      PAYMENT RECEIVED
//        → validate → identify organization → identify tenant / unit
//        → identify outstanding invoices → allocate → update tenant ledger
//        → generate receipt → calculate commission → landlord payable
//        → accounting entries → eRITS reporting dataset
//
//  A payment that cannot be matched is NOT guessed onto an account. It is
//  parked as UNMATCHED with a compliance exception for an accountant to
//  resolve, and the cash still hits the ledger — in SUSPENSE.
// ===========================================================================

import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import {
  complianceExceptions,
  landlords,
  leases,
  organizations,
  paymentAllocations,
  payments,
  properties,
  receipts,
  invoiceItems,
  rentInvoices,
  tenants,
  units,
} from '@/db/schema'
import { db, type Tx } from '@/db'
import { amount, cents } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { invoiceStatusFor, planAllocation, type AllocatableInvoice } from './allocation'
import { recordCommission, resolveCommissionRate } from './commission'
import { postLedgerGroup, reverseLedgerGroup } from './ledger'
import { identifyTenant, type MatchResult } from './matching'
import { nextNumber } from './numbering'
import { awardForAllocation, reverseAwardsForPayment } from './rewards'

export type PaymentMethodName = 'MPESA' | 'BANK_TRANSFER' | 'CASH' | 'CHEQUE' | 'CARD' | 'ADJUSTMENT'

export interface RecordPaymentInput {
  method: PaymentMethodName
  /** Integer cents. */
  grossCents: number
  paidAt: Date
  externalReference?: string | null
  payerName?: string | null
  payerPhone?: string | null
  accountReference?: string | null
  narrative?: string | null
  rawPayload?: unknown
  /** Supply when the tenant is already known (manual capture, tenant app). */
  tenantId?: string | null
  leaseId?: string | null
}

export interface RecordPaymentResult {
  paymentId: string
  reference: string
  matched: boolean
  match: MatchResult
  allocatedCents: number
  unallocatedCents: number
  commissionCents: number
  netCents: number
  receiptNumber: string | null
  invoicesUpdated: string[]
  exceptionId: string | null
}

export async function recordPayment(scope: Scope, input: RecordPaymentInput): Promise<RecordPaymentResult> {
  if (input.grossCents <= 0) throw new Error('Payment amount must be greater than zero.')

  return db.transaction(async (tx) => {
    // ---- identify tenant ---------------------------------------------------
    const match = input.tenantId
      ? await matchFromTenant(tx, scope, input.tenantId, input.leaseId ?? null)
      : await identifyTenant(tx, scope, {
          accountReference: input.accountReference,
          payerPhone: input.payerPhone,
        })

    const reference = await nextNumber(tx, scope.organizationId, 'payment', input.paidAt)

    if (!match.tenantId) {
      return recordUnmatched(tx, scope, input, reference, match)
    }

    // ---- outstanding invoices ---------------------------------------------
    const openInvoices = await tx
      .select({
        id: rentInvoices.id,
        balance: rentInvoices.balance,
        total: rentInvoices.total,
        amountPaid: rentInvoices.amountPaid,
        dueDate: rentInvoices.dueDate,
        createdAt: rentInvoices.createdAt,
        status: rentInvoices.status,
        periodLabel: rentInvoices.periodLabel,
      })
      .from(rentInvoices)
      .where(
        scoped(
          rentInvoices,
          scope,
          eq(rentInvoices.tenantId, match.tenantId),
          gt(rentInvoices.balance, '0'),
          ne(rentInvoices.status, 'CANCELLED'),
        ),
      )
      .orderBy(asc(rentInvoices.dueDate))

    const allocatable: AllocatableInvoice[] = openInvoices.map((invoice) => ({
      id: invoice.id,
      balanceCents: cents(invoice.balance),
      dueDate: invoice.dueDate,
      createdAt: invoice.createdAt,
    }))

    const plan = planAllocation(input.grossCents, allocatable)

    // ---- commission --------------------------------------------------------
    const context = await loadContext(tx, scope, match.propertyId!, match.landlordId!)
    const resolvedRate = await resolveCommissionRate(tx, scope, {
      organizationRate: context.organizationRate,
      landlordRate: context.landlordRate,
      propertyRate: context.propertyRate,
      landlordId: match.landlordId!,
      propertyId: match.propertyId!,
      at: input.paidAt,
    })

    // ---- the payment itself ------------------------------------------------
    const [payment] = await tx
      .insert(payments)
      .values({
        organizationId: scope.organizationId,
        reference,
        externalReference: input.externalReference ?? null,
        method: input.method,
        status: 'CONFIRMED',
        reconciliationStatus: plan.hasCredit ? 'PARTIALLY_ALLOCATED' : 'AUTO_MATCHED',
        tenantId: match.tenantId,
        leaseId: match.leaseId,
        propertyId: match.propertyId,
        unitId: match.unitId,
        landlordId: match.landlordId,
        payerName: input.payerName ?? null,
        payerPhone: input.payerPhone ?? null,
        accountReference: input.accountReference ?? null,
        grossAmount: amount(input.grossCents),
        allocatedAmount: amount(plan.allocatedCents),
        unallocatedAmount: amount(plan.unallocatedCents),
        settlementStatus: 'PENDING',
        paidAt: input.paidAt,
        narrative: input.narrative ?? `Rent payment via ${input.method}`,
        rawPayload: (input.rawPayload ?? null) as object | null,
        createdById: scope.userId,
        createdByName: scope.userName,
      })
      .returning()

    const { row: commissionRow, breakdown } = await recordCommission(tx, scope, {
      paymentId: payment.id,
      landlordId: match.landlordId!,
      propertyId: match.propertyId!,
      grossCents: input.grossCents,
      resolved: resolvedRate,
    })

    await tx
      .update(payments)
      .set({
        commissionAmount: commissionRow.commissionAmount,
        netAmount: commissionRow.netAmount,
        updatedAt: new Date(),
      })
      .where(eq(payments.id, payment.id))

    // ---- allocations & invoice ledger --------------------------------------
    const invoicesUpdated: string[] = []
    if (plan.allocations.length > 0) {
      const allocationRows = await tx
        .insert(paymentAllocations)
        .values(
          plan.allocations.map((allocation) => ({
            organizationId: scope.organizationId,
            paymentId: payment.id,
            invoiceId: allocation.invoiceId,
            amount: amount(allocation.amountCents),
            allocatedById: scope.userId,
            allocatedByName: scope.userName,
            isAutomatic: true,
          })),
        )
        .returning({ id: paymentAllocations.id, invoiceId: paymentAllocations.invoiceId })

      for (const allocation of plan.allocations) {
        const invoice = openInvoices.find((row) => row.id === allocation.invoiceId)!
        const paidCents = cents(invoice.amountPaid) + allocation.amountCents
        const totalCents = cents(invoice.total)
        await tx
          .update(rentInvoices)
          .set({
            amountPaid: amount(paidCents),
            balance: amount(totalCents - paidCents),
            status: invoiceStatusFor(
              invoice.status as 'DUE',
              totalCents,
              paidCents,
              invoice.dueDate,
              0,
              input.paidAt,
            ),
            updatedAt: new Date(),
          })
          .where(scoped(rentInvoices, scope, eq(rentInvoices.id, allocation.invoiceId)))
        invoicesUpdated.push(allocation.invoiceId)
      }

      // ---- reward points ---------------------------------------------------
      // Posted in this same transaction, after the invoice balances are
      // written: points and the allocation commit together or not at all. An
      // async queue would leave a window where the tenant sees the payment
      // land with no points against it, which generates a support ticket
      // every time. Awards are idempotent by database constraint, so a
      // retried callback cannot double-credit.
      for (const row of allocationRows) {
        await awardForAllocation(tx, {
          allocationId: row.id,
          paymentId: payment.id,
          invoiceId: row.invoiceId,
          tenantId: match.tenantId,
          organizationId: scope.organizationId,
          clearedAt: input.paidAt,
        })
      }
    }

    // ---- accounting --------------------------------------------------------
    const cashAccount = cashAccountFor(input.method)
    const latestPeriod = openInvoices[0]?.periodLabel ?? 'Rent'

    await postLedgerGroup(tx, scope, {
      sourceType: 'PAYMENT',
      sourceId: payment.id,
      sourceReference: payment.reference,
      transactionDate: input.paidAt,
      narrative: `${input.method} receipt ${payment.reference} — ${context.tenantName}`,
      tenantId: match.tenantId,
      unitId: match.unitId,
      propertyId: match.propertyId,
      landlordId: match.landlordId,
      lines: [
        { account: cashAccount, entryType: 'DEBIT', amountCents: input.grossCents },
        { account: 'RENT_RECEIVABLE', entryType: 'CREDIT', amountCents: input.grossCents },
      ],
    })

    // Rent belongs to the landlord, so the income accrued at invoice time is
    // released here in the same mix it was recognised in, and split between
    // our commission and what we now owe the landlord.
    const incomeSplit = await incomeMixFor(
      tx,
      scope,
      plan.allocations.map((allocation) => ({
        invoiceId: allocation.invoiceId,
        amountCents: allocation.amountCents,
      })),
      plan.unallocatedCents,
    )

    await postLedgerGroup(tx, scope, {
      sourceType: 'COMMISSION',
      sourceId: commissionRow.id,
      sourceReference: payment.reference,
      transactionDate: input.paidAt,
      narrative: `Platform commission ${resolvedRate.rate}% on ${payment.reference}`,
      tenantId: match.tenantId,
      unitId: match.unitId,
      propertyId: match.propertyId,
      landlordId: match.landlordId,
      lines: [
        { account: 'RENT_INCOME', entryType: 'DEBIT', amountCents: incomeSplit.rentCents },
        { account: 'SERVICE_CHARGE_INCOME', entryType: 'DEBIT', amountCents: incomeSplit.serviceCents },
        { account: 'PENALTY_INCOME', entryType: 'DEBIT', amountCents: incomeSplit.penaltyCents },
        { account: 'COMMISSION_INCOME', entryType: 'CREDIT', amountCents: breakdown.commissionCents },
        { account: 'LANDLORD_PAYABLE', entryType: 'CREDIT', amountCents: breakdown.netCents },
      ],
    })

    // ---- receipt -----------------------------------------------------------
    const receiptNumber = await nextNumber(tx, scope.organizationId, 'receipt', input.paidAt)
    const remainingBalance = await tenantBalanceCents(tx, scope, match.tenantId)

    await tx.insert(receipts).values({
      organizationId: scope.organizationId,
      number: receiptNumber,
      paymentId: payment.id,
      tenantId: match.tenantId,
      propertyId: match.propertyId!,
      unitId: match.unitId!,
      landlordId: match.landlordId!,
      invoiceId: plan.allocations[0]?.invoiceId ?? null,
      periodLabel: latestPeriod,
      amount: amount(input.grossCents),
      method: input.method,
      mpesaReference: input.method === 'MPESA' ? input.externalReference ?? null : null,
      paidAt: input.paidAt,
      balanceAfter: amount(remainingBalance),
      issuedById: scope.userId,
      issuedByName: scope.userName,
    })

    await audit(tx, scope, {
      action: 'Payment Recorded',
      entityType: 'Payment',
      entityId: payment.id,
      reference: payment.reference,
      newValue: {
        gross: amount(input.grossCents),
        commission: commissionRow.commissionAmount,
        net: commissionRow.netAmount,
        allocated: amount(plan.allocatedCents),
        matchedBy: match.strategy,
      },
    })

    return {
      paymentId: payment.id,
      reference: payment.reference,
      matched: true,
      match,
      allocatedCents: plan.allocatedCents,
      unallocatedCents: plan.unallocatedCents,
      commissionCents: breakdown.commissionCents,
      netCents: breakdown.netCents,
      receiptNumber,
      invoicesUpdated,
      exceptionId: null,
    }
  })
}

// ---------------------------------------------------------------------------
// Unmatched payments
// ---------------------------------------------------------------------------

async function recordUnmatched(
  tx: Tx,
  scope: Scope,
  input: RecordPaymentInput,
  reference: string,
  match: MatchResult,
): Promise<RecordPaymentResult> {
  const [payment] = await tx
    .insert(payments)
    .values({
      organizationId: scope.organizationId,
      reference,
      externalReference: input.externalReference ?? null,
      method: input.method,
      status: 'UNMATCHED',
      reconciliationStatus: 'EXCEPTION',
      payerName: input.payerName ?? null,
      payerPhone: input.payerPhone ?? null,
      accountReference: input.accountReference ?? null,
      grossAmount: amount(input.grossCents),
      allocatedAmount: '0',
      unallocatedAmount: amount(input.grossCents),
      settlementStatus: 'PENDING',
      paidAt: input.paidAt,
      narrative: input.narrative ?? `Unmatched ${input.method} receipt`,
      rawPayload: (input.rawPayload ?? null) as object | null,
      createdById: scope.userId,
      createdByName: scope.userName,
    })
    .returning()

  await postLedgerGroup(tx, scope, {
    sourceType: 'PAYMENT',
    sourceId: payment.id,
    sourceReference: payment.reference,
    transactionDate: input.paidAt,
    narrative: `Unmatched receipt ${payment.reference} — held in suspense`,
    lines: [
      { account: cashAccountFor(input.method), entryType: 'DEBIT', amountCents: input.grossCents },
      { account: 'SUSPENSE', entryType: 'CREDIT', amountCents: input.grossCents },
    ],
  })

  const [exception] = await tx
    .insert(complianceExceptions)
    .values({
      organizationId: scope.organizationId,
      code: 'PAYMENT_UNMATCHED',
      severity: 'HIGH',
      entityType: 'Payment',
      entityId: payment.id,
      paymentId: payment.id,
      title: 'Payment could not be matched to a tenant',
      detail: `${amount(input.grossCents)} received with account reference "${
        input.accountReference ?? '—'
      }" from ${input.payerPhone ?? 'an unknown number'}. ${match.strategy}.`,
      recommendedAction: 'Reconcile the payment manually against the correct tenant.',
      status: 'OPEN',
    })
    .onConflictDoNothing()
    .returning()

  await audit(tx, scope, {
    action: 'Payment Recorded',
    entityType: 'Payment',
    entityId: payment.id,
    reference: payment.reference,
    newValue: { gross: amount(input.grossCents), status: 'UNMATCHED', reason: match.strategy },
  })

  return {
    paymentId: payment.id,
    reference: payment.reference,
    matched: false,
    match,
    allocatedCents: 0,
    unallocatedCents: input.grossCents,
    commissionCents: 0,
    netCents: 0,
    receiptNumber: null,
    invoicesUpdated: [],
    exceptionId: exception?.id ?? null,
  }
}

/**
 * Manual reconciliation of an unmatched payment (spec §15). The suspense
 * posting is reversed and the payment is replayed through the normal flow.
 */
export async function reconcilePayment(
  scope: Scope,
  paymentId: string,
  target: { tenantId: string },
): Promise<RecordPaymentResult> {
  const original = await db
    .select()
    .from(payments)
    .where(scoped(payments, scope, eq(payments.id, paymentId)))
    .limit(1)
    .then((rows) => rows[0])

  assertInScope(original, scope, 'payment')
  if (original.status !== 'UNMATCHED') {
    throw new Error(`Payment ${original.reference} is already reconciled.`)
  }

  await db.transaction(async (tx) => {
    const groups = await tx
      .select({ entryGroupId: sql<string>`distinct entry_group_id` })
      .from(sql`ledger_entries`)
      .where(sql`organization_id = ${scope.organizationId} and source_id = ${paymentId}`)

    for (const group of groups) {
      await reverseLedgerGroup(tx, scope, group.entryGroupId, `Payment ${original.reference} reconciled`)
    }

    await tx
      .update(payments)
      .set({ status: 'REVERSED', reconciliationStatus: 'EXCEPTION', updatedAt: new Date() })
      .where(scoped(payments, scope, eq(payments.id, paymentId)))

    await tx
      .update(complianceExceptions)
      .set({
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: scope.userId,
        resolvedByName: scope.userName,
        updatedAt: new Date(),
      })
      .where(scoped(complianceExceptions, scope, eq(complianceExceptions.paymentId, paymentId)))
  })

  const replayed = await recordPayment(scope, {
    method: original.method as PaymentMethodName,
    grossCents: cents(original.grossAmount),
    paidAt: original.paidAt,
    externalReference: original.externalReference,
    payerName: original.payerName,
    payerPhone: original.payerPhone,
    accountReference: original.accountReference,
    narrative: `Manually reconciled from ${original.reference}`,
    rawPayload: original.rawPayload,
    tenantId: target.tenantId,
  })

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ reconciliationStatus: 'MANUALLY_MATCHED', updatedAt: new Date() })
      .where(scoped(payments, scope, eq(payments.id, replayed.paymentId)))

    await audit(tx, scope, {
      action: 'Payment Reconciled',
      entityType: 'Payment',
      entityId: replayed.paymentId,
      reference: replayed.reference,
      previousValue: { reference: original.reference, status: 'UNMATCHED' },
      newValue: { tenantId: target.tenantId, status: 'CONFIRMED' },
    })
  })

  return { ...replayed, match: { ...replayed.match, strategy: 'manual reconciliation' } }
}

/** Reverse a confirmed payment — e.g. an M-Pesa reversal (spec §14). */
export async function reversePayment(scope: Scope, paymentId: string, reason: string) {
  return db.transaction(async (tx) => {
    const payment = await tx
      .select()
      .from(payments)
      .where(scoped(payments, scope, eq(payments.id, paymentId)))
      .limit(1)
      .then((rows) => rows[0])

    assertInScope(payment, scope, 'payment')
    if (payment.status === 'REVERSED') return { reversed: false, reference: payment.reference }
    if (payment.settlementStatus === 'SETTLED') {
      throw new Error(
        `Payment ${payment.reference} has already been settled to the landlord and cannot be reversed here. ` +
          'Raise a settlement adjustment instead.',
      )
    }

    const allocations = await tx
      .select()
      .from(paymentAllocations)
      .where(scoped(paymentAllocations, scope, eq(paymentAllocations.paymentId, paymentId)))

    for (const allocation of allocations) {
      const invoice = await tx
        .select()
        .from(rentInvoices)
        .where(scoped(rentInvoices, scope, eq(rentInvoices.id, allocation.invoiceId)))
        .limit(1)
        .then((rows) => rows[0])
      if (!invoice) continue
      const paidCents = Math.max(0, cents(invoice.amountPaid) - cents(allocation.amount))
      const totalCents = cents(invoice.total)
      await tx
        .update(rentInvoices)
        .set({
          amountPaid: amount(paidCents),
          balance: amount(totalCents - paidCents),
          status: invoiceStatusFor(invoice.status as 'DUE', totalCents, paidCents, invoice.dueDate),
          updatedAt: new Date(),
        })
        .where(scoped(rentInvoices, scope, eq(rentInvoices.id, invoice.id)))
    }

    // Points come off before the allocations they were earned on disappear.
    // The awards are not deleted — a compensating group is posted against
    // each, so the tenant's statement still shows what happened and why.
    await reverseAwardsForPayment(tx, paymentId, reason)

    await tx
      .delete(paymentAllocations)
      .where(scoped(paymentAllocations, scope, eq(paymentAllocations.paymentId, paymentId)))

    const groups = await tx
      .select({ entryGroupId: sql<string>`distinct entry_group_id` })
      .from(sql`ledger_entries`)
      .where(sql`organization_id = ${scope.organizationId} and source_id = ${paymentId}`)
    for (const group of groups) {
      await reverseLedgerGroup(tx, scope, group.entryGroupId, reason)
    }

    await tx
      .update(payments)
      .set({
        status: 'REVERSED',
        reconciliationStatus: 'EXCEPTION',
        allocatedAmount: '0',
        unallocatedAmount: payment.grossAmount,
        reversedAt: new Date(),
        reversalReason: reason,
        updatedAt: new Date(),
      })
      .where(scoped(payments, scope, eq(payments.id, paymentId)))

    await audit(tx, scope, {
      action: 'Payment Reversed',
      entityType: 'Payment',
      entityId: paymentId,
      reference: payment.reference,
      previousValue: { status: payment.status, allocated: payment.allocatedAmount },
      newValue: { status: 'REVERSED', reason },
    })

    return { reversed: true, reference: payment.reference }
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cashAccountFor(method: PaymentMethodName) {
  switch (method) {
    case 'MPESA':
      return 'CASH_MPESA' as const
    case 'CASH':
      return 'CASH_ON_HAND' as const
    case 'ADJUSTMENT':
      return 'ADJUSTMENTS' as const
    default:
      return 'CASH_BANK' as const
  }
}

async function matchFromTenant(
  tx: Tx,
  scope: Scope,
  tenantId: string,
  leaseId: string | null,
): Promise<MatchResult> {
  const rows = await tx
    .select({
      tenantId: tenants.id,
      leaseId: leases.id,
      unitId: leases.unitId,
      propertyId: leases.propertyId,
      landlordId: properties.landlordId,
    })
    .from(tenants)
    .innerJoin(leases, eq(leases.tenantId, tenants.id))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(
      scoped(
        tenants,
        scope,
        eq(tenants.id, tenantId),
        leaseId ? eq(leases.id, leaseId) : sql`${leases.status} in ('ACTIVE', 'EXPIRING')`,
      ),
    )
    .orderBy(sql`${leases.startDate} desc`)
    .limit(1)

  if (rows.length === 0) {
    return {
      tenantId: null,
      leaseId: null,
      unitId: null,
      propertyId: null,
      landlordId: null,
      confidence: 'none',
      strategy: 'tenant has no active lease',
      ambiguous: false,
    }
  }
  return { ...rows[0], confidence: 'exact', strategy: 'explicit tenant', ambiguous: false }
}

async function loadContext(tx: Tx, scope: Scope, propertyId: string, landlordId: string) {
  const [property] = await tx
    .select({
      propertyRate: properties.commissionRate,
      propertyName: properties.name,
    })
    .from(properties)
    .where(scoped(properties, scope, eq(properties.id, propertyId)))
    .limit(1)

  const [landlord] = await tx
    .select({ landlordRate: landlords.commissionRate, landlordName: landlords.fullName })
    .from(landlords)
    .where(scoped(landlords, scope, eq(landlords.id, landlordId)))
    .limit(1)

  const [organization] = await tx
    .select({ organizationRate: organizations.commissionRate })
    .from(organizations)
    .where(eq(organizations.id, scope.organizationId))
    .limit(1)

  return {
    propertyRate: property?.propertyRate ?? null,
    landlordRate: landlord?.landlordRate ?? null,
    organizationRate: organization?.organizationRate ?? '1',
    propertyName: property?.propertyName ?? '',
    tenantName: landlord?.landlordName ?? '',
  }
}

/**
 * Split a receipt across the income accounts in the proportions the matching
 * invoices were accrued in, so the ledger releases exactly what it recognised.
 * Any rounding remainder, and any prepayment that matched no invoice, lands on
 * rent income — advance rent is still rent.
 */
async function incomeMixFor(
  tx: Tx,
  scope: Scope,
  allocations: { invoiceId: string; amountCents: number }[],
  unallocatedCents: number,
) {
  const totalCents = allocations.reduce((total, a) => total + a.amountCents, 0) + unallocatedCents
  let serviceCents = 0
  let penaltyCents = 0

  if (allocations.length > 0) {
    const items = await tx
      .select({
        invoiceId: invoiceItems.invoiceId,
        type: invoiceItems.type,
        amount: invoiceItems.amount,
      })
      .from(invoiceItems)
      .where(
        scoped(
          invoiceItems,
          scope,
          inArray(
            invoiceItems.invoiceId,
            allocations.map((a) => a.invoiceId),
          ),
        ),
      )

    for (const allocation of allocations) {
      const invoiceLines = items.filter((item) => item.invoiceId === allocation.invoiceId)
      const invoiceTotal = invoiceLines.reduce((total, item) => total + cents(item.amount), 0)
      if (invoiceTotal <= 0) continue
      const share = (typeAmount: number) => Math.round((typeAmount * allocation.amountCents) / invoiceTotal)
      serviceCents += share(
        invoiceLines
          .filter((item) => item.type === 'SERVICE_CHARGE')
          .reduce((total, item) => total + cents(item.amount), 0),
      )
      penaltyCents += share(
        invoiceLines
          .filter((item) => item.type === 'PENALTY')
          .reduce((total, item) => total + cents(item.amount), 0),
      )
    }
  }

  // Clamp so the group always balances even under adverse rounding.
  serviceCents = Math.max(0, Math.min(serviceCents, totalCents))
  penaltyCents = Math.max(0, Math.min(penaltyCents, totalCents - serviceCents))
  const rentCents = totalCents - serviceCents - penaltyCents

  return { rentCents, serviceCents, penaltyCents }
}

/** Outstanding balance across every open invoice for a tenant, in cents. */
export async function tenantBalanceCents(tx: Tx, scope: Scope, tenantId: string): Promise<number> {
  const [row] = await tx
    .select({ balance: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)` })
    .from(rentInvoices)
    .where(
      scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId), ne(rentInvoices.status, 'CANCELLED')),
    )
  return cents(row?.balance ?? '0')
}

export { and, eq, inArray, units }
