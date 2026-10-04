'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents, formatKES } from '@/lib/money'
import { markOverdueInvoices, runBilling, type SharedCharge } from '@/server/services/billing'
import type { ActionState } from '@/components/action-form'

export async function runBillingAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('billing.run')
    const scope = scopeFromSession(session)
    const now = new Date()
    const year = Number(formData.get('year') ?? now.getFullYear())
    const month = Number(formData.get('month') ?? now.getMonth() + 1)
    const propertyId = String(formData.get('propertyId') ?? '') || undefined

    const result = await runBilling(scope, { year, month, propertyId })

    revalidatePath('/rent')
    revalidatePath('/invoices')
    revalidatePath('/dashboard')

    return {
      ok: true,
      message:
        result.invoicesCreated > 0
          ? `${result.invoicesCreated} invoices raised for ${result.period.label}, totalling ${formatKES(result.totalBilledCents / 100)}. ${result.invoicesSkipped} leases were already billed.`
          : `Every active lease was already billed for ${result.period.label}.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Billing run failed.' }
  }
}

export async function markOverdueAction(_previous: ActionState): Promise<ActionState> {
  try {
    const session = await requirePermission('invoices.create')
    const scope = scopeFromSession(session)
    const count = await markOverdueInvoices(scope)
    revalidatePath('/rent')
    revalidatePath('/invoices')
    return { ok: true, message: count > 0 ? `${count} invoices moved to overdue.` : 'No invoices are past their due date.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update invoice statuses.' }
  }
}

/**
 * Raise rent plus one-off charges for a property, or a single unit.
 *
 * Each charge line carries a TOTAL for the run, which divides equally across
 * the tenants actually billed — a borehole repair is one cost shared between
 * them, not a cost each. The division is exact: the parts always sum back to
 * the total, with the odd cent going to the earliest shares.
 */
export async function raiseChargesAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('billing.run')
    const scope = scopeFromSession(session)
    const now = new Date()

    // The period select carries "2026-10"; the two hidden fields are a
    // fallback for a form that does not offer a choice.
    const periodKey = String(formData.get('periodKey') ?? '')
    const [keyYear, keyMonth] = periodKey.split('-').map(Number)
    const year = Number.isFinite(keyYear) && keyYear > 0 ? keyYear : Number(formData.get('year') ?? now.getFullYear())
    const month =
      Number.isFinite(keyMonth) && keyMonth > 0 ? keyMonth : Number(formData.get('month') ?? now.getMonth() + 1)

    const propertyId = String(formData.get('propertyId') ?? '') || undefined
    const unitId = String(formData.get('unitId') ?? '') || undefined

    if (!propertyId && !unitId) {
      return { ok: false, message: 'Choose a property, or a single unit within one.' }
    }

    const types = formData.getAll('chargeType').map(String)
    const descriptions = formData.getAll('chargeDescription').map(String)
    const totals = formData.getAll('chargeTotal').map(String)

    const sharedCharges: SharedCharge[] = []
    for (let index = 0; index < types.length; index += 1) {
      const description = (descriptions[index] ?? '').trim()
      const totalCents = cents(totals[index] ?? '')
      if (!description && totalCents === 0) continue
      if (!description) return { ok: false, message: 'Every charge line needs a description.' }
      if (totalCents <= 0) return { ok: false, message: `"${description}" needs an amount greater than zero.` }
      sharedCharges.push({
        type: (types[index] || 'OTHER') as SharedCharge['type'],
        description,
        totalCents,
      })
    }

    const result = await runBilling(scope, { year, month, propertyId, unitId, sharedCharges })

    revalidatePath('/rent')
    revalidatePath('/invoices')
    revalidatePath('/dashboard')

    if (result.invoicesCreated === 0) {
      return {
        ok: false,
        message: `Nothing was raised — every lease in that selection was already billed for ${result.period.label}.`,
      }
    }

    const extra = sharedCharges.length
      ? ` ${sharedCharges.length} charge line${sharedCharges.length === 1 ? '' : 's'} were split across them.`
      : ''
    return {
      ok: true,
      message:
        `${result.invoicesCreated} invoice${result.invoicesCreated === 1 ? '' : 's'} raised for ` +
        `${result.period.label}, totalling ${formatKES(result.totalBilledCents / 100)}.${extra}`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'The charges could not be raised.' }
  }
}
