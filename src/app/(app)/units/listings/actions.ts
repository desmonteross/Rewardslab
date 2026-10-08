'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents } from '@/lib/money'
import { delistUnit, listUnit } from '@/server/services/listings'
import type { ActionState } from '@/components/action-form'

function refresh() {
  revalidatePath('/units')
  revalidatePath('/units/listings')
}

export async function listUnitAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const scope = scopeFromSession(await requirePermission('units.update'))
    const rent = String(formData.get('askingRent') ?? '').trim()
    const from = String(formData.get('availableFrom') ?? '').trim()
    await listUnit(scope, String(formData.get('unitId') ?? ''), {
      headline: String(formData.get('headline') ?? ''),
      description: String(formData.get('description') ?? ''),
      askingRentCents: rent ? cents(rent) : null,
      availableFrom: from ? new Date(`${from}T00:00:00`) : null,
    })
    refresh()
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not list the unit.' }
  }
  redirect('/units/listings?view=listed')
}

export async function delistUnitAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const scope = scopeFromSession(await requirePermission('units.update'))
    const reason = String(formData.get('reason') ?? '').trim() || 'Taken off the market'
    const listing = await delistUnit(scope, String(formData.get('unitId') ?? ''), reason)
    refresh()
    return { ok: true, message: `${listing.headline} de-listed and withdrawn from Find a Home.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not de-list the unit.' }
  }
}
