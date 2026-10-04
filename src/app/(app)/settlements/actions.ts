'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { approveSettlement, createSettlementBatch, processSettlement } from '@/server/services/settlements'
import type { ActionState } from '@/components/action-form'

export async function createSettlementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('settlements.create')
    const scope = scopeFromSession(session)

    const landlordId = String(formData.get('landlordId') ?? '')
    if (!landlordId) return { ok: false, message: 'Choose a landlord to settle.' }

    const periodStart = new Date(String(formData.get('periodStart')))
    const periodEnd = new Date(String(formData.get('periodEnd')))
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
      return { ok: false, message: 'Choose a valid settlement period.' }
    }
    if (periodEnd < periodStart) return { ok: false, message: 'The period end must fall after the start.' }

    // Include the whole of the closing day.
    periodEnd.setHours(23, 59, 59, 999)

    const adjustment = String(formData.get('adjustment') ?? '0')

    const { settlement, totals } = await createSettlementBatch(scope, {
      landlordId,
      periodStart,
      periodEnd,
      includeExpenses: formData.get('includeExpenses') === 'on',
      adjustmentCents: cents(adjustment),
      adjustmentNote: String(formData.get('adjustmentNote') ?? '') || undefined,
    })

    revalidatePath('/settlements')
    revalidatePath('/payments')

    return {
      ok: true,
      message: `${settlement.reference} created. Gross ${formatKES(totals.grossCents / 100)}, commission ${formatKES(
        totals.commissionCents / 100,
      )}, expenses ${formatKES(totals.expenseCents / 100)} → net ${formatKES(totals.netCents / 100)}.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not create the settlement.' }
  }
}

export async function approveSettlementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('settlements.approve')
    const scope = scopeFromSession(session)
    const settlementId = String(formData.get('settlementId'))

    const settlement = await approveSettlement(scope, settlementId)
    revalidatePath('/settlements')
    revalidatePath(`/settlements/${settlementId}`)
    return { ok: true, message: `${settlement.reference} approved and scheduled for payout.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not approve the settlement.' }
  }
}

export async function processSettlementAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('settlements.process')
    const scope = scopeFromSession(session)
    const settlementId = String(formData.get('settlementId'))

    const { settlement, alreadySettled } = await processSettlement(scope, settlementId)
    revalidatePath('/settlements')
    revalidatePath(`/settlements/${settlementId}`)
    revalidatePath('/accounting')

    if (alreadySettled) return { ok: true, message: `${settlement.reference} was already settled.` }
    if (settlement.status === 'FAILED') {
      return { ok: false, message: `Payout failed: ${settlement.failureReason ?? 'the provider rejected it.'}` }
    }
    return {
      ok: true,
      message: `${settlement.reference} paid out — ${formatKES(settlement.netAmount)} via ${settlement.method}. Provider reference ${settlement.externalReference}.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not process the settlement.' }
  }
}
