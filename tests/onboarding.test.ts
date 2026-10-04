// ===========================================================================
//  Onboarding and access — end-to-end against the database
//
//  Landlord → property → unit → tenant → lease → move-in, through the same
//  services the new screens call, plus the landlord scoping and report gates
//  that keep one owner out of another's records.
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { scopeFromSession, systemScope, TenancyError, type Scope } from '@/lib/tenancy'
import type { Session } from '@/lib/session'
import { completeMoveIn } from '@/server/services/leases'
import {
  createLandlord,
  createLease,
  createProperty,
  createTenant,
  createUnit,
  createUnits,
  unitNumberRun,
} from '@/server/services/onboarding'
import { landlordHasTenant, landlordOwnsProperty } from '@/server/landlord-access'
import { canRunReport, findReport } from '@/server/reports'

const created: string[] = []
let scope: Scope

beforeAll(async () => {
  const [organization] = await db
    .insert(s.organizations)
    .values({
      name: 'Onboarding Test Org',
      slug: `onboarding-${Date.now()}`,
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      commissionRate: '1.000',
      county: 'Nairobi',
      town: 'Nairobi',
    })
    .returning()
  created.push(organization.id)
  scope = systemScope(organization.id, 'Test Harness')
})

afterAll(async () => {
  if (created.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, created))
  }
  await closePool()
})

