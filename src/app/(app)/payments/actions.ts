'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { recordPayment, reconcilePayment, reversePayment, type PaymentMethodName } from '@/server/services/payments'
import { ingestMpesaTransaction } from '@/server/services/mpesa'
import type { ActionState } from '@/components/action-form'

export async function recordPaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('payments.record')
    const scope = scopeFromSession(session)

    const grossCents = cents(String(formData.get('amount') ?? '0'))
    if (grossCents <= 0) return { ok: false, message: 'Enter an amount greater than zero.' }

    const result = await recordPayment(scope, {
      method: (String(formData.get('method') ?? 'MPESA') as PaymentMethodName) || 'MPESA',
      grossCents,
      paidAt: formData.get('paidAt') ? new Date(String(formData.get('paidAt'))) : new Date(),
      externalReference: String(formData.get('externalReference') ?? '') || null,
      payerName: String(formData.get('payerName') ?? '') || null,
      payerPhone: String(formData.get('payerPhone') ?? '') || null,
      accountReference: String(formData.get('accountReference') ?? '') || null,
      tenantId: String(formData.get('tenantId') ?? '') || null,
      narrative: String(formData.get('narrative') ?? '') || null,
    })

    revalidatePath('/payments')
    revalidatePath('/rent')
    revalidatePath('/dashboard')

    return {
      ok: true,
      message: result.matched
        ? `${result.reference} recorded. ${formatKES(result.allocatedCents / 100)} allocated across ${result.invoicesUpdated.length} invoice(s); commission ${formatKES(result.commissionCents / 100)}; receipt ${result.receiptNumber}.`
        : `${result.reference} could not be matched (${result.match.strategy}) and is waiting in the unmatched queue.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not record the payment.' }
  }
}

/**
 * Feed a realistic Safaricom C2B confirmation through the same webhook path a
 * live deployment would use — the quickest way to see reconciliation work.
 */
export async function simulateMpesaAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('payments.record')
    const scope = scopeFromSession(session)

    const amountCents = cents(String(formData.get('amount') ?? '0'))
    if (amountCents <= 0) return { ok: false, message: 'Enter an amount greater than zero.' }

    const result = await ingestMpesaTransaction({
      organizationId: scope.organizationId,
      amountCents,
      phone: String(formData.get('phone') ?? '0722000000'),
      billRefNumber: String(formData.get('accountReference') ?? ''),
      payerName: String(formData.get('payerName') ?? 'DEMO PAYER'),
      actor: { id: scope.userId, name: scope.userName, role: scope.role, sessionId: scope.sessionId },
    })

    revalidatePath('/payments')
    revalidatePath('/rent')
    revalidatePath('/dashboard')

    return {
      ok: true,
      message: result.matched
        ? `M-Pesa ${result.transactionId} received and matched to ${result.tenantName ?? 'a tenant'} — receipt ${result.receiptNumber}.`
        : `M-Pesa ${result.transactionId} received but could not be matched (${result.reason}). It is in the unmatched queue.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Simulation failed.' }
  }
}

export async function reconcilePaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('payments.reconcile')
    const scope = scopeFromSession(session)
    const paymentId = String(formData.get('paymentId'))
    const tenantId = String(formData.get('tenantId') ?? '')
    if (!tenantId) return { ok: false, message: 'Choose the tenant this payment belongs to.' }

    const result = await reconcilePayment(scope, paymentId, { tenantId })

    revalidatePath('/payments')
    revalidatePath(`/payments/${paymentId}`)
    revalidatePath('/rent')
    revalidatePath('/erits')

    return {
      ok: true,
      message: `Reconciled as ${result.reference}. ${formatKES(result.allocatedCents / 100)} allocated; receipt ${result.receiptNumber ?? '—'}.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not reconcile the payment.' }
  }
}

export async function reversePaymentAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('payments.reverse')
    const scope = scopeFromSession(session)
    const paymentId = String(formData.get('paymentId'))
    const reason = String(formData.get('reason') ?? '').trim()
    if (!reason) return { ok: false, message: 'Give a reason — reversals are audited.' }

    const result = await reversePayment(scope, paymentId, reason)

    revalidatePath('/payments')
    revalidatePath(`/payments/${paymentId}`)
    revalidatePath('/accounting')

    return {
      ok: result.reversed,
      message: result.reversed
        ? `${result.reference} reversed. Allocations were undone and balancing ledger entries posted.`
        : `${result.reference} was already reversed.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not reverse the payment.' }
  }
}
