// ===========================================================================
//  Reward points — the ledger, against a real database.
//
//  The questions this file exists to answer:
//    • Can a retried callback credit a tenant twice?
//    • Does a reversal leave the balance where it started, even after the
//      points matured?
//    • Can a tenant spend points that have not matured?
//    • Can one organization see another's reward activity?
//    • Does every posting balance?
//
//  Everything created here is removed afterwards.
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { scopeFromSession, systemScope, TenancyError, type Scope } from '@/lib/tenancy'
import type { Session } from '@/lib/session'
import { runBilling } from '@/server/services/billing'
import { recordPayment, reversePayment } from '@/server/services/payments'
import {
  awardForAllocation,
  ensureProgramme,
  matureDuePoints,
  redeemPoints,
  requireOwnTenant,
  rewardActivityForOrganization,
  rewardBalanceForTenant,
  rewardStatementForTenant,
  RewardError,
  streakBefore,
  UnbalancedRewardPostingError,
  postRewardGroup,
  accountFor,
  wholeDaysBetween,
} from '@/server/services/rewards'

interface TenantFixture {
  tenantId: string
  code: string
  rentKes: number
  scope: Scope
}

interface OrgFixture {
  organizationId: string
  scope: Scope
  tenants: TenantFixture[]
}

const createdOrganizations: string[] = []

function tenantScopeFor(organizationId: string, tenantId: string, userId: string): Scope {
  const session: Session = {
    userId,
    email: `${userId}@example.co.ke`,
    fullName: 'Rewards Tenant',
    role: 'TENANT',
    organizationId,
    organizationName: 'Test',
    organizationSlug: 'test',
    landlordId: null,
    tenantId,
    permissions: ['portal.view', 'portal.rewards.view', 'portal.rewards.redeem'],
    sessionId: `sess-${userId}`,
  }
  return scopeFromSession(session)
}

async function buildOrganization(options: {
  slug: string
  name: string
  code: string
  tenants: { code: string; unit: string; rentKes: number }[]
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
    })
    .returning()
  createdOrganizations.push(organization.id)

  const scope = systemScope(organization.id, 'Rewards Test Harness')

  const [landlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: organization.id,
      code: 'LL-R1',
      type: 'COMPANY',
      fullName: 'Rewards Test Landlord',
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
      code: options.code,
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
        phone: `07${Math.floor(10_000_000 + Math.random() * 89_999_999)}`,
        email: `${spec.code.toLowerCase()}-${organization.id.slice(0, 5)}@example.co.ke`,
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
        email: `rw-${spec.code.toLowerCase()}-${organization.id.slice(0, 6)}@example.co.ke`,
        passwordHash: 'x',
        fullName: `Tenant ${spec.code}`,
        role: 'TENANT',
        tenantId: tenant.id,
      })
      .returning()

    tenants.push({
      tenantId: tenant.id,
      code: spec.code,
      rentKes: spec.rentKes,
      scope: tenantScopeFor(organization.id, tenant.id, user.id),
    })
  }

  return { organizationId: organization.id, scope, tenants }
}

/** Invoices for one tenant, oldest period first. */
async function invoicesFor(tenantId: string) {
  return db
    .select()
    .from(s.rentInvoices)
    .where(eq(s.rentInvoices.tenantId, tenantId))
    .orderBy(s.rentInvoices.periodYear, s.rentInvoices.periodMonth)
}

const BILLED_MONTHS = [4, 5, 6, 7, 8]
const YEAR = 2026
/** Well past every maturation window in the fixture. */
const FAR_FUTURE = new Date(2027, 0, 1)

let alpha: OrgFixture
let beta: OrgFixture
/** Pays every month on the due date — the streak builder. */
let punctual: TenantFixture
/** Used for the one-off cases so the streak tenant is never disturbed. */
let erratic: TenantFixture
let outsider: TenantFixture

