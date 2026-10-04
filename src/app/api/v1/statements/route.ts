import { asc, eq, ne } from 'drizzle-orm'
import { db } from '@/db'
import { invoiceItems, payments, rentInvoices, tenants } from '@/db/schema'
import { authorize, handler, ok, unprocessable } from '@/lib/api'
import { scoped } from '@/lib/tenancy'
import { cents } from '@/lib/money'

/**
 * GET /api/v1/statements?tenantId=
 * A tenant statement: every charge and payment with a running balance. This is
 * the same computation the Tenant Ledger report renders.
 */
export const GET = handler(async (request: Request) => {
  const { scope } = await authorize('receipts.view')
  const tenantId = new URL(request.url).searchParams.get('tenantId')
  if (!tenantId) throw unprocessable('tenantId is required.')

  const [tenant] = await db.select().from(tenants).where(scoped(tenants, scope, eq(tenants.id, tenantId))).limit(1)
  if (!tenant) throw unprocessable('That tenant is not in this organization.')

  const [items, paymentRows] = await Promise.all([
    db
      .select({
        date: rentInvoices.issueDate,
        reference: rentInvoices.number,
        description: invoiceItems.description,
        amount: invoiceItems.amount,
        type: invoiceItems.type,
      })
      .from(invoiceItems)
      .innerJoin(rentInvoices, eq(rentInvoices.id, invoiceItems.invoiceId))
      .where(scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId), ne(rentInvoices.status, 'CANCELLED')))
      .orderBy(asc(rentInvoices.issueDate)),
    db
      .select({
        date: payments.paidAt,
        reference: payments.reference,
        externalReference: payments.externalReference,
        amount: payments.grossAmount,
        method: payments.method,
      })
      .from(payments)
      .where(scoped(payments, scope, eq(payments.tenantId, tenantId), eq(payments.status, 'CONFIRMED')))
      .orderBy(asc(payments.paidAt)),
  ])

  const entries = [
    ...items.map((row) => ({
      date: row.date,
      reference: row.reference,
      description: row.description,
      type: row.type,
      charge: cents(row.amount) / 100,
      payment: 0,
    })),
    ...paymentRows.map((row) => ({
      date: row.date,
      reference: row.reference,
      description: `Payment received — ${row.method}${row.externalReference ? ` (${row.externalReference})` : ''}`,
      type: 'PAYMENT',
      charge: 0,
      payment: cents(row.amount) / 100,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime() || b.charge - a.charge)

  let running = 0
  const statement = entries.map((entry) => {
    running += entry.charge - entry.payment
    return { ...entry, balance: Math.round(running * 100) / 100 }
  })

  return ok({
    tenant: { id: tenant.id, code: tenant.code, fullName: tenant.fullName },
    entries: statement,
    totals: {
      charged: statement.reduce((sum, entry) => sum + entry.charge, 0),
      paid: statement.reduce((sum, entry) => sum + entry.payment, 0),
      balance: Math.round(running * 100) / 100,
    },
    currency: 'KES',
  })
})
