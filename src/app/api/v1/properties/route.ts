import { asc, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, properties } from '@/db/schema'
import { authorize, handler, pagination, paginated } from '@/lib/api'
import { landlordScoped } from '@/lib/tenancy'
import { num } from '@/lib/money'

/** GET /api/v1/properties */
export const GET = handler(async (request: Request) => {
  const { scope } = await authorize('properties.view')
  const { page, pageSize, offset, limit } = pagination(request)
  const url = new URL(request.url)
  const query = url.searchParams.get('q')
  const landlordId = url.searchParams.get('landlordId')

  const where = landlordScoped(
    properties,
    scope,
    query ? or(ilike(properties.name, `%${query}%`), ilike(properties.code, `%${query}%`)) : undefined,
    landlordId ? eq(properties.landlordId, landlordId) : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: properties.id,
        code: properties.code,
        name: properties.name,
        type: properties.type,
        status: properties.status,
        county: properties.county,
        town: properties.town,
        area: properties.area,
        unitCount: properties.unitCount,
        expectedMonthlyRent: properties.expectedMonthlyRent,
        landlordId: properties.landlordId,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
        occupiedUnits: sql<number>`(select count(*)::int from units u where u.property_id = properties.id and u.status = 'OCCUPIED')`,
      })
      .from(properties)
      .innerJoin(landlords, eq(landlords.id, properties.landlordId))
      .where(where)
      .orderBy(asc(properties.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(properties).where(where),
  ])

  return paginated(
    rows.map((row) => ({ ...row, expectedMonthlyRent: num(row.expectedMonthlyRent) })),
    { page, pageSize, total },
  )
})
