// ===========================================================================
//  Automated rent billing engine (spec §12)
//
//  Once a month, every active lease produces one invoice for that period:
//
//      Tenant  James Mwangi          Unit A12
//      Rent    KES 25,000            Due the 5th
//      →  INV-2026-001023 · September 2026 Rent · KES 25,000 · DUE
//
//  The run is idempotent. A lease already invoiced for the period is skipped,
//  so the engine can safely be triggered twice on the 1st of the month.
// ===========================================================================

import { and, eq, gt, inArray, lte, ne, sql } from 'drizzle-orm'
import {
  billingRuns,
  invoiceItems,
  leaseCharges,
  leases,
  rentInvoices,
} from '@/db/schema'
import { db, type Tx } from '@/db'
import { amount, cents, percentOfCents } from '@/lib/money'
import { dueDateFor, periodFrom, type Period } from '@/lib/dates'
import { audit } from '@/lib/audit'
import { scoped, type Scope } from '@/lib/tenancy'
import { nextNumber } from './numbering'
import { postLedgerGroup } from './ledger'

export interface SharedCharge {
  type: PlannedItem['type']
  description: string
  /** The total for the whole run, in integer cents. */
  totalCents: number
}

/**
 * Divide a total into `parts` whole cents that sum back to exactly the total.
 * The remainder goes one cent at a time to the earliest shares rather than
 * being rounded away, so 1,000 across 3 tenants is 334 + 333 + 333, never
 * 333 × 3 with a shilling unaccounted for.
 */
export function splitCents(totalCents: number, parts: number): number[] {
  if (parts <= 0) return []
  const base = Math.floor(totalCents / parts)
  let remainder = totalCents - base * parts
  const shares: number[] = []
  for (let index = 0; index < parts; index += 1) {
    const extra = remainder > 0 ? 1 : 0
    remainder -= extra
    shares.push(base + extra)
  }
  return shares
}

export interface BillingOptions {
  year: number
  month: number
  /** Limit the run to one property — used by the property screen. */
  propertyId?: string
  /** Limit the run to one lease — used when a lease starts mid-month. */
  leaseId?: string
  /** Limit the run to a single unit. */
  unitId?: string
  /**
   * One-off charges raised alongside rent. Each carries a TOTAL for the whole
   * run, which is divided equally across the tenants actually billed — a
   * borehole repair is one cost shared between them, not a cost each.
   */
  sharedCharges?: SharedCharge[]
  /** Charge late-payment penalties on outstanding arrears. Default true. */
  applyPenalties?: boolean
  /** Prorate the first month when a lease starts mid-period. Default true. */
  prorateFirstMonth?: boolean
  issueDate?: Date
}

export interface BillingResult {
  runId: string
  period: Period
  invoicesCreated: number
  invoicesSkipped: number
  totalBilledCents: number
  invoices: { id: string; number: string; leaseId: string; totalCents: number }[]
}

interface PlannedItem {
  type: 'RENT' | 'SERVICE_CHARGE' | 'UTILITY' | 'WATER' | 'ELECTRICITY' | 'PARKING' | 'PENALTY' | 'OTHER'
  description: string
  quantity: number
  unitAmountCents: number
  amountCents: number
}

/**
 * Pure: what should this lease be billed for this period? Separated from the
 * database work so the arithmetic — proration, service charges, penalties —
 * can be tested on its own.
 */
