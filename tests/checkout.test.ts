// ===========================================================================
//  Invoice → pay → points, against a real database.
//
//  The questions this file exists to answer:
//    • Do shared charges divide exactly, with nothing lost to rounding?
//    • Does a tenant-initiated payment settle the invoice and award points,
//      through the same ingest path the live webhook uses?
//    • Does a part payment award nothing, and say so?
//    • Can a tenant start a payment against someone else's invoice?
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
import { runBilling, splitCents } from '@/server/services/billing'
import {
  CheckoutError,
  checkoutStatus,
  initiateStkPush,
  outstandingInvoices,
} from '@/server/services/checkout'
import { rewardBalanceForTenant } from '@/server/services/rewards'

const createdOrganizations: string[] = []

interface TenantFixture {
  tenantId: string
  code: string
  scope: Scope
}

function tenantScopeFor(organizationId: string, tenantId: string, userId: string): Scope {
  const session: Session = {
    userId,
    email: `${userId}@example.co.ke`,
    fullName: 'Paying Tenant',
    role: 'TENANT',
    organizationId,
    organizationName: 'Test',
    organizationSlug: 'test',
    landlordId: null,
    tenantId,
    permissions: ['portal.view', 'portal.rewards.view'],
    sessionId: `sess-${userId}`,
  }
  return scopeFromSession(session)
}

let orgId: string
let staff: Scope
let propertyId: string
let payer: TenantFixture
let neighbour: TenantFixture
let sharing: TenantFixture[]

beforeAll(async () => {
  const stamp = Date.now().toString(36)

  const [organization] = await db
    .insert(s.organizations)
    .values({
      name: 'Checkout Test',
      slug: `checkout-${stamp}`,
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      commissionRate: '1.000',
      county: 'Nairobi',
      town: 'Nairobi',
    })
    .returning()
  createdOrganizations.push(organization.id)
  orgId = organization.id
  staff = systemScope(orgId, 'Checkout Harness')

  const [landlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: orgId,
      code: 'LL-C1',
      type: 'COMPANY',
      fullName: 'Checkout Landlord',
      companyName: 'Checkout Holdings',
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
      organizationId: orgId,
      code: 'CO',
      name: 'Checkout Court',
      type: 'APARTMENT',
      landlordId: landlord.id,
      county: 'Nairobi',
      town: 'Nairobi',
      area: 'Kilimani',
      unitCount: 3,
      expectedMonthlyRent: amount(0),
      managementFeeRate: '0',
    })
    .returning()
  propertyId = property.id

  const made: TenantFixture[] = []
  // Three tenants, so a shared charge has an awkward remainder to distribute.
  for (const spec of [
    { code: 'CO-1', unit: 'C1', rentKes: 25_000 },
    { code: 'CO-2', unit: 'C2', rentKes: 25_000 },
    { code: 'CO-3', unit: 'C3', rentKes: 25_000 },
  ]) {
    const [unit] = await db
      .insert(s.units)
      .values({
        organizationId: orgId,
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
        organizationId: orgId,
        code: spec.code,
        fullName: `Tenant ${spec.code}`,
        nationalId: '12345678',
        phone: `0722${Math.floor(100_000 + Math.random() * 899_999)}`,
        email: `${spec.code.toLowerCase()}-${stamp}@example.co.ke`,
        status: 'ACTIVE',
      })
      .returning()

    const [lease] = await db
      .insert(s.leases)
      .values({
        organizationId: orgId,
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
        organizationId: orgId,
        email: `co-${spec.code.toLowerCase()}-${stamp}@example.co.ke`,
        passwordHash: 'x',
        fullName: `Tenant ${spec.code}`,
        role: 'TENANT',
        tenantId: tenant.id,
      })
      .returning()

    made.push({ tenantId: tenant.id, code: tenant.code, scope: tenantScopeFor(orgId, tenant.id, user.id) })
  }

  // These three carry the shared-charge invoices, and therefore arrears.
  sharing = made

  // The payment tests need tenants with NO arrears: allocation is oldest-due
  // first, so an old invoice would swallow the payment and the test would be
  // measuring lateness rather than the payment path.
  const clean = await buildCleanProperty(stamp)
  payer = clean[0]
  neighbour = clean[1]
}, 180_000)

