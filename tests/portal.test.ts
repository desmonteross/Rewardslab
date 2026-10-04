// ===========================================================================
//  Tenant portal — isolation and behaviour, against a real database.
//
//  The question this file exists to answer: can a signed-in tenant reach
//  anything that is not theirs? It builds two organizations, each with two
//  tenants, gives every one of them invoices, payments, receipts and tickets,
//  and then reads the portal through each tenant's own scope.
//
//  Everything created here is removed afterwards.
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { scopeFromSession, systemScope, TenancyError, type Scope } from '@/lib/tenancy'
import type { Session } from '@/lib/session'
import { runBilling } from '@/server/services/billing'
import { recordPayment } from '@/server/services/payments'
import { createTicket } from '@/server/services/maintenance'
import {
  portalReceipt,
  portalReceipts,
  portalRentDue,
  portalStatement,
  portalTenancy,
  portalTenancyHistory,
  portalTicketUpdates,
  portalTickets,
} from '@/server/queries/portal'
import { reportIssue } from '@/server/services/portal'
import { rentalRecordFor } from '@/server/services/rental-record'
import { acceptInvite, hashToken, inviteSubjectFor, inviteTenant, selfRegister } from '@/server/services/portal-accounts'

interface TenantFixture {
  tenantId: string
  tenantCode: string
  leaseId: string
  unitId: string
  phone: string
  /** The scope a signed-in tenant portal session produces. */
  scope: Scope
}

interface OrgFixture {
  organizationId: string
  organizationSlug: string
  scope: Scope
  propertyId: string
  tenants: TenantFixture[]
}

const createdOrganizations: string[] = []

/** The scope the app builds for a real tenant session — not a hand-made one. */
function tenantScopeFor(organizationId: string, tenantId: string, userId: string): Scope {
  const session: Session = {
    userId,
    email: `${userId}@example.co.ke`,
    fullName: 'Portal Tenant',
    role: 'TENANT',
    organizationId,
    organizationName: 'Test',
    organizationSlug: 'test',
    landlordId: null,
    tenantId,
    permissions: ['portal.view', 'portal.issues.report', 'portal.documents.download'],
    sessionId: `sess-${userId}`,
  }
  return scopeFromSession(session)
}

async function buildOrganization(options: {
  slug: string
  name: string
  propertyCode: string
  tenants: { code: string; unit: string; rentKes: number; phone: string }[]
}): Promise<OrgFixture> {
  const [organization] = await db
    .insert(s.organizations)
    .values({
      name: options.name,
      slug: options.slug,
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      commissionRate: '1.000',
      county: 'Nairobi',
      town: 'Nairobi',
      portalSelfSignup: true,
    })
    .returning()
  createdOrganizations.push(organization.id)

  const scope = systemScope(organization.id, 'Portal Test Harness')

  const [landlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: organization.id,
      code: 'LL-001',
      type: 'COMPANY',
      fullName: 'Portal Test Landlord',
      companyName: `${options.name} Holdings`,
      kraPin: 'A012345678Z',
      phone: '0722000000',
      payoutMethod: 'MPESA',
      mpesaNumber: '0722000000',
      taxpayerType: 'COMPANY',
    })
    .returning()

  const [property] = await db
    .insert(s.properties)
    .values({
      organizationId: organization.id,
      code: options.propertyCode,
      name: `${options.name} Court`,
      type: 'APARTMENT',
      landlordId: landlord.id,
      county: 'Nairobi',
      town: 'Nairobi',
      area: 'Kilimani',
      unitCount: options.tenants.length,
      expectedMonthlyRent: amount(0),
      managementFeeRate: '0',
    })
    .returning()

  const tenants: TenantFixture[] = []

  for (const spec of options.tenants) {
    const [unit] = await db
      .insert(s.units)
      .values({
        organizationId: organization.id,
        propertyId: property.id,
        unitNumber: spec.unit,
        floor: 1,
        type: 'TWO_BEDROOM',
        monthlyRent: amount(spec.rentKes * 100),
        deposit: amount(spec.rentKes * 100),
        serviceCharge: amount(0),
        status: 'OCCUPIED',
      })
      .returning()

    const [tenant] = await db
      .insert(s.tenants)
      .values({
        organizationId: organization.id,
        code: spec.code,
        fullName: `Tenant ${spec.code}`,
        nationalId: '12345678',
        phone: spec.phone,
        email: `${spec.code.toLowerCase()}@example.co.ke`,
        status: 'ACTIVE',
      })
      .returning()

    const [lease] = await db
      .insert(s.leases)
      .values({
        organizationId: organization.id,
        code: `LSE-${spec.code}`,
        tenantId: tenant.id,
        propertyId: property.id,
        unitId: unit.id,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2027, 0, 1),
        monthlyRent: amount(spec.rentKes * 100),
        deposit: amount(spec.rentKes * 100),
        serviceCharge: amount(0),
        dueDayOfMonth: 5,
        gracePeriodDays: 5,
        penaltyType: 'NONE',
        status: 'ACTIVE',
      })
      .returning()

    await db
      .update(s.units)
      .set({ currentLeaseId: lease.id, currentTenantId: tenant.id })
      .where(eq(s.units.id, unit.id))

    const [user] = await db
      .insert(s.users)
      .values({
        organizationId: organization.id,
        email: `portal-${spec.code.toLowerCase()}-${organization.id.slice(0, 6)}@example.co.ke`,
        passwordHash: 'x',
        fullName: `Tenant ${spec.code}`,
        role: 'TENANT',
        tenantId: tenant.id,
      })
      .returning()

    tenants.push({
      tenantId: tenant.id,
      tenantCode: tenant.code,
      leaseId: lease.id,
      unitId: unit.id,
      phone: spec.phone,
      scope: tenantScopeFor(organization.id, tenant.id, user.id),
    })
  }

  return {
    organizationId: organization.id,
    organizationSlug: organization.slug,
    scope,
    propertyId: property.id,
    tenants,
  }
}

