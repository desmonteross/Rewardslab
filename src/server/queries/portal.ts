// ===========================================================================
//  Tenant portal reads
//
//  Every query here goes through `ownTenantScoped` / `tenantScoped`, so the
//  organization filter and the tenant filter are both applied by construction.
//  A handler that forgets to pass the tenant id gets an exception from
//  `requireTenantId`, never a wider result set.
// ===========================================================================

import { and, asc, desc, eq, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  invoiceItems,
  leases,
  maintenanceTickets,
  maintenanceUpdates,
  notifications,
  organizations,
  payments,
  properties,
  receipts,
  rentInvoices,
  tenants,
  units,
} from '@/db/schema'
import { cents } from '@/lib/money'
import { ownTenantScoped, requireTenantId, scoped, tenantScoped, type Scope } from '@/lib/tenancy'
import { rentalRecordFor, type RentalRecord } from '@/server/services/rental-record'

export interface PortalTenancy {
  tenantId: string
  code: string
  fullName: string
  phone: string
  email: string | null
  status: string
  organizationName: string
  lease: {
    id: string
    code: string
    status: string
    startDate: Date
    endDate: Date | null
    monthlyRentCents: number
    serviceChargeCents: number
    depositCents: number
    dueDayOfMonth: number
    unitNumber: string
    propertyName: string
    propertyCode: string
    propertyAddress: string | null
  } | null
}

/** Who the signed-in tenant is, and where they live right now. */
export async function portalTenancy(scope: Scope): Promise<PortalTenancy | null> {
  const tenantId = requireTenantId(scope)

  const [row] = await db
    .select({ tenant: tenants, organizationName: organizations.name })
    .from(tenants)
    .innerJoin(organizations, eq(organizations.id, tenants.organizationId))
    .where(ownTenantScoped(tenants, scope, eq(tenants.id, tenantId)))
    .limit(1)
  if (!row) return null

  const [lease] = await db
    .select({
      id: leases.id,
      code: leases.code,
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      monthlyRent: leases.monthlyRent,
      serviceCharge: leases.serviceCharge,
      deposit: leases.deposit,
      dueDayOfMonth: leases.dueDayOfMonth,
      unitNumber: units.unitNumber,
      propertyName: properties.name,
      propertyCode: properties.code,
      propertyAddress: properties.address,
    })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(tenantScoped(leases, scope, eq(leases.tenantId, tenantId)))
    // Active tenancy first, then the most recent.
    .orderBy(sql`case when ${leases.status} = 'ACTIVE' then 0 else 1 end`, desc(leases.startDate))
    .limit(1)

  return {
    tenantId: row.tenant.id,
    code: row.tenant.code,
    fullName: row.tenant.fullName,
    phone: row.tenant.phone,
    email: row.tenant.email,
    status: row.tenant.status,
    organizationName: row.organizationName,
    lease: lease
      ? {
          id: lease.id,
          code: lease.code,
          status: lease.status,
          startDate: new Date(lease.startDate),
          endDate: lease.endDate ? new Date(lease.endDate) : null,
          monthlyRentCents: cents(lease.monthlyRent),
          serviceChargeCents: cents(lease.serviceCharge),
          depositCents: cents(lease.deposit),
          dueDayOfMonth: lease.dueDayOfMonth,
          unitNumber: lease.unitNumber,
          propertyName: lease.propertyName,
          propertyCode: lease.propertyCode,
          propertyAddress: lease.propertyAddress,
        }
      : null,
  }
}

export interface PortalInvoice {
  id: string
  number: string
  periodLabel: string
  issueDate: Date
  dueDate: Date
  totalCents: number
  balanceCents: number
  status: string
}

export interface RentDue {
  balanceCents: number
  overdueCents: number
  nextDue: PortalInvoice | null
  openInvoices: PortalInvoice[]
  /** What the tenant types into M-Pesa. */
  payReference: string | null
}

