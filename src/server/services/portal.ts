// ===========================================================================
//  Tenant portal writes
//
//  There is exactly one thing a tenant can change in the system: they can
//  report a maintenance issue. It goes through the same `createTicket` the
//  staff side uses, so it lands on the same Kanban board, gets the same
//  document number and leaves the same audit trail.
//
//  The tenant never supplies the property or unit — those are read from their
//  own active lease, so a crafted form cannot raise a ticket against someone
//  else's building.
// ===========================================================================

import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases } from '@/db/schema'
import { audit } from '@/lib/audit'
import { requireTenantId, tenantScoped, type Scope } from '@/lib/tenancy'
import { createTicket, type MaintenanceCategoryName } from './maintenance'

export const PORTAL_CATEGORIES: { value: MaintenanceCategoryName; label: string }[] = [
  { value: 'PLUMBING', label: 'Plumbing — taps, drains, toilets' },
  { value: 'WATER', label: 'Water supply' },
  { value: 'ELECTRICAL', label: 'Electrical — sockets, lighting, wiring' },
  { value: 'APPLIANCE', label: 'Appliance' },
  { value: 'STRUCTURAL', label: 'Structural — walls, floors, roof, windows' },
  { value: 'SECURITY', label: 'Security — locks, gates, alarms' },
  { value: 'INTERNET', label: 'Internet or TV' },
  { value: 'CLEANING', label: 'Cleaning or refuse' },
  { value: 'OTHER', label: 'Something else' },
]

/** What the tenant chooses, in their words. */
export const PORTAL_URGENCY: { value: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'; label: string; hint: string }[] = [
  { value: 'LOW', label: 'Whenever convenient', hint: 'Not affecting daily use.' },
  { value: 'MEDIUM', label: 'Soon', hint: 'Inconvenient but manageable.' },
  { value: 'HIGH', label: 'Urgent', hint: 'Making the home difficult to live in.' },
  { value: 'URGENT', label: 'Emergency', hint: 'Unsafe, flooding, or no water or power at all.' },
]

export interface ReportIssueInput {
  category: MaintenanceCategoryName
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
}

export interface ReportIssueResult {
  ok: boolean
  error?: string
  ticketNumber?: string
  ticketId?: string
}

export async function reportIssue(scope: Scope, input: ReportIssueInput): Promise<ReportIssueResult> {
  const tenantId = requireTenantId(scope)

  const title = input.title.trim()
  const description = input.description.trim()
  if (title.length < 4) return { ok: false, error: 'Give the issue a short title so it can be recognised.' }
  if (description.length < 10) {
    return { ok: false, error: 'Please describe the problem in a little more detail.' }
  }
  if (title.length > 120) return { ok: false, error: 'Keep the title under 120 characters.' }
  if (description.length > 4000) return { ok: false, error: 'Please keep the description under 4000 characters.' }

  // The tenancy decides the property and unit, not the form.
  const [lease] = await db
    .select({ propertyId: leases.propertyId, unitId: leases.unitId, status: leases.status })
    .from(leases)
    .where(tenantScoped(leases, scope, eq(leases.tenantId, tenantId)))
    .orderBy(sql`case when ${leases.status} = 'ACTIVE' then 0 else 1 end`, desc(leases.startDate))
    .limit(1)

  if (!lease) {
    return { ok: false, error: 'We could not find an active tenancy for your account. Contact your manager.' }
  }
  if (lease.status !== 'ACTIVE') {
    return { ok: false, error: 'Your tenancy is no longer active, so new issues cannot be raised here.' }
  }

  const ticket = await createTicket(scope, {
    propertyId: lease.propertyId,
    unitId: lease.unitId,
    tenantId,
    category: input.category,
    title,
    description,
    priority: input.priority,
  })

  // A second, portal-specific audit line: the staff-side "Ticket Created"
  // entry does not say the tenant raised it themselves.
  await audit(db, scope, {
    action: 'Tenant Issue Reported',
    entityType: 'MaintenanceTicket',
    entityId: ticket.id,
    reference: ticket.number,
    newValue: { category: input.category, priority: input.priority, via: 'tenant portal' },
  })

  return { ok: true, ticketNumber: ticket.number, ticketId: ticket.id }
}
