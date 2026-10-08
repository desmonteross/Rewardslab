'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents } from '@/lib/money'
import { completeMoveIn } from '@/server/services/leases'
import { parseUnitSheet } from '@/server/units-import'
import {
  addUnits,
  createLandlord,
  createLease,
  createProperty,
  createTenant,
  createUnits,
  type LandlordInput,
  type PropertyInput,
  type UnitInput,
} from '@/server/services/onboarding'
import type { ActionState } from '@/components/action-form'

// redirect() works by throwing, so each action does its work inside the try
// and only navigates once the record exists.

const text = (formData: FormData, key: string) => String(formData.get(key) ?? '').trim()
const optional = (formData: FormData, key: string) => text(formData, key) || null
const failure = (error: unknown, fallback: string): ActionState => ({
  ok: false,
  message: error instanceof Error ? error.message : fallback,
})

export async function createLandlordAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const scope = scopeFromSession(await requirePermission('landlords.create'))
    const fullName = text(formData, 'fullName')
    const phone = text(formData, 'phone')
    if (!fullName) return { ok: false, message: 'Give the landlord’s name.' }
    if (!phone) return { ok: false, message: 'Give a phone number.' }

    const created = await createLandlord(scope, {
      type: text(formData, 'type') as LandlordInput['type'],
      fullName,
      companyName: optional(formData, 'companyName'),
      phone,
      email: optional(formData, 'email'),
      kraPin: optional(formData, 'kraPin'),
      nationalId: optional(formData, 'nationalId'),
      payoutMethod: text(formData, 'payoutMethod') as LandlordInput['payoutMethod'],
      mpesaNumber: optional(formData, 'mpesaNumber'),
      bankName: optional(formData, 'bankName'),
      bankAccountName: optional(formData, 'bankAccountName'),
      bankAccountNumber: optional(formData, 'bankAccountNumber'),
    })
    id = created.id
    revalidatePath('/landlords')
  } catch (error) {
    return failure(error, 'Could not add the landlord.')
  }
  redirect(`/landlords/${id}`)
}

export async function createPropertyAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const scope = scopeFromSession(await requirePermission('properties.create'))
    const input = {
      landlordId: text(formData, 'landlordId'),
      name: text(formData, 'name'),
      type: text(formData, 'type') as PropertyInput['type'],
      county: text(formData, 'county'),
      town: text(formData, 'town'),
      area: optional(formData, 'area'),
      address: optional(formData, 'address'),
      managerId: optional(formData, 'managerId'),
      kraPin: optional(formData, 'kraPin'),
    }
    if (!input.landlordId) return { ok: false, message: 'Choose the landlord who owns it.' }
    if (!input.name) return { ok: false, message: 'Give the property a name.' }
    if (!input.county || !input.town) return { ok: false, message: 'Give the county and town.' }

    const created = await createProperty(scope, input)
    id = created.id
    revalidatePath('/properties')
  } catch (error) {
    return failure(error, 'Could not add the property.')
  }
  // Straight on to the units, which is the next thing a new property needs.
  redirect(`/properties/${id}?tab=units&added=1`)
}

export async function createUnitAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const scope = scopeFromSession(await requirePermission('units.create'))
    const propertyId = text(formData, 'propertyId')
    const unitNumber = text(formData, 'unitNumber')
    if (!unitNumber) return { ok: false, message: 'Give the unit number.' }
    const rentCents = cents(text(formData, 'monthlyRent') || '0')
    if (rentCents <= 0) return { ok: false, message: 'Give the monthly rent.' }

    const count = Number(text(formData, 'count') || 1)
    const created = await createUnits(
      scope,
      {
        propertyId,
        unitNumber,
        type: text(formData, 'type') as UnitInput['type'],
        floor: Number(text(formData, 'floor') || 0),
        bedrooms: Number(text(formData, 'bedrooms') || 1),
        bathrooms: Number(text(formData, 'bathrooms') || 1),
        monthlyRentCents: rentCents,
        depositCents: cents(text(formData, 'deposit') || '0'),
        serviceChargeCents: cents(text(formData, 'serviceCharge') || '0'),
      },
      count,
    )
    revalidatePath(`/properties/${propertyId}`)
    revalidatePath('/units')
    const first = created[0].unitNumber
    const last = created[created.length - 1].unitNumber
    return {
      ok: true,
      message:
        created.length === 1
          ? `Unit ${first} added. Add the next one, or sign a lease on it below.`
          : `${created.length} units added, ${first} to ${last}.`,
    }
  } catch (error) {
    return failure(error, 'Could not add the unit.')
  }
}

