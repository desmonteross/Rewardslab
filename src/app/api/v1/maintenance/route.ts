import { desc, eq, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { maintenanceTickets, properties, tenants, units } from '@/db/schema'
import { authorize, created, handler, pagination, paginated, parseBody } from '@/lib/api'
import { landlordScoped } from '@/lib/tenancy'
import { cents, num } from '@/lib/money'
import { createTicket, type MaintenanceCategoryName } from '@/server/services/maintenance'

/** GET /api/v1/maintenance */
export const GET = handler(async (request: Request) => {
  const { scope } = await authorize('maintenance.view')
  const { page, pageSize, offset, limit } = pagination(request)
  const url = new URL(request.url)

  const tenantId = url.searchParams.get('tenantId')
  const propertyId = url.searchParams.get('propertyId')
  const openOnly = url.searchParams.get('open') === 'true'

  const where = landlordScoped(
    properties,
    scope,
    tenantId ? eq(maintenanceTickets.tenantId, tenantId) : undefined,
    propertyId ? eq(maintenanceTickets.propertyId, propertyId) : undefined,
    openOnly ? ne(maintenanceTickets.status, 'CLOSED') : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: maintenanceTickets.id,
        number: maintenanceTickets.number,
        title: maintenanceTickets.title,
        description: maintenanceTickets.description,
        category: maintenanceTickets.category,
        priority: maintenanceTickets.priority,
        status: maintenanceTickets.status,
        estimatedCost: maintenanceTickets.estimatedCost,
        actualCost: maintenanceTickets.actualCost,
        reportedAt: maintenanceTickets.reportedAt,
        resolvedAt: maintenanceTickets.resolvedAt,
        propertyId: maintenanceTickets.propertyId,
        propertyName: properties.name,
        unitNumber: units.unitNumber,
        tenantId: maintenanceTickets.tenantId,
        tenantName: tenants.fullName,
      })
      .from(maintenanceTickets)
      .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
      .leftJoin(units, eq(units.id, maintenanceTickets.unitId))
      .leftJoin(tenants, eq(tenants.id, maintenanceTickets.tenantId))
      .where(where)
      .orderBy(desc(maintenanceTickets.reportedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`count(*)::int` })
      .from(maintenanceTickets)
      .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
      .where(where),
  ])

  return paginated(
    rows.map((row) => ({
      ...row,
      estimatedCost: num(row.estimatedCost),
      actualCost: num(row.actualCost),
      currency: 'KES',
    })),
    { page, pageSize, total },
  )
})

const createSchema = z.object({
  propertyId: z.string(),
  unitId: z.string().optional(),
  tenantId: z.string().optional(),
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
  title: z.string().min(3),
  description: z.string().min(3),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  estimatedCost: z.number().nonnegative().optional(),
})

/**
 * POST /api/v1/maintenance
 * The endpoint the Phase 2 tenant app uses to raise a request.
 */
export const POST = handler(async (request: Request) => {
  const { scope } = await authorize('maintenance.create')
  const body = await parseBody(request, createSchema)

  const ticket = await createTicket(scope, {
    propertyId: body.propertyId,
    unitId: body.unitId ?? null,
    tenantId: body.tenantId ?? null,
    category: body.category as MaintenanceCategoryName,
    title: body.title,
    description: body.description,
    priority: body.priority ?? 'MEDIUM',
    estimatedCostCents: body.estimatedCost ? cents(body.estimatedCost) : 0,
  })

  return created({
    id: ticket.id,
    number: ticket.number,
    status: ticket.status,
    priority: ticket.priority,
    reportedAt: ticket.reportedAt,
  })
})