/**
 * A second property whose tenants have exactly one invoice, due next month,
 * so a payment made today is on time and settles it outright.
 */
async function buildCleanProperty(stamp: string): Promise<TenantFixture[]> {
  const [landlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: orgId,
      code: 'LL-C2',
      type: 'COMPANY',
      fullName: 'Clean Landlord',
      companyName: 'Clean Holdings',
      kraPin: 'A012345678Z',
      phone: '0722000001',
      payoutMethod: 'MPESA',
      mpesaNumber: '0722000001',
      taxpayerType: 'COMPANY',
    })
    .returning()

  const [property] = await db
    .insert(s.properties)
    .values({
      organizationId: orgId,
      code: 'CL',
      name: 'Clean Court',
      type: 'APARTMENT',
      landlordId: landlord.id,
      county: 'Nairobi',
      town: 'Nairobi',
      area: 'Kilimani',
      unitCount: 2,
      expectedMonthlyRent: amount(0),
      managementFeeRate: '0',
    })
    .returning()

  const out: TenantFixture[] = []
  for (const spec of [
    { code: 'CL-1', unit: 'D1' },
    { code: 'CL-2', unit: 'D2' },
  ]) {
    const [unit] = await db
      .insert(s.units)
      .values({
        organizationId: orgId,
        propertyId: property.id,
        unitNumber: spec.unit,
        floor: 1,
        type: 'TWO_BEDROOM',
        monthlyRent: amount(25_000 * 100),
        deposit: amount(25_000 * 100),
        serviceCharge: amount(0),
        status: 'OCCUPIED',
      })
      .returning()

    const [tenant] = await db
      .insert(s.tenants)
      .values({
        organizationId: orgId,
        code: spec.code,
        fullName: `Tenant ${spec.code}`,
        nationalId: '12345678',
        phone: `0733${Math.floor(100_000 + Math.random() * 899_999)}`,
        email: `${spec.code.toLowerCase()}-${stamp}@example.co.ke`,
        status: 'ACTIVE',
      })
      .returning()

    const [lease] = await db
      .insert(s.leases)
      .values({
        organizationId: orgId,
        code: `LSE-${spec.code}`,
        tenantId: tenant.id,
        propertyId: property.id,
        unitId: unit.id,
        startDate: new Date(2026, 0, 1),
        endDate: new Date(2027, 11, 1),
        monthlyRent: amount(25_000 * 100),
        deposit: amount(25_000 * 100),
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
        organizationId: orgId,
        email: `cl-${spec.code.toLowerCase()}-${stamp}@example.co.ke`,
        passwordHash: 'x',
        fullName: `Tenant ${spec.code}`,
        role: 'TENANT',
        tenantId: tenant.id,
      })
      .returning()

    out.push({ tenantId: tenant.id, code: tenant.code, scope: tenantScopeFor(orgId, tenant.id, user.id) })
  }

  // One invoice each, due next month — so paying today is early.
  const next = new Date()
  next.setMonth(next.getMonth() + 1)
  await runBilling(staff, {
    year: next.getFullYear(),
    month: next.getMonth() + 1,
    propertyId: property.id,
  })

  return out
}

/** The invoice a tenant paying today would actually be on time for. */
function notYetDue<T extends { dueDate: Date }>(invoices: T[]): T | undefined {
  const now = Date.now()
  return invoices.find((invoice) => invoice.dueDate.getTime() >= now)
}

afterAll(async () => {
  if (createdOrganizations.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, createdOrganizations))
  }
  await closePool()
})

/** Wait past the simulated STK delay without a fixed sleep in the test body. */
async function settle(scope: Scope, requestId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const status = await checkoutStatus(scope, requestId)
    if (status.status !== 'PENDING') return status
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('The payment request never settled.')
}