export function planInvoiceItems(input: {
  period: Period
  monthlyRentCents: number
  serviceChargeCents: number
  leaseStart: Date
  leaseEnd: Date
  extraCharges: { label: string; type: PlannedItem['type']; amountCents: number }[]
  arrearsCents: number
  penaltyType: 'NONE' | 'FIXED' | 'PERCENT'
  penaltyValueCents: number
  applyPenalties: boolean
  prorateFirstMonth: boolean
}): { items: PlannedItem[]; subtotalCents: number; penaltyCents: number; totalCents: number } {
  const items: PlannedItem[] = []
  const daysInMonth = new Date(input.period.year, input.period.month, 0).getDate()

  let rentCents = input.monthlyRentCents
  let rentDescription = `${input.period.label} Rent`

  const startsMidPeriod =
    input.prorateFirstMonth &&
    input.leaseStart > input.period.start &&
    input.leaseStart <= input.period.end

  const endsMidPeriod = input.leaseEnd >= input.period.start && input.leaseEnd < input.period.end

  if (startsMidPeriod) {
    const billableDays = daysInMonth - input.leaseStart.getDate() + 1
    rentCents = Math.round((input.monthlyRentCents * billableDays) / daysInMonth)
    rentDescription = `${input.period.label} Rent (prorated, ${billableDays}/${daysInMonth} days)`
  } else if (endsMidPeriod) {
    const billableDays = input.leaseEnd.getDate()
    rentCents = Math.round((input.monthlyRentCents * billableDays) / daysInMonth)
    rentDescription = `${input.period.label} Rent (prorated, ${billableDays}/${daysInMonth} days)`
  }

  if (rentCents > 0) {
    items.push({
      type: 'RENT',
      description: rentDescription,
      quantity: 1,
      unitAmountCents: rentCents,
      amountCents: rentCents,
    })
  }

  if (input.serviceChargeCents > 0) {
    items.push({
      type: 'SERVICE_CHARGE',
      description: `${input.period.label} Service Charge`,
      quantity: 1,
      unitAmountCents: input.serviceChargeCents,
      amountCents: input.serviceChargeCents,
    })
  }

  for (const charge of input.extraCharges) {
    if (charge.amountCents === 0) continue
    items.push({
      type: charge.type,
      description: `${input.period.label} ${charge.label}`,
      quantity: 1,
      unitAmountCents: charge.amountCents,
      amountCents: charge.amountCents,
    })
  }

  let penaltyCents = 0
  if (input.applyPenalties && input.arrearsCents > 0 && input.penaltyType !== 'NONE') {
    penaltyCents =
      input.penaltyType === 'FIXED'
        ? input.penaltyValueCents
        : percentOfCents(input.arrearsCents, input.penaltyValueCents / 100)
    if (penaltyCents > 0) {
      items.push({
        type: 'PENALTY',
        description: `Late payment penalty on arrears of ${amount(input.arrearsCents)}`,
        quantity: 1,
        unitAmountCents: penaltyCents,
        amountCents: penaltyCents,
      })
    }
  }

  const subtotalCents = items
    .filter((item) => item.type !== 'PENALTY')
    .reduce((total, item) => total + item.amountCents, 0)

  return { items, subtotalCents, penaltyCents, totalCents: subtotalCents + penaltyCents }
}

