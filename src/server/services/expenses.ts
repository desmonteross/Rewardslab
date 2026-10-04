// ===========================================================================
//  Expenses (spec §20)
//
//  Property costs recorded against a property and its landlord. Approved
//  expenses that are marked rechargeable are deducted from the landlord's next
//  settlement, and the accounting entries are posted when they are approved.
// ===========================================================================

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { expenses, properties } from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { postLedgerGroup } from './ledger'
import { nextNumber } from './numbering'

export type ExpenseCategoryName =
  | 'MAINTENANCE'
  | 'SECURITY'
  | 'CLEANING'
  | 'UTILITIES'
  | 'INSURANCE'
  | 'RATES'
  | 'REPAIRS'
  | 'MANAGEMENT'
  | 'PROFESSIONAL_FEES'
  | 'OTHER'

export interface RecordExpenseInput {
  propertyId: string
  category: ExpenseCategoryName
  amountCents: number
  expenseDate: Date
  description: string
  vendorId?: string | null
  unitId?: string | null
  ticketId?: string | null
  documentUrl?: string | null
  rechargeToLandlord?: boolean
}

export async function recordExpense(scope: Scope, input: RecordExpenseInput) {
  if (input.amountCents <= 0) throw new Error('An expense must be greater than zero.')

  return db.transaction(async (tx) => {
    const property = await tx
      .select({ id: properties.id, landlordId: properties.landlordId, organizationId: properties.organizationId })
      .from(properties)
      .where(scoped(properties, scope, eq(properties.id, input.propertyId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(property, scope, 'property')

    const reference = await nextNumber(tx, scope.organizationId, 'expense', input.expenseDate)

    const [expense] = await tx
      .insert(expenses)
      .values({
        organizationId: scope.organizationId,
        reference,
        propertyId: input.propertyId,
        landlordId: property.landlordId,
        unitId: input.unitId ?? null,
        vendorId: input.vendorId ?? null,
        ticketId: input.ticketId ?? null,
        category: input.category,
        amount: amount(input.amountCents),
        expenseDate: input.expenseDate,
        description: input.description,
        documentUrl: input.documentUrl ?? null,
        approvalStatus: 'PENDING',
        paymentStatus: 'UNPAID',
        rechargeToLandlord: input.rechargeToLandlord ?? true,
        createdById: scope.userId,
        createdByName: scope.userName,
      })
      .returning()

    await audit(tx, scope, {
      action: 'Expense Recorded',
      entityType: 'Expense',
      entityId: expense.id,
      reference: expense.reference,
      newValue: { amount: expense.amount, category: expense.category, property: input.propertyId },
    })

    return expense
  })
}

export async function approveExpense(scope: Scope, expenseId: string, approve: boolean, note?: string) {
  return db.transaction(async (tx) => {
    const expense = await tx
      .select()
      .from(expenses)
      .where(scoped(expenses, scope, eq(expenses.id, expenseId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(expense, scope, 'expense')

    if (expense.approvalStatus !== 'PENDING') {
      throw new Error(`${expense.reference} has already been ${expense.approvalStatus.toLowerCase()}.`)
    }

    const [updated] = await tx
      .update(expenses)
      .set({
        approvalStatus: approve ? 'APPROVED' : 'REJECTED',
        approvedById: scope.userId,
        approvedByName: scope.userName,
        approvedAt: new Date(),
        paymentStatus: approve ? 'PAID' : 'UNPAID',
        updatedAt: new Date(),
      })
      .where(scoped(expenses, scope, eq(expenses.id, expenseId)))
      .returning()

    if (approve) {
      // The cost is incurred and settled from the operating float; it is
      // recovered from the landlord when the settlement is built.
      await postLedgerGroup(tx, scope, {
        sourceType: 'EXPENSE',
        sourceId: expense.id,
        sourceReference: expense.reference,
        transactionDate: expense.expenseDate,
        narrative: `${expense.description} (${expense.reference})`,
        propertyId: expense.propertyId,
        landlordId: expense.landlordId,
        unitId: expense.unitId,
        lines: [
          { account: 'PROPERTY_EXPENSE', entryType: 'DEBIT', amountCents: cents(expense.amount) },
          { account: 'CASH_BANK', entryType: 'CREDIT', amountCents: cents(expense.amount) },
        ],
      })
    }

    await audit(tx, scope, {
      action: 'Expense Approved',
      entityType: 'Expense',
      entityId: expenseId,
      reference: expense.reference,
      previousValue: { approvalStatus: expense.approvalStatus },
      newValue: { approvalStatus: approve ? 'APPROVED' : 'REJECTED', note: note ?? null },
    })

    return updated
  })
}
