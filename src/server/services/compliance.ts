// ===========================================================================
//  KRA eRITS compliance engine (spec §22–§28)
//
//      M-PESA RENT PAYMENTS → RECONCILIATION → CONFIRMED RENT RECEIVED
//      → PROPERTY LEDGER → LANDLORD RENTAL INCOME
//      → MONTHLY AGGREGATION → COMPLIANCE ENGINE → eRITS REVIEW
//      → SUBMIT / EXPORT → STATUS TRACKING → AUDIT LOG
//
//  Rental income is aggregated from payments that were actually RECEIVED and
//  CONFIRMED — never from invoices raised — because rental income tax is
//  assessed on income received.
//
//  Tax rates are never hard-coded. They come from the configurable `tax_rules`
//  table, because Kenyan rates and thresholds change.
// ===========================================================================

import { and, desc, eq, isNull, ne, or, sql } from 'drizzle-orm'
import {
  complianceExceptions,
  eritsPeriodProperties,
  eritsPeriods,
  eritsProperties,
  eritsSubmissions,
  eritsSyncLogs,
  landlords,
  payments,
  properties,
  taxRules,
} from '@/db/schema'
import { db, type Tx } from '@/db'
import { amount, cents, num, percentOfCents, rateValue } from '@/lib/money'
import { periodFrom } from '@/lib/dates'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { getTaxProvider } from '../adapters'
import { nextNumber } from './numbering'

// ---------------------------------------------------------------------------
// Tax rules
// ---------------------------------------------------------------------------

export interface TaxRuleCandidate {
  id: string
  name: string
  rate: number
  thresholdMinCents: number | null
  thresholdMaxCents: number | null
  propertyType: string | null
  taxpayerType: string
  effectiveFrom: Date
}

/**
 * Pure selection: most specific applicable rule wins, then the most recently
 * effective. Exposed separately so rule precedence is unit-tested.
 */
export function selectTaxRule(
  candidates: TaxRuleCandidate[],
  context: {
    taxpayerType: string
    propertyType?: string | null
    /**
     * The figure the rule's thresholds are measured against. Kenyan rental
     * income bands are annual, so the caller passes annualised income here
     * while the resolved rate is applied to the period's taxable amount.
     */
    thresholdBasisCents: number
  },
): TaxRuleCandidate | null {
  const applicable = candidates.filter((rule) => {
    if (rule.taxpayerType !== 'ANY' && rule.taxpayerType !== context.taxpayerType) return false
    // A rule scoped to a property type only applies when that type is known.
    if (rule.propertyType && rule.propertyType !== context.propertyType) return false
    if (rule.thresholdMinCents !== null && context.thresholdBasisCents < rule.thresholdMinCents) return false
    if (rule.thresholdMaxCents !== null && context.thresholdBasisCents > rule.thresholdMaxCents) return false
    return true
  })

  if (applicable.length === 0) return null

  applicable.sort((a, b) => {
    const specificity = (rule: TaxRuleCandidate) =>
      (rule.propertyType ? 2 : 0) + (rule.taxpayerType !== 'ANY' ? 1 : 0)
    const bySpecificity = specificity(b) - specificity(a)
    if (bySpecificity !== 0) return bySpecificity
    return b.effectiveFrom.getTime() - a.effectiveFrom.getTime()
  })

  return applicable[0]
}

export async function loadTaxRules(tx: Tx, scope: Scope, at: Date): Promise<TaxRuleCandidate[]> {
  const rows = await tx
    .select()
    .from(taxRules)
    .where(
      and(
        or(eq(taxRules.organizationId, scope.organizationId), isNull(taxRules.organizationId)),
        eq(taxRules.isActive, true),
        sql`${taxRules.effectiveFrom} <= ${at}`,
        or(isNull(taxRules.effectiveUntil), sql`${taxRules.effectiveUntil} >= ${at}`),
      ),
    )
    .orderBy(desc(taxRules.effectiveFrom))

  return rows.map((rule) => ({
    id: rule.id,
    name: rule.name,
    rate: rateValue(rule.rate),
    thresholdMinCents: rule.thresholdMin === null ? null : cents(rule.thresholdMin),
    thresholdMaxCents: rule.thresholdMax === null ? null : cents(rule.thresholdMax),
    propertyType: rule.propertyType,
    taxpayerType: rule.taxpayerType,
    effectiveFrom: rule.effectiveFrom,
  }))
}

