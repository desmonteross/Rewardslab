import { desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/db'
import { payments, properties, tenants, units } from '@/db/schema'
import { authorize, created, handler, pagination, paginated, parseBody, unprocessable } from '@/lib/api'
import { landlordScoped } from '@/lib/tenancy'
import { cents, num } from '@/lib/money'
import { recordPayment, type PaymentMethodName } from '@/server/services/payments'

/** GET /api/v1/payments */
export const GET = handler(async (request: Request) => {
  const { scope } = await authorize('payments.view')
  const { page, pageSize, offset, limit } = pagination(request)
  const url = new URL(request.url)

  const tenantId = url.searchParams.get('tenantId')
  const status = url.searchParams.get('status')

  const where = landlordScoped(
    payments,
    scope,
    tenantId ? eq(payments.tenantId, tenantId) : undefined,
    status ? eq(payments.status, status as 'CONFIRMED') : undefined,
  )

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: payments.id,
        reference: payments.reference,
        externalReference: payments.externalReference,
        method: payments.method,
        status: payments.status,
        reconciliationStatus: payments.reconciliationStatus,
        settlementStatus: payments.settlementStatus,
        grossAmount: payments.grossAmount,
        commissionAmount: payments.commissionAmount,
        netAmount: payments.netAmount,
        allocatedAmount: payments.allocatedAmount,
        unallocatedAmount: payments.unallocatedAmount,
        paidAt: payments.paidAt,
        accountReference: payments.accountReference,
        tenantId: payments.tenantId,
        tenantName: tenants.fullName,
        propertyName: properties.name,
        unitNumber: units.unitNumber,
      })
      .from(payments)
      .leftJoin(tenants, eq(tenants.id, payments.tenantId))
      .leftJoin(properties, eq(properties.id, payments.propertyId))
      .leftJoin(units, eq(units.id, payments.unitId))
      .where(where)
      .orderBy(desc(payments.paidAt))
      .limit(limit)
      .offset(offset),
    db.select({ total: sql<number>`count(*)::int` }).from(payments).where(where),
  ])

  return paginated(
    rows.map((row) => ({
      ...row,
      grossAmount: num(row.grossAmount),
      commissionAmount: num(row.commissionAmount),
      netAmount: num(row.netAmount),
      allocatedAmount: num(row.allocatedAmount),
      unallocatedAmount: num(row.unallocatedAmount),
      currency: 'KES',
    })),
    { page, pageSize, total },
  )
})

const createSchema = z.object({
  amount: z.number().positive(),
  method: z.enum(['MPESA', 'BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD']).default('MPESA'),
  tenantId: z.string().optional(),
  accountReference: z.string().optional(),
  externalReference: z.string().optional(),
  payerName: z.string().optional(),
  payerPhone: z.string().optional(),
  paidAt: z.string().datetime().optional(),
  narrative: z.string().optional(),
})

/** POST /api/v1/payments — record a receipt and run the full pipeline. */
export const POST = handler(async (request: Request) => {
  const { scope } = await authorize('payments.record')
  const body = await parseBody(request, createSchema)

  if (!body.tenantId && !body.accountReference) {
    throw unprocessable('Supply either tenantId or accountReference so the payment can be matched.')
  }

  const result = await recordPayment(scope, {
    method: body.method as PaymentMethodName,
    grossCents: cents(body.amount),
    paidAt: body.paidAt ? new Date(body.paidAt) : new Date(),
    tenantId: body.tenantId ?? null,
    accountReference: body.accountReference ?? null,
    externalReference: body.externalReference ?? null,
    payerName: body.payerName ?? null,
    payerPhone: body.payerPhone ?? null,
    narrative: body.narrative ?? null,
  })

  return created({
    paymentId: result.paymentId,
    reference: result.reference,
    matched: result.matched,
    matchStrategy: result.match.strategy,
    allocated: result.allocatedCents / 100,
    unallocated: result.unallocatedCents / 100,
    commission: result.commissionCents / 100,
    net: result.netCents / 100,
    receiptNumber: result.receiptNumber,
    invoicesUpdated: result.invoicesUpdated,
    currency: 'KES',
  })
})
