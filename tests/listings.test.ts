// ===========================================================================
//  Unit listings — against the database
//
//  List a vacant unit, refuse to list one that is let or already listed,
//  de-list it, and de-list automatically when a lease is signed on it.
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { systemScope, type Scope } from '@/lib/tenancy'
import { createLandlord, createLease, createProperty, createTenant, createUnits } from '@/server/services/onboarding'
import { delistUnit, listUnit, liveListingsByUnit } from '@/server/services/listings'

const created: string[] = []
let scope: Scope
let unitA = ''
let unitB = ''

beforeAll(async () => {
  const [organization] = await db
    .insert(s.organizations)
    .values({
      name: 'Listings Test Org',
      slug: `listings-${Date.now()}`,
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      commissionRate: '1.000',
      county: 'Nairobi',
      town: 'Nairobi',
    })
    .returning()
  created.push(organization.id)
  scope = systemScope(organization.id, 'Test Harness')

  const landlord = await createLandlord(scope, {
    type: 'INDIVIDUAL',
    fullName: 'Listing Owner',
    phone: '0711222333',
    payoutMethod: 'MPESA',
    mpesaNumber: '0711222333',
  })
  const property = await createProperty(scope, {
    landlordId: landlord.id,
    name: 'Seeker Court',
    type: 'APARTMENT',
    county: 'Nairobi',
    town: 'Nairobi',
    area: 'Kilimani',
  })
  const [a, b] = await createUnits(
    scope,
    {
      propertyId: property.id,
      unitNumber: 'L1',
      type: 'ONE_BEDROOM',
      floor: 0,
      bedrooms: 1,
      bathrooms: 1,
      monthlyRentCents: 3_000_000,
      depositCents: 3_000_000,
      serviceChargeCents: 0,
    },
    2,
  )
  unitA = a.id
  unitB = b.id
})

afterAll(async () => {
  if (created.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, created))
  }
  await closePool()
})

describe('listing a vacant unit on Find a Home', () => {
  it('lists it with the unit’s rent and a default headline, queued until the portal is connected', async () => {
    const listing = await listUnit(scope, unitA)
    expect(listing.status).toBe('LISTED')
    expect(listing.askingRent).toBe('30000.00')
    expect(listing.headline).toBe('Seeker Court L1, Kilimani')
    expect(listing.syncStatus).toBe('QUEUED')
    expect((await liveListingsByUnit(scope)).has(unitA)).toBe(true)
  })

  it('will not list the same unit twice', async () => {
    await expect(listUnit(scope, unitA)).rejects.toThrow(/already listed/)
  })

  it('de-lists it, keeping the history', async () => {
    const closed = await delistUnit(scope, unitA, 'Owner is renovating')
    expect(closed.status).toBe('DELISTED')
    expect(closed.delistReason).toBe('Owner is renovating')
    expect((await liveListingsByUnit(scope)).has(unitA)).toBe(false)
    await expect(delistUnit(scope, unitA)).rejects.toThrow(/not listed/)

    // It can go back on the market afterwards.
    const again = await listUnit(scope, unitA, { askingRentCents: 2_800_000, headline: 'Quiet one-bed' })
    expect(again.askingRent).toBe('28000.00')
    const rows = await db.select().from(s.unitListings).where(eq(s.unitListings.unitId, unitA))
    expect(rows).toHaveLength(2)
  })

  it('takes a unit off the market automatically when a lease is signed on it', async () => {
    await listUnit(scope, unitB)
    const tenant = await createTenant(scope, { fullName: 'House Seeker', phone: '0799888777' })
    await createLease(scope, { tenantId: tenant.id, unitId: unitB, startDate: new Date(), months: 12, dueDayOfMonth: 5 })

    const [closed] = await db
      .select()
      .from(s.unitListings)
      .where(and(eq(s.unitListings.unitId, unitB), eq(s.unitListings.status, 'DELISTED')))
    expect(closed.delistReason).toMatch(/^Let to House Seeker/)
    expect((await liveListingsByUnit(scope)).has(unitB)).toBe(false)
  })

  it('refuses to list a unit that is not vacant', async () => {
    await expect(listUnit(scope, unitB)).rejects.toThrow(/Only a vacant unit can be listed/)
  })
})
