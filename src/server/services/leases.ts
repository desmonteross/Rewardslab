// ===========================================================================
//  Lease lifecycle (spec §11)
//
//  Renew, terminate, transfer and move-out. Each one keeps the unit, the
//  tenant and the lease in agreement with one another, and leaves an audit
//  entry behind.
// ===========================================================================

import { addMonths, addYears } from 'date-fns'
import { eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { leases, moveEvents, rentInvoices, tenants, units } from '@/db/schema'
import { amount, cents, percentOfCents, rateValue } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { nextNumber } from './numbering'

export async function renewLease(
  scope: Scope,
  leaseId: string,
  options: { months?: number; applyEscalation?: boolean; newRentCents?: number } = {},
) {
  const months = options.months ?? 12

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(leases)
      .where(scoped(leases, scope, eq(leases.id, leaseId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(existing, scope, 'lease')

    const currentRentCents = cents(existing.monthlyRent)
    const escalation = rateValue(existing.escalationPercent)
    const renewedRentCents =
      options.newRentCents ??
      (options.applyEscalation !== false && escalation > 0
        ? currentRentCents + percentOfCents(currentRentCents, escalation)
        : currentRentCents)

    const startDate = new Date(existing.endDate.getTime() + 86_400_000)
    const endDate = addMonths(startDate, months)
    const code = await nextNumber(tx, scope.organizationId, 'lease')

    const [renewal] = await tx
      .insert(leases)
      .values({
        organizationId: scope.organizationId,
        code,
        tenantId: existing.tenantId,
        propertyId: existing.propertyId,
        unitId: existing.unitId,
        startDate,
        endDate,
        monthlyRent: amount(renewedRentCents),
        deposit: existing.deposit,
        serviceCharge: existing.serviceCharge,
        dueDayOfMonth: existing.dueDayOfMonth,
        gracePeriodDays: existing.gracePeriodDays,
        penaltyType: existing.penaltyType,
        penaltyValue: existing.penaltyValue,
        escalationPercent: existing.escalationPercent,
        escalationMonths: existing.escalationMonths,
        noticePeriodDays: existing.noticePeriodDays,
        status: 'ACTIVE',
        moveInDate: existing.moveInDate,
        renewedFromId: existing.id,
      })
      .returning()

    await tx
      .update(leases)
      .set({ status: 'RENEWED', updatedAt: new Date() })
      .where(scoped(leases, scope, eq(leases.id, leaseId)))

    await tx
      .update(units)
      .set({ currentLeaseId: renewal.id, monthlyRent: amount(renewedRentCents), updatedAt: new Date() })
      .where(scoped(units, scope, eq(units.id, existing.unitId)))

    await audit(tx, scope, {
      action: 'Lease Renewed',
      entityType: 'Lease',
      entityId: renewal.id,
      reference: renewal.code,
      previousValue: { lease: existing.code, rent: existing.monthlyRent, endDate: existing.endDate },
      newValue: { rent: renewal.monthlyRent, startDate, endDate },
    })

    return renewal
  })
}

export async function terminateLease(
  scope: Scope,
  leaseId: string,
  options: { reason: string; effectiveDate?: Date; scheduleMoveOut?: boolean },
) {
  const effectiveDate = options.effectiveDate ?? new Date()

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(leases)
      .where(scoped(leases, scope, eq(leases.id, leaseId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(existing, scope, 'lease')

    const [updated] = await tx
      .update(leases)
      .set({
        status: 'TERMINATED',
        terminationReason: options.reason,
        moveOutDate: effectiveDate,
        updatedAt: new Date(),
      })
      .where(scoped(leases, scope, eq(leases.id, leaseId)))
      .returning()

    if (options.scheduleMoveOut !== false) {
      await tx.insert(moveEvents).values({
        organizationId: scope.organizationId,
        type: 'MOVE_OUT',
        leaseId,
        tenantId: existing.tenantId,
        propertyId: existing.propertyId,
        unitId: existing.unitId,
        scheduledDate: effectiveDate,
        status: 'SCHEDULED',
        depositHeld: existing.deposit,
        handledById: scope.userId,
        handledByName: scope.userName,
      })
    }

    await tx
      .update(tenants)
      .set({ status: 'NOTICE', updatedAt: new Date() })
      .where(scoped(tenants, scope, eq(tenants.id, existing.tenantId)))

    await audit(tx, scope, {
      action: 'Lease Terminated',
      entityType: 'Lease',
      entityId: leaseId,
      reference: existing.code,
      previousValue: { status: existing.status },
      newValue: { status: 'TERMINATED', reason: options.reason, effectiveDate },
    })

    return updated
  })
}

/**
 * Complete a scheduled move-out: settle the deposit against any arrears and
 * release the unit back to the vacant pool.
 */
export async function completeMoveOut(
  scope: Scope,
  moveEventId: string,
  options: { deductionsCents?: number; inspectionNotes?: string } = {},
) {
  return db.transaction(async (tx) => {
    const move = await tx
      .select()
      .from(moveEvents)
      .where(scoped(moveEvents, scope, eq(moveEvents.id, moveEventId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(move, scope, 'move event')

    const [arrears] = await tx
      .select({ balance: sql<string>`coalesce(sum(${rentInvoices.balance}), 0)` })
      .from(rentInvoices)
      .where(scoped(rentInvoices, scope, eq(rentInvoices.tenantId, move.tenantId)))

    const depositCents = cents(move.depositHeld)
    const deductionsCents = Math.min(depositCents, (options.deductionsCents ?? 0) + cents(arrears?.balance))
    const refundCents = Math.max(0, depositCents - deductionsCents)

    const [updated] = await tx
      .update(moveEvents)
      .set({
        status: 'COMPLETED',
        completedDate: new Date(),
        deductions: amount(deductionsCents),
        depositRefunded: amount(refundCents),
        inspectionNotes: options.inspectionNotes ?? move.inspectionNotes,
        handledById: scope.userId,
        handledByName: scope.userName,
        updatedAt: new Date(),
      })
      .where(scoped(moveEvents, scope, eq(moveEvents.id, moveEventId)))
      .returning()

    await tx
      .update(units)
      .set({ status: 'VACANT', currentLeaseId: null, currentTenantId: null, updatedAt: new Date() })
      .where(scoped(units, scope, eq(units.id, move.unitId)))

    await tx
      .update(tenants)
      .set({ status: 'VACATED', updatedAt: new Date() })
      .where(scoped(tenants, scope, eq(tenants.id, move.tenantId)))

    await tx
      .update(leases)
      .set({ status: 'TERMINATED', moveOutDate: new Date(), updatedAt: new Date() })
      .where(scoped(leases, scope, eq(leases.id, move.leaseId)))

    await audit(tx, scope, {
      action: 'Move Out Completed',
      entityType: 'MoveEvent',
      entityId: moveEventId,
      newValue: {
        deposit: move.depositHeld,
        deductions: amount(deductionsCents),
        refunded: amount(refundCents),
      },
    })

    return { move: updated, depositCents, deductionsCents, refundCents }
  })
}

export async function completeMoveIn(scope: Scope, moveEventId: string, notes?: string) {
  return db.transaction(async (tx) => {
    const move = await tx
      .select()
      .from(moveEvents)
      .where(scoped(moveEvents, scope, eq(moveEvents.id, moveEventId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(move, scope, 'move event')

    const [updated] = await tx
      .update(moveEvents)
      .set({
        status: 'COMPLETED',
        completedDate: new Date(),
        inspectionNotes: notes ?? move.inspectionNotes,
        handledById: scope.userId,
        handledByName: scope.userName,
        updatedAt: new Date(),
      })
      .where(scoped(moveEvents, scope, eq(moveEvents.id, moveEventId)))
      .returning()

    await tx
      .update(units)
      .set({ status: 'OCCUPIED', currentLeaseId: move.leaseId, currentTenantId: move.tenantId, updatedAt: new Date() })
      .where(scoped(units, scope, eq(units.id, move.unitId)))

    await audit(tx, scope, {
      action: 'Move In Completed',
      entityType: 'MoveEvent',
      entityId: moveEventId,
      newValue: { unitId: move.unitId, tenantId: move.tenantId },
    })

    return updated
  })
}

/** Move a tenant to a different unit, closing the old lease and opening a new one. */
export async function transferTenant(
  scope: Scope,
  leaseId: string,
  options: { toUnitId: string; effectiveDate?: Date; monthlyRentCents?: number },
) {
  const effectiveDate = options.effectiveDate ?? new Date()

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(leases)
      .where(scoped(leases, scope, eq(leases.id, leaseId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(existing, scope, 'lease')

    const target = await tx
      .select()
      .from(units)
      .where(scoped(units, scope, eq(units.id, options.toUnitId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(target, scope, 'unit')

    if (target.status === 'OCCUPIED') {
      throw new Error(`Unit ${target.unitNumber} is already occupied.`)
    }

    const code = await nextNumber(tx, scope.organizationId, 'lease')
    const rentCents = options.monthlyRentCents ?? cents(target.monthlyRent)

    const [created] = await tx
      .insert(leases)
      .values({
        organizationId: scope.organizationId,
        code,
        tenantId: existing.tenantId,
        propertyId: target.propertyId,
        unitId: target.id,
        startDate: effectiveDate,
        endDate: addYears(effectiveDate, 1),
        monthlyRent: amount(rentCents),
        deposit: existing.deposit,
        serviceCharge: target.serviceCharge,
        dueDayOfMonth: existing.dueDayOfMonth,
        gracePeriodDays: existing.gracePeriodDays,
        penaltyType: existing.penaltyType,
        penaltyValue: existing.penaltyValue,
        escalationPercent: existing.escalationPercent,
        escalationMonths: existing.escalationMonths,
        noticePeriodDays: existing.noticePeriodDays,
        status: 'ACTIVE',
        moveInDate: effectiveDate,
      })
      .returning()

    await tx
      .update(leases)
      .set({ status: 'TERMINATED', moveOutDate: effectiveDate, terminationReason: 'Transferred to another unit', updatedAt: new Date() })
      .where(scoped(leases, scope, eq(leases.id, leaseId)))

    await tx
      .update(units)
      .set({ status: 'VACANT', currentLeaseId: null, currentTenantId: null, updatedAt: new Date() })
      .where(scoped(units, scope, eq(units.id, existing.unitId)))

    await tx
      .update(units)
      .set({ status: 'OCCUPIED', currentLeaseId: created.id, currentTenantId: existing.tenantId, updatedAt: new Date() })
      .where(scoped(units, scope, eq(units.id, target.id)))

    await tx.insert(moveEvents).values([
      {
        organizationId: scope.organizationId,
        type: 'MOVE_OUT',
        leaseId,
        tenantId: existing.tenantId,
        propertyId: existing.propertyId,
        unitId: existing.unitId,
        scheduledDate: effectiveDate,
        completedDate: effectiveDate,
        status: 'COMPLETED',
        inspectionNotes: 'Transferred to another unit',
        handledByName: scope.userName,
      },
      {
        organizationId: scope.organizationId,
        type: 'MOVE_IN',
        leaseId: created.id,
        tenantId: existing.tenantId,
        propertyId: target.propertyId,
        unitId: target.id,
        scheduledDate: effectiveDate,
        completedDate: effectiveDate,
        status: 'COMPLETED',
        depositHeld: existing.deposit,
        handledByName: scope.userName,
      },
    ])

    await audit(tx, scope, {
      action: 'Lease Updated',
      entityType: 'Lease',
      entityId: created.id,
      reference: created.code,
      previousValue: { lease: existing.code, unitId: existing.unitId },
      newValue: { unitId: target.id, rent: created.monthlyRent },
    })

    return created
  })
}

/** Nightly housekeeping: flag leases inside their notice window. */
export async function refreshLeaseStatuses(scope: Scope, asOf: Date = new Date()) {
  const expiring = await db
    .update(leases)
    .set({ status: 'EXPIRING', updatedAt: new Date() })
    .where(
      scoped(
        leases,
        scope,
        eq(leases.status, 'ACTIVE'),
        sql`${leases.endDate} <= ${new Date(asOf.getTime() + 60 * 86_400_000)}`,
        sql`${leases.endDate} >= ${asOf}`,
      ),
    )
    .returning({ id: leases.id })

  const expired = await db
    .update(leases)
    .set({ status: 'EXPIRED', updatedAt: new Date() })
    .where(scoped(leases, scope, sql`${leases.status} in ('ACTIVE','EXPIRING')`, sql`${leases.endDate} < ${asOf}`))
    .returning({ id: leases.id })

  return { expiring: expiring.length, expired: expired.length }
}
