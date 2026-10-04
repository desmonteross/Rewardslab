import { desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { properties, receipts, tenants, units } from '@/db/schema'
import { authorize, handler, pagination, paginated } from '@/lib/api'
import { landlordScoped } from '@/lib/tenancy'
import { num } from '@/lib/money'

/** GET /api/v1/receipts — the tenant app's payment history. */
export const GET = handler(async (request: Request) => {
  const { scope } = await authorize('receipts.view')
  const { page, pageSize, offset, limit } = pagination(request)
  const tenantId = new URL(request.url).searchParams.get('tenantId')

  const where = landlordScoped(receipts, scope, tenantId ? eq(receipts.tenantId, tenantId) : undefined)

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: receipts.id,
        number: receipts.number,
        periodLabel: receipts.periodLabel,
        amount: receipts.amount,
        method: receipts.method,
        mpesaReference: receipts.mpesaReference,
        paidAt: receipts.paidAt,
        balanceAfter: receipts.balanceAfter,
        tenantId: receipts.tenantId,
        tenantName: tenants.fullName,
        propertyName: properties.name,
        unitNumber: units.unitNumber,
      })
      .from(receipts)
      .innerJoin(tenants, eq(tenants.id, receipts.tenantId))
      .innerJoin(properties, eq(properties.id, receipts.propertyId))
      .innerJoin(units, eq(units.id, receipts.unitId))
      .where(where)
      .orderBy(desc(receipts.paidAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(receipts).where(where),
  ])

  return paginated(
    rows.map((row) => ({
      ...row,
      amount: num(row.amount),
      balanceAfter: num(row.balanceAfter),
      currency: 'KES',
    })),
    { page, pageSize, total },
  )
})