let alpha: OrgFixture
let beta: OrgFixture

beforeAll(async () => {
  const stamp = Date.now().toString(36)

  alpha = await buildOrganization({
    slug: `portal-alpha-${stamp}`,
    name: 'Portal Alpha',
    propertyCode: 'PA',
    tenants: [
      { code: 'TNT-A1', unit: 'A1', rentKes: 30_000, phone: '0722111111' },
      { code: 'TNT-A2', unit: 'A2', rentKes: 45_000, phone: '0722222222' },
    ],
  })

  beta = await buildOrganization({
    slug: `portal-beta-${stamp}`,
    name: 'Portal Beta',
    propertyCode: 'PB',
    tenants: [{ code: 'TNT-B1', unit: 'B1', rentKes: 60_000, phone: '0733333333' }],
  })

  // Three months of rent for everybody.
  for (const org of [alpha, beta]) {
    for (const month of [7, 8, 9]) {
      await runBilling(org.scope, { year: 2026, month })
    }
  }

  // A1 pays in full; A2 pays nothing, so the two have different records.
  const a1Invoices = await db
    .select()
    .from(s.rentInvoices)
    .where(eq(s.rentInvoices.tenantId, alpha.tenants[0].tenantId))

  for (const invoice of a1Invoices) {
    await recordPayment(alpha.scope, {
      tenantId: alpha.tenants[0].tenantId,
      grossCents: cents(invoice.total),
      method: 'MPESA',
      paidAt: invoice.dueDate,
      externalReference: `TEST${invoice.number}`,
    })
  }

  // B1 pays once, so the other organization also has receipts to confuse us with.
  const b1Invoices = await db
    .select()
    .from(s.rentInvoices)
    .where(eq(s.rentInvoices.tenantId, beta.tenants[0].tenantId))
  await recordPayment(beta.scope, {
    tenantId: beta.tenants[0].tenantId,
    grossCents: cents(b1Invoices[0].total),
    method: 'MPESA',
    paidAt: b1Invoices[0].dueDate,
    externalReference: 'TESTBETA1',
  })

  // A ticket for each tenant, so "only mine" is testable on tickets too.
  for (const org of [alpha, beta]) {
    for (const tenant of org.tenants) {
      await createTicket(org.scope, {
        propertyId: org.propertyId,
        unitId: tenant.unitId,
        tenantId: tenant.tenantId,
        category: 'PLUMBING',
        title: `Leak for ${tenant.tenantCode}`,
        description: 'Water under the sink.',
        priority: 'MEDIUM',
      })
    }
  }
}, 120_000)

afterAll(async () => {
  if (createdOrganizations.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, createdOrganizations))
  }
  await closePool()
})

// ---------------------------------------------------------------------------

