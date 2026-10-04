import { desc, eq, gt, sql } from 'drizzle-orm'
import { db } from '@/db'
import { properties, rentInvoices, tenants, units } from '@/db/schema'
import { authorize, handler, pagination, paginated } from '@/lib/api'
import { landlordScoped } from '@/lib/tenancy'
import { num } from '@/lib/money'

/**
 * GET /api/v1/invoices
 * The Phase 2 tenant app calls this with ?tenantId= to show "rent due".
 */
export const GET = handler(async (request: Request) => {
  const { scope } = await authorize('invoices.view')
  const { page, pageSize, offset, limit } = pagination(request)
  const url = new URL(request.url)

  const tenantId = url.searchParams.get('tenantId')
  const propertyId = url.searchParams.get('propertyId')
  const status = url.searchParams.get('status')
  const openOnly = url.searchParams.get('open') === 'true'

  const where = landlordScoped(
    rentInvoices,
    scope,
    tenantId ? eq(rentInvoices.tenantId, tenantId) : undefined,
    propertyId ? eq(rentInvoices.propertyId, propertyId) : undefined,
    status ? eq(rentInvoices.status, status as 'DUE') : undefined,
    openOnly ? gt(rentInvoices.balance, '0') : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: rentInvoices.id,
        number: rentInvoices.number,
        periodLabel: rentInvoices.periodLabel,
        periodYear: rentInvoices.periodYear,
        periodMonth: rentInvoices.periodMonth,
        issueDate: rentInvoices.issueDate,
        dueDate: rentInvoices.dueDate,
        subtotal: rentInvoices.subtotal,
        penaltyAmount: rentInvoices.penaltyAmount,
        total: rentInvoices.total,
        amountPaid: rentInvoices.amountPaid,
        balance: rentInvoices.balance,
        status: rentInvoices.status,
        tenantId: rentInvoices.tenantId,
        tenantName: tenants.fullName,
        propertyId: rentInvoices.propertyId,
        propertyName: properties.name,
        unitNumber: units.unitNumber,
      })
      .from(rentInvoices)
      .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
      .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
      .innerJoin(units, eq(units.id, rentInvoices.unitId))
      .where(where)
      .orderBy(desc(rentInvoices.dueDate))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(rentInvoices).where(where),
  ])

  return paginated(
    rows.map((row) => ({
      ...row,
      subtotal: num(row.subtotal),
      penaltyAmount: num(row.penaltyAmount),
      total: num(row.total),
      amountPaid: num(row.amountPaid),
      balance: num(row.balance),
      currency: 'KES',
    })),
    { page, pageSize, total },
  )
})
