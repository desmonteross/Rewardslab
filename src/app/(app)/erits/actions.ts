'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { formatKES } from '@/lib/money'
import {
  buildAllPeriods,
  buildPeriodForLandlord,
  refreshComplianceExceptions,
  resolveException,
  submitPeriod,
  syncPropertyMapping,
} from '@/server/services/compliance'
import type { ActionState } from '@/components/action-form'

export async function mapPropertyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('compliance.manage')
    const scope = scopeFromSession(session)
    const propertyId = String(formData.get('propertyId') ?? '')
    if (!propertyId) return { ok: false, message: 'Choose a property to map.' }

    const result = await syncPropertyMapping(scope, propertyId)

    revalidatePath('/erits')
    revalidatePath(`/properties/${propertyId}`)

    return {
      ok: result.success,
      message: result.success
        ? `Mapped. eRITS property reference ${result.propertyRef}. (Simulated — nothing was sent to KRA.)`
        : result.message,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Mapping failed.' }
  }
}

export async function buildPeriodsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('compliance.manage')
    const scope = scopeFromSession(session)
    const now = new Date()
    const year = Number(formData.get('year') ?? now.getFullYear())
    const month = Number(formData.get('month') ?? now.getMonth() + 1)
    const landlordId = String(formData.get('landlordId') ?? '')

    if (landlordId) {
      const result = await buildPeriodForLandlord(scope, landlordId, year, month)
      revalidatePath('/erits')
      return {
        ok: true,
        message: `${result.label}: ${formatKES(result.grossRentalIncomeCents / 100)} of rental income across ${result.propertyCount} properties. Status ${result.status.replace(/_/g, ' ').toLowerCase()}.`,
      }
    }

    const results = await buildAllPeriods(scope, year, month)
    const ready = results.filter((row) => row.status === 'READY_FOR_REVIEW').length
    const gross = results.reduce((sum, row) => sum + row.grossRentalIncomeCents, 0)

    revalidatePath('/erits')
    return {
      ok: true,
      message: `${results.length} landlord periods aggregated — ${formatKES(gross / 100)} of rental income, ${ready} ready for review.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not aggregate the period.' }
  }
}

export async function submitPeriodAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('compliance.submit')
    const scope = scopeFromSession(session)
    const periodId = String(formData.get('periodId'))

    const { submission, result } = await submitPeriod(scope, periodId)

    revalidatePath('/erits')
    revalidatePath(`/erits/${periodId}`)

    return {
      ok: result.success,
      message: result.success
        ? `SIMULATED eRITS SUBMISSION recorded as ${submission.reference}. Acknowledgement ${result.acknowledgementRef}. Nothing was transmitted to KRA.`
        : result.message,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Submission failed.' }
  }
}

export async function refreshExceptionsAction(_previous: ActionState): Promise<ActionState> {
  try {
    const session = await requirePermission('compliance.manage')
    const scope = scopeFromSession(session)
    const count = await refreshComplianceExceptions(scope)
    revalidatePath('/erits')
    return {
      ok: true,
      message: count > 0 ? `${count} compliance issues detected.` : 'No compliance issues found.',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not run the checks.' }
  }
}

export async function resolveExceptionAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('compliance.manage')
    const scope = scopeFromSession(session)
    const exceptionId = String(formData.get('exceptionId'))
    const note = String(formData.get('note') ?? '') || undefined

    await resolveException(scope, exceptionId, note)
    revalidatePath('/erits')
    return { ok: true, message: 'Marked as resolved.' }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not resolve the issue.' }
  }
}