describe('onboarding a tenancy from nothing', () => {
  let landlordId = ''
  let propertyId = ''
  let unitId = ''
  let tenantId = ''

  it('creates a landlord, skipping codes already taken outside the counter', async () => {
    // A seeded or imported landlord sits ahead of the counter.
    await db.insert(s.landlords).values({
      organizationId: scope.organizationId,
      code: 'LL-0001',
      fullName: 'Imported Owner',
      phone: '0711000000',
      payoutMethod: 'MPESA',
      mpesaNumber: '0711000000',
    })

    const landlord = await createLandlord(scope, {
      type: 'INDIVIDUAL',
      fullName: 'Grace Wanjiru',
      phone: '0722111222',
      payoutMethod: 'MPESA',
      mpesaNumber: '0722111222',
    })
    expect(landlord.code).not.toBe('LL-0001')
    landlordId = landlord.id
  })

  it('refuses a payout method with no destination', async () => {
    await expect(
      createLandlord(scope, { type: 'INDIVIDUAL', fullName: 'No Payout', phone: '0700', payoutMethod: 'BANK' }),
    ).rejects.toThrow(/bank/i)
  })

  it('creates a property and a unit, and keeps the property totals in step', async () => {
    const property = await createProperty(scope, {
      landlordId,
      name: 'Wanjiru Court',
      type: 'APARTMENT',
      county: 'Nairobi',
      town: 'Nairobi',
    })
    propertyId = property.id

    const unit = await createUnit(scope, {
      propertyId,
      unitNumber: 'A1',
      type: 'ONE_BEDROOM',
      floor: 0,
      bedrooms: 1,
      bathrooms: 1,
      monthlyRentCents: 2_500_000,
      depositCents: 2_500_000,
      serviceChargeCents: 0,
    })
    unitId = unit.id

    const [after] = await db.select().from(s.properties).where(eq(s.properties.id, propertyId))
    expect(after.unitCount).toBe(1)
    expect(after.expectedMonthlyRent).toBe('25000.00')

    await expect(
      createUnit(scope, { ...unit, propertyId, monthlyRentCents: 1, depositCents: 0, serviceChargeCents: 0 }),
    ).rejects.toThrow(/already has a unit A1/)
  })

  it('adds a numbered run of units in one go, and none if any clash', async () => {
    expect(unitNumberRun('A1', 3)).toEqual(['A1', 'A2', 'A3'])
    expect(unitNumberRun('B09', 2)).toEqual(['B09', 'B10'])
    expect(unitNumberRun('101', 1)).toEqual(['101'])
    expect(() => unitNumberRun('Penthouse', 2)).toThrow(/start from a number/)

    const base = {
      propertyId,
      unitNumber: 'B1',
      type: 'BEDSITTER' as const,
      floor: 1,
      bedrooms: 0,
      bathrooms: 1,
      monthlyRentCents: 1_000_000,
      depositCents: 0,
      serviceChargeCents: 0,
    }
    const run = await createUnits(scope, base, 3)
    expect(run.map((unit) => unit.unitNumber)).toEqual(['B1', 'B2', 'B3'])

    // B3 already exists, so B3–B4 is refused whole.
    await expect(createUnits(scope, { ...base, unitNumber: 'B3' }, 2)).rejects.toThrow(/already has a unit B3/)
    const [after] = await db.select().from(s.properties).where(eq(s.properties.id, propertyId))
    expect(after.unitCount).toBe(4)
    expect(after.expectedMonthlyRent).toBe('55000.00')
  })

  it('signs a lease that reserves the unit, then a move-in that occupies it', async () => {
    const tenant = await createTenant(scope, { fullName: 'Brian Otieno', phone: '0733444555' })
    tenantId = tenant.id
    expect(tenant.status).toBe('PROSPECT')

    const lease = await createLease(scope, {
      tenantId,
      unitId,
      startDate: new Date('2026-10-01T00:00:00'),
      months: 12,
      dueDayOfMonth: 5,
    })
    // Blank figures fall back to the unit's own.
    expect(lease.monthlyRent).toBe('25000.00')
    expect(lease.deposit).toBe('25000.00')

    const [reserved] = await db.select().from(s.units).where(eq(s.units.id, unitId))
    expect(reserved.status).toBe('RESERVED')

    await expect(
      createLease(scope, { tenantId, unitId, startDate: new Date(), months: 12, dueDayOfMonth: 5 }),
    ).rejects.toThrow(/not vacant/)

    const [move] = await db.select().from(s.moveEvents).where(eq(s.moveEvents.leaseId, lease.id))
    expect(move.status).toBe('SCHEDULED')
    await completeMoveIn(scope, move.id)

    const [occupied] = await db.select().from(s.units).where(eq(s.units.id, unitId))
    expect(occupied.status).toBe('OCCUPIED')
    await expect(completeMoveIn(scope, move.id)).rejects.toThrow(/scheduled move-in/)
  })

  it('lets the owning landlord see the property and tenant, and no other landlord', async () => {
    const other = await createLandlord(scope, {
      type: 'INDIVIDUAL',
      fullName: 'Other Owner',
      phone: '0744000000',
      payoutMethod: 'MPESA',
      mpesaNumber: '0744000000',
    })
    const owner: Scope = { ...scope, role: 'LANDLORD', landlordId }
    const stranger: Scope = { ...scope, role: 'LANDLORD', landlordId: other.id }

    expect(await landlordOwnsProperty(owner, propertyId)).toBe(true)
    expect(await landlordHasTenant(owner, tenantId)).toBe(true)
    expect(await landlordOwnsProperty(stranger, propertyId)).toBe(false)
    expect(await landlordHasTenant(stranger, tenantId)).toBe(false)
    // Staff are never narrowed.
    expect(await landlordOwnsProperty(scope, propertyId)).toBe(true)
  })
})

describe('access gates', () => {
  it('fails closed for a landlord login with no landlord record', () => {
    const session = {
      organizationId: 'org',
      role: 'LANDLORD',
      landlordId: null,
      tenantId: null,
      userId: 'u',
      fullName: 'x',
      permissions: [],
      sessionId: 's',
    } as unknown as Session
    expect(() => scopeFromSession(session)).toThrow(TenancyError)
  })

  it('keeps the audit and M-Pesa reports away from landlords', () => {
    const audit = findReport('audit-report')!
    const mpesa = findReport('mpesa-reconciliation')!
    const rent = findReport('rent-collection')!
    const landlord = { landlordId: 'll', role: 'LANDLORD' as const, permissions: [] }
    const manager = { landlordId: null, role: 'PROPERTY_MANAGER' as const, permissions: [] }
    const accountant = { landlordId: null, role: 'ACCOUNTANT' as const, permissions: [] }

    expect(canRunReport(landlord, audit)).toBe(false)
    expect(canRunReport(landlord, mpesa)).toBe(false)
    expect(canRunReport(landlord, rent)).toBe(true)
    expect(canRunReport(manager, audit)).toBe(false)
    expect(canRunReport(accountant, audit)).toBe(true)
  })
})