describe('portal isolation — across organizations', () => {
  it('shows a tenant only their own tenancy', async () => {
    const tenancy = await portalTenancy(alpha.tenants[0].scope)
    expect(tenancy?.tenantId).toBe(alpha.tenants[0].tenantId)
    expect(tenancy?.code).toBe('TNT-A1')
  })

  it('returns nothing for a tenant id belonging to another organization', async () => {
    // Alpha's session carrying Beta's tenant id: the organization filter wins.
    const crossScope = tenantScopeFor(alpha.organizationId, beta.tenants[0].tenantId, 'attacker')
    expect(await portalTenancy(crossScope)).toBeNull()
    expect((await portalRentDue(crossScope)).openInvoices).toHaveLength(0)
    expect(await portalReceipts(crossScope)).toHaveLength(0)
    expect(await portalTickets(crossScope)).toHaveLength(0)
    expect(await portalStatement(crossScope)).toHaveLength(0)
  })

  it('never returns another organization\'s receipts by id', async () => {
    const [betaReceipt] = await db
      .select()
      .from(s.receipts)
      .where(eq(s.receipts.tenantId, beta.tenants[0].tenantId))
    expect(betaReceipt).toBeDefined()

    const stolen = await portalReceipt(alpha.tenants[0].scope, betaReceipt.id)
    expect(stolen).toBeNull()
  })
})

describe('portal isolation — between tenants of the same organization', () => {
  it('does not leak the neighbour\'s invoices', async () => {
    const a1 = await portalRentDue(alpha.tenants[0].scope)
    const a2 = await portalRentDue(alpha.tenants[1].scope)

    // A1 paid everything; A2 paid nothing.
    expect(a1.balanceCents).toBe(0)
    expect(a2.balanceCents).toBeGreaterThan(0)
    expect(a2.openInvoices).toHaveLength(3)

    const a2Numbers = new Set(a2.openInvoices.map((invoice) => invoice.number))
    for (const invoice of a1.openInvoices) {
      expect(a2Numbers.has(invoice.number)).toBe(false)
    }
  })

  it('does not leak the neighbour\'s receipts', async () => {
    const a1 = await portalReceipts(alpha.tenants[0].scope)
    const a2 = await portalReceipts(alpha.tenants[1].scope)
    expect(a1.length).toBe(3)
    expect(a2).toHaveLength(0)
  })

  it('does not leak the neighbour\'s tickets, or their updates', async () => {
    const a1 = await portalTickets(alpha.tenants[0].scope)
    const a2 = await portalTickets(alpha.tenants[1].scope)
    expect(a1).toHaveLength(1)
    expect(a2).toHaveLength(1)
    expect(a1[0].id).not.toBe(a2[0].id)

    // Asking for the neighbour's thread by id returns nothing, not their notes.
    const stolen = await portalTicketUpdates(alpha.tenants[0].scope, a2[0].id)
    expect(stolen).toHaveLength(0)
  })

  it('builds each tenant\'s statement from their own ledger only', async () => {
    const a1 = await portalStatement(alpha.tenants[0].scope)
    const a2 = await portalStatement(alpha.tenants[1].scope)

    // A1: three charges, three payments, closing at zero.
    expect(a1[a1.length - 1].balanceCents).toBe(0)
    expect(a1.filter((line) => line.paymentCents > 0)).toHaveLength(3)

    // A2: charges only, closing at the full amount owed.
    expect(a2.every((line) => line.paymentCents === 0)).toBe(true)
    expect(a2[a2.length - 1].balanceCents).toBeGreaterThan(0)
  })
})

describe('portal refuses a session with no tenant', () => {
  it('throws rather than widening to the whole organization', async () => {
    const staffScope = systemScope(alpha.organizationId, 'Staff')
    await expect(portalTenancy(staffScope)).rejects.toBeInstanceOf(TenancyError)
    await expect(portalRentDue(staffScope)).rejects.toBeInstanceOf(TenancyError)
    await expect(portalReceipts(staffScope)).rejects.toBeInstanceOf(TenancyError)
    await expect(portalStatement(staffScope)).rejects.toBeInstanceOf(TenancyError)
  })
})

describe('rental record against real data', () => {
  it('rates the tenant who paid on time above the one who did not', async () => {
    const good = await rentalRecordFor(alpha.tenants[0].scope, alpha.tenants[0].tenantId)
    const bad = await rentalRecordFor(alpha.tenants[1].scope, alpha.tenants[1].tenantId)

    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.onTimeRate).toBe(1)
    expect(good.currentArrearsCents).toBe(0)
    expect(bad.currentArrearsCents).toBeGreaterThan(0)
    expect(bad.band).toBe('ATTENTION')
  })

  it('derives cleared dates from the allocation ledger, not a status flag', async () => {
    const record = await rentalRecordFor(alpha.tenants[0].scope, alpha.tenants[0].tenantId)
    expect(record.history).toHaveLength(3)
    for (const entry of record.history) {
      expect(entry.clearedAt).not.toBeNull()
      expect(entry.outcome).toBe('ON_TIME')
    }
  })
})