beforeAll(async () => {
  const stamp = Date.now().toString(36)

  alpha = await buildOrganization({
    slug: `rw-alpha-${stamp}`,
    name: 'Rewards Alpha',
    code: 'RA',
    tenants: [
      { code: 'RW-A1', unit: 'A1', rentKes: 25_000 },
      { code: 'RW-A2', unit: 'A2', rentKes: 9_500 },
    ],
  })

  beta = await buildOrganization({
    slug: `rw-beta-${stamp}`,
    name: 'Rewards Beta',
    code: 'RB',
    tenants: [{ code: 'RW-B1', unit: 'B1', rentKes: 110_000 }],
  })

  punctual = alpha.tenants[0]
  erratic = alpha.tenants[1]
  outsider = beta.tenants[0]

  for (const org of [alpha, beta]) {
    for (const month of BILLED_MONTHS) {
      await runBilling(org.scope, { year: YEAR, month })
    }
  }

  // The punctual tenant clears every invoice on its due date, in order, so a
  // streak accumulates the way it would in life.
  for (const invoice of await invoicesFor(punctual.tenantId)) {
    await recordPayment(alpha.scope, {
      tenantId: punctual.tenantId,
      grossCents: cents(invoice.total),
      method: 'MPESA',
      paidAt: invoice.dueDate,
      externalReference: `RWP${invoice.number}`,
    })
  }
}, 180_000)

afterAll(async () => {
  if (createdOrganizations.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, createdOrganizations))
  }
  await closePool()
})

// ---------------------------------------------------------------------------
// Invariants — each one must hold over everything the fixture created
// ---------------------------------------------------------------------------

describe('invariants', () => {
  it('every entry group sums to zero', async () => {
    const rows = await db
      .select({ entryGroupId: s.rewardEntries.entryGroupId, total: sql<number>`sum(${s.rewardEntries.points})::int` })
      .from(s.rewardEntries)
      .groupBy(s.rewardEntries.entryGroupId)
      .having(sql`sum(${s.rewardEntries.points}) <> 0`)
    expect(rows).toEqual([])
  })

  it('no entry carries zero points', async () => {
    const rows = await db.select().from(s.rewardEntries).where(eq(s.rewardEntries.points, 0))
    expect(rows).toEqual([])
  })

  it('awards at most one earning group per allocation', async () => {
    const rows = await db
      .select({
        allocationId: s.rewardEntries.sourceAllocationId,
        groups: sql<number>`count(distinct ${s.rewardEntries.entryGroupId})::int`,
      })
      .from(s.rewardEntries)
      .where(eq(s.rewardEntries.type, 'EARN'))
      .groupBy(s.rewardEntries.sourceAllocationId)
      .having(sql`count(distinct ${s.rewardEntries.entryGroupId}) > 1`)
    expect(rows).toEqual([])
  })

  it('every earning entry names the rule version it was computed under', async () => {
    const rows = await db
      .select()
      .from(s.rewardEntries)
      .where(and(eq(s.rewardEntries.type, 'EARN'), sql`${s.rewardEntries.ruleVersionId} is null`))
    expect(rows).toEqual([])
  })

  it('every earning entry points at a live allocation', async () => {
    const orphans = await db
      .select({ id: s.rewardEntries.id })
      .from(s.rewardEntries)
      .leftJoin(s.paymentAllocations, eq(s.paymentAllocations.id, s.rewardEntries.sourceAllocationId))
      .where(and(eq(s.rewardEntries.type, 'EARN'), sql`${s.paymentAllocations.id} is null`))
    expect(orphans).toEqual([])
  })

  it('balances the tenants against the funding account', async () => {
    const { programme } = await ensureProgramme(db)
    const rows = await db
      .select({ kind: s.rewardAccounts.kind, total: sql<number>`sum(${s.rewardEntries.points})::int` })
      .from(s.rewardEntries)
      .innerJoin(s.rewardAccounts, eq(s.rewardAccounts.id, s.rewardEntries.accountId))
      .where(eq(s.rewardEntries.programmeId, programme.id))
      .groupBy(s.rewardAccounts.kind)

    const total = rows.reduce((sum, row) => sum + Number(row.total), 0)
    expect(total).toBe(0)

    const funding = rows.find((row) => row.kind === 'FUNDING')
    expect(funding).toBeDefined()
    // Every point a tenant holds was issued against the funding counterparty,
    // so outstanding liability is a query rather than an estimate.
    expect(Number(funding!.total)).toBeLessThan(0)
  })

  it('rejects an unbalanced posting outright rather than writing half of it', async () => {
    const { programme } = await ensureProgramme(db)
    const account = await accountFor(db, programme.id, 'TENANT', punctual.tenantId)
    await expect(
      postRewardGroup(db, {
        programmeId: programme.id,
        type: 'ADJUSTMENT',
        narrative: 'deliberately lopsided',
        transactionDate: new Date(),
        lines: [{ accountId: account, points: 50, tenantId: punctual.tenantId }],
      }),
    ).rejects.toBeInstanceOf(UnbalancedRewardPostingError)
  })
})

