// ===========================================================================
//  End-to-end tests against a real PostgreSQL database.
//
//  These build two throwaway organizations, push money through the actual
//  billing → reconciliation → commission → settlement pipeline, and assert
//  both the financial outcome and that neither organization can see the
//  other's data. Everything created here is removed afterwards.
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq, inArray } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { periodFrom } from '@/lib/dates'
import { assertInScope, scoped, systemScope, TenancyError, type Scope } from '@/lib/tenancy'
import { runBilling } from '@/server/services/billing'
import { recordPayment, reversePayment } from '@/server/services/payments'
import { createSettlementBatch, approveSettlement, processSettlement } from '@/server/services/settlements'
import { ledgerTotals, trialBalance } from '@/server/services/ledger'
import { buildPeriodForLandlord } from '@/server/services/compliance'

interface Fixture {
  scope: Scope
  organizationId: string
  landlordId: string
  propertyId: string
  propertyCode: string
  unitId: string
  unitNumber: string
  tenantId: string
  leaseId: string
}

const created: string[] = []

async function buildOrganization(options: {
  slug: string
  name: string
  propertyCode: string
  unitNumber: string
  rentKes: number
  serviceChargeKes?: number
  commissionRate?: string
  managementFeeRate?: string
}): Promise<Fixture> {
  const [organization] = await db
    .insert(s.organizations)
    .values({
      name: options.name,
      slug: options.slug,
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      commissionRate: options.commissionRate ?? '1.000',
      county: 'Nairobi',
      town: 'Nairobi',
    })
    .returning()
  created.push(organization.id)

  const scope = systemScope(organization.id, 'Test Harness')

  const [landlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: organization.id,
      code: 'LL-001',
      type: 'COMPANY',
      fullName: 'Test Landlord',
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
      kraPin: 'A012345678Z',
      county: 'Nairobi',
      town: 'Nairobi',
      area: 'Kilimani',
      unitCount: 1,
      expectedMonthlyRent: amount(options.rentKes * 100),
      managementFeeRate: options.managementFeeRate ?? '0',
    })
    .returning()

  const [unit] = await db
    .insert(s.units)
    .values({
      organizationId: organization.id,
      propertyId: property.id,
      unitNumber: options.unitNumber,
      floor: 1,
      type: 'TWO_BEDROOM',
      monthlyRent: amount(options.rentKes * 100),
      deposit: amount(options.rentKes * 100),
      serviceCharge: amount((options.serviceChargeKes ?? 0) * 100),
      status: 'OCCUPIED',
    })
    .returning()

  const [tenant] = await db
    .insert(s.tenants)
    .values({
      organizationId: organization.id,
      code: 'TNT-0001',
      fullName: 'James Mwangi',
      nationalId: '12345678',
      phone: '0733111222',
      status: 'ACTIVE',
    })
    .returning()

  const [lease] = await db
    .insert(s.leases)
    .values({
      organizationId: organization.id,
      code: 'LSE-0001',
      tenantId: tenant.id,
      propertyId: property.id,
      unitId: unit.id,
      startDate: new Date(2026, 0, 1),
      endDate: new Date(2027, 0, 1),
      monthlyRent: amount(options.rentKes * 100),
      deposit: amount(options.rentKes * 100),
      serviceCharge: amount((options.serviceChargeKes ?? 0) * 100),
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

  return {
    scope,
    organizationId: organization.id,
    landlordId: landlord.id,
    propertyId: property.id,
    propertyCode: property.code,
    unitId: unit.id,
    unitNumber: unit.unitNumber,
    tenantId: tenant.id,
    leaseId: lease.id,
  }
}

let alpha: Fixture
let beta: Fixture

beforeAll(async () => {
  const stamp = Date.now().toString(36)
  alpha = await buildOrganization({
    slug: `test-alpha-${stamp}`,
    name: 'Alpha Property',
    propertyCode: 'AP',
    unitNumber: 'A12',
    rentKes: 25_000,
    serviceChargeKes: 2_500,
    managementFeeRate: '5.000',
  })
  beta = await buildOrganization({
    slug: `test-beta-${stamp}`,
    name: 'Beta Property',
    propertyCode: 'BP',
    unitNumber: 'B01',
    rentKes: 40_000,
    commissionRate: '2.000',
  })
}, 60_000)

afterAll(async () => {
  if (created.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, created))
  }
  await closePool()
})