export async function createTenantAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const scope = scopeFromSession(await requirePermission('tenants.create'))
    const fullName = text(formData, 'fullName')
    const phone = text(formData, 'phone')
    if (!fullName) return { ok: false, message: 'Give the tenant’s name.' }
    if (!phone) return { ok: false, message: 'Give a phone number. It is how M-Pesa payments are matched.' }

    const created = await createTenant(scope, {
      fullName,
      phone,
      email: optional(formData, 'email'),
      nationalId: optional(formData, 'nationalId'),
      kraPin: optional(formData, 'kraPin'),
      emergencyName: optional(formData, 'emergencyName'),
      emergencyPhone: optional(formData, 'emergencyPhone'),
    })
    id = created.id
    revalidatePath('/tenants')
  } catch (error) {
    return failure(error, 'Could not add the tenant.')
  }
  redirect(`/leases/new?tenant=${id}`)
}

export async function createLeaseAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  let id: string
  try {
    const scope = scopeFromSession(await requirePermission('leases.create'))
    const tenantId = text(formData, 'tenantId')
    const unitId = text(formData, 'unitId')
    const start = text(formData, 'startDate')
    if (!tenantId) return { ok: false, message: 'Choose the tenant.' }
    if (!unitId) return { ok: false, message: 'Choose a vacant unit.' }
    if (!start) return { ok: false, message: 'Give the start date.' }
    // Blank money fields fall back to the unit's own rent, deposit and charge.
    const money = (key: string) => (text(formData, key) ? cents(text(formData, key)) : null)

    const created = await createLease(scope, {
      tenantId,
      unitId,
      startDate: new Date(`${start}T00:00:00`),
      months: Number(text(formData, 'months') || 12),
      monthlyRentCents: money('monthlyRent'),
      depositCents: money('deposit'),
      serviceChargeCents: money('serviceCharge'),
      dueDayOfMonth: Number(text(formData, 'dueDay') || 5),
    })
    id = created.id
    revalidatePath('/leases')
    revalidatePath('/move-ins')
  } catch (error) {
    return failure(error, 'Could not create the lease.')
  }
  redirect(`/leases/${id}`)
}

export async function completeMoveInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const scope = scopeFromSession(await requirePermission('moves.manage'))
    await completeMoveIn(scope, text(formData, 'moveEventId'), optional(formData, 'notes') ?? undefined)
    revalidatePath('/move-ins')
    revalidatePath('/units')
    return { ok: true, message: 'Move-in completed. The unit is now occupied.' }
  } catch (error) {
    return failure(error, 'Could not complete the move-in.')
  }
}

/**
 * Bulk upload: every row is checked before anything is saved, so a file with
 * one bad row adds nothing and says exactly which rows to fix.
 */
export async function importUnitsAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const scope = scopeFromSession(await requirePermission('units.create'))
    const propertyId = text(formData, 'propertyId')
    const file = formData.get('file')
    if (!(file instanceof File) || file.size === 0) return { ok: false, message: 'Choose a CSV file to upload.' }
    if (file.size > 1_000_000) return { ok: false, message: 'That file is over 1 MB. Upload at most 500 units at a time.' }
    if (/\.(xlsx?|ods|numbers)$/i.test(file.name)) {
      return { ok: false, message: 'Save the sheet as CSV first (File → Save As → CSV), then upload that file.' }
    }

    const { rows, errors } = parseUnitSheet(await file.text())
    if (errors.length > 0) {
      const shown = errors.slice(0, 8).map((error) => `Row ${error.line}: ${error.message}`)
      const more = errors.length > shown.length ? `\n…and ${errors.length - shown.length} more.` : ''
      return {
        ok: false,
        message: `Nothing was added. Fix ${errors.length === 1 ? 'this row' : `these ${errors.length} rows`} and upload again:\n${shown.join('\n')}${more}`,
      }
    }

    const created = await addUnits(scope, propertyId, rows)
    revalidatePath(`/properties/${propertyId}`)
    revalidatePath('/units')
    return { ok: true, message: `${created.length} unit${created.length === 1 ? '' : 's'} added from ${file.name}.` }
  } catch (error) {
    return failure(error, 'Could not import the units.')
  }
}
