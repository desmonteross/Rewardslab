import { and, asc, desc, eq, gt, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, maintenanceTickets, payments, properties, receipts, rentInvoices, tenants, units } from '@/db/schema'
import { authenticate, forbidden, handler, ok, unprocessable } from '@/lib/api'
import { can } from '@/lib/rbac'
import { landlordHasTenant } from '@/server/landlord-access'
import { scoped } from '@/lib/tenancy'
import { cents, num } from '@/lib/money'

/**
 * GET /api/v1/me/summary
 *
 * The shape the tenant mobile app opens on: what is due, what is owed, the
 * latest receipt and any open maintenance.
 *
 * A tenant session carries its own tenant id, and that always wins. Staff may
 * pass ?tenantId= to read one of their own tenants — useful for support, and
 * still confined to their organization by `scoped()`.
 */
export const GET = handler(async (request: Request) => {
  const { scope } = await authenticate()
  const requested = new URL(request.url).searchParams.get('tenantId')
  const tenantId = scope.tenantId ?? requested
  if (!tenantId) {
    throw unprocessable('Supply tenantId, or sign in as a tenant.')
  }
  // A tenant may never read another tenancy, whatever the query string says.
  if (scope.tenantId && requested && requested !== scope.tenantId) {
    throw forbidden('You can only read your own tenancy.')
  }
  // Staff reading on behalf of a tenant need the same rights as the tenant
  // screens, and a landlord only reaches tenants on their own properties.
  if (!scope.tenantId) {
    if (!can({ role: scope.role, permissions: scope.permissions }, 'tenants.view')) {
      throw forbidden('Your role cannot read tenant records.')
    }
    if (!(await landlordHasTenant(scope, tenantId))) {
      throw forbidden('That tenant is not on your properties.')
    }
  }

  const [tenant] = await db.select().from(tenants).where(scoped(tenants, scope, eq(tenants.id, tenantId))).limit(1)
  if (!tenant) return ok(null)

  const [lease] = await db
    .select({
      id: leases.id,
      code: leases.code,
      monthlyRent: leases.monthlyRent,
      serviceCharge: leases.serviceCharge,
      deposit: leases.deposit,
      dueDayOfMonth: leases.dueDayOfMonth,
      startDate: leases.startDate,
      endDate: leases.endDate,
      status: leases.status,
      unitNumber: units.unitNumber,
      propertyName: properties.name,
      propertyCode: properties.code,
    })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(scoped(leases, scope, eq(leases.tenantId, tenantId)))
    .orderBy(desc(leases.startDate))
    .limit(1)

  const [openInvoices, [balance], lastReceipt, openTickets] = await Promise.all([
    db
      .select({
        id: rentInvoices.id,
        number: rentInvoices.number,
        periodLabel: rentInvoices.periodLabel,
        dueDate: rentInvoices.dueDate,
        total: rentInvoices.total,
        balance: rentInvoices.balance,
        status: rentInvoices.status,
      })
      .from(rentInvoices)
      .where(
        scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId), gt(rentInvoices.balance, '0'), ne(rentInvoices.status, 'CANCELLED')),
      )
      .orderBy(asc(rentInvoices.dueDate)),
    db
      .select({ balance: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)` })
      .from(rentInvoices)
      .where(scoped(rentInvoices, scope, eq(rentInvoices.tenantId, tenantId), ne(rentInvoices.status, 'CANCELLED'))),
    db
      .select({
        number: receipts.number,
        amount: receipts.amount,
        paidAt: receipts.paidAt,
        periodLabel: receipts.periodLabel,
        method: receipts.method,
      })
      .from(receipts)
      .where(scoped(receipts, scope, eq(receipts.tenantId, tenantId)))
      .orderBy(desc(receipts.paidAt))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: maintenanceTickets.id,
        number: maintenanceTickets.number,
        title: maintenanceTickets.title,
        status: maintenanceTickets.status,
        priority: maintenanceTickets.priority,
        reportedAt: maintenanceTickets.reportedAt,
      })
      .from(maintenanceTickets)
      .where(scoped(maintenanceTickets, scope, eq(maintenanceTickets.tenantId, tenantId), ne(maintenanceTickets.status, 'CLOSED')))
      .orderBy(desc(maintenanceTickets.reportedAt)),
  ])

  const [paidToDate] = await db
    .select({ total: sql<string>`coalesce(sum(${payments.grossAmount}), 0)`, count: sql<number>`count(*)::int` })
    .from(payments)
    .where(scoped(payments, scope, eq(payments.tenantId, tenantId), eq(payments.status, 'CONFIRMED')))

  return ok({
    tenant: {
      id: tenant.id,
      code: tenant.code,
      fullName: tenant.fullName,
      phone: tenant.phone,
      email: tenant.email,
      status: tenant.status,
    },
    lease: lease
      ? {
          ...lease,
          monthlyRent: num(lease.monthlyRent),
          serviceCharge: num(lease.serviceCharge),
          deposit: num(lease.deposit),
        }
      : null,
    balance: num(balance?.balance),
    nextDue: openInvoices[0]
      ? {
          invoiceId: openInvoices[0].id,
          number: openInvoices[0].number,
          periodLabel: openInvoices[0].periodLabel,
          dueDate: openInvoices[0].dueDate,
          amount: num(openInvoices[0].balance),
          status: openInvoices[0].status,
        }
      : null,
    openInvoices: openInvoices.map((invoice) => ({
      ...invoice,
      total: num(invoice.total),
      balance: num(invoice.balance),
    })),
    lastReceipt: lastReceipt ? { ...lastReceipt, amount: num(lastReceipt.amount) } : null,
    paymentHistory: { count: paidToDate?.count ?? 0, total: cents(paidToDate?.total) / 100 },
    openMaintenance: openTickets,
    /** How the tenant should pay, so the app can pre-fill the till. */
    payment: {
      method: 'MPESA',
      accountReference: lease ? `${lease.propertyCode}-${lease.unitNumber}` : null,
    },
    currency: 'KES',
  })
})