// ---------------------------------------------------------------------------

describe('splitting a shared cost', () => {
  it('divides exactly, with the remainder distributed rather than lost', () => {
    expect(splitCents(100_000, 3)).toEqual([33_334, 33_333, 33_333])
    expect(splitCents(100_000, 3).reduce((a, b) => a + b, 0)).toBe(100_000)
  })

  it('handles a clean division, a single tenant, and none at all', () => {
    expect(splitCents(90_000, 3)).toEqual([30_000, 30_000, 30_000])
    expect(splitCents(1_234, 1)).toEqual([1_234])
    expect(splitCents(1_000, 0)).toEqual([])
  })

  it('never loses a cent, whatever the numbers', () => {
    for (const total of [1, 7, 999, 100_001, 2_400_000]) {
      for (const parts of [1, 2, 3, 7, 13]) {
        expect(splitCents(total, parts).reduce((a, b) => a + b, 0)).toBe(total)
      }
    }
  })
})

describe('raising rent plus shared charges', () => {
  it('bills every tenant in the property and splits the extras between them', async () => {
    const result = await runBilling(staff, {
      year: 2026,
      month: 5,
      propertyId,
      sharedCharges: [
        // 24,000 across 3 tenants divides cleanly; 1,000 does not.
        { type: 'OTHER', description: 'Borehole repair', totalCents: 2_400_000 },
        { type: 'WATER', description: 'Water top-up', totalCents: 100_000 },
      ],
    })

    expect(result.invoicesCreated).toBe(3)

    const invoices = await db
      .select()
      .from(s.rentInvoices)
      .where(eq(s.rentInvoices.propertyId, propertyId))

    const items = await db
      .select()
      .from(s.invoiceItems)
      .where(
        inArray(
          s.invoiceItems.invoiceId,
          invoices.map((invoice) => invoice.id),
        ),
      )

    // Descriptions carry the period as a prefix — "May 2026 Borehole repair".
    const borehole = items.filter((item) => item.description.includes('Borehole repair'))
    const water = items.filter((item) => item.description.includes('Water top-up'))

    expect(borehole).toHaveLength(3)
    expect(borehole.reduce((total, item) => total + cents(item.amount), 0)).toBe(2_400_000)
    expect(water.reduce((total, item) => total + cents(item.amount), 0)).toBe(100_000)

    // Rent is added automatically on top of the shared charges.
    expect(items.filter((item) => item.type === 'RENT')).toHaveLength(3)
  })

  it('can target a single unit instead of the whole property', async () => {
    const unit = await db
      .select()
      .from(s.units)
      .where(eq(s.units.propertyId, propertyId))
      .limit(1)
      .then((rows) => rows[0])

    const result = await runBilling(staff, { year: 2026, month: 6, unitId: unit.id })
    expect(result.invoicesCreated).toBe(1)
  })
})

describe('the tenant sees what they owe', () => {
  it('lists their own outstanding invoices, oldest first', async () => {
    const invoices = await outstandingInvoices(payer.scope)
    expect(invoices.length).toBeGreaterThan(0)
    expect(invoices[0].balanceCents).toBeGreaterThan(0)

    const ownIds = new Set(
      (
        await db
          .select({ id: s.rentInvoices.id })
          .from(s.rentInvoices)
          .where(eq(s.rentInvoices.tenantId, payer.tenantId))
      ).map((row) => row.id),
    )
    for (const invoice of invoices) expect(ownIds.has(invoice.id)).toBe(true)
  })

  it('refuses a session with no tenancy behind it', async () => {
    await expect(outstandingInvoices(staff)).rejects.toBeInstanceOf(TenancyError)
  })
})

