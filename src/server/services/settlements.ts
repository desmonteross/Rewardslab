// ===========================================================================
//  Landlord settlement engine (spec §18)
//
//  PAYMENT is money received. SETTLEMENT is money owed onward to the landlord.
//  They are deliberately separate records, because between the two sit
//  commission, management fees, approved expenses and adjustments:
//
//      Wanjiku Holdings Ltd · 1–7 September
//      Gross rent        KES 750,000
//      Platform fees     KES   7,500
//      Adjustments       KES       0
//      NET SETTLEMENT    KES 742,500
// ===========================================================================

import { and, eq, inArray, isNull, sql } from 'drizzle-orm'
import {
  commissions,
  expenses,
  landlords,
  payments,
  properties,
  settlementItems,
  settlements,
} from '@/db/schema'
import { db, type Tx } from '@/db'
import { amount, cents, percentOfCents } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { postLedgerGroup } from './ledger'
import { nextNumber } from './numbering'
import { ensureFunded } from './treasury'
import { getPayoutProvider } from '../adapters'

export interface SettlementDraftLine {
  type: 'RENT' | 'COMMISSION' | 'MANAGEMENT_FEE' | 'EXPENSE' | 'ADJUSTMENT'
  description: string
  propertyId?: string | null
  paymentId?: string | null
  expenseId?: string | null
  grossCents: number
  commissionCents: number
  netCents: number
}

export interface SettlementTotals {
  grossCents: number
  commissionCents: number
  managementFeeCents: number
  expenseCents: number
  adjustmentCents: number
  netCents: number
}

/** Pure: totals for a batch, so the arithmetic is testable without a database. */
export function totalsFor(lines: SettlementDraftLine[]): SettlementTotals {
  let grossCents = 0
  let commissionCents = 0
  let managementFeeCents = 0
  let expenseCents = 0
  let adjustmentCents = 0

  for (const line of lines) {
    switch (line.type) {
      case 'RENT':
        grossCents += line.grossCents
        commissionCents += line.commissionCents
        break
      case 'MANAGEMENT_FEE':
        managementFeeCents += line.grossCents
        break
      case 'EXPENSE':
        expenseCents += line.grossCents
        break
      case 'ADJUSTMENT':
        adjustmentCents += line.netCents
        break
      default:
        break
    }
  }

  const netCents = grossCents - commissionCents - managementFeeCents - expenseCents + adjustmentCents
  return { grossCents, commissionCents, managementFeeCents, expenseCents, adjustmentCents, netCents }
}

export interface CreateSettlementArgs {
  landlordId: string
  periodStart: Date
  periodEnd: Date
  /** Deduct approved, recharged expenses falling in the period. Default true. */
  includeExpenses?: boolean
  adjustmentCents?: number
  adjustmentNote?: string
  scheduledFor?: Date
}

