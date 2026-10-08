// ===========================================================================
//  Onboarding (spec §8–§11)
//
//  Creating the records the rest of the chain hangs off: landlord, property,
//  unit, tenant and lease. Each one is numbered from the organization's own
//  counter, scoped to the organization, and audited — the same rules the
//  billing and payment services already follow.
// ===========================================================================

import { addMonths } from 'date-fns'
import { eq, inArray, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, leases, moveEvents, properties, tenants, units } from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import type { Tx } from '@/db'
import { nextNumber } from './numbering'
import { delistOnLetting } from './listings'

/**
 * The next number from the organization's counter that is not already taken.
 * Records imported or seeded without going through the counter can sit ahead
 * of it, and the unique index would otherwise reject every new record.
 */
async function freshCode(
  tx: Tx,
  scope: Scope,
  key: 'landlord' | 'property' | 'tenant' | 'lease',
  table: typeof landlords | typeof properties | typeof tenants | typeof leases,
): Promise<string> {
  for (let attempt = 0; attempt < 1000; attempt++) {
    const code = await nextNumber(tx, scope.organizationId, key)
    const [taken] = await tx
      .select({ id: table.id })
      .from(table)
      .where(scoped(table, scope, eq(table.code, code)))
      .limit(1)
    if (!taken) return code
  }
  throw new Error(`Could not find a free  number.`)
}

type LandlordType = (typeof landlords.$inferInsert)['type']
type PayoutMethod = (typeof landlords.$inferInsert)['payoutMethod']
type PropertyType = (typeof properties.$inferInsert)['type']
type UnitType = (typeof units.$inferInsert)['type']

export interface LandlordInput {
  type: LandlordType
  fullName: string
  companyName?: string | null
  phone: string
  email?: string | null
  kraPin?: string | null
  nationalId?: string | null
  payoutMethod: PayoutMethod
  mpesaNumber?: string | null
  bankName?: string | null
  bankAccountName?: string | null
  bankAccountNumber?: string | null
}

export async function createLandlord(scope: Scope, input: LandlordInput) {
  if (input.payoutMethod === 'MPESA' && !input.mpesaNumber) {
    throw new Error('Give the M-Pesa number the landlord is paid on.')
  }
  if (input.payoutMethod === 'BANK' && (!input.bankName || !input.bankAccountNumber)) {
    throw new Error('Give the bank name and account number the landlord is paid to.')
  }

  return db.transaction(async (tx) => {
    const code = await freshCode(tx, scope, 'landlord', landlords)
    const [created] = await tx
      .insert(landlords)
      .values({
        organizationId: scope.organizationId,
        code,
        type: input.type,
        fullName: input.fullName,
        companyName: input.companyName || null,
        phone: input.phone,
        email: input.email || null,
        kraPin: input.kraPin || null,
        nationalId: input.nationalId || null,
        payoutMethod: input.payoutMethod,
        mpesaNumber: input.mpesaNumber || null,
        bankName: input.bankName || null,
        bankAccountName: input.bankAccountName || null,
        bankAccountNumber: input.bankAccountNumber || null,
        taxpayerType: input.type === 'COMPANY' ? 'COMPANY' : 'INDIVIDUAL',
      })
      .returning()

    await audit(tx, scope, {
      action: 'Landlord Created',
      entityType: 'Landlord',
      entityId: created.id,
      reference: created.code,
      newValue: { fullName: created.fullName, payoutMethod: created.payoutMethod },
    })
    return created
  })
}

export interface PropertyInput {
  landlordId: string
  name: string
  type: PropertyType
  county: string
  town: string
  area?: string | null
  address?: string | null
  managerId?: string | null
  kraPin?: string | null
}