describe('reporting an issue', () => {
  it('raises a ticket against the tenant\'s own unit', async () => {
    const before = await portalTickets(alpha.tenants[0].scope)
    const result = await reportIssue(alpha.tenants[0].scope, {
      category: 'ELECTRICAL',
      title: 'Socket sparking',
      description: 'The socket in the sitting room sparks when anything is plugged in.',
      priority: 'HIGH',
    })

    expect(result.ok).toBe(true)
    expect(result.ticketNumber).toBeTruthy()

    const after = await portalTickets(alpha.tenants[0].scope)
    expect(after).toHaveLength(before.length + 1)

    const [raised] = await db
      .select()
      .from(s.maintenanceTickets)
      .where(eq(s.maintenanceTickets.id, result.ticketId!))

    // The tenant supplied no property or unit — they came from the lease.
    expect(raised.propertyId).toBe(alpha.propertyId)
    expect(raised.unitId).toBe(alpha.tenants[0].unitId)
    expect(raised.tenantId).toBe(alpha.tenants[0].tenantId)
    expect(raised.organizationId).toBe(alpha.organizationId)
  })

  it('rejects an empty or too-short report instead of creating a ticket', async () => {
    const before = await portalTickets(alpha.tenants[1].scope)
    const short = await reportIssue(alpha.tenants[1].scope, {
      category: 'OTHER',
      title: 'x',
      description: 'y',
      priority: 'LOW',
    })
    expect(short.ok).toBe(false)
    expect(await portalTickets(alpha.tenants[1].scope)).toHaveLength(before.length)
  })

  it('records that the tenant raised it themselves', async () => {
    const rows = await db
      .select()
      .from(s.auditLogs)
      .where(eq(s.auditLogs.organizationId, alpha.organizationId))
    expect(rows.some((row) => row.action === 'Tenant Issue Reported')).toBe(true)
  })
})

describe('tenancy history', () => {
  it('lists the tenant\'s own tenancies only', async () => {
    const history = await portalTenancyHistory(alpha.tenants[0].scope)
    expect(history).toHaveLength(1)
    expect(history[0].unitNumber).toBe('A1')
  })
})

describe('invitations', () => {
  it('stores only the hash of the token', async () => {
    const result = await inviteTenant(alpha.scope, alpha.tenants[1].tenantId, {
      email: 'invited-a2@example.co.ke',
      baseUrl: 'http://localhost:3000',
    })
    expect(result.ok).toBe(true)

    const token = new URL(result.inviteUrl!).searchParams.get('token')!
    expect(token.length).toBeGreaterThan(20)

    const [row] = await db
      .select()
      .from(s.tenantInvites)
      .where(eq(s.tenantInvites.tenantId, alpha.tenants[1].tenantId))

    expect(row.tokenHash).not.toBe(token)
    expect(row.tokenHash).toBe(hashToken(token))
  })

  it('resolves a valid token to its own tenant, and rejects a wrong one', async () => {
    const result = await inviteTenant(alpha.scope, alpha.tenants[1].tenantId, {
      email: 'invited-a2b@example.co.ke',
      baseUrl: 'http://localhost:3000',
    })
    const token = new URL(result.inviteUrl!).searchParams.get('token')!

    const subject = await inviteSubjectFor(token)
    expect(subject?.tenantId).toBe(alpha.tenants[1].tenantId)
    expect(await inviteSubjectFor('not-a-real-token')).toBeNull()
  })

  it('invalidates the previous link when a new invitation is issued', async () => {
    const first = await inviteTenant(alpha.scope, alpha.tenants[1].tenantId, {
      email: 'rotate@example.co.ke',
      baseUrl: 'http://localhost:3000',
    })
    const firstToken = new URL(first.inviteUrl!).searchParams.get('token')!

    const second = await inviteTenant(alpha.scope, alpha.tenants[1].tenantId, {
      email: 'rotate@example.co.ke',
      baseUrl: 'http://localhost:3000',
    })
    const secondToken = new URL(second.inviteUrl!).searchParams.get('token')!

    expect(await inviteSubjectFor(firstToken)).toBeNull()
    expect(await inviteSubjectFor(secondToken)).not.toBeNull()
  })

  it('refuses to invite a tenant belonging to another organization', async () => {
    const result = await inviteTenant(alpha.scope, beta.tenants[0].tenantId, {
      email: 'cross@example.co.ke',
      baseUrl: 'http://localhost:3000',
    })
    expect(result.ok).toBe(false)
  })
})