// ---------------------------------------------------------------------------
// Earning
// ---------------------------------------------------------------------------

describe('earning', () => {
  it('awards on the real payment path, not just when called directly', async () => {
    const balance = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(balance.lifetimeEarned).toBeGreaterThan(0)
    expect(balance.total).toBe(balance.lifetimeEarned)
  })

  it('earns 1 point per 100 KES of rent for the first on-time month', async () => {
    const statement = await rewardStatementForTenant(db, punctual.tenantId)
    const first = statement[statement.length - 1]
    // 25,000 KES, on time, no streak behind it.
    expect(first.points).toBe(250)
  })

  it('builds a streak across consecutive on-time months', async () => {
    const invoices = await invoicesFor(punctual.tenantId)
    const last = invoices[invoices.length - 1]
    const streak = await streakBefore(db, {
      programmeId: (await ensureProgramme(db)).programme.id,
      tenantId: punctual.tenantId,
      periodYear: last.periodYear,
      periodMonth: last.periodMonth,
      graceDays: 5,
    })
    expect(streak).toBe(BILLED_MONTHS.length - 1)
  })

  it('pays the streak bonus once the run is long enough', async () => {
    const statement = await rewardStatementForTenant(db, punctual.tenantId)
    const newest = statement[0]
    // Four on-time months behind it → +10%, so 250 → 275.
    expect(newest.points).toBe(275)
    expect(newest.narrative).toContain('streak')
  })

  it('does not award on a partial payment, and awards once on settlement', async () => {
    const [invoice] = await invoicesFor(erratic.tenantId)
    const half = Math.floor(cents(invoice.total) / 2)

    await recordPayment(alpha.scope, {
      tenantId: erratic.tenantId,
      grossCents: half,
      method: 'MPESA',
      paidAt: invoice.dueDate,
      externalReference: `RWHALF1-${invoice.number}`,
    })
    expect((await rewardBalanceForTenant(db, erratic.tenantId)).total).toBe(0)

    await recordPayment(alpha.scope, {
      tenantId: erratic.tenantId,
      grossCents: cents(invoice.total) - half,
      method: 'MPESA',
      paidAt: invoice.dueDate,
      externalReference: `RWHALF2-${invoice.number}`,
    })

    // 9,500 KES on time, no streak → 95 points, awarded exactly once.
    const balance = await rewardBalanceForTenant(db, erratic.tenantId)
    expect(balance.total).toBe(95)
  })

  it('refuses a second award for the same allocation', async () => {
    // Replay an award exactly as it was first posted — same allocation, same
    // cleared date. This is what a retried M-Pesa callback does, and the
    // unique index is what has to stop it, not a pre-check in application
    // code that would lose the race under concurrency.
    const original = await db
      .select()
      .from(s.rewardEntries)
      .where(
        and(
          eq(s.rewardEntries.tenantId, punctual.tenantId),
          eq(s.rewardEntries.type, 'EARN'),
          sql`${s.rewardEntries.points} > 0`,
        ),
      )
      .limit(1)
      .then((rows) => rows[0])

    const before = await rewardBalanceForTenant(db, punctual.tenantId)

    const outcome = await awardForAllocation(db, {
      allocationId: original.sourceAllocationId!,
      paymentId: original.sourcePaymentId!,
      invoiceId: original.sourceInvoiceId!,
      tenantId: punctual.tenantId,
      organizationId: alpha.organizationId,
      clearedAt: original.transactionDate,
    })

    expect(outcome.awarded).toBe(false)
    expect(outcome.reason).toMatch(/already awarded/i)
    const after = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(after.total).toBe(before.total)
  })

  it('earns nothing when rent is cleared more than two weeks late', async () => {
    const invoices = await invoicesFor(erratic.tenantId)
    const invoice = invoices[1]
    const before = await rewardBalanceForTenant(db, erratic.tenantId)

    await recordPayment(alpha.scope, {
      tenantId: erratic.tenantId,
      grossCents: cents(invoice.total),
      method: 'MPESA',
      paidAt: new Date(invoice.dueDate.getTime() + 25 * 86_400_000),
      externalReference: `RWLATE-${invoice.number}`,
    })

    const after = await rewardBalanceForTenant(db, erratic.tenantId)
    expect(after.total).toBe(before.total)
  })

  it('breaks the streak on the month that earned nothing', async () => {
    const invoices = await invoicesFor(erratic.tenantId)
    const third = invoices[2]
    const streak = await streakBefore(db, {
      programmeId: (await ensureProgramme(db)).programme.id,
      tenantId: erratic.tenantId,
      periodYear: third.periodYear,
      periodMonth: third.periodMonth,
      graceDays: 5,
    })
    // The month before it was written off entirely, so the run is gone.
    expect(streak).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Maturation
// ---------------------------------------------------------------------------

describe('maturation', () => {
  it('starts every award in the pending bucket', async () => {
    const balance = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(balance.available).toBe(0)
    expect(balance.pending).toBe(balance.total)
  })

  it('refuses to spend points that have not matured', async () => {
    await expect(
      redeemPoints(db, {
        tenantId: punctual.tenantId,
        organizationId: alpha.organizationId,
        type: 'DEPOSIT_FUND',
        points: 100,
        requestKey: `early-${punctual.tenantId}`,
      }),
    ).rejects.toBeInstanceOf(RewardError)
  })

  it('moves matured points across without changing the total', async () => {
    const before = await rewardBalanceForTenant(db, punctual.tenantId)
    const moved = await matureDuePoints(db, FAR_FUTURE)
    expect(moved.points).toBeGreaterThan(0)

    const after = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(after.total).toBe(before.total)
    expect(after.available).toBe(before.total)
    expect(after.pending).toBe(0)
  })

  it('is a no-op the second time it runs', async () => {
    const before = await rewardBalanceForTenant(db, punctual.tenantId)
    const again = await matureDuePoints(db, FAR_FUTURE)
    expect(again.groups).toBe(0)
    const after = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(after.available).toBe(before.available)
  })

  it('prices the available balance at the programme peg', async () => {
    const balance = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(balance.pegKesPerPoint).toBe(1)
    expect(balance.availableValueCents).toBe(balance.available * 100)
  })
})

// ---------------------------------------------------------------------------
// Redemption
// ---------------------------------------------------------------------------

describe('redemption', () => {
  it('spends available points and records what they were worth', async () => {
    const before = await rewardBalanceForTenant(db, punctual.tenantId)
    const redemption = await redeemPoints(db, {
      tenantId: punctual.tenantId,
      organizationId: alpha.organizationId,
      type: 'DEPOSIT_FUND',
      points: 100,
      requestKey: `deposit-${punctual.tenantId}`,
    })

    expect(redemption.status).toBe('FULFILLED')
    expect(cents(redemption.valueAmount)).toBe(100 * 100)

    const after = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(after.available).toBe(before.available - 100)
  })

  it('does not spend twice when the request is retried', async () => {
    const before = await rewardBalanceForTenant(db, punctual.tenantId)
    await redeemPoints(db, {
      tenantId: punctual.tenantId,
      organizationId: alpha.organizationId,
      type: 'DEPOSIT_FUND',
      points: 100,
      requestKey: `deposit-${punctual.tenantId}`,
    })
    const after = await rewardBalanceForTenant(db, punctual.tenantId)
    expect(after.available).toBe(before.available)
  })

  it('refuses to spend more than is available', async () => {
    const balance = await rewardBalanceForTenant(db, punctual.tenantId)
    await expect(
      redeemPoints(db, {
        tenantId: punctual.tenantId,
        organizationId: alpha.organizationId,
        type: 'AIRTIME',
        points: balance.available + 1,
        requestKey: `toomuch-${punctual.tenantId}`,
      }),
    ).rejects.toBeInstanceOf(RewardError)
  })
})

// ---------------------------------------------------------------------------
// Reversal
// ---------------------------------------------------------------------------

describe('reversal', () => {
  it('takes back the points when a payment is reversed, after they matured', async () => {
    // A tenant of its own so the reversal cannot disturb the streak fixture.
    const org = await buildOrganization({
      slug: `rw-rev-${Date.now().toString(36)}`,
      name: 'Rewards Reversal',
      code: 'RR',
      tenants: [{ code: 'RW-R1', unit: 'R1', rentKes: 25_000 }],
    })
    await runBilling(org.scope, { year: YEAR, month: 4 })
    const tenant = org.tenants[0]
    const [invoice] = await invoicesFor(tenant.tenantId)

    const payment = await recordPayment(org.scope, {
      tenantId: tenant.tenantId,
      grossCents: cents(invoice.total),
      method: 'MPESA',
      paidAt: invoice.dueDate,
      externalReference: `RWREV-${invoice.number}`,
    })

    const earned = await rewardBalanceForTenant(db, tenant.tenantId)
    expect(earned.total).toBe(250)

    await matureDuePoints(db, FAR_FUTURE)
    expect((await rewardBalanceForTenant(db, tenant.tenantId)).available).toBe(250)

    await reversePayment(org.scope, payment.paymentId, 'Recalled by the bank')

    const after = await rewardBalanceForTenant(db, tenant.tenantId)
    expect(after.total).toBe(0)
    expect(after.available).toBe(0)
    expect(after.pending).toBe(0)
  })

  it('does not delete the original award — the history survives', async () => {
    const reversals = await db
      .select()
      .from(s.rewardEntries)
      .where(eq(s.rewardEntries.type, 'REVERSAL'))
    expect(reversals.length).toBeGreaterThan(0)
    for (const entry of reversals) expect(entry.reversesGroupId).toBeTruthy()

    const originals = await db
      .select()
      .from(s.rewardEntries)
      .where(
        and(
          eq(s.rewardEntries.type, 'EARN'),
          inArray(
            s.rewardEntries.entryGroupId,
            reversals.map((row) => row.reversesGroupId!),
          ),
        ),
      )
    expect(originals.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Isolation
// ---------------------------------------------------------------------------

describe('isolation', () => {
  it('refuses a staff session the cross-organization balance accessor', () => {
    expect(() => requireOwnTenant(alpha.scope)).toThrow(TenancyError)
  })

  it('refuses a landlord session too, not just an admin', () => {
    const landlordScope: Scope = { ...alpha.scope, role: 'LANDLORD', landlordId: 'll-1', tenantId: null }
    expect(() => requireOwnTenant(landlordScope)).toThrow(TenancyError)
  })

  it('accepts a tenant portal session and returns that tenant', () => {
    expect(requireOwnTenant(punctual.scope)).toBe(punctual.tenantId)
  })

  it('shows an organization only the reward activity it caused', async () => {
    const alphaRows = await rewardActivityForOrganization(db, alpha.scope)
    const betaRows = await rewardActivityForOrganization(db, beta.scope)

    const alphaTenants = new Set(alpha.tenants.map((tenant) => tenant.tenantId))
    for (const row of alphaRows) expect(alphaTenants.has(row.tenantId!)).toBe(true)
    // Beta has billed but never taken a payment, so it has caused nothing.
    expect(betaRows).toEqual([])
  })

  it('never lets one tenant read another tenant, even in the same organization', async () => {
    const mine = await rewardStatementForTenant(db, punctual.tenantId)
    const theirs = await rewardStatementForTenant(db, erratic.tenantId)
    const mineIds = new Set(mine.map((row) => row.id))
    for (const row of theirs) expect(mineIds.has(row.id)).toBe(false)
  })

  it('keeps the programme itself platform-level rather than organization-scoped', async () => {
    const { programme } = await ensureProgramme(db)
    expect(programme.organizationId).toBeNull()
    // …while every entry still records which organization caused it, which is
    // what keeps the staff-side view isolated.
    const entries = await db
      .select()
      .from(s.rewardEntries)
      .where(eq(s.rewardEntries.type, 'EARN'))
      .limit(5)
    for (const entry of entries) expect(entry.originOrganizationId).toBeTruthy()
  })

  it('does not award points to a tenant of another organization', async () => {
    const balance = await rewardBalanceForTenant(db, outsider.tenantId)
    expect(balance.total).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe('date arithmetic', () => {
  it('counts whole days, and goes negative when paid early', () => {
    const due = new Date(Date.UTC(2026, 6, 5))
    expect(wholeDaysBetween(due, new Date(Date.UTC(2026, 6, 5)))).toBe(0)
    expect(wholeDaysBetween(due, new Date(Date.UTC(2026, 6, 8)))).toBe(3)
    expect(wholeDaysBetween(due, new Date(Date.UTC(2026, 6, 1)))).toBe(-4)
  })
})