export async function createProperty(scope: Scope, input: PropertyInput) {
  return db.transaction(async (tx) => {
    const landlord = await tx
      .select({ id: landlords.id, organizationId: landlords.organizationId })
      .from(landlords)
      .where(scoped(landlords, scope, eq(landlords.id, input.landlordId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(landlord, scope, 'landlord')

    const code = await freshCode(tx, scope, 'property', properties)
    const [created] = await tx
      .insert(properties)
      .values({
        organizationId: scope.organizationId,
        code,
        name: input.name,
        type: input.type,
        landlordId: input.landlordId,
        // A property manager adding a property manages it, or they could not see it.
        managerId: input.managerId || scope.managerId || null,
        county: input.county,
        town: input.town,
        area: input.area || null,
        address: input.address || null,
        kraPin: input.kraPin || null,
      })
      .returning()

    await audit(tx, scope, {
      action: 'Property Created',
      entityType: 'Property',
      entityId: created.id,
      reference: created.code,
      newValue: { name: created.name, landlordId: created.landlordId },
    })
    return created
  })
}

export interface UnitInput {
  propertyId: string
  unitNumber: string
  type: UnitType
  floor: number
  bedrooms: number
  bathrooms: number
  monthlyRentCents: number
  depositCents: number
  serviceChargeCents: number
}

/**
 * The unit numbers for a run starting at `first`: "A1" × 3 gives A1, A2, A3,
 * and "101" × 3 gives 101, 102, 103. Zero padding is kept ("A01" → "A02").
 */
export function unitNumberRun(first: string, count: number): string[] {
  if (count <= 1) return [first]
  const match = /^(.*?)(\d+)$/.exec(first)
  if (!match) throw new Error(`To add several units, start from a number such as A1 or 101, not "${first}".`)
  const [, prefix, digits] = match
  const start = Number(digits)
  return Array.from({ length: count }, (_, index) => `${prefix}${String(start + index).padStart(digits.length, '0')}`)
}

export async function createUnit(scope: Scope, input: UnitInput) {
  const [created] = await createUnits(scope, input, 1)
  return created
}

/** Add `count` identical units numbered on from `input.unitNumber`, all or none. */
export async function createUnits(scope: Scope, input: UnitInput, count: number) {
  if (count < 1 || count > 200) throw new Error('Add between 1 and 200 units at a time.')
  const { propertyId, ...unit } = input
  return addUnits(
    scope,
    propertyId,
    unitNumberRun(input.unitNumber, count).map((unitNumber) => ({ ...unit, unitNumber })),
  )
}

export type UnitRow = Omit<UnitInput, 'propertyId'>

/**
 * Insert a set of units on one property in a single transaction, so a batch
 * from the form or an uploaded sheet lands whole or not at all.
 */
export async function addUnits(scope: Scope, propertyId: string, rows: UnitRow[]) {
  if (rows.length === 0) throw new Error('There are no units to add.')
  const numbers = rows.map((row) => row.unitNumber)
  const repeated = numbers.find((number, index) => numbers.indexOf(number) !== index)
  if (repeated) throw new Error(`Unit ${repeated} appears more than once.`)

  return db.transaction(async (tx) => {
    const property = await tx
      .select()
      .from(properties)
      .where(scoped(properties, scope, eq(properties.id, propertyId)))
      .limit(1)
      .then((result) => result[0])
    assertInScope(property, scope, 'property')

    const clashes = await tx
      .select({ unitNumber: units.unitNumber })
      .from(units)
      .where(scoped(units, scope, eq(units.propertyId, propertyId), inArray(units.unitNumber, numbers)))
    if (clashes.length > 0) {
      const list = clashes.map((row) => row.unitNumber).slice(0, 10).join(', ')
      throw new Error(`${property.name} already has unit${clashes.length > 1 ? 's' : ''} ${list}.`)
    }

    const created = await tx
      .insert(units)
      .values(
        rows.map((row) => ({
          organizationId: scope.organizationId,
          propertyId,
          unitNumber: row.unitNumber,
          type: row.type,
          floor: row.floor,
          bedrooms: row.bedrooms,
          bathrooms: row.bathrooms,
          monthlyRent: amount(row.monthlyRentCents),
          deposit: amount(row.depositCents),
          serviceCharge: amount(row.serviceChargeCents),
          status: 'VACANT' as const,
        })),
      )
      .returning()

    // The property's headline figures are kept in step with its units.
    const addedRentCents = rows.reduce((sum, row) => sum + row.monthlyRentCents, 0)
    await tx
      .update(properties)
      .set({
        unitCount: sql`${properties.unitCount} + ${rows.length}`,
        expectedMonthlyRent: sql`${properties.expectedMonthlyRent} + ${amount(addedRentCents)}`,
        updatedAt: new Date(),
      })
      .where(scoped(properties, scope, eq(properties.id, propertyId)))

    for (const unit of created) {
      await audit(tx, scope, {
        action: 'Unit Created',
        entityType: 'Unit',
        entityId: unit.id,
        reference: `${property.code}-${unit.unitNumber}`,
        newValue: { unitNumber: unit.unitNumber, monthlyRent: unit.monthlyRent },
      })
    }
    return created
  })
}

export interface TenantInput {
  fullName: string
  phone: string
  email?: string | null
  nationalId?: string | null
  kraPin?: string | null
  emergencyName?: string | null
  emergencyPhone?: string | null
}

export async function createTenant(scope: Scope, input: TenantInput) {
  return db.transaction(async (tx) => {
    const [samePhone] = await tx
      .select({ code: tenants.code })
      .from(tenants)
      .where(scoped(tenants, scope, eq(tenants.phone, input.phone)))
      .limit(1)
    if (samePhone) throw new Error(`Tenant ${samePhone.code} already uses ${input.phone}.`)

    const code = await freshCode(tx, scope, 'tenant', tenants)
    const [created] = await tx
      .insert(tenants)
      .values({
        organizationId: scope.organizationId,
        code,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
        nationalId: input.nationalId || null,
        kraPin: input.kraPin || null,
        emergencyName: input.emergencyName || null,
        emergencyPhone: input.emergencyPhone || null,
        // A tenant becomes ACTIVE when a lease is signed.
        status: 'PROSPECT',
      })
      .returning()

    await audit(tx, scope, {
      action: 'Tenant Created',
      entityType: 'Tenant',
      entityId: created.id,
      reference: created.code,
      newValue: { fullName: created.fullName, phone: created.phone },
    })
    return created
  })
}

export interface LeaseInput {
  tenantId: string
  unitId: string
  startDate: Date
  months: number
  /** Left out, the unit's own figures are used. */
  monthlyRentCents?: number | null
  depositCents?: number | null
  serviceChargeCents?: number | null
  dueDayOfMonth: number
}

/**
 * Sign a lease on a vacant unit. The unit is reserved and a move-in is
 * scheduled; completing the move-in is what marks the unit occupied.
 */
export async function createLease(scope: Scope, input: LeaseInput) {
  if (input.months < 1) throw new Error('A lease runs for at least one month.')
  if (input.dueDayOfMonth < 1 || input.dueDayOfMonth > 28) throw new Error('Rent is due on a day from 1 to 28.')

  let afterCommit = async () => {}
  const lease = await db.transaction(async (tx) => {
    const unit = await tx
      .select()
      .from(units)
      .where(scoped(units, scope, eq(units.id, input.unitId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(unit, scope, 'unit')
    if (unit.status !== 'VACANT') {
      throw new Error(`Unit ${unit.unitNumber} is ${unit.status.toLowerCase()}, not vacant.`)
    }

    const tenant = await tx
      .select()
      .from(tenants)
      .where(scoped(tenants, scope, eq(tenants.id, input.tenantId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(tenant, scope, 'tenant')
    if (tenant.status === 'BLACKLISTED') throw new Error(`${tenant.fullName} is blacklisted and cannot be given a lease.`)

    const [openLease] = await tx
      .select({ code: leases.code })
      .from(leases)
      .where(
        scoped(
          leases,
          scope,
          eq(leases.unitId, input.unitId),
          sql`${leases.status} in ('ACTIVE','EXPIRING','DRAFT')`,
        ),
      )
      .limit(1)
    if (openLease) throw new Error(`Unit ${unit.unitNumber} already has lease ${openLease.code}.`)

    const code = await freshCode(tx, scope, 'lease', leases)
    const endDate = addMonths(input.startDate, input.months)
    const rentCents = input.monthlyRentCents ?? cents(unit.monthlyRent)
    const depositCents = input.depositCents ?? cents(unit.deposit)
    const serviceChargeCents = input.serviceChargeCents ?? cents(unit.serviceCharge)
    if (rentCents <= 0) throw new Error('Give the monthly rent. The unit has none set.')

    const [created] = await tx
      .insert(leases)
      .values({
        organizationId: scope.organizationId,
        code,
        tenantId: tenant.id,
        propertyId: unit.propertyId,
        unitId: unit.id,
        startDate: input.startDate,
        endDate,
        monthlyRent: amount(rentCents),
        deposit: amount(depositCents),
        serviceCharge: amount(serviceChargeCents),
        dueDayOfMonth: input.dueDayOfMonth,
        status: 'ACTIVE',
        moveInDate: input.startDate,
      })
      .returning()

    await tx.insert(moveEvents).values({
      organizationId: scope.organizationId,
      type: 'MOVE_IN',
      leaseId: created.id,
      tenantId: tenant.id,
      propertyId: unit.propertyId,
      unitId: unit.id,
      scheduledDate: input.startDate,
      status: 'SCHEDULED',
      depositHeld: amount(depositCents),
    })

    await tx
      .update(units)
      .set({ status: 'RESERVED', currentLeaseId: created.id, currentTenantId: tenant.id, updatedAt: new Date() })
      .where(scoped(units, scope, eq(units.id, unit.id)))

    // A let unit comes off Find a Home straight away.
    afterCommit = await delistOnLetting(tx, scope, unit.id, `Let to ${tenant.fullName} (${code})`)

    await tx
      .update(tenants)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(scoped(tenants, scope, eq(tenants.id, tenant.id)))

    await audit(tx, scope, {
      action: 'Lease Created',
      entityType: 'Lease',
      entityId: created.id,
      reference: created.code,
      newValue: { tenantId: tenant.id, unitId: unit.id, monthlyRent: created.monthlyRent, endDate },
    })
    return created
  })
  await afterCommit()
  return lease
}