/** Run the monthly billing engine for one organization. */
export async function runBilling(scope: Scope, options: BillingOptions): Promise<BillingResult> {
  const period = periodFrom(options.year, options.month)
  const issueDate = options.issueDate ?? period.start
  const applyPenalties = options.applyPenalties ?? true
  const prorateFirstMonth = options.prorateFirstMonth ?? true

  return db.transaction(async (tx) => {
    const [run] = await tx
      .insert(billingRuns)
      .values({
        organizationId: scope.organizationId,
        periodYear: period.year,
        periodMonth: period.month,
        label: period.label,
        status: 'RUNNING',
        runById: scope.userId,
        runByName: scope.userName,
      })
      .returning()

    const candidates = await tx
      .select()
      .from(leases)
      .where(
        scoped(
          leases,
          scope,
          inArray(leases.status, ['ACTIVE', 'EXPIRING']),
          lte(leases.startDate, period.end),
          sql`${leases.endDate} >= ${period.start}`,
          options.propertyId ? eq(leases.propertyId, options.propertyId) : undefined,
          options.leaseId ? eq(leases.id, options.leaseId) : undefined,
          options.unitId ? eq(leases.unitId, options.unitId) : undefined,
        ),
      )

    const leaseIds = candidates.map((lease) => lease.id)

    const alreadyBilled = leaseIds.length
      ? await tx
          .select({ leaseId: rentInvoices.leaseId })
          .from(rentInvoices)
          .where(
            scoped(
              rentInvoices,
              scope,
              inArray(rentInvoices.leaseId, leaseIds),
              eq(rentInvoices.periodYear, period.year),
              eq(rentInvoices.periodMonth, period.month),
            ),
          )
      : []
    const billedLeaseIds = new Set(alreadyBilled.map((row) => row.leaseId))

    const chargeRows = leaseIds.length
      ? await tx
          .select()
          .from(leaseCharges)
          .where(
            scoped(
              leaseCharges,
              scope,
              inArray(leaseCharges.leaseId, leaseIds),
              eq(leaseCharges.isActive, true),
              eq(leaseCharges.frequency, 'MONTHLY'),
            ),
          )
      : []

    const arrearsRows = leaseIds.length
      ? await tx
          .select({
            leaseId: rentInvoices.leaseId,
            arrears: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)`,
          })
          .from(rentInvoices)
          .where(
            scoped(
              rentInvoices,
              scope,
              inArray(rentInvoices.leaseId, leaseIds),
              gt(rentInvoices.balance, '0'),
              ne(rentInvoices.status, 'CANCELLED'),
              sql`${rentInvoices.dueDate} < ${period.start}`,
            ),
          )
          .groupBy(rentInvoices.leaseId)
      : []
    const arrearsByLease = new Map(arrearsRows.map((row) => [row.leaseId, cents(row.arrears)]))

    // Shared charges divide across the leases this run will ACTUALLY bill, so
    // a lease already invoiced for the period does not absorb a share that
    // then goes nowhere.
    const billable = candidates.filter((lease) => !billedLeaseIds.has(lease.id))
    const sharesByLease = new Map<string, { label: string; type: PlannedItem['type']; amountCents: number }[]>()
    for (const charge of options.sharedCharges ?? []) {
      const shares = splitCents(charge.totalCents, billable.length)
      billable.forEach((lease, index) => {
        if (shares[index] <= 0) return
        const list = sharesByLease.get(lease.id) ?? []
        list.push({ label: charge.description, type: charge.type, amountCents: shares[index] })
        sharesByLease.set(lease.id, list)
      })
    }

    const created: BillingResult['invoices'] = []
    let skipped = 0
    let totalBilledCents = 0

    for (const lease of candidates) {
      if (billedLeaseIds.has(lease.id)) {
        skipped += 1
        continue
      }

      const extraCharges = chargeRows
        .filter((charge) => charge.leaseId === lease.id)
        .filter((charge) => !charge.startDate || charge.startDate <= period.end)
        .filter((charge) => !charge.endDate || charge.endDate >= period.start)
        .map((charge) => ({
          label: charge.label,
          type: charge.type as PlannedItem['type'],
          amountCents: cents(charge.amount),
        }))
        .concat(sharesByLease.get(lease.id) ?? [])

      const plan = planInvoiceItems({
        period,
        monthlyRentCents: cents(lease.monthlyRent),
        serviceChargeCents: cents(lease.serviceCharge),
        leaseStart: lease.startDate,
        leaseEnd: lease.endDate,
        extraCharges,
        arrearsCents: arrearsByLease.get(lease.id) ?? 0,
        penaltyType: lease.penaltyType as 'NONE' | 'FIXED' | 'PERCENT',
        penaltyValueCents: cents(lease.penaltyValue),
        applyPenalties,
        prorateFirstMonth,
      })

      if (plan.totalCents <= 0) {
        skipped += 1
        continue
      }

      const number = await nextNumber(tx, scope.organizationId, 'invoice', issueDate)
      const dueDate = dueDateFor(period, lease.dueDayOfMonth)

      const [invoice] = await tx
        .insert(rentInvoices)
        .values({
          organizationId: scope.organizationId,
          number,
          leaseId: lease.id,
          tenantId: lease.tenantId,
          propertyId: lease.propertyId,
          unitId: lease.unitId,
          landlordId: await landlordIdForProperty(tx, scope, lease.propertyId),
          periodYear: period.year,
          periodMonth: period.month,
          periodLabel: period.label,
          periodStart: period.start,
          periodEnd: period.end,
          issueDate,
          dueDate,
          subtotal: amount(plan.subtotalCents),
          penaltyAmount: amount(plan.penaltyCents),
          total: amount(plan.totalCents),
          amountPaid: '0',
          balance: amount(plan.totalCents),
          status: 'DUE',
        })
        .returning()

      await tx.insert(invoiceItems).values(
        plan.items.map((item) => ({
          organizationId: scope.organizationId,
          invoiceId: invoice.id,
          type: item.type,
          description: item.description,
          quantity: item.quantity,
          unitAmount: amount(item.unitAmountCents),
          amount: amount(item.amountCents),
        })),
      )

      // Accrue the receivable and the income it represents.
      const rentCents = plan.items
        .filter((item) => item.type === 'RENT')
        .reduce((total, item) => total + item.amountCents, 0)
      const serviceCents = plan.items
        .filter((item) => item.type === 'SERVICE_CHARGE')
        .reduce((total, item) => total + item.amountCents, 0)
      const otherCents = plan.subtotalCents - rentCents - serviceCents

      await postLedgerGroup(tx, scope, {
        sourceType: 'INVOICE',
        sourceId: invoice.id,
        sourceReference: invoice.number,
        transactionDate: issueDate,
        narrative: `${period.label} rent invoice ${invoice.number}`,
        propertyId: lease.propertyId,
        unitId: lease.unitId,
        tenantId: lease.tenantId,
        landlordId: invoice.landlordId,
        lines: [
          { account: 'RENT_RECEIVABLE', entryType: 'DEBIT', amountCents: plan.totalCents },
          { account: 'RENT_INCOME', entryType: 'CREDIT', amountCents: rentCents + otherCents },
          { account: 'SERVICE_CHARGE_INCOME', entryType: 'CREDIT', amountCents: serviceCents },
          { account: 'PENALTY_INCOME', entryType: 'CREDIT', amountCents: plan.penaltyCents },
        ],
      })

      await audit(tx, scope, {
        action: 'Invoice Generated',
        entityType: 'RentInvoice',
        entityId: invoice.id,
        reference: invoice.number,
        newValue: { total: invoice.total, period: period.label, lease: lease.code },
      })

      created.push({ id: invoice.id, number: invoice.number, leaseId: lease.id, totalCents: plan.totalCents })
      totalBilledCents += plan.totalCents
    }

    await tx
      .update(billingRuns)
      .set({
        invoicesCreated: created.length,
        invoicesSkipped: skipped,
        totalBilled: amount(totalBilledCents),
        status: 'COMPLETED',
        completedAt: new Date(),
        message: `${created.length} invoices raised for ${period.label}.`,
      })
      .where(eq(billingRuns.id, run.id))

    await audit(tx, scope, {
      action: 'Billing Run Completed',
      entityType: 'BillingRun',
      entityId: run.id,
      reference: period.label,
      newValue: { created: created.length, skipped, totalBilled: amount(totalBilledCents) },
    })

    return {
      runId: run.id,
      period,
      invoicesCreated: created.length,
      invoicesSkipped: skipped,
      totalBilledCents,
      invoices: created,
    }
  })
}

const landlordCache = new Map<string, string>()

async function landlordIdForProperty(tx: Tx, scope: Scope, propertyId: string): Promise<string> {
  const cacheKey = `${scope.organizationId}:${propertyId}`
  const cached = landlordCache.get(cacheKey)
  if (cached) return cached
  const rows = await tx.execute(
    sql`select landlord_id from properties where id = ${propertyId} and organization_id = ${scope.organizationId} limit 1`,
  )
  const row = (rows.rows?.[0] ?? (rows as unknown as { landlord_id: string }[])[0]) as
    | { landlord_id: string }
    | undefined
  if (!row) throw new Error(`Property ${propertyId} not found in this organization.`)
  landlordCache.set(cacheKey, row.landlord_id)
  return row.landlord_id
}

/**
 * Move DUE invoices past their grace period into OVERDUE. Run nightly.
 */
export async function markOverdueInvoices(scope: Scope, asOf: Date = new Date()) {
  const result = await db
    .update(rentInvoices)
    .set({ status: 'OVERDUE', updatedAt: new Date() })
    .where(
      scoped(
        rentInvoices,
        scope,
        inArray(rentInvoices.status, ['DUE', 'PARTIALLY_PAID']),
        gt(rentInvoices.balance, '0'),
        sql`${rentInvoices.dueDate} < ${asOf}`,
      ),
    )
    .returning({ id: rentInvoices.id })
  return result.length
}

export { and }
