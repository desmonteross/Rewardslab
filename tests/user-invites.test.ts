// ===========================================================================
//  Landlord and property manager invitations, and what each login can see
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { landlordScoped, ownLandlordScoped, scoped, systemScope, type Scope } from '@/lib/tenancy'
import { createLandlord, createLease, createProperty, createTenant, createUnits } from '@/server/services/onboarding'
import { landlordHasTenant, landlordOwnsProperty } from '@/server/landlord-access'
import {
  acceptUserInvite,
  inviteLandlord,
  invitePropertyManager,
  userInviteSubjectFor,
} from '@/server/services/user-invites'

const created: string[] = []
const emails: string[] = []
let admin: Scope
let ownerA = ''
let ownerB = ''
let propertyA = ''
let propertyB = ''
let tenantA = ''

const tokenOf = (url?: string) => new URL(url!, 'http://x').searchParams.get('token')!

beforeAll(async () => {
  const [organization] = await db
    .insert(s.organizations)
    .values({ name: 'Invites Test Org', slug: `invites-${Date.now()}`, status: 'ACTIVE', plan: 'PROFESSIONAL', commissionRate: '1.000', county: 'Nairobi', town: 'Nairobi' })
    .returning()
  created.push(organization.id)
  admin = systemScope(organization.id, 'Test Harness')

  const a = await createLandlord(admin, { type: 'INDIVIDUAL', fullName: 'Owner A', phone: '0711000001', email: `owner.a.${Date.now()}@example.test`, payoutMethod: 'MPESA', mpesaNumber: '0711000001' })
  const b = await createLandlord(admin, { type: 'INDIVIDUAL', fullName: 'Owner B', phone: '0711000002', payoutMethod: 'MPESA', mpesaNumber: '0711000002' })
  ownerA = a.id
  ownerB = b.id
  propertyA = (await createProperty(admin, { landlordId: ownerA, name: 'A Court', type: 'APARTMENT', county: 'Nairobi', town: 'Nairobi' })).id
  propertyB = (await createProperty(admin, { landlordId: ownerB, name: 'B Court', type: 'APARTMENT', county: 'Nairobi', town: 'Nairobi' })).id
  const [unitA] = await createUnits(admin, { propertyId: propertyA, unitNumber: 'A1', type: 'ONE_BEDROOM', floor: 0, bedrooms: 1, bathrooms: 1, monthlyRentCents: 2_000_000, depositCents: 0, serviceChargeCents: 0 }, 1)
  tenantA = (await createTenant(admin, { fullName: 'Tenant A', phone: '0722000001' })).id
  await createLease(admin, { tenantId: tenantA, unitId: unitA.id, startDate: new Date(), months: 12, dueDayOfMonth: 5 })
})

afterAll(async () => {
  // Organization first: its properties reference the manager login.
  if (created.length > 0) await db.delete(s.organizations).where(inArray(s.organizations.id, created))
  if (emails.length > 0) await db.delete(s.users).where(inArray(s.users.email, emails))
  await closePool()
})

describe('inviting a landlord', () => {
  it('creates a landlord login bound to that landlord, and burns the link', async () => {
    const invite = await inviteLandlord(admin, ownerA, { baseUrl: 'http://localhost:3000' })
    expect(invite.ok).toBe(true)
    expect(invite.inviteUrl).toMatch(/\/invite\/accept\?token=/)
    const token = tokenOf(invite.inviteUrl)

    const subject = await userInviteSubjectFor(token)
    expect(subject?.role).toBe('LANDLORD')
    expect(subject?.landlordId).toBe(ownerA)

    const accepted = await acceptUserInvite(token, 'Password123')
    expect(accepted.ok).toBe(true)
    emails.push(accepted.email!)
    const [user] = await db.select().from(s.users).where(eq(s.users.email, accepted.email!))
    expect(user.role).toBe('LANDLORD')
    expect(user.landlordId).toBe(ownerA)

    expect(await userInviteSubjectFor(token)).toBeNull()
    expect((await acceptUserInvite(token, 'Password123')).ok).toBe(false)
  })

  it('refuses a second login for the same landlord, and a landlord without an email', async () => {
    expect((await inviteLandlord(admin, ownerA)).error).toMatch(/already has a portal login/)
    expect((await inviteLandlord(admin, ownerB)).error).toMatch(/Add an email address/)
  })

  it('only the newest invitation works', async () => {
    const first = await inviteLandlord(admin, ownerB, { email: `owner.b.${Date.now()}@example.test` })
    const second = await inviteLandlord(admin, ownerB, { email: `owner.b2.${Date.now()}@example.test` })
    expect(await userInviteSubjectFor(tokenOf(first.inviteUrl))).toBeNull()
    expect(await userInviteSubjectFor(tokenOf(second.inviteUrl))).not.toBeNull()
  })
})

describe('inviting a property manager', () => {
  it('creates a manager login who sees only the properties assigned to them', async () => {
    const email = `manager.${Date.now()}@example.test`
    const invite = await invitePropertyManager(admin, { fullName: 'Pat Manager', email })
    const accepted = await acceptUserInvite(tokenOf(invite.inviteUrl), 'Password123')
    expect(accepted.ok).toBe(true)
    emails.push(email)
    const [manager] = await db.select().from(s.users).where(eq(s.users.email, email))
    expect(manager.role).toBe('PROPERTY_MANAGER')

    const scope: Scope = { ...admin, role: 'PROPERTY_MANAGER', managerId: manager.id }

    // Nothing assigned yet: nothing visible.
    const before = await db.select({ id: s.properties.id }).from(s.properties).where(landlordScoped(s.properties, scope))
    expect(before).toHaveLength(0)

    await db.update(s.properties).set({ managerId: manager.id }).where(eq(s.properties.id, propertyA))

    const after = await db.select({ id: s.properties.id }).from(s.properties).where(landlordScoped(s.properties, scope))
    expect(after.map((row) => row.id)).toEqual([propertyA])

    // Tables keyed by property, and the landlords table, follow the same rule.
    const units = await db.select({ id: s.units.id }).from(s.units).innerJoin(s.properties, eq(s.properties.id, s.units.propertyId)).where(landlordScoped(s.properties, scope))
    expect(units).toHaveLength(1)
    const owners = await db.select({ id: s.landlords.id }).from(s.landlords).where(ownLandlordScoped(s.landlords, scope))
    expect(owners.map((row) => row.id)).toEqual([ownerA])

    expect(await landlordOwnsProperty(scope, propertyA)).toBe(true)
    expect(await landlordOwnsProperty(scope, propertyB)).toBe(false)
    expect(await landlordHasTenant(scope, tenantA)).toBe(true)

    // Unrestricted staff still see everything.
    const all = await db.select({ id: s.properties.id }).from(s.properties).where(scoped(s.properties, admin))
    expect(all).toHaveLength(2)
  })
})
