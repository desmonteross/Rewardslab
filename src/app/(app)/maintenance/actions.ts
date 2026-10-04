'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { cents } from '@/lib/money'
import {
  createTicket,
  updateTicket,
  type MaintenanceCategoryName,
  type TicketStatusName,
} from '@/server/services/maintenance'
import type { ActionState } from '@/components/action-form'

export async function createTicketAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('maintenance.create')
    const scope = scopeFromSession(session)

    const propertyId = String(formData.get('propertyId') ?? '')
    const title = String(formData.get('title') ?? '').trim()
    const description = String(formData.get('description') ?? '').trim()
    if (!propertyId) return { ok: false, message: 'Choose the property.' }
    if (!title) return { ok: false, message: 'Give the ticket a short title.' }

    const ticket = await createTicket(scope, {
      propertyId,
      unitId: String(formData.get('unitId') ?? '') || null,
      category: String(formData.get('category') ?? 'OTHER') as MaintenanceCategoryName,
      title,
      description: description || title,
      priority: String(formData.get('priority') ?? 'MEDIUM') as 'MEDIUM',
      estimatedCostCents: cents(String(formData.get('estimatedCost') ?? '0')),
      vendorId: String(formData.get('vendorId') ?? '') || null,
      assignedToId: String(formData.get('assignedToId') ?? '') || null,
    })

    revalidatePath('/maintenance')
    return { ok: true, message: `${ticket.number} raised.` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not raise the ticket.' }
  }
}

export async function updateTicketAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('maintenance.update')
    const scope = scopeFromSession(session)
    const ticketId = String(formData.get('ticketId'))

    const status = String(formData.get('status') ?? '') as TicketStatusName | ''
    const actualCost = String(formData.get('actualCost') ?? '')

    const result = await updateTicket(scope, ticketId, {
      status: status || undefined,
      note: String(formData.get('note') ?? '') || undefined,
      assignedToId: formData.has('assignedToId') ? String(formData.get('assignedToId')) || null : undefined,
      vendorId: formData.has('vendorId') ? String(formData.get('vendorId')) || null : undefined,
      actualCostCents: actualCost ? cents(actualCost) : undefined,
      resolutionNotes: String(formData.get('resolutionNotes') ?? '') || undefined,
      raiseExpense: formData.get('raiseExpense') === 'on',
    })

    revalidatePath('/maintenance')
    revalidatePath(`/maintenance/${ticketId}`)
    if (result.expenseReference) revalidatePath('/expenses')

    return {
      ok: true,
      message: result.expenseReference
        ? `${result.ticket.number} updated and expense ${result.expenseReference} raised for approval.`
        : `${result.ticket.number} updated.`,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not update the ticket.' }
  }
}