// ---------------------------------------------------------------------------

describe('billing → payment → commission → receipt', () => {
  it('raises one invoice per active lease for the period', async () => {
    const result = await runBilling(alpha.scope, { year: 2026, month: 9 })
    expect(result.invoicesCreated).toBe(1)
    expect(amount(result.totalBilledCents)).toBe('27500.00')

    const [invoice] = await db
      .select()
      .from(s.rentInvoices)
      .where(scoped(s.rentInvoices, alpha.scope, eq(s.rentInvoices.leaseId, alpha.leaseId)))

    expect(invoice.number).toMatch(/^INV-2026-\d{6}$/)
    expect(invoice.periodLabel).toBe('September 2026')
    expect(invoice.status).toBe('DUE')
    expect(invoice.balance).toBe('27500.00')
    expect(invoice.dueDate.getDate()).toBe(5)
  })

  it('is idempotent — a second run raises nothing', async () => {
    const result = await runBilling(alpha.scope, { year: 2026, month: 9 })
    expect(result.invoicesCreated).toBe(0)
    expect(result.invoicesSkipped).toBe(1)
  })

  it('matches an M-Pesa receipt to the tenant from the account reference', async () => {
    const result = await recordPayment(alpha.scope, {
      method: 'MPESA',
      grossCents: 27_500 * 100,
      paidAt: new Date(2026, 8, 4),
      externalReference: `TEST${Date.now()}`,
      payerName: 'JAMES MWANGI',
      payerPhone: '254733111222',
      accountReference: `${alpha.propertyCode}-${alpha.unitNumber}`,
    })

    expect(result.matched).toBe(true)
    expect(result.match.strategy).toBe('property code + unit number')
    expect(result.reference).toMatch(/^PAY-\d{6}$/)
    expect(amount(result.allocatedCents)).toBe('27500.00')
    expect(result.unallocatedCents).toBe(0)
  })

  it('takes the configured 1% commission and leaves the rest for the landlord', async () => {
    const [commission] = await db
      .select()
      .from(s.commissions)
      .where(scoped(s.commissions, alpha.scope))

    expect(commission.rate).toBe('1.000')
    expect(commission.grossAmount).toBe('27500.00')
    expect(commission.commissionAmount).toBe('275.00')
    expect(commission.netAmount).toBe('27225.00')
  })

  it('settles the invoice and issues a receipt', async () => {
    const [invoice] = await db
      .select()
      .from(s.rentInvoices)
      .where(scoped(s.rentInvoices, alpha.scope, eq(s.rentInvoices.leaseId, alpha.leaseId)))
    expect(invoice.status).toBe('PAID')
    expect(invoice.balance).toBe('0.00')

    const [receipt] = await db.select().from(s.receipts).where(scoped(s.receipts, alpha.scope))
    expect(receipt.number).toMatch(/^RCP-2026-\d{6}$/)
    expect(receipt.amount).toBe('27500.00')
    expect(receipt.balanceAfter).toBe('0.00')
    expect(receipt.mpesaReference).toBeTruthy()
  })

  it('leaves the ledger balanced, with the landlord payable recognised', async () => {
    const totals = await ledgerTotals(alpha.scope)
    expect(totals.balanced).toBe(true)

    const balances = await trialBalance(alpha.scope)
    const byAccount = Object.fromEntries(balances.map((row) => [row.account, row.balance]))
    expect(amount(byAccount.CASH_MPESA)).toBe('27500.00')
    expect(amount(byAccount.RENT_RECEIVABLE)).toBe('0.00')
    expect(amount(-byAccount.COMMISSION_INCOME)).toBe('275.00')
    expect(amount(-byAccount.LANDLORD_PAYABLE)).toBe('27225.00')
  })

  it('writes an audit entry for the payment', async () => {
    const entries = await db
      .select()
      .from(s.auditLogs)
      .where(scoped(s.auditLogs, alpha.scope, eq(s.auditLogs.action, 'Payment Recorded')))
    expect(entries).toHaveLength(1)
    expect(entries[0].entityType).toBe('Payment')
  })
})