export async function portalRentDue(scope: Scope, asOf = new Date()): Promise<RentDue> {
  const tenantId = requireTenantId(scope)

  const rows = await db
    .select({
      id: rentInvoices.id,
      number: rentInvoices.number,
      periodLabel: rentInvoices.periodLabel,
      issueDate: rentInvoices.issueDate,
      dueDate: rentInvoices.dueDate,
      total: rentInvoices.total,
      balance: rentInvoices.balance,
      status: rentInvoices.status,
    })
    .from(rentInvoices)
    .where(
      tenantScoped(
        rentInvoices,
        scope,
        eq(rentInvoices.tenantId, tenantId),
        ne(rentInvoices.status, 'CANCELLED'),
        sql`${rentInvoices.balance} > 0`,
      ),
    )
    .orderBy(asc(rentInvoices.dueDate))

  const open: PortalInvoice[] = rows.map((row) => ({
    id: row.id,
    number: row.number,
    periodLabel: row.periodLabel,
    issueDate: new Date(row.issueDate),
    dueDate: new Date(row.dueDate),
    totalCents: cents(row.total),
    balanceCents: cents(row.balance),
    status: row.status,
  }))

  const balanceCents = open.reduce((sum, invoice) => sum + invoice.balanceCents, 0)
  const overdueCents = open
    .filter((invoice) => invoice.dueDate.getTime() < asOf.getTime())
    .reduce((sum, invoice) => sum + invoice.balanceCents, 0)

  const tenancy = await portalTenancy(scope)
  const payReference = tenancy?.lease ? `${tenancy.lease.propertyCode}-${tenancy.lease.unitNumber}` : null

  return { balanceCents, overdueCents, nextDue: open[0] ?? null, openInvoices: open, payReference }
}

export interface PortalReceipt {
  id: string
  number: string
  paidAt: Date
  amountCents: number
  method: string
  periodLabel: string | null
  reference: string | null
}

export async function portalReceipts(scope: Scope, limit = 60): Promise<PortalReceipt[]> {
  const tenantId = requireTenantId(scope)
  const rows = await db
    .select({
      id: receipts.id,
      number: receipts.number,
      paidAt: receipts.paidAt,
      amount: receipts.amount,
      method: receipts.method,
      periodLabel: receipts.periodLabel,
      reference: payments.externalReference,
    })
    .from(receipts)
    .leftJoin(payments, eq(payments.id, receipts.paymentId))
    .where(tenantScoped(receipts, scope, eq(receipts.tenantId, tenantId)))
    .orderBy(desc(receipts.paidAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    paidAt: new Date(row.paidAt),
    amountCents: cents(row.amount),
    method: row.method,
    periodLabel: row.periodLabel,
    reference: row.reference,
  }))
}

export interface StatementLine {
  date: Date
  reference: string
  description: string
  chargeCents: number
  paymentCents: number
  balanceCents: number
}

/**
 * The tenant's own statement — every charge and every payment, in date order,
 * with a running balance. Same computation as the staff-side tenant ledger.
 */