export async function createSettlementBatch(scope: Scope, args: CreateSettlementArgs) {
  const includeExpenses = args.includeExpenses ?? true

  return db.transaction(async (tx) => {
    const landlord = await tx
      .select()
      .from(landlords)
      .where(scoped(landlords, scope, eq(landlords.id, args.landlordId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(landlord, scope, 'landlord')

    // Confirmed, not-yet-settled receipts for this landlord in the window.
    const settleable = await tx
      .select({
        paymentId: payments.id,
        reference: payments.reference,
        propertyId: payments.propertyId,
        propertyName: properties.name,
        managementFeeRate: properties.managementFeeRate,
        grossAmount: payments.grossAmount,
        commissionAmount: commissions.commissionAmount,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .leftJoin(commissions, eq(commissions.paymentId, payments.id))
      .leftJoin(properties, eq(properties.id, payments.propertyId))
      .where(
        scoped(
          payments,
          scope,
          eq(payments.landlordId, args.landlordId),
          eq(payments.status, 'CONFIRMED'),
          eq(payments.settlementStatus, 'PENDING'),
          isNull(payments.settlementId),
          sql`${payments.paidAt} >= ${args.periodStart}`,
          sql`${payments.paidAt} <= ${args.periodEnd}`,
        ),
      )

    if (settleable.length === 0 && !args.adjustmentCents) {
      throw new Error('There are no unsettled payments for this landlord in the selected period.')
    }

    const lines: SettlementDraftLine[] = []

    for (const payment of settleable) {
      const grossCents = cents(payment.grossAmount)
      const commissionCents = cents(payment.commissionAmount)
      lines.push({
        type: 'RENT',
        description: `${payment.reference} — ${payment.propertyName ?? 'Property'}`,
        propertyId: payment.propertyId,
        paymentId: payment.paymentId,
        grossCents,
        commissionCents,
        netCents: grossCents - commissionCents,
      })

      const managementFeeCents = percentOfCents(grossCents, payment.managementFeeRate ?? '0')
      if (managementFeeCents > 0) {
        lines.push({
          type: 'MANAGEMENT_FEE',
          description: `Management fee ${payment.managementFeeRate}% on ${payment.reference}`,
          propertyId: payment.propertyId,
          paymentId: payment.paymentId,
          grossCents: managementFeeCents,
          commissionCents: 0,
          netCents: -managementFeeCents,
        })
      }
    }

    let settleableExpenses: { id: string; reference: string; amount: string; description: string; propertyId: string }[] =
      []
    if (includeExpenses) {
      settleableExpenses = await tx
        .select({
          id: expenses.id,
          reference: expenses.reference,
          amount: expenses.amount,
          description: expenses.description,
          propertyId: expenses.propertyId,
        })
        .from(expenses)
        .where(
          scoped(
            expenses,
            scope,
            eq(expenses.landlordId, args.landlordId),
            eq(expenses.approvalStatus, 'APPROVED'),
            eq(expenses.rechargeToLandlord, true),
            isNull(expenses.settlementId),
            sql`${expenses.expenseDate} >= ${args.periodStart}`,
            sql`${expenses.expenseDate} <= ${args.periodEnd}`,
          ),
        )

      for (const expense of settleableExpenses) {
        const expenseCents = cents(expense.amount)
        lines.push({
          type: 'EXPENSE',
          description: `${expense.reference} — ${expense.description}`,
          propertyId: expense.propertyId,
          expenseId: expense.id,
          grossCents: expenseCents,
          commissionCents: 0,
          netCents: -expenseCents,
        })
      }
    }

    if (args.adjustmentCents) {
      lines.push({
        type: 'ADJUSTMENT',
        description: args.adjustmentNote ?? 'Manual adjustment',
        grossCents: 0,
        commissionCents: 0,
        netCents: args.adjustmentCents,
      })
    }

    const totals = totalsFor(lines)
    const reference = await nextNumber(tx, scope.organizationId, 'settlement')

    const [settlement] = await tx
      .insert(settlements)
      .values({
        organizationId: scope.organizationId,
        reference,
        landlordId: args.landlordId,
        periodStart: args.periodStart,
        periodEnd: args.periodEnd,
        grossAmount: amount(totals.grossCents),
        commissionAmount: amount(totals.commissionCents),
        managementFee: amount(totals.managementFeeCents),
        expenseAmount: amount(totals.expenseCents),
        adjustmentAmount: amount(totals.adjustmentCents),
        netAmount: amount(totals.netCents),
        status: 'PENDING',
        method: landlord.payoutMethod,
        destination:
          landlord.payoutMethod === 'MPESA'
            ? maskTail(landlord.mpesaNumber)
            : `${landlord.bankName ?? 'Bank'} ${maskTail(landlord.bankAccountNumber)}`,
        scheduledFor: args.scheduledFor ?? null,
        createdById: scope.userId,
        createdByName: scope.userName,
      })
      .returning()

    await tx.insert(settlementItems).values(
      lines.map((line) => ({
        organizationId: scope.organizationId,
        settlementId: settlement.id,
        type: line.type,
        description: line.description,
        propertyId: line.propertyId ?? null,
        paymentId: line.paymentId ?? null,
        expenseId: line.expenseId ?? null,
        grossAmount: amount(line.grossCents),
        commissionAmount: amount(line.commissionCents),
        netAmount: amount(line.netCents),
      })),
    )

    const paymentIds = settleable.map((payment) => payment.paymentId)
    if (paymentIds.length > 0) {
      await tx
        .update(payments)
        .set({ settlementId: settlement.id, settlementStatus: 'SCHEDULED', updatedAt: new Date() })
        .where(scoped(payments, scope, inArray(payments.id, paymentIds)))

      await tx
        .update(commissions)
        .set({ settlementId: settlement.id, status: 'SETTLED' })
        .where(scoped(commissions, scope, inArray(commissions.paymentId, paymentIds)))
    }

    if (settleableExpenses.length > 0) {
      await tx
        .update(expenses)
        .set({ settlementId: settlement.id, paymentStatus: 'PAID', updatedAt: new Date() })
        .where(
          scoped(
            expenses,
            scope,
            inArray(
              expenses.id,
              settleableExpenses.map((expense) => expense.id),
            ),
          ),
        )
    }

    await audit(tx, scope, {
      action: 'Settlement Created',
      entityType: 'Settlement',
      entityId: settlement.id,
      reference: settlement.reference,
      newValue: {
        gross: settlement.grossAmount,
        commission: settlement.commissionAmount,
        expenses: settlement.expenseAmount,
        net: settlement.netAmount,
        payments: paymentIds.length,
      },
    })

    return { settlement, totals, lineCount: lines.length }
  })
}

export async function approveSettlement(scope: Scope, settlementId: string) {
  return db.transaction(async (tx) => {
    const settlement = await loadSettlement(tx, scope, settlementId)
    if (settlement.status !== 'PENDING') {
      throw new Error(`Settlement ${settlement.reference} is ${settlement.status.toLowerCase()} and cannot be approved.`)
    }
    const [updated] = await tx
      .update(settlements)
      .set({
        status: 'SCHEDULED',
        approvedById: scope.userId,
        approvedByName: scope.userName,
        updatedAt: new Date(),
      })
      .where(scoped(settlements, scope, eq(settlements.id, settlementId)))
      .returning()

    await audit(tx, scope, {
      action: 'Settlement Approved',
      entityType: 'Settlement',
      entityId: settlementId,
      reference: settlement.reference,
      previousValue: { status: settlement.status },
      newValue: { status: 'SCHEDULED', net: settlement.netAmount },
    })
    return updated
  })
}

/**
 * Disburse the batch through the configured payout provider (a mock in
 * Phase 1) and post the accounting entries that clear the landlord payable.
 */
export async function processSettlement(scope: Scope, settlementId: string) {
  const settlement = await db
    .select()
    .from(settlements)
    .where(scoped(settlements, scope, eq(settlements.id, settlementId)))
    .limit(1)
    .then((rows) => rows[0])
  assertInScope(settlement, scope, 'settlement')

  if (settlement.status === 'SETTLED') return { settlement, alreadySettled: true }
  if (settlement.status !== 'SCHEDULED' && settlement.status !== 'PENDING') {
    throw new Error(`Settlement ${settlement.reference} cannot be processed from ${settlement.status}.`)
  }

  await db
    .update(settlements)
    .set({ status: 'PROCESSING', updatedAt: new Date() })
    .where(scoped(settlements, scope, eq(settlements.id, settlementId)))

  // Bank payouts are funded from the M-Pesa float, which is where the rent
  // actually landed. Without the sweep the bank account drifts negative.
  await ensureFunded(
    scope,
    settlement.method === 'MPESA' ? 'CASH_MPESA' : 'CASH_BANK',
    cents(settlement.netAmount),
  )

  const payout = await getPayoutProvider().disburse({
    reference: settlement.reference,
    method: settlement.method,
    destination: settlement.destination ?? '',
    amountCents: cents(settlement.netAmount),
    narrative: `Landlord settlement ${settlement.reference}`,
  })

  return db.transaction(async (tx) => {
    if (!payout.success) {
      const [failed] = await tx
        .update(settlements)
        .set({ status: 'FAILED', failureReason: payout.message, updatedAt: new Date() })
        .where(scoped(settlements, scope, eq(settlements.id, settlementId)))
        .returning()
      return { settlement: failed, alreadySettled: false }
    }

    const grossCents = cents(settlement.grossAmount)
    const commissionCents = cents(settlement.commissionAmount)
    const managementFeeCents = cents(settlement.managementFee)
    const expenseCents = cents(settlement.expenseAmount)
    const adjustmentCents = cents(settlement.adjustmentAmount)
    const netCents = cents(settlement.netAmount)
    const payableCents = grossCents - commissionCents

    await postLedgerGroup(tx, scope, {
      sourceType: 'SETTLEMENT',
      sourceId: settlement.id,
      sourceReference: settlement.reference,
      transactionDate: new Date(),
      narrative: `Landlord settlement ${settlement.reference}`,
      landlordId: settlement.landlordId,
      lines: [
        { account: 'LANDLORD_PAYABLE', entryType: 'DEBIT', amountCents: payableCents },
        { account: 'ADJUSTMENTS', entryType: 'DEBIT', amountCents: Math.max(0, adjustmentCents) },
        { account: 'COMMISSION_INCOME', entryType: 'CREDIT', amountCents: managementFeeCents },
        { account: 'PROPERTY_EXPENSE', entryType: 'CREDIT', amountCents: expenseCents },
        { account: 'ADJUSTMENTS', entryType: 'CREDIT', amountCents: Math.max(0, -adjustmentCents) },
        {
          account: settlement.method === 'MPESA' ? 'CASH_MPESA' : 'CASH_BANK',
          entryType: 'CREDIT',
          amountCents: netCents,
        },
      ],
    })

    await tx
      .update(payments)
      .set({ settlementStatus: 'SETTLED', updatedAt: new Date() })
      .where(scoped(payments, scope, eq(payments.settlementId, settlementId)))

    const [settled] = await tx
      .update(settlements)
      .set({
        status: 'SETTLED',
        processedAt: new Date(),
        externalReference: payout.reference,
        updatedAt: new Date(),
      })
      .where(scoped(settlements, scope, eq(settlements.id, settlementId)))
      .returning()

    await audit(tx, scope, {
      action: 'Settlement Processed',
      entityType: 'Settlement',
      entityId: settlementId,
      reference: settlement.reference,
      previousValue: { status: settlement.status },
      newValue: { status: 'SETTLED', net: settlement.netAmount, providerRef: payout.reference },
    })

    return { settlement: settled, alreadySettled: false }
  })
}

async function loadSettlement(tx: Tx, scope: Scope, settlementId: string) {
  const row = await tx
    .select()
    .from(settlements)
    .where(scoped(settlements, scope, eq(settlements.id, settlementId)))
    .limit(1)
    .then((rows) => rows[0])
  return assertInScope(row, scope, 'settlement')
}

function maskTail(value: string | null | undefined) {
  if (!value) return '—'
  const trimmed = value.replace(/\s+/g, '')
  return trimmed.length <= 4 ? trimmed : `•••• ${trimmed.slice(-4)}`
}

export { and }