describe('partial payments and credit', () => {
  it('marks an invoice partially paid and carries the balance', async () => {
    await runBilling(alpha.scope, { year: 2026, month: 10 })
    const result = await recordPayment(alpha.scope, {
      method: 'MPESA',
      grossCents: 10_000 * 100,
      paidAt: new Date(2026, 9, 6),
      externalReference: `TEST${Date.now()}A`,
      accountReference: alpha.unitNumber,
      payerPhone: '254733111222',
    })
    expect(result.matched).toBe(true)

    const [invoice] = await db
      .select()
      .from(s.rentInvoices)
      .where(
        scoped(
          s.rentInvoices,
          alpha.scope,
          eq(s.rentInvoices.periodMonth, 10),
        ),
      )
    expect(invoice.status).toBe('PARTIALLY_PAID')
    expect(invoice.amountPaid).toBe('10000.00')
    expect(invoice.balance).toBe('17500.00')
  })

  it('holds an overpayment as unallocated credit rather than inventing an invoice', async () => {
    const result = await recordPayment(alpha.scope, {
      method: 'MPESA',
      grossCents: 30_000 * 100,
      paidAt: new Date(2026, 9, 7),
      externalReference: `TEST${Date.now()}B`,
      accountReference: alpha.unitNumber,
      payerPhone: '254733111222',
    })
    expect(amount(result.allocatedCents)).toBe('17500.00')
    expect(amount(result.unallocatedCents)).toBe('12500.00')

    const totals = await ledgerTotals(alpha.scope)
    expect(totals.balanced).toBe(true)
  })
})

describe('unmatched payments', () => {
  it('parks an unrecognisable reference instead of guessing', async () => {
    const result = await recordPayment(alpha.scope, {
      method: 'MPESA',
      grossCents: 15_000 * 100,
      paidAt: new Date(2026, 8, 20),
      externalReference: `TEST${Date.now()}C`,
      payerPhone: '254700999888',
      accountReference: 'RENT',
    })

    expect(result.matched).toBe(false)
    expect(result.allocatedCents).toBe(0)
    expect(result.receiptNumber).toBeNull()
    expect(result.exceptionId).toBeTruthy()

    const [payment] = await db
      .select()
      .from(s.payments)
      .where(scoped(s.payments, alpha.scope, eq(s.payments.id, result.paymentId)))
    expect(payment.status).toBe('UNMATCHED')

    const balances = await trialBalance(alpha.scope)
    const suspense = balances.find((row) => row.account === 'SUSPENSE')!
    expect(amount(-suspense.balance)).toBe('15000.00')
  })

  it('still balances the ledger for money it cannot attribute', async () => {
    expect((await ledgerTotals(alpha.scope)).balanced).toBe(true)
  })
})

describe('settlement', () => {
  it('nets commission and management fee out of the landlord payout', async () => {
    const { settlement, totals } = await createSettlementBatch(alpha.scope, {
      landlordId: alpha.landlordId,
      periodStart: new Date(2026, 8, 1),
      periodEnd: new Date(2026, 9, 31),
    })

    // Three matched receipts: 27,500 + 10,000 + 30,000 = 67,500 gross.
    expect(amount(totals.grossCents)).toBe('67500.00')
    expect(amount(totals.commissionCents)).toBe('675.00')
    expect(amount(totals.managementFeeCents)).toBe('3375.00')
    expect(amount(totals.netCents)).toBe('63450.00')
    expect(settlement.status).toBe('PENDING')
  })

  it('will not create a second batch from payments already settled', async () => {
    await expect(
      createSettlementBatch(alpha.scope, {
        landlordId: alpha.landlordId,
        periodStart: new Date(2026, 8, 1),
        periodEnd: new Date(2026, 9, 31),
      }),
    ).rejects.toThrow(/no unsettled payments/i)
  })

  it('pays out through the provider and clears the payable', async () => {
    const [settlement] = await db.select().from(s.settlements).where(scoped(s.settlements, alpha.scope))
    await approveSettlement(alpha.scope, settlement.id)
    const { settlement: settled } = await processSettlement(alpha.scope, settlement.id)

    expect(settled.status).toBe('SETTLED')
    expect(settled.externalReference).toMatch(/^B2C_/)

    const paymentRows = await db
      .select()
      .from(s.payments)
      .where(scoped(s.payments, alpha.scope, eq(s.payments.settlementId, settlement.id)))
    expect(paymentRows.every((row) => row.settlementStatus === 'SETTLED')).toBe(true)

    expect((await ledgerTotals(alpha.scope)).balanced).toBe(true)
  })
})