export async function portalStatement(scope: Scope): Promise<StatementLine[]> {
  const tenantId = requireTenantId(scope)

  const [charges, paid] = await Promise.all([
    db
      .select({
        date: rentInvoices.issueDate,
        reference: rentInvoices.number,
        description: invoiceItems.description,
        amount: invoiceItems.amount,
      })
      .from(invoiceItems)
      .innerJoin(rentInvoices, eq(rentInvoices.id, invoiceItems.invoiceId))
      .where(
        tenantScoped(
          rentInvoices,
          scope,
          eq(rentInvoices.tenantId, tenantId),
          ne(rentInvoices.status, 'CANCELLED'),
        ),
      )
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
      .where(
        tenantScoped(payments, scope, eq(payments.tenantId, tenantId), eq(payments.status, 'CONFIRMED')),
      )
      .orderBy(asc(payments.paidAt)),
  ])

  const rows = [
    ...charges.map((row) => ({
      date: new Date(row.date),
      reference: row.reference,
      description: row.description,
      chargeCents: cents(row.amount),
      paymentCents: 0,
    })),
    ...paid.map((row) => ({
      date: new Date(row.date),
      reference: row.reference,
      description: `Payment received — ${row.method}${row.externalReference ? ` (${row.externalReference})` : ''}`,
      chargeCents: 0,
      paymentCents: cents(row.amount),
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime())

  let running = 0
  return rows.map((row) => {
    running += row.chargeCents - row.paymentCents
    return { ...row, balanceCents: running }
  })
}

export interface PortalTicket {
  id: string
  number: string
  title: string
  description: string
  category: string
  priority: string
  status: string
  reportedAt: Date
  resolvedAt: Date | null
  closedAt: Date | null
  resolutionNotes: string | null
  propertyName: string
  unitNumber: string | null
}

export async function portalTickets(scope: Scope): Promise<PortalTicket[]> {
  const tenantId = requireTenantId(scope)
  const rows = await db
    .select({
      id: maintenanceTickets.id,
      number: maintenanceTickets.number,
      title: maintenanceTickets.title,
      description: maintenanceTickets.description,
      category: maintenanceTickets.category,
      priority: maintenanceTickets.priority,
      status: maintenanceTickets.status,
      reportedAt: maintenanceTickets.reportedAt,
      resolvedAt: maintenanceTickets.resolvedAt,
      closedAt: maintenanceTickets.closedAt,
      resolutionNotes: maintenanceTickets.resolutionNotes,
      propertyName: properties.name,
      unitNumber: units.unitNumber,
    })
    .from(maintenanceTickets)
    .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
    .leftJoin(units, eq(units.id, maintenanceTickets.unitId))
    .where(tenantScoped(maintenanceTickets, scope, eq(maintenanceTickets.tenantId, tenantId)))
    .orderBy(desc(maintenanceTickets.reportedAt))

  return rows.map((row) => ({
    ...row,
    reportedAt: new Date(row.reportedAt),
    resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : null,
    closedAt: row.closedAt ? new Date(row.closedAt) : null,
  }))
}

export interface TicketUpdate {
  id: string
  note: string
  status: string | null
  authorName: string | null
  createdAt: Date
}

/** The progress notes on one of the tenant's own tickets. */
export async function portalTicketUpdates(scope: Scope, ticketId: string): Promise<TicketUpdate[]> {
  const tenantId = requireTenantId(scope)

  // Confirm the ticket is theirs before reading anything attached to it.
  const [ticket] = await db
    .select({ id: maintenanceTickets.id })
    .from(maintenanceTickets)
    .where(
      tenantScoped(
        maintenanceTickets,
        scope,
        eq(maintenanceTickets.id, ticketId),
        eq(maintenanceTickets.tenantId, tenantId),
      ),
    )
    .limit(1)
  if (!ticket) return []

  return db
    .select({
      id: maintenanceUpdates.id,
      note: maintenanceUpdates.note,
      status: maintenanceUpdates.status,
      authorName: maintenanceUpdates.authorName,
      createdAt: maintenanceUpdates.createdAt,
    })
    .from(maintenanceUpdates)
    .where(scoped(maintenanceUpdates, scope, eq(maintenanceUpdates.ticketId, ticketId)))
    .orderBy(asc(maintenanceUpdates.createdAt))
}

export interface TenancyHistoryEntry {
  leaseCode: string
  status: string
  propertyName: string
  propertyCode: string
  unitNumber: string
  startDate: Date
  endDate: Date | null
  monthlyRentCents: number
  months: number
  terminationReason: string | null
}

/** Every tenancy this tenant has held, newest first — the rental passport. */
export async function portalTenancyHistory(scope: Scope): Promise<TenancyHistoryEntry[]> {
  const tenantId = requireTenantId(scope)
  const rows = await db
    .select({
      leaseCode: leases.code,
      status: leases.status,
      startDate: leases.startDate,
      endDate: leases.endDate,
      monthlyRent: leases.monthlyRent,
      terminationReason: leases.terminationReason,
      propertyName: properties.name,
      propertyCode: properties.code,
      unitNumber: units.unitNumber,
    })
    .from(leases)
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(tenantScoped(leases, scope, eq(leases.tenantId, tenantId)))
    .orderBy(desc(leases.startDate))

  const now = Date.now()
  return rows.map((row) => {
    const start = new Date(row.startDate)
    const end = row.endDate ? new Date(row.endDate) : null
    const until = end && end.getTime() < now ? end.getTime() : now
    return {
      leaseCode: row.leaseCode,
      status: row.status,
      propertyName: row.propertyName,
      propertyCode: row.propertyCode,
      unitNumber: row.unitNumber,
      startDate: start,
      endDate: end,
      monthlyRentCents: cents(row.monthlyRent),
      months: Math.max(0, Math.round((until - start.getTime()) / (30.44 * 86_400_000))),
      terminationReason: row.terminationReason,
    }
  })
}

export interface PaymentSummary {
  paymentCount: number
  totalPaidCents: number
  firstPaymentAt: Date | null
  lastPaymentAt: Date | null
}

export async function portalPaymentSummary(scope: Scope): Promise<PaymentSummary> {
  const tenantId = requireTenantId(scope)
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      total: sql<string>`coalesce(sum(${payments.grossAmount}), 0)`,
      first: sql<Date | null>`min(${payments.paidAt})`,
      last: sql<Date | null>`max(${payments.paidAt})`,
    })
    .from(payments)
    .where(tenantScoped(payments, scope, eq(payments.tenantId, tenantId), eq(payments.status, 'CONFIRMED')))

  return {
    paymentCount: row?.count ?? 0,
    totalPaidCents: cents(row?.total),
    firstPaymentAt: row?.first ? new Date(row.first) : null,
    lastPaymentAt: row?.last ? new Date(row.last) : null,
  }
}

export interface PortalOverview {
  tenancy: PortalTenancy | null
  rent: RentDue
  record: RentalRecord
  openTickets: number
  lastReceipt: PortalReceipt | null
}

/** Everything the portal home screen needs, in one round of queries. */
export async function portalOverview(scope: Scope, asOf = new Date()): Promise<PortalOverview> {
  const tenantId = requireTenantId(scope)
  const [tenancy, rent, record, tickets, receiptRows] = await Promise.all([
    portalTenancy(scope),
    portalRentDue(scope, asOf),
    rentalRecordFor(scope, tenantId, asOf),
    db
      .select({ id: maintenanceTickets.id })
      .from(maintenanceTickets)
      .where(
        tenantScoped(
          maintenanceTickets,
          scope,
          eq(maintenanceTickets.tenantId, tenantId),
          ne(maintenanceTickets.status, 'CLOSED'),
        ),
      ),
    portalReceipts(scope, 1),
  ])

  return {
    tenancy,
    rent,
    record,
    openTickets: tickets.length,
    lastReceipt: receiptRows[0] ?? null,
  }
}

/** One receipt, but only if it belongs to the signed-in tenant. */
export async function portalReceipt(scope: Scope, receiptId: string) {
  const tenantId = requireTenantId(scope)
  const [row] = await db
    .select({
      receipt: receipts,
      organizationName: organizations.name,
      tenantName: tenants.fullName,
      tenantCode: tenants.code,
      propertyName: properties.name,
      unitNumber: units.unitNumber,
      externalReference: payments.externalReference,
      payerName: payments.payerName,
    })
    .from(receipts)
    .innerJoin(organizations, eq(organizations.id, receipts.organizationId))
    .innerJoin(tenants, eq(tenants.id, receipts.tenantId))
    .leftJoin(payments, eq(payments.id, receipts.paymentId))
    .leftJoin(units, eq(units.id, receipts.unitId))
    .leftJoin(properties, eq(properties.id, receipts.propertyId))
    .where(
      and(
        tenantScoped(receipts, scope, eq(receipts.id, receiptId), eq(receipts.tenantId, tenantId)),
      ),
    )
    .limit(1)
  return row ?? null
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

export interface PortalAnnouncement {
  id: string
  title: string
  body: string
  createdAt: Date
  unread: boolean
}

/**
 * What has been sent to this tenant.
 *
 * Addressed to the signed-in user rather than broadcast to the organization,
 * so a tenant only ever sees notices meant for them. Scoped on the
 * organization as well as the user id — a stale user id must not become a way
 * to read another organization's messages.
 */
export async function portalAnnouncements(
  scope: Scope,
  limit = 20,
): Promise<PortalAnnouncement[]> {
  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      body: notifications.body,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .where(scoped(notifications, scope, eq(notifications.userId, scope.userId)))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: new Date(row.createdAt),
    unread: row.readAt === null,
  }))
}

export interface PortalNavCounts {
  maintenance: number
  notifications: number
}

/** The two numbers the navigation badges carry. */
export async function portalNavCounts(scope: Scope): Promise<PortalNavCounts> {
  const tenantId = requireTenantId(scope)

  const [tickets, unread] = await Promise.all([
    db
      .select({ id: maintenanceTickets.id })
      .from(maintenanceTickets)
      .where(
        tenantScoped(
          maintenanceTickets,
          scope,
          eq(maintenanceTickets.tenantId, tenantId),
          ne(maintenanceTickets.status, 'CLOSED'),
        ),
      ),
    db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        scoped(
          notifications,
          scope,
          eq(notifications.userId, scope.userId),
          sql`${notifications.readAt} is null`,
        ),
      ),
  ])

  return { maintenance: tickets.length, notifications: unread.length }
}
