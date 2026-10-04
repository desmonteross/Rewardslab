'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents } from '@/lib/money'
import { completeMoveOut, renewLease, terminateLease, transferTenant } from '@/server/services/leases'
import { runBilling } from '@/server/services/billing'

export interface ActionState {
  ok: boolean
  message: string
}

export async function renewLeaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('leases.update')
    const scope = scopeFromSession(session)
    const leaseId = String(formData.get('leaseId'))
    const months = Number(formData.get('months') ?? 12)
    const applyEscalation = formData.get('applyEscalation') === 'on'

    const renewal = await renewLease(scope, leaseId, { months, applyEscalation })
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath('/leases')
    return { ok: true, message: `Lease renewed as ${renewal.code}, running to ${renewal.endDate.toDateString()}.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not renew the lease.' }
  }
}

export async function terminateLeaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('leases.terminate')
    const scope = scopeFromSession(session)
    const leaseId = String(formData.get('leaseId'))
    const reason = String(formData.get('reason') ?? '').trim()
    if (!reason) return { ok: false, message: 'Give a reason for the termination — it is recorded in the audit trail.' }

    await terminateLease(scope, leaseId, { reason })
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath('/leases')
    revalidatePath('/move-outs')
    return { ok: true, message: 'Lease terminated and a move-out scheduled.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not terminate the lease.' }
  }
}

export async function transferTenantAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('leases.update')
    const scope = scopeFromSession(session)
    const leaseId = String(formData.get('leaseId'))
    const toUnitId = String(formData.get('toUnitId') ?? '')
    if (!toUnitId) return { ok: false, message: 'Choose the unit to transfer the tenant into.' }

    const created = await transferTenant(scope, leaseId, { toUnitId })
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath('/units')
    return { ok: true, message: `Tenant transferred under lease ${created.code}.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not transfer the tenant.' }
  }
}

export async function completeMoveOutAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('moves.manage')
    const scope = scopeFromSession(session)
    const moveId = String(formData.get('moveId'))
    const deductions = String(formData.get('deductions') ?? '0')
    const notes = String(formData.get('notes') ?? '')

    const result = await completeMoveOut(scope, moveId, {
      deductionsCents: cents(deductions),
      inspectionNotes: notes || undefined,
    })
    revalidatePath('/move-outs')
    revalidatePath('/units')
    return {
      ok: true,
      message: `Move-out completed. Deposit ${(result.depositCents / 100).toLocaleString()} · deductions ${(result.deductionsCents / 100).toLocaleString()} · refund ${(result.refundCents / 100).toLocaleString()}.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not complete the move-out.' }
  }
}

export async function billLeaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('billing.run')
    const scope = scopeFromSession(session)
    const leaseId = String(formData.get('leaseId'))
    const now = new Date()

    const result = await runBilling(scope, {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      leaseId,
    })
    revalidatePath(`/leases/${leaseId}`)
    revalidatePath('/invoices')
    return {
      ok: true,
      message:
        result.invoicesCreated > 0
          ? `Invoice raised for ${result.period.label}.`
          : `Already invoiced for ${result.period.label} — nothing to do.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not run billing.' }
  }
}
