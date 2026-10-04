// ===========================================================================
//  Maintenance (spec §21)
//
//  A ticket moves through a fixed set of states, each transition leaving an
//  update on the thread. Closing a ticket with an actual cost raises the
//  matching property expense, so maintenance spend reaches the landlord
//  statement without anyone re-keying it.
// ===========================================================================

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { maintenanceTickets, maintenanceUpdates, properties, units } from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { nextNumber } from './numbering'
import { recordExpense } from './expenses'

export type TicketStatusName =
  | 'REPORTED'
  | 'ACKNOWLEDGED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'RESOLVED'
  | 'CLOSED'

export type MaintenanceCategoryName =
  | 'PLUMBING'
  | 'ELECTRICAL'
  | 'WATER'
  | 'STRUCTURAL'
  | 'SECURITY'
  | 'APPLIANCE'
  | 'INTERNET'
  | 'CLEANING'
  | 'OTHER'

export const TICKET_FLOW: TicketStatusName[] = [
  'REPORTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING',
  'RESOLVED',
  'CLOSED',
]

export interface CreateTicketInput {
  propertyId: string
  unitId?: string | null
  tenantId?: string | null
  category: MaintenanceCategoryName
  title: string
  description: string
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
  estimatedCostCents?: number
  dueDate?: Date | null
  assignedToId?: string | null
  vendorId?: string | null
}

export async function createTicket(scope: Scope, input: CreateTicketInput) {
  return db.transaction(async (tx) => {
    const property = await tx
      .select({ id: properties.id, organizationId: properties.organizationId })
      .from(properties)
      .where(scoped(properties, scope, eq(properties.id, input.propertyId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(property, scope, 'property')

    if (input.unitId) {
      const unit = await tx
        .select({ id: units.id, organizationId: units.organizationId })
        .from(units)
        .where(scoped(units, scope, eq(units.id, input.unitId)))
        .limit(1)
        .then((rows) => rows[0])
      assertInScope(unit, scope, 'unit')
    }

    const number = await nextNumber(tx, scope.organizationId, 'ticket')

    const [ticket] = await tx
      .insert(maintenanceTickets)
      .values({
        organizationId: scope.organizationId,
        number,
        propertyId: input.propertyId,
        unitId: input.unitId ?? null,
        tenantId: input.tenantId ?? null,
        category: input.category,
        title: input.title,
        description: input.description,
        priority: input.priority,
        status: input.assignedToId || input.vendorId ? 'ASSIGNED' : 'REPORTED',
        reportedById: scope.userId,
        reportedByName: scope.userName,
        assignedToId: input.assignedToId ?? null,
        vendorId: input.vendorId ?? null,
        estimatedCost: amount(input.estimatedCostCents ?? 0),
        dueDate: input.dueDate ?? null,
      })
      .returning()

    await tx.insert(maintenanceUpdates).values({
      organizationId: scope.organizationId,
      ticketId: ticket.id,
      authorId: scope.userId,
      authorName: scope.userName,
      status: ticket.status,
      note: 'Ticket raised.',
    })

    await audit(tx, scope, {
      action: 'Maintenance Ticket Created',
      entityType: 'MaintenanceTicket',
      entityId: ticket.id,
      reference: ticket.number,
      newValue: { title: ticket.title, priority: ticket.priority, property: input.propertyId },
    })

    return ticket
  })
}

export interface UpdateTicketInput {
  status?: TicketStatusName
  note?: string
  assignedToId?: string | null
  vendorId?: string | null
  actualCostCents?: number
  resolutionNotes?: string
  /** Raise a property expense for the actual cost when closing. */
  raiseExpense?: boolean
}

export async function updateTicket(scope: Scope, ticketId: string, input: UpdateTicketInput) {
  const result = await db.transaction(async (tx) => {
    const ticket = await tx
      .select()
      .from(maintenanceTickets)
      .where(scoped(maintenanceTickets, scope, eq(maintenanceTickets.id, ticketId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(ticket, scope, 'ticket')

    const now = new Date()
    const nextStatus = input.status ?? (ticket.status as TicketStatusName)

    const [updated] = await tx
      .update(maintenanceTickets)
      .set({
        status: nextStatus,
        assignedToId: input.assignedToId === undefined ? ticket.assignedToId : input.assignedToId,
        vendorId: input.vendorId === undefined ? ticket.vendorId : input.vendorId,
        actualCost: input.actualCostCents !== undefined ? amount(input.actualCostCents) : ticket.actualCost,
        resolutionNotes: input.resolutionNotes ?? ticket.resolutionNotes,
        resolvedAt: nextStatus === 'RESOLVED' || nextStatus === 'CLOSED' ? (ticket.resolvedAt ?? now) : ticket.resolvedAt,
        closedAt: nextStatus === 'CLOSED' ? (ticket.closedAt ?? now) : ticket.closedAt,
        updatedAt: now,
      })
      .where(scoped(maintenanceTickets, scope, eq(maintenanceTickets.id, ticketId)))
      .returning()

    await tx.insert(maintenanceUpdates).values({
      organizationId: scope.organizationId,
      ticketId,
      authorId: scope.userId,
      authorName: scope.userName,
      status: nextStatus,
      note: input.note?.trim() || `Status changed to ${nextStatus.toLowerCase().replace(/_/g, ' ')}.`,
    })

    await audit(tx, scope, {
      action: 'Maintenance Ticket Updated',
      entityType: 'MaintenanceTicket',
      entityId: ticketId,
      reference: ticket.number,
      previousValue: { status: ticket.status, actualCost: ticket.actualCost },
      newValue: { status: nextStatus, actualCost: updated.actualCost },
    })

    return { ticket: updated, previousStatus: ticket.status as TicketStatusName }
  })

  // The expense is raised outside the ticket transaction so a failure there
  // cannot roll back the status change the user just made.
  let expenseReference: string | null = null
  const costCents = cents(result.ticket.actualCost)
  if (input.raiseExpense && costCents > 0 && result.ticket.status === 'CLOSED') {
    const expense = await recordExpense(scope, {
      propertyId: result.ticket.propertyId,
      unitId: result.ticket.unitId,
      category: 'MAINTENANCE',
      amountCents: costCents,
      expenseDate: new Date(),
      description: `${result.ticket.number} — ${result.ticket.title}`,
      vendorId: result.ticket.vendorId,
      ticketId: result.ticket.id,
      rechargeToLandlord: true,
    })
    expenseReference = expense.reference
  }

  return { ...result, expenseReference }
}