describe('self-registration', () => {
  it('refuses a wrong phone number with the same message as a wrong code', async () => {
    const wrongPhone = await selfRegister({
      organizationSlug: alpha.organizationSlug,
      tenantCode: alpha.tenants[0].tenantCode,
      phone: '0700000000',
      email: 'probe1@example.co.ke',
      password: 'Password123',
    })
    const wrongCode = await selfRegister({
      organizationSlug: alpha.organizationSlug,
      tenantCode: 'TNT-DOES-NOT-EXIST',
      phone: alpha.tenants[0].phone,
      email: 'probe2@example.co.ke',
      password: 'Password123',
    })

    expect(wrongPhone.ok).toBe(false)
    expect(wrongCode.ok).toBe(false)
    // Identical wording, so probing reveals nothing about which part was wrong.
    expect(wrongPhone.error).toBe(wrongCode.error)
  })

  it('accepts the phone number however it is written', async () => {
    const [tenant] = await db
      .insert(s.tenants)
      .values({
        organizationId: alpha.organizationId,
        code: 'TNT-A3',
        fullName: 'Tenant A3',
        phone: '0745123456',
        email: 'a3@example.co.ke',
        status: 'ACTIVE',
      })
      .returning()

    const result = await selfRegister({
      organizationSlug: alpha.organizationSlug,
      tenantCode: 'TNT-A3',
      phone: '+254 745 123 456',
      email: 'a3.portal@example.co.ke',
      password: 'Password123',
    })

    expect(result.ok).toBe(true)

    const [user] = await db.select().from(s.users).where(eq(s.users.id, result.userId!))
    expect(user.role).toBe('TENANT')
    expect(user.tenantId).toBe(tenant.id)
    expect(user.organizationId).toBe(alpha.organizationId)
    // A portal account is never also a landlord account.
    expect(user.landlordId).toBeNull()
  })

  it('refuses a second account for the same tenancy', async () => {
    const again = await selfRegister({
      organizationSlug: alpha.organizationSlug,
      tenantCode: 'TNT-A3',
      phone: '0745123456',
      email: 'a3.again@example.co.ke',
      password: 'Password123',
    })
    expect(again.ok).toBe(false)
  })

  it('refuses when the organization has self-registration turned off', async () => {
    await db
      .update(s.organizations)
      .set({ portalSelfSignup: false })
      .where(eq(s.organizations.id, beta.organizationId))

    const result = await selfRegister({
      organizationSlug: beta.organizationSlug,
      tenantCode: beta.tenants[0].tenantCode,
      phone: beta.tenants[0].phone,
      email: 'beta.portal@example.co.ke',
      password: 'Password123',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('invitation')
  })

  it('enforces the password policy', async () => {
    const weak = await selfRegister({
      organizationSlug: alpha.organizationSlug,
      tenantCode: alpha.tenants[0].tenantCode,
      phone: alpha.tenants[0].phone,
      email: 'weak@example.co.ke',
      password: 'short',
    })
    expect(weak.ok).toBe(false)
    expect(weak.error).toMatch(/8 characters/)
  })
})

describe('accepting an invitation', () => {
  it('creates a tenant-bound account and burns the token', async () => {
    const [tenant] = await db
      .insert(s.tenants)
      .values({
        organizationId: alpha.organizationId,
        code: 'TNT-A4',
        fullName: 'Tenant A4',
        phone: '0745999888',
        email: 'a4@example.co.ke',
        status: 'ACTIVE',
      })
      .returning()

    const invite = await inviteTenant(alpha.scope, tenant.id, { baseUrl: 'http://localhost:3000' })
    const token = new URL(invite.inviteUrl!).searchParams.get('token')!

    const accepted = await acceptInvite(token, 'Password123')
    expect(accepted.ok).toBe(true)

    const [user] = await db.select().from(s.users).where(eq(s.users.id, accepted.userId!))
    expect(user.role).toBe('TENANT')
    expect(user.tenantId).toBe(tenant.id)

    // Single use: the same link cannot be replayed.
    expect(await inviteSubjectFor(token)).toBeNull()
    const replay = await acceptInvite(token, 'Password123')
    expect(replay.ok).toBe(false)
  })
})
