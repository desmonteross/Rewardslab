import { z } from 'zod'
import { authenticate, forbidden, handler, ok, parseBody, unprocessable } from '@/lib/api'
import { can } from '@/lib/rbac'
import { portalTickets } from '@/server/queries/portal'
import { reportIssue } from '@/server/services/portal'

const ReportIssue = z.object({
  category: z.enum([
    'PLUMBING',
    'ELECTRICAL',
    'WATER',
    'STRUCTURAL',
    'SECURITY',
    'APPLIANCE',
    'INTERNET',
    'CLEANING',
    'OTHER',
  ]),
  title: z.string().min(4).max(120),
  description: z.string().min(10).max(4000),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
})

/** GET /api/v1/me/issues — the signed-in tenant's own maintenance tickets. */
export const GET = handler(async () => {
  const { session, scope } = await authenticate()
  if (session.role !== 'TENANT') throw forbidden('This endpoint is for tenant sessions.')

  const tickets = await portalTickets(scope)
  return ok(
    tickets.map((ticket) => ({
      id: ticket.id,
      number: ticket.number,
      title: ticket.title,
      description: ticket.description,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      reportedAt: ticket.reportedAt,
      resolvedAt: ticket.resolvedAt,
      closedAt: ticket.closedAt,
      property: ticket.propertyName,
      unit: ticket.unitNumber,
    })),
  )
})

/**
 * POST /api/v1/me/issues — report a maintenance issue.
 *
 * The property and unit are taken from the tenant's own lease, never from the
 * request, so this endpoint cannot raise a ticket against another building.
 */
export const POST = handler(async (request: Request) => {
  const { session, scope } = await authenticate()
  if (session.role !== 'TENANT' || !can(session, 'portal.issues.report')) {
    throw forbidden('This endpoint is for tenant sessions.')
  }

  const input = await parseBody(request, ReportIssue)
  const result = await reportIssue(scope, { ...input, priority: input.priority ?? 'MEDIUM' })
  if (!result.ok) throw unprocessable(result.error ?? 'That could not be reported.')

  return ok({ id: result.ticketId, number: result.ticketNumber }, { status: 201 })
})