// ---------------------------------------------------------------------------
// Property ↔ landlord ↔ KRA PIN ↔ eRITS mapping (spec §23)
// ---------------------------------------------------------------------------

export async function syncPropertyMapping(scope: Scope, propertyId: string) {
  const started = Date.now()

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        property: properties,
        landlord: landlords,
      })
      .from(properties)
      .innerJoin(landlords, eq(landlords.id, properties.landlordId))
      .where(scoped(properties, scope, eq(properties.id, propertyId)))
      .limit(1)

    if (!row) throw new Error('Property not found in this organization.')
    const { property, landlord } = row

    const kraPin = property.kraPin ?? landlord.kraPin ?? ''
    const estimatedAnnualRentCents = cents(property.expectedMonthlyRent) * 12

    const result = await getTaxProvider().registerProperty({
      kraPin,
      propertyName: property.name,
      propertyType: property.type,
      county: property.county,
      town: property.town,
      unitCount: property.unitCount,
      estimatedAnnualRentCents,
    })

    const existing = await tx
      .select()
      .from(eritsProperties)
      .where(scoped(eritsProperties, scope, eq(eritsProperties.propertyId, propertyId)))
      .limit(1)
      .then((rows) => rows[0])

    const values = {
      organizationId: scope.organizationId,
      propertyId,
      landlordId: property.landlordId,
      kraPin: kraPin || null,
      eritsPropertyRef: result.propertyRef ?? existing?.eritsPropertyRef ?? property.eritsPropertyRef ?? null,
      propertyType: property.type,
      county: property.county,
      town: property.town,
      unitCount: property.unitCount,
      estimatedAnnualRent: amount(estimatedAnnualRentCents),
      registrationStatus: result.status,
      lastSyncedAt: new Date(),
      lastSyncStatus: result.success ? ('SUCCESS' as const) : ('FAILED' as const),
      notes: result.message,
      updatedAt: new Date(),
    }

    if (existing) {
      await tx.update(eritsProperties).set(values).where(eq(eritsProperties.id, existing.id))
    } else {
      await tx.insert(eritsProperties).values(values)
    }

    if (result.propertyRef) {
      await tx
        .update(properties)
        .set({ eritsPropertyRef: result.propertyRef, updatedAt: new Date() })
        .where(scoped(properties, scope, eq(properties.id, propertyId)))
    }

    await tx.insert(eritsSyncLogs).values({
      organizationId: scope.organizationId,
      propertyId,
      operation: 'registerProperty',
      status: result.success ? 'SUCCESS' : 'FAILED',
      message: result.message,
      request: { kraPin, propertyName: property.name, unitCount: property.unitCount },
      response: result as unknown as object,
      durationMs: Date.now() - started,
    })

    await audit(tx, scope, {
      action: 'eRITS Mapping Updated',
      entityType: 'Property',
      entityId: propertyId,
      reference: property.code,
      newValue: { status: result.status, propertyRef: result.propertyRef },
    })

    return result
  })
}

// ---------------------------------------------------------------------------
// Monthly rental income aggregation (spec §25, §26)
// ---------------------------------------------------------------------------

export interface PeriodBuildResult {
  periodId: string
  label: string
  landlordId: string
  grossRentalIncomeCents: number
  taxableAmountCents: number
  taxAmountCents: number
  taxRate: number
  taxRuleName: string | null
  propertyCount: number
  paymentCount: number
  unreconciledCount: number
  exceptionCount: number
  status: 'OPEN' | 'READY_FOR_REVIEW' | 'UNDER_REVIEW' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED'
}

