// ===========================================================================
//  Reporting centre (spec §30)
//
//  Every report is a definition — columns plus a query — rather than a bespoke
//  page. That gives one renderer, one export path (CSV / Excel-readable), one
//  filter contract, and no chance of the screen and the export disagreeing.
// ===========================================================================

import { and, asc, desc, eq, gt, ilike, inArray, ne, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  auditLogs,
  commissions,
  complianceExceptions,
  eritsPeriods,
  eritsProperties,
  expenses,
  landlords,
  leases,
  maintenanceTickets,
  mpesaTransactions,
  payments,
  properties,
  rentInvoices,
  settlements,
  tenants,
  units,
  vendors,
} from '@/db/schema'
import { cents, formatKES, formatPercent, percent } from '@/lib/money'
import { fmtDate, fmtDateTime, periodFrom, periodOf } from '@/lib/dates'
import { landlordScoped, scoped, type Scope } from '@/lib/tenancy'
import { can, type Permission } from '@/lib/rbac'

export interface ReportFilters {
  from?: Date
  to?: Date
  propertyId?: string
  landlordId?: string
  tenantId?: string
  year?: number
  month?: number
}

export type CellAlign = 'left' | 'right' | 'center'

export interface ReportColumn {
  key: string
  header: string
  align?: CellAlign
  /** Rendered in the table and written to the export. */
  format?: 'money' | 'percent' | 'date' | 'datetime' | 'number' | 'text'
}

export interface ReportResult {
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  totals?: Record<string, string | number | null>
  summary?: { label: string; value: string }[]
  note?: string
}

export interface ReportDefinition {
  slug: string
  name: string
  group: 'Rent' | 'Portfolio' | 'Finance' | 'Operations' | 'Compliance'
  description: string
  /** Which filters the report honours, so the UI only shows the useful ones. */
  filters: ('period' | 'dateRange' | 'property' | 'landlord' | 'tenant')[]
  /**
   * Extra permission needed beyond reports.view. Landlord logins are refused
   * when `staffOnly` is set, because the rows are not tied to one landlord.
   */
  permission?: Permission
  staffOnly?: boolean
  run: (scope: Scope, filters: ReportFilters) => Promise<ReportResult>
}

/** May this scope open the report? Used by the list, the screen and the export. */
export function canRunReport(scope: Pick<Scope, 'landlordId' | 'role' | 'permissions'>, report: ReportDefinition): boolean {
  if (report.staffOnly && scope.landlordId) return false
  if (report.permission && !can({ role: scope.role, permissions: scope.permissions }, report.permission)) return false
  return true
}

const money = (value: unknown) => formatKES(value as string)
const num = (value: unknown) => Number(value ?? 0)

function range(filters: ReportFilters) {
  if (filters.from && filters.to) return { start: filters.from, end: filters.to }
  const period = filters.year && filters.month ? periodFrom(filters.year, filters.month) : periodOf(new Date())
  return { start: period.start, end: period.end, label: period.label }
}

// ---------------------------------------------------------------------------

