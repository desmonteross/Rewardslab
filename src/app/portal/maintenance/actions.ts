'use server'

import { revalidatePath } from 'next/cache'
import { requireSession } from '@/lib/session'
import { can } from '@/lib/rbac'
import { scopeFromSession } from '@/lib/tenancy'
import { reportIssue } from '@/server/services/portal'
import type { MaintenanceCategoryName } from '@/server/services/maintenance'
import type { ActionState } from '@/components/action-form'

const CATEGORIES: MaintenanceCategoryName[] = [
  'PLUMBING',
  'ELECTRICAL',
  'WATER',
  'STRUCTURAL',
  'SECURITY',
  'APPLIANCE',
  'INTERNET',
  'CLEANING',
  'OTHER',
]

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const

export async function reportIssueAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession()
  if (session.role !== 'TENANT' || !can(session, 'portal.issues.report')) {
    return { ok: false, message: 'You are not allowed to report issues here.' }
  }

  const category = String(formData.get('category') ?? 'OTHER') as MaintenanceCategoryName
  const priority = String(formData.get('priority') ?? 'MEDIUM') as (typeof PRIORITIES)[number]

  // Never trust the select: an unknown value falls back rather than reaching the database.
  const safeCategory = CATEGORIES.includes(category) ? category : 'OTHER'
  const safePriority = PRIORITIES.includes(priority) ? priority : 'MEDIUM'

  const result = await reportIssue(scopeFromSession(session), {
    category: safeCategory,
    priority: safePriority,
    title: String(formData.get('title') ?? ''),
    description: String(formData.get('description') ?? ''),
  })

  if (!result.ok) return { ok: false, message: result.error ?? 'That could not be reported.' }

  revalidatePath('/portal/maintenance')
  revalidatePath('/portal')

  return {
    ok: true,
    message: `Reported as ${result.ticketNumber}. Your property manager can see it now.`,
  }
}