describe('paying from the portal', () => {
  it('settles the invoice and awards points, through the real ingest path', async () => {
    const invoices = await outstandingInvoices(payer.scope)
    expect(invoices).toHaveLength(1)
    const invoice = invoices[0]
    const before = await rewardBalanceForTenant(db, payer.tenantId)

    const request = await initiateStkPush(payer.scope, { invoiceId: invoice.id })
    expect(request.isSimulated).toBe(true)
    expect(request.isPartial).toBe(false)
    expect(request.amountCents).toBe(invoice.balanceCents)

    const status = await settle(payer.scope, request.requestId)

    expect(status.status).toBe('CONFIRMED')
    expect(status.mpesaReceipt).toBeTruthy()
    expect(status.paymentReference).toBeTruthy()
    expect(status.invoicesSettled).toBe(1)
    expect(status.outstandingAfterCents).toBe(0)

    // Points come off the rent line only, never the shared charges: 25,000
    // KES at 1 point per 100, paid before the due date, no streak behind it.
    expect(status.pointsAwarded).toBe(250)

    const after = await rewardBalanceForTenant(db, payer.tenantId)
    expect(after.total).toBe(before.total + status.pointsAwarded!)
  })

  it('writes a receipt and marks the invoice paid', async () => {
    const paid = await db
      .select()
      .from(s.rentInvoices)
      .where(eq(s.rentInvoices.tenantId, payer.tenantId))
    expect(paid.some((invoice) => invoice.status === 'PAID')).toBe(true)

    const receipts = await db
      .select()
      .from(s.receipts)
      .where(eq(s.receipts.tenantId, payer.tenantId))
    expect(receipts.length).toBeGreaterThan(0)
  })

  it('awards nothing for a part payment, and reports it as partial', async () => {
    const invoice = (await outstandingInvoices(neighbour.scope))[0]
    const before = await rewardBalanceForTenant(db, neighbour.tenantId)

    const half = Math.floor(invoice.balanceCents / 2)
    const request = await initiateStkPush(neighbour.scope, {
      invoiceId: invoice.id,
      amountCents: half,
    })
    expect(request.isPartial).toBe(true)

    const status = await settle(neighbour.scope, request.requestId)
    expect(status.status).toBe('CONFIRMED')
    expect(status.invoicesSettled).toBe(0)
    expect(status.pointsAwarded).toBe(0)
    expect(status.outstandingAfterCents).toBeGreaterThan(0)

    const after = await rewardBalanceForTenant(db, neighbour.tenantId)
    expect(after.total).toBe(before.total)
  })

  it('refuses to pay more than the invoice is for', async () => {
    const invoices = await outstandingInvoices(neighbour.scope)
    await expect(
      initiateStkPush(neighbour.scope, {
        invoiceId: invoices[0].id,
        amountCents: invoices[0].balanceCents + 1,
      }),
    ).rejects.toBeInstanceOf(CheckoutError)
  })

  it('refuses a zero or negative amount', async () => {
    const invoices = await outstandingInvoices(neighbour.scope)
    await expect(
      initiateStkPush(neighbour.scope, { invoiceId: invoices[0].id, amountCents: 0 }),
    ).rejects.toBeInstanceOf(CheckoutError)
  })
})

describe('isolation', () => {
  it('refuses to start a payment against another tenant’s invoice', async () => {
    const theirs = await outstandingInvoices(neighbour.scope)
    await expect(
      initiateStkPush(payer.scope, { invoiceId: theirs[0].id }),
    ).rejects.toBeInstanceOf(TenancyError)
  })

  it('refuses to read another tenant’s payment request', async () => {
    const invoices = await outstandingInvoices(neighbour.scope)
    const request = await initiateStkPush(neighbour.scope, {
      invoiceId: invoices[0].id,
      amountCents: 1_000,
    })
    await expect(checkoutStatus(payer.scope, request.requestId)).rejects.toBeInstanceOf(TenancyError)
  })

  it('records every simulated request as simulated', async () => {
    const rows = await db.select().from(s.stkRequests).where(eq(s.stkRequests.organizationId, orgId))
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.isSimulated).toBe(true)
  })
})