export const REPORTS: ReportDefinition[] = [
  {
    slug: 'rent-collection',
    name: 'Rent Collection Report',
    group: 'Rent',
    description: 'Billed against collected for a period, tenant by tenant.',
    filters: ['period', 'property', 'landlord'],
    async run(scope, filters) {
      const period = filters.year && filters.month ? periodFrom(filters.year, filters.month) : periodOf(new Date())
      const rows = await db
        .select({
          invoice: rentInvoices.number,
          tenant: tenants.fullName,
          property: properties.name,
          unit: units.unitNumber,
          billed: rentInvoices.total,
          paid: rentInvoices.amountPaid,
          balance: rentInvoices.balance,
          dueDate: rentInvoices.dueDate,
          status: rentInvoices.status,
        })
        .from(rentInvoices)
        .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
        .innerJoin(units, eq(units.id, rentInvoices.unitId))
        .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
        .where(
          landlordScoped(
            rentInvoices,
            scope,
            eq(rentInvoices.periodYear, period.year),
            eq(rentInvoices.periodMonth, period.month),
            ne(rentInvoices.status, 'CANCELLED'),
            filters.propertyId ? eq(rentInvoices.propertyId, filters.propertyId) : undefined,
            filters.landlordId ? eq(rentInvoices.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(asc(properties.name), asc(units.unitNumber))

      const billed = rows.reduce((sum, row) => sum + cents(row.billed), 0)
      const paid = rows.reduce((sum, row) => sum + cents(row.paid), 0)
      const balance = rows.reduce((sum, row) => sum + cents(row.balance), 0)

      return {
        columns: [
          { key: 'invoice', header: 'Invoice' },
          { key: 'tenant', header: 'Tenant' },
          { key: 'property', header: 'Property' },
          { key: 'unit', header: 'Unit' },
          { key: 'billed', header: 'Billed', align: 'right', format: 'money' },
          { key: 'paid', header: 'Paid', align: 'right', format: 'money' },
          { key: 'balance', header: 'Balance', align: 'right', format: 'money' },
          { key: 'dueDate', header: 'Due', format: 'date' },
          { key: 'status', header: 'Status' },
        ],
        rows: rows.map((row) => ({ ...row, dueDate: row.dueDate.toISOString() })),
        totals: { invoice: 'Total', billed: money(billed / 100), paid: money(paid / 100), balance: money(balance / 100) },
        summary: [
          { label: 'Period', value: period.label },
          { label: 'Invoices', value: String(rows.length) },
          { label: 'Billed', value: money(billed / 100) },
          { label: 'Collected', value: money(paid / 100) },
          { label: 'Outstanding', value: money(balance / 100) },
          { label: 'Collection rate', value: formatPercent(percent(paid, billed)) },
        ],
      }
    },
  },

  {
    slug: 'outstanding-rent',
    name: 'Outstanding Rent Report',
    group: 'Rent',
    description: 'Every invoice with a balance, oldest first.',
    filters: ['property', 'landlord'],
    async run(scope, filters) {
      const rows = await db
        .select({
          invoice: rentInvoices.number,
          period: rentInvoices.periodLabel,
          tenant: tenants.fullName,
          phone: tenants.phone,
          property: properties.name,
          unit: units.unitNumber,
          balance: rentInvoices.balance,
          dueDate: rentInvoices.dueDate,
          daysOverdue: sql<number>`greatest(0, (now()::date - ${rentInvoices.dueDate}::date))::int`,
          status: rentInvoices.status,
        })
        .from(rentInvoices)
        .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
        .innerJoin(units, eq(units.id, rentInvoices.unitId))
        .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
        .where(
          landlordScoped(
            rentInvoices,
            scope,
            gt(rentInvoices.balance, '0'),
            ne(rentInvoices.status, 'CANCELLED'),
            filters.propertyId ? eq(rentInvoices.propertyId, filters.propertyId) : undefined,
            filters.landlordId ? eq(rentInvoices.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(asc(rentInvoices.dueDate))

      const balance = rows.reduce((sum, row) => sum + cents(row.balance), 0)

      return {
        columns: [
          { key: 'invoice', header: 'Invoice' },
          { key: 'period', header: 'Period' },
          { key: 'tenant', header: 'Tenant' },
          { key: 'phone', header: 'Phone' },
          { key: 'property', header: 'Property' },
          { key: 'unit', header: 'Unit' },
          { key: 'dueDate', header: 'Due', format: 'date' },
          { key: 'daysOverdue', header: 'Days overdue', align: 'right', format: 'number' },
          { key: 'balance', header: 'Balance', align: 'right', format: 'money' },
          { key: 'status', header: 'Status' },
        ],
        rows: rows.map((row) => ({ ...row, dueDate: row.dueDate.toISOString() })),
        totals: { invoice: 'Total', balance: money(balance / 100) },
        summary: [
          { label: 'Invoices outstanding', value: String(rows.length) },
          { label: 'Total outstanding', value: money(balance / 100) },
        ],
      }
    },
  },

  {
    slug: 'arrears',
    name: 'Arrears Report',
    group: 'Rent',
    description: 'Arrears by tenant, aged into buckets.',
    filters: ['property', 'landlord'],
    async run(scope, filters) {
      const rows = await db
        .select({
          tenant: tenants.fullName,
          phone: tenants.phone,
          property: properties.name,
          unit: units.unitNumber,
          current: sql<string>`coalesce(sum(${rentInvoices.balance}) filter (where now()::date - ${rentInvoices.dueDate}::date <= 0), 0)`,
          bucket30: sql<string>`coalesce(sum(${rentInvoices.balance}) filter (where now()::date - ${rentInvoices.dueDate}::date between 1 and 30), 0)`,
          bucket60: sql<string>`coalesce(sum(${rentInvoices.balance}) filter (where now()::date - ${rentInvoices.dueDate}::date between 31 and 60), 0)`,
          bucket90: sql<string>`coalesce(sum(${rentInvoices.balance}) filter (where now()::date - ${rentInvoices.dueDate}::date between 61 and 90), 0)`,
          older: sql<string>`coalesce(sum(${rentInvoices.balance}) filter (where now()::date - ${rentInvoices.dueDate}::date > 90), 0)`,
          total: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)`,
        })
        .from(rentInvoices)
        .innerJoin(tenants, eq(tenants.id, rentInvoices.tenantId))
        .innerJoin(units, eq(units.id, rentInvoices.unitId))
        .innerJoin(properties, eq(properties.id, rentInvoices.propertyId))
        .where(
          landlordScoped(
            rentInvoices,
            scope,
            gt(rentInvoices.balance, '0'),
            ne(rentInvoices.status, 'CANCELLED'),
            filters.propertyId ? eq(rentInvoices.propertyId, filters.propertyId) : undefined,
            filters.landlordId ? eq(rentInvoices.landlordId, filters.landlordId) : undefined,
          ),
        )
        .groupBy(tenants.fullName, tenants.phone, properties.name, units.unitNumber)
        .orderBy(desc(sql`coalesce(sum(${rentInvoices.balance}), 0)`))

      const sum = (key: keyof (typeof rows)[number]) =>
        rows.reduce((total, row) => total + cents(row[key] as string), 0)

      return {
        columns: [
          { key: 'tenant', header: 'Tenant' },
          { key: 'phone', header: 'Phone' },
          { key: 'property', header: 'Property' },
          { key: 'unit', header: 'Unit' },
          { key: 'current', header: 'Not yet due', align: 'right', format: 'money' },
          { key: 'bucket30', header: '1–30 days', align: 'right', format: 'money' },
          { key: 'bucket60', header: '31–60 days', align: 'right', format: 'money' },
          { key: 'bucket90', header: '61–90 days', align: 'right', format: 'money' },
          { key: 'older', header: 'Over 90 days', align: 'right', format: 'money' },
          { key: 'total', header: 'Total', align: 'right', format: 'money' },
        ],
        rows,
        totals: {
          tenant: 'Total',
          current: money(sum('current') / 100),
          bucket30: money(sum('bucket30') / 100),
          bucket60: money(sum('bucket60') / 100),
          bucket90: money(sum('bucket90') / 100),
          older: money(sum('older') / 100),
          total: money(sum('total') / 100),
        },
        summary: [
          { label: 'Tenants in arrears', value: String(rows.length) },
          { label: 'Total arrears', value: money(sum('total') / 100) },
          { label: 'Over 90 days', value: money(sum('older') / 100) },
        ],
      }
    },
  },

  {
    slug: 'occupancy',
    name: 'Occupancy Report',
    group: 'Portfolio',
    description: 'Units let, vacant and out of service, by property.',
    filters: ['property', 'landlord'],
    async run(scope, filters) {
      const rows = await db
        .select({
          property: properties.name,
          code: properties.code,
          area: properties.area,
          total: sql<number>`count(${units.id})::int`,
          occupied: sql<number>`count(*) filter (where ${units.status} = 'OCCUPIED')::int`,
          vacant: sql<number>`count(*) filter (where ${units.status} = 'VACANT')::int`,
          maintenance: sql<number>`count(*) filter (where ${units.status} = 'MAINTENANCE')::int`,
          reserved: sql<number>`count(*) filter (where ${units.status} = 'RESERVED')::int`,
          potential: sql<string>`coalesce(sum(${units.monthlyRent}), 0)`,
          earning: sql<string>`coalesce(sum(${units.monthlyRent}) filter (where ${units.status} = 'OCCUPIED'), 0)`,
        })
        .from(properties)
        .leftJoin(units, eq(units.propertyId, properties.id))
        .where(
          landlordScoped(
            properties,
            scope,
            ne(properties.status, 'ARCHIVED'),
            filters.propertyId ? eq(properties.id, filters.propertyId) : undefined,
            filters.landlordId ? eq(properties.landlordId, filters.landlordId) : undefined,
          ),
        )
        .groupBy(properties.name, properties.code, properties.area)
        .orderBy(asc(properties.name))

      const totalUnits = rows.reduce((sum, row) => sum + row.total, 0)
      const occupied = rows.reduce((sum, row) => sum + row.occupied, 0)
      const potential = rows.reduce((sum, row) => sum + cents(row.potential), 0)
      const earning = rows.reduce((sum, row) => sum + cents(row.earning), 0)

      return {
        columns: [
          { key: 'property', header: 'Property' },
          { key: 'code', header: 'Code' },
          { key: 'area', header: 'Area' },
          { key: 'total', header: 'Units', align: 'right', format: 'number' },
          { key: 'occupied', header: 'Occupied', align: 'right', format: 'number' },
          { key: 'vacant', header: 'Vacant', align: 'right', format: 'number' },
          { key: 'maintenance', header: 'Maintenance', align: 'right', format: 'number' },
          { key: 'reserved', header: 'Reserved', align: 'right', format: 'number' },
          { key: 'occupancy', header: 'Occupancy', align: 'right' },
          { key: 'potential', header: 'Potential rent', align: 'right', format: 'money' },
          { key: 'earning', header: 'Earning rent', align: 'right', format: 'money' },
        ],
        rows: rows.map((row) => ({ ...row, occupancy: formatPercent(percent(row.occupied, row.total)) })),
        totals: {
          property: 'Total',
          total: totalUnits,
          occupied,
          occupancy: formatPercent(percent(occupied, totalUnits)),
          potential: money(potential / 100),
          earning: money(earning / 100),
        },
        summary: [
          { label: 'Units', value: String(totalUnits) },
          { label: 'Occupied', value: String(occupied) },
          { label: 'Occupancy', value: formatPercent(percent(occupied, totalUnits)) },
          { label: 'Rent forgone to vacancy', value: money((potential - earning) / 100) },
        ],
      }
    },
  },

  {
    slug: 'property-performance',
    name: 'Property Performance Report',
    group: 'Portfolio',
    description: 'Collection, arrears and costs per property for a period.',
    filters: ['period', 'landlord'],
    async run(scope, filters) {
      const period = filters.year && filters.month ? periodFrom(filters.year, filters.month) : periodOf(new Date())
      const rows = await db
        .select({
          property: properties.name,
          landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          expected: sql<string>`(select coalesce(sum(i.total), 0) from rent_invoices i where i.property_id = properties.id and i.period_year = ${period.year} and i.period_month = ${period.month} and i.status <> 'CANCELLED')`,
          collected: sql<string>`(select coalesce(sum(p.gross_amount), 0) from payments p where p.property_id = properties.id and p.status = 'CONFIRMED' and p.paid_at >= ${period.start} and p.paid_at <= ${period.end})`,
          arrears: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.property_id = properties.id and i.status <> 'CANCELLED')`,
          expensesTotal: sql<string>`(select coalesce(sum(e.amount), 0) from expenses e where e.property_id = properties.id and e.approval_status = 'APPROVED' and e.expense_date >= ${period.start} and e.expense_date <= ${period.end})`,
          tickets: sql<number>`(select count(*)::int from maintenance_tickets t where t.property_id = properties.id and t.status <> 'CLOSED')`,
          occupancy: sql<string>`(select case when count(*) = 0 then '0' else round(100.0 * count(*) filter (where u.status = 'OCCUPIED') / count(*), 1)::text end from units u where u.property_id = properties.id)`,
        })
        .from(properties)
        .innerJoin(landlords, eq(landlords.id, properties.landlordId))
        .where(
          landlordScoped(
            properties,
            scope,
            ne(properties.status, 'ARCHIVED'),
            filters.landlordId ? eq(properties.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(asc(properties.name))

      const expected = rows.reduce((sum, row) => sum + cents(row.expected), 0)
      const collected = rows.reduce((sum, row) => sum + cents(row.collected), 0)

      return {
        columns: [
          { key: 'property', header: 'Property' },
          { key: 'landlord', header: 'Landlord' },
          { key: 'occupancy', header: 'Occupancy %', align: 'right' },
          { key: 'expected', header: 'Billed', align: 'right', format: 'money' },
          { key: 'collected', header: 'Collected', align: 'right', format: 'money' },
          { key: 'rate', header: 'Collection %', align: 'right' },
          { key: 'arrears', header: 'Arrears', align: 'right', format: 'money' },
          { key: 'expensesTotal', header: 'Expenses', align: 'right', format: 'money' },
          { key: 'tickets', header: 'Open tickets', align: 'right', format: 'number' },
        ],
        rows: rows.map((row) => ({
          ...row,
          rate: formatPercent(percent(cents(row.collected), cents(row.expected))),
        })),
        totals: {
          property: 'Total',
          expected: money(expected / 100),
          collected: money(collected / 100),
          rate: formatPercent(percent(collected, expected)),
        },
        summary: [
          { label: 'Period', value: period.label },
          { label: 'Properties', value: String(rows.length) },
          { label: 'Collection rate', value: formatPercent(percent(collected, expected)) },
        ],
      }
    },
  },

  {
    slug: 'payment-report',
    name: 'Payment Report',
    group: 'Finance',
    description: 'Every receipt in the window, with commission and net.',
    filters: ['dateRange', 'property', 'landlord'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          reference: payments.reference,
          external: payments.externalReference,
          paidAt: payments.paidAt,
          tenant: tenants.fullName,
          property: properties.name,
          unit: units.unitNumber,
          method: payments.method,
          gross: payments.grossAmount,
          commission: payments.commissionAmount,
          net: payments.netAmount,
          status: payments.status,
          settlement: payments.settlementStatus,
        })
        .from(payments)
        .leftJoin(tenants, eq(tenants.id, payments.tenantId))
        .leftJoin(properties, eq(properties.id, payments.propertyId))
        .leftJoin(units, eq(units.id, payments.unitId))
        .where(
          landlordScoped(
            payments,
            scope,
            sql`${payments.paidAt} >= ${window.start}`,
            sql`${payments.paidAt} <= ${window.end}`,
            filters.propertyId ? eq(payments.propertyId, filters.propertyId) : undefined,
            filters.landlordId ? eq(payments.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(desc(payments.paidAt))

      const gross = rows.reduce((sum, row) => sum + cents(row.gross), 0)
      const commission = rows.reduce((sum, row) => sum + cents(row.commission), 0)

      return {
        columns: [
          { key: 'reference', header: 'Reference' },
          { key: 'external', header: 'Provider ref' },
          { key: 'paidAt', header: 'Paid', format: 'date' },
          { key: 'tenant', header: 'Tenant' },
          { key: 'property', header: 'Property' },
          { key: 'unit', header: 'Unit' },
          { key: 'method', header: 'Method' },
          { key: 'gross', header: 'Gross', align: 'right', format: 'money' },
          { key: 'commission', header: 'Commission', align: 'right', format: 'money' },
          { key: 'net', header: 'Net', align: 'right', format: 'money' },
          { key: 'status', header: 'Status' },
          { key: 'settlement', header: 'Settlement' },
        ],
        rows: rows.map((row) => ({ ...row, paidAt: row.paidAt.toISOString() })),
        totals: {
          reference: 'Total',
          gross: money(gross / 100),
          commission: money(commission / 100),
          net: money((gross - commission) / 100),
        },
        summary: [
          { label: 'Payments', value: String(rows.length) },
          { label: 'Gross received', value: money(gross / 100) },
          { label: 'Commission', value: money(commission / 100) },
        ],
      }
    },
  },

  {
    slug: 'mpesa-reconciliation',
    staffOnly: true,
    name: 'M-Pesa Reconciliation Report',
    group: 'Finance',
    description: 'Raw M-Pesa transactions against what the system matched.',
    filters: ['dateRange'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          transactionId: mpesaTransactions.transactionId,
          transactionTime: mpesaTransactions.transactionTime,
          msisdn: mpesaTransactions.msisdn,
          payer: mpesaTransactions.payerName,
          billRef: mpesaTransactions.billRefNumber,
          amount: mpesaTransactions.amount,
          reconciliation: mpesaTransactions.reconciliationStatus,
          failureReason: mpesaTransactions.failureReason,
          matched: payments.reference,
        })
        .from(mpesaTransactions)
        .leftJoin(payments, eq(payments.id, mpesaTransactions.matchedPaymentId))
        .where(
          scoped(
            mpesaTransactions as unknown as { organizationId: typeof mpesaTransactions.organizationId },
            scope,
            sql`${mpesaTransactions.transactionTime} >= ${window.start}`,
            sql`${mpesaTransactions.transactionTime} <= ${window.end}`,
          ),
        )
        .orderBy(desc(mpesaTransactions.transactionTime))

      const total = rows.reduce((sum, row) => sum + cents(row.amount), 0)
      const unmatched = rows.filter((row) => row.reconciliation !== 'AUTO_MATCHED')

      return {
        columns: [
          { key: 'transactionId', header: 'M-Pesa ref' },
          { key: 'transactionTime', header: 'Received', format: 'datetime' },
          { key: 'msisdn', header: 'Phone' },
          { key: 'payer', header: 'Payer' },
          { key: 'billRef', header: 'Account ref' },
          { key: 'amount', header: 'Amount', align: 'right', format: 'money' },
          { key: 'matched', header: 'Matched to' },
          { key: 'reconciliation', header: 'Reconciliation' },
          { key: 'failureReason', header: 'Reason' },
        ],
        rows: rows.map((row) => ({ ...row, transactionTime: row.transactionTime.toISOString() })),
        totals: { transactionId: 'Total', amount: money(total / 100) },
        summary: [
          { label: 'Transactions', value: String(rows.length) },
          { label: 'Value', value: money(total / 100) },
          { label: 'Unmatched', value: String(unmatched.length) },
        ],
        note:
          'Rows come from the raw provider feed, before matching. The unmatched ones are the queue an accountant works through.',
      }
    },
  },

  {
    slug: 'commission-report',
    name: 'Commission Report',
    group: 'Finance',
    description: 'Platform commission earned, by landlord and property.',
    filters: ['dateRange', 'landlord'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          property: properties.name,
          payments: sql<number>`count(*)::int`,
          gross: sql<string>`coalesce(sum(${commissions.grossAmount}), 0)`,
          rate: sql<string>`round(avg(${commissions.rate}), 3)::text`,
          commission: sql<string>`coalesce(sum(${commissions.commissionAmount}), 0)`,
          net: sql<string>`coalesce(sum(${commissions.netAmount}), 0)`,
        })
        .from(commissions)
        .innerJoin(payments, eq(payments.id, commissions.paymentId))
        .innerJoin(landlords, eq(landlords.id, commissions.landlordId))
        .innerJoin(properties, eq(properties.id, commissions.propertyId))
        .where(
          landlordScoped(
            commissions,
            scope,
            eq(payments.status, 'CONFIRMED'),
            sql`${payments.paidAt} >= ${window.start}`,
            sql`${payments.paidAt} <= ${window.end}`,
            filters.landlordId ? eq(commissions.landlordId, filters.landlordId) : undefined,
          ),
        )
        .groupBy(landlords.companyName, landlords.fullName, properties.name)
        .orderBy(desc(sql`coalesce(sum(${commissions.commissionAmount}), 0)`))

      const commission = rows.reduce((sum, row) => sum + cents(row.commission), 0)
      const gross = rows.reduce((sum, row) => sum + cents(row.gross), 0)

      return {
        columns: [
          { key: 'landlord', header: 'Landlord' },
          { key: 'property', header: 'Property' },
          { key: 'payments', header: 'Payments', align: 'right', format: 'number' },
          { key: 'gross', header: 'Gross rent', align: 'right', format: 'money' },
          { key: 'rate', header: 'Average rate %', align: 'right' },
          { key: 'commission', header: 'Commission', align: 'right', format: 'money' },
          { key: 'net', header: 'Net to landlord', align: 'right', format: 'money' },
        ],
        rows,
        totals: {
          landlord: 'Total',
          gross: money(gross / 100),
          commission: money(commission / 100),
          net: money((gross - commission) / 100),
        },
        summary: [
          { label: 'Gross rent', value: money(gross / 100) },
          { label: 'Commission earned', value: money(commission / 100) },
          { label: 'Effective rate', value: formatPercent(percent(commission, gross), 3) },
        ],
      }
    },
  },

  {
    slug: 'settlement-report',
    name: 'Settlement Report',
    group: 'Finance',
    description: 'Landlord payouts, their deductions and status.',
    filters: ['dateRange', 'landlord'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          reference: settlements.reference,
          landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          periodStart: settlements.periodStart,
          periodEnd: settlements.periodEnd,
          gross: settlements.grossAmount,
          commission: settlements.commissionAmount,
          managementFee: settlements.managementFee,
          expensesTotal: settlements.expenseAmount,
          adjustments: settlements.adjustmentAmount,
          net: settlements.netAmount,
          method: settlements.method,
          status: settlements.status,
          processedAt: settlements.processedAt,
        })
        .from(settlements)
        .innerJoin(landlords, eq(landlords.id, settlements.landlordId))
        .where(
          landlordScoped(
            settlements,
            scope,
            sql`${settlements.createdAt} >= ${window.start}`,
            sql`${settlements.createdAt} <= ${window.end}`,
            filters.landlordId ? eq(settlements.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(desc(settlements.createdAt))

      const gross = rows.reduce((sum, row) => sum + cents(row.gross), 0)
      const net = rows.reduce((sum, row) => sum + cents(row.net), 0)

      return {
        columns: [
          { key: 'reference', header: 'Reference' },
          { key: 'landlord', header: 'Landlord' },
          { key: 'periodStart', header: 'From', format: 'date' },
          { key: 'periodEnd', header: 'To', format: 'date' },
          { key: 'gross', header: 'Gross rent', align: 'right', format: 'money' },
          { key: 'commission', header: 'Commission', align: 'right', format: 'money' },
          { key: 'managementFee', header: 'Management fee', align: 'right', format: 'money' },
          { key: 'expensesTotal', header: 'Expenses', align: 'right', format: 'money' },
          { key: 'adjustments', header: 'Adjustments', align: 'right', format: 'money' },
          { key: 'net', header: 'Net settlement', align: 'right', format: 'money' },
          { key: 'method', header: 'Method' },
          { key: 'status', header: 'Status' },
        ],
        rows: rows.map((row) => ({
          ...row,
          periodStart: row.periodStart.toISOString(),
          periodEnd: row.periodEnd.toISOString(),
          processedAt: row.processedAt ? row.processedAt.toISOString() : null,
        })),
        totals: { reference: 'Total', gross: money(gross / 100), net: money(net / 100) },
        summary: [
          { label: 'Batches', value: String(rows.length) },
          { label: 'Gross rent settled', value: money(gross / 100) },
          { label: 'Net paid to landlords', value: money(net / 100) },
        ],
      }
    },
  },

  {
    slug: 'expense-report',
    name: 'Expense Report',
    group: 'Finance',
    description: 'Property costs by category and approval status.',
    filters: ['dateRange', 'property', 'landlord'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          reference: expenses.reference,
          date: expenses.expenseDate,
          property: properties.name,
          landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          category: expenses.category,
          vendor: vendors.name,
          description: expenses.description,
          amount: expenses.amount,
          approval: expenses.approvalStatus,
          recovered: sql<string>`case when ${expenses.settlementId} is null then 'No' else 'Yes' end`,
        })
        .from(expenses)
        .innerJoin(properties, eq(properties.id, expenses.propertyId))
        .innerJoin(landlords, eq(landlords.id, expenses.landlordId))
        .leftJoin(vendors, eq(vendors.id, expenses.vendorId))
        .where(
          landlordScoped(
            expenses,
            scope,
            sql`${expenses.expenseDate} >= ${window.start}`,
            sql`${expenses.expenseDate} <= ${window.end}`,
            filters.propertyId ? eq(expenses.propertyId, filters.propertyId) : undefined,
            filters.landlordId ? eq(expenses.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(desc(expenses.expenseDate))

      const total = rows.reduce((sum, row) => sum + cents(row.amount), 0)
      const approved = rows
        .filter((row) => row.approval === 'APPROVED')
        .reduce((sum, row) => sum + cents(row.amount), 0)

      return {
        columns: [
          { key: 'reference', header: 'Reference' },
          { key: 'date', header: 'Date', format: 'date' },
          { key: 'property', header: 'Property' },
          { key: 'landlord', header: 'Landlord' },
          { key: 'category', header: 'Category' },
          { key: 'vendor', header: 'Vendor' },
          { key: 'description', header: 'Description' },
          { key: 'amount', header: 'Amount', align: 'right', format: 'money' },
          { key: 'approval', header: 'Approval' },
          { key: 'recovered', header: 'Recovered' },
        ],
        rows: rows.map((row) => ({ ...row, date: row.date.toISOString() })),
        totals: { reference: 'Total', amount: money(total / 100) },
        summary: [
          { label: 'Expenses', value: String(rows.length) },
          { label: 'Total', value: money(total / 100) },
          { label: 'Approved', value: money(approved / 100) },
        ],
      }
    },
  },

  {
    slug: 'maintenance-report',
    name: 'Maintenance Report',
    group: 'Operations',
    description: 'Tickets raised, resolved and what they cost.',
    filters: ['dateRange', 'property'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          number: maintenanceTickets.number,
          reportedAt: maintenanceTickets.reportedAt,
          property: properties.name,
          unit: units.unitNumber,
          category: maintenanceTickets.category,
          title: maintenanceTickets.title,
          priority: maintenanceTickets.priority,
          status: maintenanceTickets.status,
          vendor: vendors.name,
          estimated: maintenanceTickets.estimatedCost,
          actual: maintenanceTickets.actualCost,
          resolvedAt: maintenanceTickets.resolvedAt,
          daysOpen: sql<number>`greatest(0, (coalesce(${maintenanceTickets.resolvedAt}, now())::date - ${maintenanceTickets.reportedAt}::date))::int`,
        })
        .from(maintenanceTickets)
        .innerJoin(properties, eq(properties.id, maintenanceTickets.propertyId))
        .leftJoin(units, eq(units.id, maintenanceTickets.unitId))
        .leftJoin(vendors, eq(vendors.id, maintenanceTickets.vendorId))
        .where(
          landlordScoped(
            properties,
            scope,
            sql`${maintenanceTickets.reportedAt} >= ${window.start}`,
            sql`${maintenanceTickets.reportedAt} <= ${window.end}`,
            filters.propertyId ? eq(maintenanceTickets.propertyId, filters.propertyId) : undefined,
          ),
        )
        .orderBy(desc(maintenanceTickets.reportedAt))

      const actual = rows.reduce((sum, row) => sum + cents(row.actual), 0)
      const resolved = rows.filter((row) => row.status === 'RESOLVED' || row.status === 'CLOSED')
      const averageDays = resolved.length
        ? Math.round(resolved.reduce((sum, row) => sum + row.daysOpen, 0) / resolved.length)
        : 0

      return {
        columns: [
          { key: 'number', header: 'Ticket' },
          { key: 'reportedAt', header: 'Reported', format: 'date' },
          { key: 'property', header: 'Property' },
          { key: 'unit', header: 'Unit' },
          { key: 'category', header: 'Category' },
          { key: 'title', header: 'Issue' },
          { key: 'priority', header: 'Priority' },
          { key: 'vendor', header: 'Vendor' },
          { key: 'estimated', header: 'Estimated', align: 'right', format: 'money' },
          { key: 'actual', header: 'Actual', align: 'right', format: 'money' },
          { key: 'daysOpen', header: 'Days open', align: 'right', format: 'number' },
          { key: 'status', header: 'Status' },
        ],
        rows: rows.map((row) => ({
          ...row,
          reportedAt: row.reportedAt.toISOString(),
          resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
        })),
        totals: { number: 'Total', actual: money(actual / 100) },
        summary: [
          { label: 'Tickets', value: String(rows.length) },
          { label: 'Resolved', value: String(resolved.length) },
          { label: 'Average days to resolve', value: String(averageDays) },
          { label: 'Actual cost', value: money(actual / 100) },
        ],
      }
    },
  },

  {
    slug: 'lease-expiry',
    name: 'Lease Expiry Report',
    group: 'Portfolio',
    description: 'Leases ending, so renewals can be chased in time.',
    filters: ['property', 'landlord'],
    async run(scope, filters) {
      const rows = await db
        .select({
          lease: leases.code,
          tenant: tenants.fullName,
          phone: tenants.phone,
          property: properties.name,
          unit: units.unitNumber,
          startDate: leases.startDate,
          endDate: leases.endDate,
          daysToExpiry: sql<number>`(${leases.endDate}::date - now()::date)::int`,
          rent: leases.monthlyRent,
          noticePeriod: leases.noticePeriodDays,
          status: leases.status,
        })
        .from(leases)
        .innerJoin(tenants, eq(tenants.id, leases.tenantId))
        .innerJoin(units, eq(units.id, leases.unitId))
        .innerJoin(properties, eq(properties.id, leases.propertyId))
        .where(
          landlordScoped(
            properties,
            scope,
            inArray(leases.status, ['ACTIVE', 'EXPIRING', 'EXPIRED']),
            filters.propertyId ? eq(leases.propertyId, filters.propertyId) : undefined,
            filters.landlordId ? eq(properties.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(asc(leases.endDate))

      const within90 = rows.filter((row) => row.daysToExpiry <= 90 && row.daysToExpiry >= 0)
      const rentAtRisk = within90.reduce((sum, row) => sum + cents(row.rent), 0)

      return {
        columns: [
          { key: 'lease', header: 'Lease' },
          { key: 'tenant', header: 'Tenant' },
          { key: 'phone', header: 'Phone' },
          { key: 'property', header: 'Property' },
          { key: 'unit', header: 'Unit' },
          { key: 'startDate', header: 'Start', format: 'date' },
          { key: 'endDate', header: 'End', format: 'date' },
          { key: 'daysToExpiry', header: 'Days to expiry', align: 'right', format: 'number' },
          { key: 'noticePeriod', header: 'Notice days', align: 'right', format: 'number' },
          { key: 'rent', header: 'Monthly rent', align: 'right', format: 'money' },
          { key: 'status', header: 'Status' },
        ],
        rows: rows.map((row) => ({
          ...row,
          startDate: row.startDate.toISOString(),
          endDate: row.endDate.toISOString(),
        })),
        summary: [
          { label: 'Leases', value: String(rows.length) },
          { label: 'Expiring within 90 days', value: String(within90.length) },
          { label: 'Monthly rent at risk', value: money(rentAtRisk / 100) },
        ],
      }
    },
  },

  {
    slug: 'rental-income',
    name: 'Rental Income Report',
    group: 'Compliance',
    description: 'Rental income actually received, by landlord and period — the basis for eRITS.',
    filters: ['period', 'landlord'],
    async run(scope, filters) {
      const rows = await db
        .select({
          landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          kraPin: landlords.kraPin,
          period: eritsPeriods.label,
          properties: eritsPeriods.propertyCount,
          payments: eritsPeriods.paymentCount,
          gross: eritsPeriods.grossRentalIncome,
          deductions: eritsPeriods.allowableDeductions,
          taxable: eritsPeriods.taxableAmount,
          rule: eritsPeriods.taxRuleName,
          rate: eritsPeriods.taxRate,
          tax: eritsPeriods.taxAmount,
          status: eritsPeriods.status,
        })
        .from(eritsPeriods)
        .innerJoin(landlords, eq(landlords.id, eritsPeriods.landlordId))
        .where(
          landlordScoped(
            eritsPeriods,
            scope,
            filters.year ? eq(eritsPeriods.periodYear, filters.year) : undefined,
            filters.month ? eq(eritsPeriods.periodMonth, filters.month) : undefined,
            filters.landlordId ? eq(eritsPeriods.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(desc(eritsPeriods.periodYear), desc(eritsPeriods.periodMonth), desc(eritsPeriods.grossRentalIncome))

      const gross = rows.reduce((sum, row) => sum + cents(row.gross), 0)
      const tax = rows.reduce((sum, row) => sum + cents(row.tax), 0)

      return {
        columns: [
          { key: 'landlord', header: 'Landlord' },
          { key: 'kraPin', header: 'KRA PIN' },
          { key: 'period', header: 'Period' },
          { key: 'properties', header: 'Properties', align: 'right', format: 'number' },
          { key: 'payments', header: 'Payments', align: 'right', format: 'number' },
          { key: 'gross', header: 'Gross rental income', align: 'right', format: 'money' },
          { key: 'deductions', header: 'Deductions', align: 'right', format: 'money' },
          { key: 'taxable', header: 'Taxable', align: 'right', format: 'money' },
          { key: 'rule', header: 'Rule applied' },
          { key: 'rate', header: 'Rate %', align: 'right' },
          { key: 'tax', header: 'Tax', align: 'right', format: 'money' },
          { key: 'status', header: 'eRITS status' },
        ],
        rows,
        totals: { landlord: 'Total', gross: money(gross / 100), tax: money(tax / 100) },
        summary: [
          { label: 'Periods', value: String(rows.length) },
          { label: 'Gross rental income', value: money(gross / 100) },
          { label: 'Tax computed', value: money(tax / 100) },
        ],
        note: 'Income is taken from confirmed receipts, not invoices raised, because rental income tax is assessed on income received.',
      }
    },
  },

  {
    slug: 'erits-compliance',
    name: 'KRA / eRITS Compliance Report',
    group: 'Compliance',
    description: 'Mapping status and open issues across the portfolio.',
    filters: ['landlord'],
    async run(scope, filters) {
      const rows = await db
        .select({
          property: properties.name,
          landlord: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
          kraPin: sql<string>`coalesce(${eritsProperties.kraPin}, ${landlords.kraPin})`,
          eritsRef: eritsProperties.eritsPropertyRef,
          registration: sql<string>`coalesce(${eritsProperties.registrationStatus}::text, 'NOT_MAPPED')`,
          lastSync: eritsProperties.lastSyncedAt,
          units: properties.unitCount,
          estimatedAnnual: sql<string>`coalesce(${eritsProperties.estimatedAnnualRent}, ${properties.expectedMonthlyRent} * 12)`,
          openIssues: sql<number>`(select count(*)::int from compliance_exceptions ce where ce.property_id = properties.id and ce.status = 'OPEN')`,
        })
        .from(properties)
        .innerJoin(landlords, eq(landlords.id, properties.landlordId))
        .leftJoin(eritsProperties, eq(eritsProperties.propertyId, properties.id))
        .where(
          landlordScoped(
            properties,
            scope,
            ne(properties.status, 'ARCHIVED'),
            filters.landlordId ? eq(properties.landlordId, filters.landlordId) : undefined,
          ),
        )
        .orderBy(asc(properties.name))

      const [issueSummary] = await db
        .select({
          open: sql<number>`count(*) filter (where ${complianceExceptions.status} = 'OPEN')::int`,
          critical: sql<number>`count(*) filter (where ${complianceExceptions.status} = 'OPEN' and ${complianceExceptions.severity} = 'CRITICAL')::int`,
        })
        .from(complianceExceptions)
        .where(scoped(complianceExceptions, scope))

      return {
        columns: [
          { key: 'property', header: 'Property' },
          { key: 'landlord', header: 'Landlord' },
          { key: 'kraPin', header: 'KRA PIN' },
          { key: 'eritsRef', header: 'eRITS reference' },
          { key: 'units', header: 'Units', align: 'right', format: 'number' },
          { key: 'estimatedAnnual', header: 'Estimated annual rent', align: 'right', format: 'money' },
          { key: 'lastSync', header: 'Last sync', format: 'date' },
          { key: 'openIssues', header: 'Open issues', align: 'right', format: 'number' },
          { key: 'registration', header: 'Status' },
        ],
        rows: rows.map((row) => ({ ...row, lastSync: row.lastSync ? row.lastSync.toISOString() : null })),
        summary: [
          { label: 'Properties', value: String(rows.length) },
          { label: 'Mapped', value: String(rows.filter((row) => row.eritsRef).length) },
          { label: 'Open compliance issues', value: String(issueSummary?.open ?? 0) },
          { label: 'Critical', value: String(issueSummary?.critical ?? 0) },
        ],
      }
    },
  },

  {
    slug: 'audit-report',
    staffOnly: true,
    permission: 'audit.view',
    name: 'Audit Report',
    group: 'Compliance',
    description: 'Financial and tax actions taken in the window, with the actor.',
    filters: ['dateRange'],
    async run(scope, filters) {
      const window = range(filters)
      const rows = await db
        .select({
          createdAt: auditLogs.createdAt,
          action: auditLogs.action,
          entityType: auditLogs.entityType,
          reference: auditLogs.reference,
          user: auditLogs.userName,
          role: auditLogs.userRole,
          ip: auditLogs.ipAddress,
        })
        .from(auditLogs)
        .where(
          scoped(
            auditLogs,
            scope,
            sql`${auditLogs.createdAt} >= ${window.start}`,
            sql`${auditLogs.createdAt} <= ${window.end}`,
          ),
        )
        .orderBy(desc(auditLogs.createdAt))
        .limit(5000)

      return {
        columns: [
          { key: 'createdAt', header: 'When', format: 'datetime' },
          { key: 'action', header: 'Action' },
          { key: 'entityType', header: 'Entity' },
          { key: 'reference', header: 'Reference' },
          { key: 'user', header: 'User' },
          { key: 'role', header: 'Role' },
          { key: 'ip', header: 'IP' },
        ],
        rows: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
        summary: [{ label: 'Entries', value: String(rows.length) }],
      }
    },
  },
]

export function findReport(slug: string): ReportDefinition | undefined {
  return REPORTS.find((report) => report.slug === slug)
}

/** Format a value the same way for the screen and the export. */
export function formatCell(value: unknown, format?: ReportColumn['format']): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (format) {
    case 'money':
      return formatKES(value as string)
    case 'percent':
      return formatPercent(num(value))
    case 'date':
      return fmtDate(value as string)
    case 'datetime':
      return fmtDateTime(value as string)
    case 'number':
      return num(value).toLocaleString()
    default:
      return String(value)
  }
}

export function toCsv(result: ReportResult): string {
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
  const header = result.columns.map((column) => escape(column.header)).join(',')
  const body = result.rows.map((row) =>
    result.columns
      .map((column) => escape(formatCell(row[column.key], column.format).replace('—', '')))
      .join(','),
  )
  const totals = result.totals
    ? [result.columns.map((column) => escape(String(result.totals?.[column.key] ?? ''))).join(',')]
    : []
  return [header, ...body, ...totals].join('\n')
}

export { and }