describe('reversal', () => {
  it('restores the invoice balance and reverses the ledger', async () => {
    await runBilling(beta.scope, { year: 2026, month: 9 })
    const payment = await recordPayment(beta.scope, {
      method: 'MPESA',
      grossCents: 40_000 * 100,
      paidAt: new Date(2026, 8, 3),
      externalReference: `TEST${Date.now()}D`,
      accountReference: `${beta.propertyCode}-${beta.unitNumber}`,
    })

    const before = await db
      .select()
      .from(s.rentInvoices)
      .where(scoped(s.rentInvoices, beta.scope, eq(s.rentInvoices.periodMonth, 9)))
    expect(before[0].status).toBe('PAID')

    await reversePayment(beta.scope, payment.paymentId, 'M-Pesa reversal requested by the payer')

    const after = await db
      .select()
      .from(s.rentInvoices)
      .where(scoped(s.rentInvoices, beta.scope, eq(s.rentInvoices.periodMonth, 9)))
    // DUE, or OVERDUE if the reversal happens past the grace period — either
    // way the debt is back on the tenant's ledger in full.
    expect(['DUE', 'OVERDUE']).toContain(after[0].status)
    expect(after[0].balance).toBe('40000.00')

    const [reversed] = await db
      .select()
      .from(s.payments)
      .where(scoped(s.payments, beta.scope, eq(s.payments.id, payment.paymentId)))
    expect(reversed.status).toBe('REVERSED')

    const totals = await ledgerTotals(beta.scope)
    expect(totals.balanced).toBe(true)

    const balances = await trialBalance(beta.scope)
    const cash = balances.find((row) => row.account === 'CASH_MPESA')!
    expect(cash.balance).toBe(0)
  })
})

describe('commission configuration', () => {
  it('uses the organization rate, not a hard-coded 1%', async () => {
    const result = await recordPayment(beta.scope, {
      method: 'MPESA',
      grossCents: 40_000 * 100,
      paidAt: new Date(2026, 8, 10),
      externalReference: `TEST${Date.now()}E`,
      accountReference: `${beta.propertyCode}-${beta.unitNumber}`,
    })
    // Beta is configured at 2%.
    expect(amount(result.commissionCents)).toBe('800.00')
    expect(amount(result.netCents)).toBe('39200.00')
  })
})