export async function buildPeriodForLandlord(
  scope: Scope,
  landlordId: string,
  year: number,
  month: number,
): Promise<PeriodBuildResult> {
  const period = periodFrom(year, month)

  return db.transaction(async (tx) => {
    const landlord = await tx
      .select()
      .from(landlords)
      .where(scoped(landlords, scope, eq(landlords.id, landlordId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(landlord, scope, 'landlord')

    // Income actually received and confirmed in the period, by property.
    const byProperty = await tx
      .select({
        propertyId: payments.propertyId,
        gross: sql<string>`coalesce(sum(${payments.grossAmount}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(payments)
      .where(
        scoped(
          payments,
          scope,
          eq(payments.landlordId, landlordId),
          eq(payments.status, 'CONFIRMED'),
          sql`${payments.paidAt} >= ${period.start}`,
          sql`${payments.paidAt} <= ${period.end}`,
        ),
      )
      .groupBy(payments.propertyId)

    const grossRentalIncomeCents = byProperty.reduce((total, row) => total + cents(row.gross), 0)
    const paymentCount = byProperty.reduce((total, row) => total + row.count, 0)

    const [{ count: unreconciledCount } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(payments)
      .where(
        scoped(
          payments,
          scope,
          or(eq(payments.status, 'UNMATCHED'), eq(payments.reconciliationStatus, 'EXCEPTION')) as never,
          sql`${payments.paidAt} >= ${period.start}`,
          sql`${payments.paidAt} <= ${period.end}`,
        ),
      )

    const [{ count: exceptionCount } = { count: 0 }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(complianceExceptions)
      .where(
        scoped(
          complianceExceptions,
          scope,
          eq(complianceExceptions.landlordId, landlordId),
          eq(complianceExceptions.status, 'OPEN'),
        ),
      )

    // Resolve the tax rule from configuration — never a literal in code.
    const rules = await loadTaxRules(tx, scope, period.end)
    // Thresholds are annual; the resolved rate applies to the month's income.
    const rule = selectTaxRule(rules, {
      taxpayerType: landlord.taxpayerType,
      propertyType: null,
      thresholdBasisCents: grossRentalIncomeCents * 12,
    })

    const allowableDeductionsCents = 0
    const taxableAmountCents = grossRentalIncomeCents - allowableDeductionsCents
    const taxRate = rule?.rate ?? 0
    const taxAmountCents = rule ? percentOfCents(taxableAmountCents, taxRate) : 0

    const readyForReview =
      grossRentalIncomeCents > 0 && unreconciledCount === 0 && exceptionCount === 0 && Boolean(landlord.kraPin)

    const existing = await tx
      .select()
      .from(eritsPeriods)
      .where(
        scoped(
          eritsPeriods,
          scope,
          eq(eritsPeriods.landlordId, landlordId),
          eq(eritsPeriods.periodYear, year),
          eq(eritsPeriods.periodMonth, month),
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    // Never rewind a period that has already been submitted.
    const locked = existing && ['SUBMITTED', 'ACCEPTED'].includes(existing.status)
    const status = locked
      ? (existing!.status as PeriodBuildResult['status'])
      : readyForReview
        ? 'READY_FOR_REVIEW'
        : 'OPEN'

    const values = {
      organizationId: scope.organizationId,
      landlordId,
      periodYear: year,
      periodMonth: month,
      label: period.label,
      grossRentalIncome: amount(grossRentalIncomeCents),
      allowableDeductions: amount(allowableDeductionsCents),
      taxableAmount: amount(taxableAmountCents),
      taxRuleId: rule?.id ?? null,
      taxRuleName: rule?.name ?? null,
      taxRate: String(taxRate),
      taxAmount: amount(taxAmountCents),
      propertyCount: byProperty.length,
      paymentCount,
      unreconciledCount,
      exceptionCount,
      status,
      updatedAt: new Date(),
    }

    let periodId: string
    if (existing) {
      await tx.update(eritsPeriods).set(values).where(eq(eritsPeriods.id, existing.id))
      periodId = existing.id
    } else {
      const [inserted] = await tx.insert(eritsPeriods).values(values).returning({ id: eritsPeriods.id })
      periodId = inserted.id
    }

    await tx
      .delete(eritsPeriodProperties)
      .where(scoped(eritsPeriodProperties, scope, eq(eritsPeriodProperties.periodId, periodId)))

    if (byProperty.length > 0) {
      await tx.insert(eritsPeriodProperties).values(
        byProperty
          .filter((row) => row.propertyId)
          .map((row) => ({
            organizationId: scope.organizationId,
            periodId,
            propertyId: row.propertyId!,
            grossRentalIncome: amount(cents(row.gross)),
            paymentCount: row.count,
          })),
      )
    }

    return {
      periodId,
      label: period.label,
      landlordId,
      grossRentalIncomeCents,
      taxableAmountCents,
      taxAmountCents,
      taxRate,
      taxRuleName: rule?.name ?? null,
      propertyCount: byProperty.length,
      paymentCount,
      unreconciledCount,
      exceptionCount,
      status,
    }
  })
}

/** Rebuild every landlord's period — the monthly close. */
export async function buildAllPeriods(scope: Scope, year: number, month: number) {
  const rows = await db
    .select({ id: landlords.id })
    .from(landlords)
    .where(scoped(landlords, scope, eq(landlords.isActive, true)))

  const results: PeriodBuildResult[] = []
  for (const landlord of rows) {
    results.push(await buildPeriodForLandlord(scope, landlord.id, year, month))
  }
  return results
}

// ---------------------------------------------------------------------------
// Submission (spec §26) — always simulated in Phase 1
// ---------------------------------------------------------------------------

export async function submitPeriod(scope: Scope, periodId: string) {
  const period = await db
    .select()
    .from(eritsPeriods)
    .where(scoped(eritsPeriods, scope, eq(eritsPeriods.id, periodId)))
    .limit(1)
    .then((rows) => rows[0])
  assertInScope(period, scope, 'eRITS period')

  if (period.status === 'SUBMITTED' || period.status === 'ACCEPTED') {
    throw new Error(`${period.label} has already been submitted.`)
  }

  const landlord = await db
    .select()
    .from(landlords)
    .where(scoped(landlords, scope, eq(landlords.id, period.landlordId)))
    .limit(1)
    .then((rows) => rows[0])

  const breakdown = await db
    .select({
      propertyName: properties.name,
      propertyRef: eritsProperties.eritsPropertyRef,
      gross: eritsPeriodProperties.grossRentalIncome,
      paymentCount: eritsPeriodProperties.paymentCount,
    })
    .from(eritsPeriodProperties)
    .innerJoin(properties, eq(properties.id, eritsPeriodProperties.propertyId))
    .leftJoin(eritsProperties, eq(eritsProperties.propertyId, eritsPeriodProperties.propertyId))
    .where(scoped(eritsPeriodProperties, scope, eq(eritsPeriodProperties.periodId, periodId)))

  const payload = {
    kraPin: landlord?.kraPin ?? '',
    taxpayerName: landlord?.companyName ?? landlord?.fullName ?? '',
    periodYear: period.periodYear,
    periodMonth: period.periodMonth,
    grossRentalIncomeCents: cents(period.grossRentalIncome),
    allowableDeductionsCents: cents(period.allowableDeductions),
    taxableAmountCents: cents(period.taxableAmount),
    taxRate: rateValue(period.taxRate),
    taxPayableCents: cents(period.taxAmount),
    properties: breakdown.map((row) => ({
      propertyRef: row.propertyRef,
      propertyName: row.propertyName,
      grossRentalIncomeCents: cents(row.gross),
      paymentCount: row.paymentCount,
    })),
  }

  const started = Date.now()
  const result = await getTaxProvider().submitReturn(payload)

  return db.transaction(async (tx) => {
    const reference = await nextNumber(tx, scope.organizationId, 'erits_submission')

    const [submission] = await tx
      .insert(eritsSubmissions)
      .values({
        organizationId: scope.organizationId,
        periodId,
        landlordId: period.landlordId,
        reference,
        mode: result.mode,
        payload: payload as unknown as object,
        status: result.status,
        acknowledgementRef: result.acknowledgementRef,
        responseMessage: result.message,
        acknowledgedAt: result.success ? new Date() : null,
        submittedById: scope.userId,
        submittedByName: scope.userName,
      })
      .returning()

    await tx
      .update(eritsPeriods)
      .set({
        status: result.success ? 'SUBMITTED' : 'REJECTED',
        preparedById: scope.userId,
        preparedByName: scope.userName,
        preparedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(scoped(eritsPeriods, scope, eq(eritsPeriods.id, periodId)))

    await tx.insert(eritsSyncLogs).values({
      organizationId: scope.organizationId,
      periodId,
      operation: 'submitReturn',
      status: result.success ? 'SUCCESS' : 'FAILED',
      message: result.message,
      request: payload as unknown as object,
      response: result as unknown as object,
      durationMs: Date.now() - started,
    })

    await audit(tx, scope, {
      action: 'eRITS Submission Simulated',
      entityType: 'EritsPeriod',
      entityId: periodId,
      reference: submission.reference,
      newValue: {
        mode: result.mode,
        status: result.status,
        gross: period.grossRentalIncome,
        tax: period.taxAmount,
      },
    })

    return { submission, result }
  })
}

// ---------------------------------------------------------------------------
// Compliance exception detection (spec §28)
// ---------------------------------------------------------------------------

export interface DetectedException {
  code: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  entityType: string
  entityId: string
  propertyId?: string | null
  landlordId?: string | null
  paymentId?: string | null
  title: string
  detail: string
  recommendedAction: string
}

export async function detectComplianceExceptions(scope: Scope): Promise<DetectedException[]> {
  const found: DetectedException[] = []

  const landlordRows = await db
    .select()
    .from(landlords)
    .where(scoped(landlords, scope, eq(landlords.isActive, true)))

  for (const landlord of landlordRows) {
    if (!landlord.kraPin) {
      found.push({
        code: 'LANDLORD_MISSING_KRA_PIN',
        severity: 'HIGH',
        entityType: 'Landlord',
        entityId: landlord.id,
        landlordId: landlord.id,
        title: 'Landlord has no KRA PIN on file',
        detail: `${landlord.companyName ?? landlord.fullName} cannot be included in an eRITS return without a KRA PIN.`,
        recommendedAction: 'Capture the landlord’s KRA PIN on their profile.',
      })
    }
  }

  const propertyRows = await db
    .select({
      property: properties,
      erits: eritsProperties,
      landlord: landlords,
    })
    .from(properties)
    .innerJoin(landlords, eq(landlords.id, properties.landlordId))
    .leftJoin(eritsProperties, eq(eritsProperties.propertyId, properties.id))
    .where(scoped(properties, scope, ne(properties.status, 'ARCHIVED')))

  for (const row of propertyRows) {
    if (!row.erits) {
      found.push({
        code: 'PROPERTY_NOT_MAPPED',
        severity: 'HIGH',
        entityType: 'Property',
        entityId: row.property.id,
        propertyId: row.property.id,
        landlordId: row.property.landlordId,
        title: 'Property is not mapped to eRITS',
        detail: `${row.property.name} has no eRITS mapping record, so its rental income cannot be reported.`,
        recommendedAction: 'Complete property mapping from the KRA eRITS screen.',
      })
      continue
    }
    if (!row.erits.eritsPropertyRef) {
      found.push({
        code: 'PROPERTY_MISSING_ERITS_REF',
        severity: 'HIGH',
        entityType: 'Property',
        entityId: row.property.id,
        propertyId: row.property.id,
        landlordId: row.property.landlordId,
        title: 'eRITS property reference missing',
        detail: `${row.property.name} has been mapped but no eRITS property reference has been issued.`,
        recommendedAction: 'Complete Property Mapping',
      })
    }
    if (!row.property.kraPin && !row.landlord.kraPin) {
      found.push({
        code: 'PROPERTY_MISSING_KRA_PIN',
        severity: 'MEDIUM',
        entityType: 'Property',
        entityId: row.property.id,
        propertyId: row.property.id,
        landlordId: row.property.landlordId,
        title: 'Property has no KRA PIN mapping',
        detail: `Neither ${row.property.name} nor its landlord carries a KRA PIN.`,
        recommendedAction: 'Record the KRA PIN on the property or the landlord.',
      })
    }
  }

  const unmatched = await db
    .select()
    .from(payments)
    .where(scoped(payments, scope, eq(payments.status, 'UNMATCHED')))

  for (const payment of unmatched) {
    found.push({
      code: 'PAYMENT_UNMATCHED',
      severity: 'HIGH',
      entityType: 'Payment',
      entityId: payment.id,
      paymentId: payment.id,
      title: 'Payment not reconciled',
      detail: `${payment.reference} of ${amount(cents(payment.grossAmount))} has not been matched to a tenant.`,
      recommendedAction: 'Reconcile the payment from the Payments screen.',
    })
  }

  const reversed = await db
    .select()
    .from(payments)
    .where(scoped(payments, scope, eq(payments.status, 'REVERSED')))

  for (const payment of reversed) {
    found.push({
      code: 'PAYMENT_REVERSED',
      severity: 'MEDIUM',
      entityType: 'Payment',
      entityId: payment.id,
      paymentId: payment.id,
      landlordId: payment.landlordId,
      title: 'Reversed transaction in the reporting window',
      detail: `${payment.reference} was reversed: ${payment.reversalReason ?? 'no reason recorded'}.`,
      recommendedAction: 'Confirm the reversal is reflected in the affected tax period.',
    })
  }

  const duplicates = await db
    .select({
      externalReference: payments.externalReference,
      count: sql<number>`count(*)::int`,
      ids: sql<string>`string_agg(${payments.id}, ',')`,
    })
    .from(payments)
    .where(scoped(payments, scope, sql`${payments.externalReference} is not null`))
    .groupBy(payments.externalReference)
    .having(sql`count(*) > 1`)

  for (const duplicate of duplicates) {
    const [firstId] = duplicate.ids.split(',')
    found.push({
      code: 'PAYMENT_DUPLICATE_REFERENCE',
      severity: 'CRITICAL',
      entityType: 'Payment',
      entityId: firstId,
      title: 'Duplicate transaction reference',
      detail: `${duplicate.count} payments share the provider reference ${duplicate.externalReference}.`,
      recommendedAction: 'Reverse the duplicate receipt so rental income is not overstated.',
    })
  }

  return found
}

/** Persist detected exceptions, leaving already-resolved ones alone. */
export async function refreshComplianceExceptions(scope: Scope) {
  const detected = await detectComplianceExceptions(scope)

  await db.transaction(async (tx) => {
    for (const exception of detected) {
      await tx
        .insert(complianceExceptions)
        .values({
          organizationId: scope.organizationId,
          code: exception.code,
          severity: exception.severity,
          entityType: exception.entityType,
          entityId: exception.entityId,
          propertyId: exception.propertyId ?? null,
          landlordId: exception.landlordId ?? null,
          paymentId: exception.paymentId ?? null,
          title: exception.title,
          detail: exception.detail,
          recommendedAction: exception.recommendedAction,
          status: 'OPEN',
        })
        .onConflictDoUpdate({
          target: [
            complianceExceptions.organizationId,
            complianceExceptions.code,
            complianceExceptions.entityType,
            complianceExceptions.entityId,
          ],
          set: { detail: exception.detail, severity: exception.severity, updatedAt: new Date() },
        })
    }
  })

  return detected.length
}

export async function resolveException(scope: Scope, exceptionId: string, note?: string) {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(complianceExceptions)
      .set({
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedById: scope.userId,
        resolvedByName: scope.userName,
        detail: note ? `${note}` : undefined,
        updatedAt: new Date(),
      })
      .where(scoped(complianceExceptions, scope, eq(complianceExceptions.id, exceptionId)))
      .returning()

    if (updated) {
      await audit(tx, scope, {
        action: 'Compliance Exception Resolved',
        entityType: 'ComplianceException',
        entityId: exceptionId,
        reference: updated.code,
        newValue: { status: 'RESOLVED', note: note ?? null },
      })
    }
    return updated
  })
}
