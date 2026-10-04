'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { approveExpense, recordExpense, type ExpenseCategoryName } from '@/server/services/expenses'
import type { ActionState } from '@/components/action-form'

export async function recordExpenseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('expenses.create')
    const scope = scopeFromSession(session)

    const amountCents = cents(String(formData.get('amount') ?? '0'))
    const propertyId = String(formData.get('propertyId') ?? '')
    const description = String(formData.get('description') ?? '').trim()

    if (!propertyId) return { ok: false, message: 'Choose the property this cost belongs to.' }
    if (amountCents <= 0) return { ok: false, message: 'Enter an amount greater than zero.' }
    if (!description) return { ok: false, message: 'Describe what the money was spent on.' }

    const expense = await recordExpense(scope, {
      propertyId,
      category: String(formData.get('category') ?? 'OTHER') as ExpenseCategoryName,
      amountCents,
      expenseDate: formData.get('expenseDate') ? new Date(String(formData.get('expenseDate'))) : new Date(),
      description,
      vendorId: String(formData.get('vendorId') ?? '') || null,
      rechargeToLandlord: formData.get('recharge') === 'on',
    })

    revalidatePath('/expenses')
    return { ok: true, message: `${expense.reference} recorded for ${formatKES(expense.amount)} and is awaiting approval.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not record the expense.' }
  }
}

export async function approveExpenseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('expenses.approve')
    const scope = scopeFromSession(session)
    const expenseId = String(formData.get('expenseId'))
    const approve = String(formData.get('decision') ?? 'approve') === 'approve'

    const updated = await approveExpense(scope, expenseId, approve)

    revalidatePath('/expenses')
    revalidatePath('/accounting')
    return {
      ok: true,
      message: approve
        ? `${updated.reference} approved. It will be deducted from the landlord's next settlement.`
        : `${updated.reference} rejected.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update the expense.' }
  }
}