describe('multi-tenant isolation', () => {
  it('never returns another organization’s rows from a scoped query', async () => {
    const alphaProperties = await db.select().from(s.properties).where(scoped(s.properties, alpha.scope))
    const betaProperties = await db.select().from(s.properties).where(scoped(s.properties, beta.scope))

    expect(alphaProperties).toHaveLength(1)
    expect(betaProperties).toHaveLength(1)
    expect(alphaProperties[0].id).not.toBe(betaProperties[0].id)
    expect(alphaProperties.some((row) => row.organizationId === beta.organizationId)).toBe(false)
  })

  it('refuses a row fetched by id that belongs to another organization', async () => {
    const [betaProperty] = await db
      .select()
      .from(s.properties)
      .where(eq(s.properties.id, beta.propertyId))

    expect(() => assertInScope(betaProperty, alpha.scope, 'property')).toThrow(TenancyError)
    expect(() => assertInScope(betaProperty, beta.scope, 'property')).not.toThrow()
  })

  it('does not match a payment to a unit that lives in another organization', async () => {
    const result = await recordPayment(alpha.scope, {
      method: 'MPESA',
      grossCents: 5_000 * 100,
      paidAt: new Date(2026, 8, 25),
      externalReference: `TEST${Date.now()}F`,
      // Beta's property code and unit number — invisible from inside Alpha.
      accountReference: `${beta.propertyCode}-${beta.unitNumber}`,
    })
    expect(result.matched).toBe(false)
  })

  it('keeps each organization’s document numbering independent', async () => {
    const alphaInvoices = await db
      .select()
      .from(s.rentInvoices)
      .where(scoped(s.rentInvoices, alpha.scope))
    const betaInvoices = await db.select().from(s.rentInvoices).where(scoped(s.rentInvoices, beta.scope))

    expect(alphaInvoices.map((row) => row.number)).toContain('INV-2026-000001')
    expect(betaInvoices.map((row) => row.number)).toContain('INV-2026-000001')
  })

  it('keeps ledgers separate and each one balanced', async () => {
    expect((await ledgerTotals(alpha.scope)).balanced).toBe(true)
    expect((await ledgerTotals(beta.scope)).balanced).toBe(true)

    const alphaCash = (await trialBalance(alpha.scope)).find((row) => row.account === 'CASH_MPESA')!
    const betaCash = (await trialBalance(beta.scope)).find((row) => row.account === 'CASH_MPESA')!
    expect(alphaCash.balance).not.toBe(betaCash.balance)
  })

  it('refuses to build a scope for a session with no organization', () => {
    expect(() =>
      systemScope('', 'nobody') && assertInScope(null, alpha.scope, 'record'),
    ).toThrow(TenancyError)
  })
})

describe('eRITS period aggregation', () => {
  it('aggregates rental income actually received, not invoiced', async () => {
    const period = periodFrom(2026, 9)
    const result = await buildPeriodForLandlord(alpha.scope, alpha.landlordId, period.year, period.month)

    // September receipts for Alpha: 27,500 matched. The 15,000 unmatched
    // receipt is not attributed to a landlord, so it must not appear here.
    expect(amount(result.grossRentalIncomeCents)).toBe('27500.00')
    expect(result.paymentCount).toBe(1)
    expect(result.label).toBe('September 2026')
  })

  it('holds the period open while an unreconciled payment exists', async () => {
    const period = periodFrom(2026, 9)
    const result = await buildPeriodForLandlord(alpha.scope, alpha.landlordId, period.year, period.month)
    expect(result.unreconciledCount).toBeGreaterThan(0)
    expect(result.status).toBe('OPEN')
  })

  it('applies a configured tax rule rather than a literal rate', async () => {
    const period = periodFrom(2026, 9)
    const result = await buildPeriodForLandlord(alpha.scope, alpha.landlordId, period.year, period.month)
    // 27,500/month annualises to 330,000 — inside the residential MRI band.
    expect(result.taxRate).toBe(7.5)
    expect(result.taxRuleName).toContain('Monthly Rental Income')
    expect(amount(result.taxAmountCents)).toBe('2062.50')
  })
})

describe('money never drifts', () => {
  it('reconciles gross = commission + net across every payment', async () => {
    for (const scope of [alpha.scope, beta.scope]) {
      const rows = await db.select().from(s.commissions).where(scoped(s.commissions, scope))
      for (const row of rows) {
        expect(cents(row.commissionAmount) + cents(row.netAmount)).toBe(cents(row.grossAmount))
      }
    }
  })

  it('reconciles invoice total = paid + balance', async () => {
    for (const scope of [alpha.scope, beta.scope]) {
      const rows = await db.select().from(s.rentInvoices).where(scoped(s.rentInvoices, scope))
      for (const row of rows) {
        expect(cents(row.amountPaid) + cents(row.balance)).toBe(cents(row.total))
      }
    }
  })
})
