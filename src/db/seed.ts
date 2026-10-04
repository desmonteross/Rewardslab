// ===========================================================================
//  Demo data (spec §36)
//
//  Deliberately built by calling the real engines — the billing run, the
//  payment pipeline, the settlement batcher, the compliance aggregator — so
//  seeding the database is itself an end-to-end exercise of the system, and
//  the dashboards show numbers that genuinely reconcile.
//
//  Three organizations are created so tenant isolation is demonstrable:
//  a property-management company, a second company, and an independent
//  landlord.
// ===========================================================================

import { config } from '@/lib/env-file'
config()

import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, getPool } from '@/db'
import * as s from '@/db/schema'
import { hashPassword } from '@/lib/auth'
import { amount, cents, formatKES } from '@/lib/money'
import { addDays, periodOf, recentPeriods, startOfMonth, subMonths } from '@/lib/dates'
import { systemScope, type Scope } from '@/lib/tenancy'
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, ROLE_LABELS, type AppRole } from '@/lib/rbac'
import { runBilling } from '@/server/services/billing'
import { recordPayment } from '@/server/services/payments'
import { createSettlementBatch, approveSettlement, processSettlement } from '@/server/services/settlements'
import { buildAllPeriods, refreshComplianceExceptions, submitPeriod, syncPropertyMapping } from '@/server/services/compliance'
import { nextNumber } from '@/server/services/numbering'

// ---------------------------------------------------------------------------
// Deterministic randomness — the same seed always produces the same demo data.
// ---------------------------------------------------------------------------

let rngState = 20260921

function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296
  return rngState / 4294967296
}
function int(min: number, max: number): number {
  return Math.floor(rnd() * (max - min + 1)) + min
}
function pick<T>(items: readonly T[]): T {
  return items[Math.floor(rnd() * items.length)]
}
function chance(probability: number): boolean {
  return rnd() < probability
}

const FIRST_NAMES = [
  'James', 'Mary', 'Peter', 'Grace', 'John', 'Faith', 'David', 'Mercy', 'Samuel', 'Esther',
  'Daniel', 'Joyce', 'Brian', 'Caroline', 'Kevin', 'Nancy', 'Dennis', 'Lucy', 'Collins', 'Ann',
  'Victor', 'Sharon', 'Felix', 'Rose', 'Elijah', 'Naomi', 'Patrick', 'Beatrice', 'Isaac', 'Winnie',
  'Stephen', 'Purity', 'Anthony', 'Cynthia', 'George', 'Eunice', 'Martin', 'Irene', 'Paul', 'Jackline',
]
const SURNAMES = [
  'Mwangi', 'Otieno', 'Wanjiru', 'Kamau', 'Achieng', 'Kiprop', 'Njoroge', 'Auma', 'Mutua', 'Chebet',
  'Omondi', 'Wafula', 'Kariuki', 'Nyambura', 'Kipchoge', 'Atieno', 'Maina', 'Cherono', 'Ouma', 'Wairimu',
  'Barasa', 'Gitonga', 'Owino', 'Muthoni', 'Rotich', 'Adhiambo', 'Kimani', 'Wekesa', 'Karanja', 'Anyango',
]
const OCCUPATIONS = [
  'Teacher', 'Accountant', 'Software Developer', 'Nurse', 'Sales Executive', 'Civil Engineer',
  'Bank Officer', 'Entrepreneur', 'Logistics Officer', 'Marketing Manager', 'Pharmacist', 'Lecturer',
]
const EMPLOYERS = [
  'Safaricom PLC', 'Kenya Commercial Bank', 'Equity Bank', 'Nairobi Hospital', 'Ministry of Education',
  'Bidco Africa', 'Kenya Power', 'Britam', 'Self-employed', 'Jumia Kenya', 'Twiga Foods', 'Cellulant',
]

function personName(): string {
  return `${pick(FIRST_NAMES)} ${pick(SURNAMES)}`
}
function phoneNumber(): string {
  return `07${int(10, 39)}${String(int(100000, 999999))}`
}
function nationalId(): string {
  return String(int(20000000, 39999999))
}
function kraPin(): string {
  const letter = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  return `${pick(['A', 'P'])}${String(int(100000000, 999999999))}${letter[int(0, 25)]}`
}
function emailFor(name: string, domain = 'example.co.ke'): string {
  return `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${int(1, 99)}@${domain}`
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

const TABLES = [
  'audit_logs', 'notifications', 'documents', 'integrations', 'document_counters',
  'compliance_exceptions', 'erits_sync_logs', 'erits_submissions', 'erits_period_properties',
  'erits_periods', 'erits_properties', 'tax_rules', 'tax_profiles',
  'maintenance_updates', 'maintenance_tickets', 'expenses', 'vendors',
  'settlement_items', 'settlements', 'commissions', 'commission_rules',
  'ledger_entries', 'receipts', 'payment_allocations', 'payments', 'mpesa_transactions',
  'invoice_items', 'rent_invoices', 'billing_runs',
  'move_events', 'lease_charges', 'leases', 'tenant_notes', 'tenant_invites', 'tenants',
  'property_valuations', 'units', 'properties', 'landlords', 'users', 'roles', 'permissions', 'organizations',
]

/**
 * Empty every table the seed fills.
 *
 * Only the tables that actually exist are truncated. On a database that has
 * never had the schema applied, `TRUNCATE` on the whole list fails on the
 * first missing table and reports *that* table — which reads as a corrupt
 * database rather than an empty one, and sends you looking in the wrong
 * place. An empty database is a normal state for a first run, and it is not
 * this function's job to complain about it.
 */
async function reset() {
  const { rows } = await db.execute<{ table_name: string }>(sql`
    select table_name
      from information_schema.tables
     where table_schema = 'public'
       and table_type = 'BASE TABLE'
  `)
  const present = new Set(rows.map((row) => row.table_name))
  const targets = TABLES.filter((table) => present.has(table))

  if (targets.length === 0) {
    console.log('Nothing to reset — the database has no tables yet.')
    return
  }
  if (targets.length < TABLES.length) {
    const missing = TABLES.filter((table) => !present.has(table))
    console.warn(
      `Note: ${missing.length} table(s) not present yet and skipped: ${missing.slice(0, 6).join(', ')}` +
        (missing.length > 6 ? ' …' : ''),
    )
  }

  await db.execute(
    sql.raw(`TRUNCATE TABLE ${targets.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`),
  )
}

// ---------------------------------------------------------------------------
// Platform-level reference data
// ---------------------------------------------------------------------------

async function seedPermissions() {
  await db.insert(s.permissions).values(
    Object.entries(PERMISSIONS).map(([key, meta]) => ({
      key,
      module: meta.module,
      label: meta.label,
      description: null,
    })),
  )
}

/**
 * Tax rules are DATA, not code (spec §25). These are seeded as a starting
 * configuration and are editable from Compliance → Tax Records. Confirm the
 * current rate, bands and filing channel with KRA before any real filing.
 */
async function seedTaxRules() {
  const from2024 = new Date(2024, 0, 1)
  await db.insert(s.taxRules).values([
    {
      organizationId: null,
      name: 'Monthly Rental Income Tax — residential',
      code: 'MRI-RESIDENTIAL',
      rate: '7.500',
      thresholdMin: '288000.00',
      thresholdMax: '15000000.00',
      taxpayerType: 'ANY',
      effectiveFrom: from2024,
      source: 'Seeded sample configuration — verify the current rate and bands with KRA before filing.',
      notes: 'Thresholds are annual gross rental income. The rate is applied to the period taxable amount.',
    },
    {
      organizationId: null,
      name: 'Below the Monthly Rental Income threshold',
      code: 'MRI-BELOW-THRESHOLD',
      rate: '0.000',
      thresholdMin: '0.00',
      thresholdMax: '287999.99',
      taxpayerType: 'ANY',
      effectiveFrom: from2024,
      source: 'Seeded sample configuration — verify with KRA.',
      notes: 'Landlords under the annual threshold are not assessed under the monthly rental income regime.',
    },
    {
      organizationId: null,
      name: 'Above the Monthly Rental Income cap — annual return',
      code: 'MRI-ABOVE-CAP',
      rate: '0.000',
      thresholdMin: '15000000.01',
      taxpayerType: 'ANY',
      effectiveFrom: from2024,
      source: 'Seeded sample configuration — verify with KRA.',
      notes:
        'Rental income above the annual cap falls outside the monthly regime and is assessed in the annual income tax return.',
    },
  ])
}

async function seedGlobalCommissionRule() {
  await db.insert(s.commissionRules).values({
    organizationId: null,
    name: 'Platform default commission',
    scope: 'GLOBAL',
    rate: '1.000',
    effectiveFrom: new Date(2024, 0, 1),
    isActive: true,
    notes: 'Applies to every organization unless a more specific rule exists.',
  })
}

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

interface OrgSpec {
  name: string
  slug: string
  legalName: string
  status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED'
  plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE'
  county: string
  town: string
  commissionRate: string
  contactEmail: string
}

async function createOrganization(spec: OrgSpec) {
  const [org] = await db
    .insert(s.organizations)
    .values({
      name: spec.name,
      slug: spec.slug,
      legalName: spec.legalName,
      kraPin: kraPin(),
      status: spec.status,
      plan: spec.plan,
      contactEmail: spec.contactEmail,
      contactPhone: phoneNumber(),
      county: spec.county,
      town: spec.town,
      address: `P.O. Box ${int(1000, 99999)}-00100, ${spec.town}`,
      commissionRate: spec.commissionRate,
    })
    .returning()

  await db.insert(s.roles).values(
    (Object.keys(DEFAULT_ROLE_PERMISSIONS) as AppRole[])
      .filter((role) => role !== 'SUPER_ADMIN')
      .map((role) => ({
        organizationId: org.id,
        key: role,
        name: ROLE_LABELS[role],
        description: `Default ${ROLE_LABELS[role]} permissions`,
        isSystem: true,
        permissions: DEFAULT_ROLE_PERMISSIONS[role] as unknown as string[],
      })),
  )

  await db.insert(s.integrations).values([
    {
      organizationId: org.id,
      key: 'mpesa',
      name: 'M-Pesa',
      category: 'Payments',
      provider: 'mpesa-mock',
      status: 'CONNECTED',
      phase: 'Phase 1',
      description: 'Collect rent by Pay Bill and reconcile receipts automatically.',
      isEnabled: true,
      config: { shortCode: String(int(400000, 899999)), mode: 'mock' },
      lastCheckedAt: new Date(),
    },
    {
      organizationId: org.id,
      key: 'erits',
      name: 'KRA eRITS',
      category: 'Compliance',
      provider: 'erits-mock',
      status: 'SANDBOX',
      phase: 'Phase 1',
      description: 'Electronic Rental Income Tax System — mapping, aggregation and simulated filing.',
      isEnabled: true,
      config: { mode: 'mock' },
      lastCheckedAt: new Date(),
    },
    {
      organizationId: org.id,
      key: 'sms',
      name: 'SMS',
      category: 'Notifications',
      provider: 'console',
      status: 'AVAILABLE',
      phase: 'Phase 1',
      description: 'Rent reminders and receipt notifications by SMS.',
      isEnabled: true,
    },
    {
      organizationId: org.id,
      key: 'email',
      name: 'Email',
      category: 'Notifications',
      provider: 'console',
      status: 'AVAILABLE',
      phase: 'Phase 1',
      description: 'Statements, receipts and reports by email.',
      isEnabled: true,
    },
    {
      organizationId: org.id,
      key: 'banking',
      name: 'Banking',
      category: 'Payments',
      provider: 'banking-stub',
      status: 'COMING_SOON',
      phase: 'Phase 2',
      description: 'Direct bank transfer reconciliation from statement feeds.',
    },
    {
      organizationId: org.id,
      key: 'etims',
      name: 'KRA eTIMS',
      category: 'Compliance',
      provider: 'etims',
      status: 'COMING_SOON',
      phase: 'Future',
      description: 'Electronic tax invoicing for management fees and commercial rent.',
    },
    {
      organizationId: org.id,
      key: 'credit-reference',
      name: 'Credit Reference',
      category: 'Financial Services',
      provider: 'crb',
      status: 'COMING_SOON',
      phase: 'Phase 2',
      description: 'Tenant rental payment history shared as a credit profile.',
    },
    {
      organizationId: org.id,
      key: 'lenders',
      name: 'Lender Marketplace',
      category: 'Financial Services',
      provider: 'lenders',
      status: 'COMING_SOON',
      phase: 'Phase 2',
      description: 'Rent advance and landlord working capital offers.',
    },
  ])

  return org
}

async function createUser(args: {
  organizationId: string | null
  email: string
  fullName: string
  role: AppRole
  landlordId?: string | null
  tenantId?: string | null
  phone?: string
  password?: string
}) {
  const [user] = await db
    .insert(s.users)
    .values({
      organizationId: args.organizationId,
      email: args.email,
      passwordHash: await hashPassword(args.password ?? 'Password123'),
      fullName: args.fullName,
      phone: args.phone ?? phoneNumber(),
      role: args.role,
      landlordId: args.landlordId ?? null,
      tenantId: args.tenantId ?? null,
      isActive: true,
    })
    .returning()
  return user
}

// ---------------------------------------------------------------------------
// Tenant portal accounts
//
// Chosen from the tenants the simulation actually produced, so the demo logins
// land on real histories: one tenant who pays on time, one carrying arrears.
// ---------------------------------------------------------------------------

async function seedPortalAccounts(scope: Scope, emails: { good: string; arrears: string }) {
  const standing = await db.execute(sql`
    select t.id,
           t.full_name,
           t.phone,
           count(i.id)::int                                   as invoices,
           coalesce(sum(i.balance), 0)::numeric               as outstanding
      from tenants t
      join rent_invoices i on i.tenant_id = t.id and i.status <> 'CANCELLED'
     where t.organization_id = ${scope.organizationId}
       and t.status = 'ACTIVE'
     group by t.id, t.full_name, t.phone
     having count(i.id) >= 4
     order by count(i.id) desc
  `)

  const rows = (standing.rows ?? []) as unknown as {
    id: string
    full_name: string
    phone: string
    invoices: number
    outstanding: string
  }[]
  if (rows.length === 0) return []

  const clear = rows.find((row) => cents(row.outstanding) === 0) ?? rows[0]
  const owing = rows.find((row) => cents(row.outstanding) > 0 && row.id !== clear.id)

  const made: { email: string; note: string }[] = []

  await createUser({
    organizationId: scope.organizationId,
    email: emails.good,
    fullName: clear.full_name,
    role: 'TENANT',
    tenantId: clear.id,
    phone: clear.phone,
  })
  made.push({ email: emails.good, note: `${clear.full_name} — up to date` })

  if (owing) {
    await createUser({
      organizationId: scope.organizationId,
      email: emails.arrears,
      fullName: owing.full_name,
      role: 'TENANT',
      tenantId: owing.id,
      phone: owing.phone,
    })
    made.push({ email: emails.arrears, note: `${owing.full_name} — in arrears` })
  }

  // One tenant left with an invitation outstanding, so the staff-side Portal
  // tab has a pending invite to show.
  const pendingFor = rows.find((row) => row.id !== clear.id && row.id !== owing?.id)
  if (pendingFor) {
    await db.insert(s.tenantInvites).values({
      organizationId: scope.organizationId,
      tenantId: pendingFor.id,
      email: emailFor(pendingFor.full_name),
      // A hash of a token that was never issued: the row demonstrates the
      // state without leaving a usable link in the demo data.
      tokenHash: createHash('sha256').update(`seed-not-a-real-token-${pendingFor.id}`).digest('hex'),
      status: 'PENDING',
      expiresAt: addDays(new Date(), 2),
      invitedByName: 'Catherine Njeri',
    })
  }

  return made
}

// ---------------------------------------------------------------------------
// Portfolio builders
// ---------------------------------------------------------------------------

interface UnitPlan {
  count: number
  type: (typeof s.unitTypeEnum.enumValues)[number]
  bedrooms: number
  bathrooms: number
  rent: number
  serviceCharge: number
  prefix: string
}

interface PropertyPlan {
  code: string
  name: string
  type: (typeof s.propertyTypeEnum.enumValues)[number]
  county: string
  town: string
  area: string
  managementFeeRate: string
  occupiedTarget: number
  units: UnitPlan[]
}

async function createProperty(
  organizationId: string,
  landlordId: string,
  managerId: string | null,
  plan: PropertyPlan,
  landlordPin: string,
  withKraPin = true,
) {
  const totalUnits = plan.units.reduce((total, group) => total + group.count, 0)
  const expectedMonthly = plan.units.reduce((total, group) => total + group.count * group.rent, 0)

  const [property] = await db
    .insert(s.properties)
    .values({
      organizationId,
      code: plan.code,
      name: plan.name,
      type: plan.type,
      landlordId,
      managerId,
      kraPin: withKraPin ? landlordPin : null,
      county: plan.county,
      town: plan.town,
      area: plan.area,
      address: `${plan.area}, ${plan.town}`,
      unitCount: totalUnits,
      expectedMonthlyRent: amount(expectedMonthly * 100),
      managementFeeRate: plan.managementFeeRate,
      settlementAccount: null,
      status: 'ACTIVE',
      yearBuilt: int(2008, 2022),
      description: `${totalUnits}-unit ${plan.type.toLowerCase().replace(/_/g, ' ')} in ${plan.area}, ${plan.town}.`,
    })
    .returning()

  const unitRows: (typeof s.units.$inferInsert)[] = []
  for (const group of plan.units) {
    for (let index = 1; index <= group.count; index++) {
      const floor = Math.ceil(index / 4)
      unitRows.push({
        organizationId,
        propertyId: property.id,
        unitNumber: `${group.prefix}${String(index).padStart(2, '0')}`,
        floor,
        type: group.type,
        bedrooms: group.bedrooms,
        bathrooms: group.bathrooms,
        sizeSqm: 25 + group.bedrooms * 22,
        monthlyRent: amount(group.rent * 100),
        deposit: amount(group.rent * 100),
        serviceCharge: amount(group.serviceCharge * 100),
        status: 'VACANT',
      })
    }
  }
  const units = await db.insert(s.units).values(unitRows).returning()

  await valueProperty(organizationId, property.id, expectedMonthly)

  return { property, units }
}

/**
 * Give a property a short valuation history.
 *
 * Derived from the rent it produces at a gross yield, which is how a Kenyan
 * residential block is actually valued in practice, rather than from a made-up
 * figure. Three dated rows — a purchase price, a professional valuation, and
 * for some properties a recent revaluation — so the portfolio-value tile has a
 * real movement to report rather than a constant.
 */
async function valueProperty(organizationId: string, propertyId: string, expectedMonthly: number) {
  const annualRent = expectedMonthly * 12
  /** Gross yield, as a percentage. Lower yield ⇒ higher capital value. */
  const yieldPercent = 6 + Math.random() * 2.5
  const current = Math.round((annualRent / (yieldPercent / 100)) / 100_000) * 100_000

  const monthsAgo = (count: number) => {
    const date = new Date()
    date.setMonth(date.getMonth() - count)
    return date
  }
  const daysAgo = (count: number) => new Date(Date.now() - count * 86_400_000)

  const rows: (typeof s.propertyValuations.$inferInsert)[] = [
    {
      organizationId,
      propertyId,
      amount: amount(Math.round(current * 0.82) * 100),
      valuedAt: monthsAgo(int(24, 34)),
      basis: 'PURCHASE_PRICE',
      note: 'Acquisition price recorded at transfer.',
    },
    {
      organizationId,
      propertyId,
      amount: amount(Math.round(current * 0.94) * 100),
      valuedAt: monthsAgo(int(11, 16)),
      basis: 'PROFESSIONAL',
      valuerName: 'Tysons Valuers Ltd',
      reference: `VAL-${int(1000, 9999)}`,
    },
  ]

  // Not every property has been revalued recently — an unvalued or
  // stale-valued property is the normal case, and the tile says so.
  if (Math.random() < 0.7) {
    rows.push({
      organizationId,
      propertyId,
      amount: amount(current * 100),
      valuedAt: daysAgo(int(3, 25)),
      basis: Math.random() < 0.5 ? 'PROFESSIONAL' : 'BANK',
      valuerName: Math.random() < 0.5 ? 'Knight Frank Kenya' : 'Kenya Commercial Bank',
      reference: `VAL-${int(1000, 9999)}`,
    })
  }

  await db.insert(s.propertyValuations).values(rows)
}

/** Create tenants and active leases for the first `count` units. */
async function occupy(
  scope: Scope,
  property: typeof s.properties.$inferSelect,
  units: (typeof s.units.$inferSelect)[],
  count: number,
  now: Date,
) {
  const created: { tenant: typeof s.tenants.$inferSelect; lease: typeof s.leases.$inferSelect }[] = []

  for (let index = 0; index < Math.min(count, units.length); index++) {
    const unit = units[index]
    const fullName = personName()
    const tenantCode = await db.transaction((tx) => nextNumber(tx, scope.organizationId, 'tenant'))

    const [tenant] = await db
      .insert(s.tenants)
      .values({
        organizationId: scope.organizationId,
        code: tenantCode,
        fullName,
        nationalId: nationalId(),
        kraPin: chance(0.55) ? kraPin() : null,
        phone: phoneNumber(),
        email: emailFor(fullName),
        emergencyName: personName(),
        emergencyPhone: phoneNumber(),
        emergencyRelationship: pick(['Spouse', 'Sibling', 'Parent', 'Friend', 'Colleague']),
        occupation: pick(OCCUPATIONS),
        employer: pick(EMPLOYERS),
        status: 'ACTIVE',
      })
      .returning()

    const monthsAgo = int(7, 30)
    const startDate = startOfMonth(subMonths(now, monthsAgo))
    const endDate = new Date(startDate.getFullYear() + (monthsAgo > 12 ? 2 : 1), startDate.getMonth(), startDate.getDate())
    const leaseCode = await db.transaction((tx) => nextNumber(tx, scope.organizationId, 'lease'))

    const [lease] = await db
      .insert(s.leases)
      .values({
        organizationId: scope.organizationId,
        code: leaseCode,
        tenantId: tenant.id,
        propertyId: property.id,
        unitId: unit.id,
        startDate,
        endDate,
        monthlyRent: unit.monthlyRent,
        deposit: unit.deposit,
        serviceCharge: unit.serviceCharge,
        dueDayOfMonth: 5,
        gracePeriodDays: 5,
        penaltyType: 'PERCENT',
        penaltyValue: '5.00',
        escalationPercent: '7.000',
        escalationMonths: 12,
        noticePeriodDays: 60,
        status: endDate <= addDays(now, 60) ? 'EXPIRING' : 'ACTIVE',
        moveInDate: startDate,
      })
      .returning()

    if (chance(0.25)) {
      await db.insert(s.leaseCharges).values({
        organizationId: scope.organizationId,
        leaseId: lease.id,
        type: pick(['WATER', 'PARKING', 'UTILITY'] as const),
        label: pick(['Water', 'Parking bay', 'Garbage collection']),
        amount: amount(pick([500, 1000, 1500, 2500]) * 100),
        frequency: 'MONTHLY',
        isActive: true,
      })
    }

    await db
      .update(s.units)
      .set({ status: 'OCCUPIED', currentLeaseId: lease.id, currentTenantId: tenant.id })
      .where(eq(s.units.id, unit.id))

    await db.insert(s.moveEvents).values({
      organizationId: scope.organizationId,
      type: 'MOVE_IN',
      leaseId: lease.id,
      tenantId: tenant.id,
      propertyId: property.id,
      unitId: unit.id,
      scheduledDate: startDate,
      completedDate: startDate,
      status: 'COMPLETED',
      depositHeld: unit.deposit,
      inspectionNotes: 'Unit handed over in good condition. Meter readings recorded.',
      handledByName: 'Prime Property Management',
    })

    created.push({ tenant, lease })
  }

  // A couple of non-occupied units in a realistic state.
  const remaining = units.slice(count)
  if (remaining.length > 0) {
    await db
      .update(s.units)
      .set({ status: 'MAINTENANCE', notes: 'Repainting and plumbing refresh before listing.' })
      .where(eq(s.units.id, remaining[0].id))
  }
  if (remaining.length > 2) {
    await db
      .update(s.units)
      .set({ status: 'RESERVED', notes: 'Held for a prospective tenant pending deposit.' })
      .where(eq(s.units.id, remaining[1].id))
  }

  return created
}

// ---------------------------------------------------------------------------
// Financial history
// ---------------------------------------------------------------------------

/**
 * Walk the last `monthCount` months: run the billing engine, then push
 * payments through the real reconciliation pipeline so ledgers, receipts,
 * commissions and landlord payables are all genuinely derived.
 */
async function simulateHistory(
  scope: Scope,
  now: Date,
  monthCount: number,
  collectionByAge: number[],
  propertyCodes: Map<string, string>,
) {
  const periods = recentPeriods(now, monthCount)
  let paymentCount = 0

  for (let index = 0; index < periods.length; index++) {
    const period = periods[index]
    const isCurrent = index === periods.length - 1
    const fullPaymentRate = collectionByAge[index] ?? 0.95

    await runBilling(scope, { year: period.year, month: period.month, issueDate: period.start })

    const invoices = await db
      .select({
        id: s.rentInvoices.id,
        total: s.rentInvoices.total,
        balance: s.rentInvoices.balance,
        dueDate: s.rentInvoices.dueDate,
        tenantId: s.rentInvoices.tenantId,
        propertyId: s.rentInvoices.propertyId,
        unitId: s.rentInvoices.unitId,
      })
      .from(s.rentInvoices)
      .where(
        sql`${s.rentInvoices.organizationId} = ${scope.organizationId}
            and ${s.rentInvoices.periodYear} = ${period.year}
            and ${s.rentInvoices.periodMonth} = ${period.month}`,
      )

    for (const invoice of invoices) {
      const balanceCents = cents(invoice.balance)
      if (balanceCents <= 0) continue

      const roll = rnd()
      let payCents = 0
      if (roll < fullPaymentRate) {
        payCents = balanceCents
      } else if (roll < fullPaymentRate + 0.09) {
        payCents = Math.round(balanceCents * pick([0.3, 0.4, 0.5, 0.6, 0.75]))
      } else {
        continue // left outstanding
      }

      const [unitRow] = await db
        .select({ unitNumber: s.units.unitNumber })
        .from(s.units)
        .where(eq(s.units.id, invoice.unitId))
        .limit(1)
      const [tenantRow] = await db
        .select({ phone: s.tenants.phone, fullName: s.tenants.fullName })
        .from(s.tenants)
        .where(eq(s.tenants.id, invoice.tenantId))
        .limit(1)

      const propertyCode = propertyCodes.get(invoice.propertyId) ?? ''
      // Tenants type the account number in all sorts of ways.
      const reference = pick([
        `${propertyCode}-${unitRow.unitNumber}`,
        `${propertyCode} ${unitRow.unitNumber}`,
        unitRow.unitNumber,
        `${propertyCode}${unitRow.unitNumber}`,
      ])

      const offset = isCurrent ? int(-4, 3) : int(-5, 9)
      const paidAt = addDays(invoice.dueDate, offset)
      if (paidAt > now) continue

      await recordPayment(scope, {
        method: chance(0.92) ? 'MPESA' : pick(['BANK_TRANSFER', 'CASH'] as const),
        grossCents: payCents,
        paidAt,
        externalReference: `MP${Date.now().toString(36).toUpperCase()}${int(1000, 9999)}`,
        payerName: tenantRow.fullName,
        payerPhone: tenantRow.phone,
        accountReference: reference,
        narrative: `${period.label} rent`,
      })
      paymentCount += 1
    }
  }

  return paymentCount
}

/** A few payments nobody can match — the queue an accountant works through. */
async function seedUnmatchedPayments(scope: Scope, now: Date) {
  const cases = [
    { reference: 'RENT', amountKes: 25000, note: 'Payer typed the word RENT instead of a unit number.' },
    { reference: 'ZZ-999', amountKes: 18000, note: 'Unit does not exist in this portfolio.' },
    { reference: '', amountKes: 32000, note: 'No account reference supplied at the till.' },
  ]

  for (const item of cases) {
    await recordPayment(scope, {
      method: 'MPESA',
      grossCents: item.amountKes * 100,
      paidAt: addDays(now, -int(1, 12)),
      externalReference: `MP${Date.now().toString(36).toUpperCase()}${int(1000, 9999)}`,
      payerName: personName(),
      payerPhone: phoneNumber(),
      accountReference: item.reference,
      narrative: item.note,
    })
  }
}

async function seedVendorsAndMaintenance(
  scope: Scope,
  properties: { id: string; name: string }[],
  occupancy: { tenantId: string; unitId: string; propertyId: string }[],
  assignees: string[],
  now: Date,
) {
  const vendors = await db
    .insert(s.vendors)
    .values([
      { organizationId: scope.organizationId, name: 'Kilimani Plumbing Works', category: 'Plumbing', contactName: personName(), phone: phoneNumber(), email: 'info@kilimaniplumbing.co.ke', kraPin: kraPin(), rating: 4 },
      { organizationId: scope.organizationId, name: 'BrightSpark Electricals', category: 'Electrical', contactName: personName(), phone: phoneNumber(), email: 'jobs@brightspark.co.ke', kraPin: kraPin(), rating: 5 },
      { organizationId: scope.organizationId, name: 'Safi Cleaning Services', category: 'Cleaning', contactName: personName(), phone: phoneNumber(), rating: 4 },
      { organizationId: scope.organizationId, name: 'Ulinzi Security Ltd', category: 'Security', contactName: personName(), phone: phoneNumber(), kraPin: kraPin(), rating: 4 },
      { organizationId: scope.organizationId, name: 'Nairobi Lifts & Generators', category: 'Appliance', contactName: personName(), phone: phoneNumber(), rating: 3 },
      { organizationId: scope.organizationId, name: 'Jenga General Contractors', category: 'Structural', contactName: personName(), phone: phoneNumber(), kraPin: kraPin(), rating: 4 },
    ])
    .returning()

  const tickets: { id: string; propertyId: string; actualCost: string }[] = []
  const templates = [
    { category: 'PLUMBING' as const, title: 'Kitchen sink blocked', description: 'Water backing up into the kitchen sink; drainage is very slow.' },
    { category: 'ELECTRICAL' as const, title: 'Sockets in living room dead', description: 'Two wall sockets stopped working after a power surge.' },
    { category: 'WATER' as const, title: 'No water supply on third floor', description: 'Tenants on the third floor report no water since yesterday evening.' },
    { category: 'STRUCTURAL' as const, title: 'Cracked ceiling in bedroom', description: 'A hairline crack has widened along the bedroom ceiling.' },
    { category: 'SECURITY' as const, title: 'Gate motor not responding', description: 'The automatic gate has to be opened manually.' },
    { category: 'APPLIANCE' as const, title: 'Water heater not heating', description: 'Instant shower heater trips the breaker when switched on.' },
    { category: 'INTERNET' as const, title: 'Fibre outage in block B', description: 'Internet has been down for two days in block B.' },
    { category: 'CLEANING' as const, title: 'Common area cleaning missed', description: 'Corridors and stairwell were not cleaned this week.' },
  ]
  const statuses = ['REPORTED', 'ACKNOWLEDGED', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED'] as const

  for (let index = 0; index < 15; index++) {
    const template = pick(templates)
    const status = index < 4 ? statuses[index % 3] : pick(statuses)
    const occupant = pick(occupancy)
    const number = await db.transaction((tx) => nextNumber(tx, scope.organizationId, 'ticket'))
    const reportedAt = addDays(now, -int(1, 60))
    const resolved = status === 'RESOLVED' || status === 'CLOSED'
    const estimated = pick([3500, 6000, 8500, 12000, 18000, 25000])
    const actual = resolved ? Math.round(estimated * (0.8 + rnd() * 0.5)) : 0

    const [ticket] = await db
      .insert(s.maintenanceTickets)
      .values({
        organizationId: scope.organizationId,
        number,
        propertyId: occupant.propertyId,
        unitId: occupant.unitId,
        tenantId: occupant.tenantId,
        category: template.category,
        title: template.title,
        description: template.description,
        priority: pick(['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const),
        status,
        reportedByName: 'Tenant',
        assignedToId: status === 'REPORTED' ? null : pick(assignees),
        vendorId: status === 'REPORTED' ? null : pick(vendors).id,
        estimatedCost: amount(estimated * 100),
        actualCost: amount(actual * 100),
        reportedAt,
        dueDate: addDays(reportedAt, int(3, 14)),
        resolvedAt: resolved ? addDays(reportedAt, int(1, 9)) : null,
        closedAt: status === 'CLOSED' ? addDays(reportedAt, int(2, 12)) : null,
        resolutionNotes: resolved ? 'Work completed and verified by the caretaker.' : null,
      })
      .returning()

    await db.insert(s.maintenanceUpdates).values({
      organizationId: scope.organizationId,
      ticketId: ticket.id,
      authorName: 'Property Manager',
      status,
      note:
        status === 'REPORTED'
          ? 'Ticket logged from the tenant’s call.'
          : resolved
            ? 'Vendor confirmed completion; tenant signed off.'
            : 'Vendor scheduled to attend site.',
    })

    tickets.push({ id: ticket.id, propertyId: ticket.propertyId, actualCost: ticket.actualCost })
  }

  return { vendors, tickets }
}

async function seedExpenses(
  scope: Scope,
  properties: { id: string; landlordId: string; name: string }[],
  vendors: { id: string; name: string; category: string }[],
  now: Date,
) {
  const categories = [
    { category: 'SECURITY' as const, description: 'Monthly security guarding', min: 45000, max: 90000 },
    { category: 'CLEANING' as const, description: 'Common area cleaning', min: 18000, max: 35000 },
    { category: 'UTILITIES' as const, description: 'Common area water and electricity', min: 22000, max: 60000 },
    { category: 'REPAIRS' as const, description: 'Plumbing and electrical repairs', min: 8000, max: 45000 },
    { category: 'INSURANCE' as const, description: 'Property insurance premium', min: 35000, max: 120000 },
    { category: 'RATES' as const, description: 'County land rates and service fees', min: 25000, max: 80000 },
    { category: 'MAINTENANCE' as const, description: 'Lift and generator servicing', min: 15000, max: 55000 },
  ]

  let created = 0
  for (const property of properties) {
    for (let monthsBack = 0; monthsBack < 3; monthsBack++) {
      const template = pick(categories)
      const expenseDate = addDays(startOfMonth(subMonths(now, monthsBack)), int(2, 24))
      if (expenseDate > now) continue
      const approved = monthsBack > 0 || chance(0.6)
      const reference = await db.transaction((tx) => nextNumber(tx, scope.organizationId, 'expense'))

      await db.insert(s.expenses).values({
        organizationId: scope.organizationId,
        reference,
        propertyId: property.id,
        landlordId: property.landlordId,
        vendorId: pick(vendors).id,
        category: template.category,
        amount: amount(int(template.min, template.max) * 100),
        expenseDate,
        description: `${template.description} — ${property.name}`,
        approvalStatus: approved ? 'APPROVED' : 'PENDING',
        approvedByName: approved ? 'Mary Wanjiku' : null,
        approvedAt: approved ? addDays(expenseDate, 2) : null,
        paymentStatus: approved ? 'PAID' : 'UNPAID',
        rechargeToLandlord: true,
        createdByName: 'Prime Property Management',
      })
      created += 1
    }
  }
  return created
}

async function seedSettlements(scope: Scope, landlordIds: string[], now: Date) {
  let batches = 0
  // Weekly batches through the previous two months, plus a pending one for
  // the current period so the approve / process actions are demonstrable.
  for (const landlordId of landlordIds) {
    for (let weeksBack = 9; weeksBack >= 1; weeksBack--) {
      const periodEnd = addDays(now, -weeksBack * 7)
      const periodStart = addDays(periodEnd, -6)
      try {
        const { settlement } = await createSettlementBatch(scope, {
          landlordId,
          periodStart,
          periodEnd,
          includeExpenses: weeksBack % 4 === 1,
        })
        batches += 1
        if (weeksBack > 2) {
          await approveSettlement(scope, settlement.id)
          await processSettlement(scope, settlement.id)
        } else if (weeksBack === 2) {
          await approveSettlement(scope, settlement.id)
        }
      } catch {
        // No unsettled payments in that window — expected for quiet weeks.
      }
    }
  }
  return batches
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const now = new Date()
  const started = Date.now()

  console.log('Resetting database …')
  await reset()

  console.log('Seeding platform reference data …')
  await seedPermissions()
  await seedTaxRules()
  await seedGlobalCommissionRule()

  await createUser({
    organizationId: null,
    email: 'superadmin@pms.co.ke',
    fullName: 'Platform Super Admin',
    role: 'SUPER_ADMIN',
  })

  // =========================================================================
  // Organization 1 — Prime Property Management Ltd (the demo portfolio)
  // =========================================================================
  console.log('Seeding Prime Property Management Ltd …')
  const prime = await createOrganization({
    name: 'Prime Property Management Ltd',
    slug: 'prime',
    legalName: 'Prime Property Management Limited',
    status: 'ACTIVE',
    plan: 'PROFESSIONAL',
    county: 'Nairobi',
    town: 'Nairobi',
    commissionRate: '1.000',
    contactEmail: 'hello@primeproperty.co.ke',
  })
  const primeScope = systemScope(prime.id, 'Prime Property Management')

  const primeAdmin = await createUser({
    organizationId: prime.id,
    email: 'admin@prime.co.ke',
    fullName: 'Catherine Njeri',
    role: 'ORG_ADMIN',
  })
  const primeManager = await createUser({
    organizationId: prime.id,
    email: 'manager@prime.co.ke',
    fullName: 'Peter Otieno',
    role: 'PROPERTY_MANAGER',
  })
  const primeAccountant = await createUser({
    organizationId: prime.id,
    email: 'accounts@prime.co.ke',
    fullName: 'Mary Wanjiku',
    role: 'ACCOUNTANT',
  })
  const primeCaretaker = await createUser({
    organizationId: prime.id,
    email: 'caretaker@prime.co.ke',
    fullName: 'Joseph Mutiso',
    role: 'CARETAKER',
  })
  const primeMaintenance = await createUser({
    organizationId: prime.id,
    email: 'maintenance@prime.co.ke',
    fullName: 'Alice Chebet',
    role: 'MAINTENANCE',
  })
  await createUser({
    organizationId: prime.id,
    email: 'auditor@prime.co.ke',
    fullName: 'Samuel Kiprono',
    role: 'AUDITOR',
  })

  const wanjikuPin = kraPin()
  const kamauPin = kraPin()
  const achiengPin = kraPin()

  const [wanjiku] = await db
    .insert(s.landlords)
    .values({
      organizationId: prime.id,
      code: 'LL-001',
      type: 'COMPANY',
      fullName: 'Grace Wanjiku',
      companyName: 'Wanjiku Holdings Ltd',
      registrationNumber: `CPR/2016/${int(100000, 999999)}`,
      kraPin: wanjikuPin,
      phone: phoneNumber(),
      email: 'finance@wanjikuholdings.co.ke',
      address: 'P.O. Box 24518-00100, Nairobi',
      county: 'Nairobi',
      town: 'Nairobi',
      payoutMethod: 'BANK',
      bankName: 'Kenya Commercial Bank',
      bankBranch: 'Kilimani',
      bankAccountName: 'Wanjiku Holdings Ltd',
      bankAccountNumber: `11${int(10000000, 99999999)}`,
      taxpayerType: 'COMPANY',
      eritsStatus: 'REGISTERED',
      eritsTaxpayerRef: `ERT-${int(100000, 999999)}`,
      notes: 'Anchor client. Statements are due by the 5th of each month.',
    })
    .returning()

  const [kamau] = await db
    .insert(s.landlords)
    .values({
      organizationId: prime.id,
      code: 'LL-002',
      type: 'INDIVIDUAL',
      fullName: 'Joseph Kamau Mwangi',
      nationalId: nationalId(),
      kraPin: kamauPin,
      phone: phoneNumber(),
      email: 'jkmwangi@example.co.ke',
      address: 'P.O. Box 9921-00200, Nairobi',
      county: 'Nairobi',
      town: 'Nairobi',
      payoutMethod: 'MPESA',
      mpesaNumber: phoneNumber(),
      taxpayerType: 'INDIVIDUAL',
      eritsStatus: 'REGISTERED',
      eritsTaxpayerRef: `ERT-${int(100000, 999999)}`,
    })
    .returning()

  const [achieng] = await db
    .insert(s.landlords)
    .values({
      organizationId: prime.id,
      code: 'LL-003',
      type: 'COMPANY',
      fullName: 'Everline Achieng',
      companyName: 'Achieng Properties Ltd',
      registrationNumber: `CPR/2019/${int(100000, 999999)}`,
      kraPin: achiengPin,
      phone: phoneNumber(),
      email: 'accounts@achiengproperties.co.ke',
      county: 'Nairobi',
      town: 'Nairobi',
      payoutMethod: 'BANK',
      bankName: 'Equity Bank',
      bankBranch: 'Westlands',
      bankAccountName: 'Achieng Properties Ltd',
      bankAccountNumber: `04${int(10000000, 99999999)}`,
      taxpayerType: 'COMPANY',
      eritsStatus: 'PENDING',
      commissionRate: '1.250',
      notes: 'Negotiated commission of 1.25% across the portfolio.',
    })
    .returning()

  await createUser({
    organizationId: prime.id,
    email: 'landlord@wanjikuholdings.co.ke',
    fullName: 'Grace Wanjiku',
    role: 'LANDLORD',
    landlordId: wanjiku.id,
  })

  for (const [landlord, pin] of [
    [wanjiku, wanjikuPin],
    [kamau, kamauPin],
    [achieng, achiengPin],
  ] as const) {
    await db.insert(s.taxProfiles).values({
      organizationId: prime.id,
      landlordId: landlord.id,
      kraPin: pin,
      taxpayerType: landlord.taxpayerType,
      taxObligation: 'Monthly Rental Income',
      eritsRegistered: landlord.eritsStatus === 'REGISTERED',
      eritsTaxpayerRef: landlord.eritsTaxpayerRef,
      registrationDate: landlord.eritsStatus === 'REGISTERED' ? new Date(2024, 2, 14) : null,
    })
  }

  const propertyPlans: { plan: PropertyPlan; landlordId: string; pin: string; withKraPin: boolean }[] = [
    {
      landlordId: wanjiku.id,
      pin: wanjikuPin,
      withKraPin: true,
      plan: {
        code: 'GV',
        name: 'Greenview Apartments',
        type: 'APARTMENT',
        county: 'Nairobi',
        town: 'Nairobi',
        area: 'Kilimani',
        managementFeeRate: '5.000',
        occupiedTarget: 44,
        units: [
          { count: 16, type: 'ONE_BEDROOM', bedrooms: 1, bathrooms: 1, rent: 22000, serviceCharge: 2000, prefix: 'A' },
          { count: 20, type: 'TWO_BEDROOM', bedrooms: 2, bathrooms: 2, rent: 25000, serviceCharge: 2500, prefix: 'B' },
          { count: 12, type: 'THREE_BEDROOM', bedrooms: 3, bathrooms: 2, rent: 30000, serviceCharge: 3000, prefix: 'C' },
        ],
      },
    },
    {
      landlordId: kamau.id,
      pin: kamauPin,
      withKraPin: true,
      plan: {
        code: 'KH',
        name: 'Kileleshwa Heights',
        type: 'APARTMENT',
        county: 'Nairobi',
        town: 'Nairobi',
        area: 'Kileleshwa',
        managementFeeRate: '6.000',
        occupiedTarget: 4,
        units: [
          { count: 12, type: 'THREE_BEDROOM', bedrooms: 3, bathrooms: 3, rent: 55000, serviceCharge: 6000, prefix: 'K' },
        ],
      },
    },
    {
      landlordId: achieng.id,
      pin: achiengPin,
      withKraPin: true,
      plan: {
        code: 'WC',
        name: 'Westlands Court',
        type: 'MIXED_USE',
        county: 'Nairobi',
        town: 'Nairobi',
        area: 'Westlands',
        managementFeeRate: '5.500',
        occupiedTarget: 20,
        units: [
          { count: 18, type: 'TWO_BEDROOM', bedrooms: 2, bathrooms: 2, rent: 38000, serviceCharge: 4000, prefix: 'W' },
          { count: 6, type: 'SHOP', bedrooms: 0, bathrooms: 1, rent: 65000, serviceCharge: 8000, prefix: 'S' },
        ],
      },
    },
    {
      landlordId: achieng.id,
      pin: achiengPin,
      withKraPin: true,
      plan: {
        code: 'RG',
        name: 'Riverside Gardens',
        type: 'RESIDENTIAL',
        county: 'Nairobi',
        town: 'Nairobi',
        area: 'Riverside',
        managementFeeRate: '5.000',
        occupiedTarget: 10,
        units: [
          { count: 8, type: 'BEDSITTER', bedrooms: 0, bathrooms: 1, rent: 16000, serviceCharge: 1500, prefix: 'R' },
          { count: 8, type: 'ONE_BEDROOM', bedrooms: 1, bathrooms: 1, rent: 24000, serviceCharge: 2000, prefix: 'G' },
        ],
      },
    },
    {
      landlordId: achieng.id,
      pin: achiengPin,
      // Left without a KRA PIN on purpose so the compliance engine raises a
      // real exception on the eRITS screen.
      withKraPin: false,
      plan: {
        code: 'IB',
        name: 'Industrial Area Business Park',
        type: 'COMMERCIAL',
        county: 'Nairobi',
        town: 'Nairobi',
        area: 'Industrial Area',
        managementFeeRate: '4.000',
        occupiedTarget: 2,
        units: [
          { count: 8, type: 'OFFICE_SPACE', bedrooms: 0, bathrooms: 2, rent: 110000, serviceCharge: 15000, prefix: 'U' },
        ],
      },
    },
  ]

  const propertyCodes = new Map<string, string>()
  const primeProperties: { id: string; landlordId: string; name: string }[] = []
  const occupancy: { tenantId: string; unitId: string; propertyId: string }[] = []

  for (const entry of propertyPlans) {
    const { property, units } = await createProperty(
      prime.id,
      entry.landlordId,
      pick([primeManager.id, primeAdmin.id]),
      entry.plan,
      entry.pin,
      entry.withKraPin,
    )
    propertyCodes.set(property.id, property.code)
    primeProperties.push({ id: property.id, landlordId: property.landlordId, name: property.name })

    const created = await occupy(primeScope, property, units, entry.plan.occupiedTarget, now)
    for (const item of created) {
      occupancy.push({ tenantId: item.tenant.id, unitId: item.lease.unitId, propertyId: property.id })
    }
    console.log(`  ${property.name}: ${units.length} units, ${created.length} occupied`)
  }

  console.log('Running billing and payment history …')
  const paymentsMade = await simulateHistory(
    primeScope,
    now,
    6,
    [0.98, 0.97, 0.97, 0.96, 0.94, 0.84],
    propertyCodes,
  )
  await seedUnmatchedPayments(primeScope, now)
  console.log(`  ${paymentsMade} payments reconciled through the live pipeline`)

  console.log('Seeding vendors, maintenance and expenses …')
  const { vendors } = await seedVendorsAndMaintenance(
    primeScope,
    primeProperties,
    occupancy,
    [primeMaintenance.id, primeCaretaker.id, primeManager.id],
    now,
  )
  const expenseCount = await seedExpenses(primeScope, primeProperties, vendors, now)
  console.log(`  ${expenseCount} expenses recorded`)

  console.log('Creating landlord settlement batches …')
  const batches = await seedSettlements(primeScope, [wanjiku.id, kamau.id, achieng.id], now)
  console.log(`  ${batches} settlement batches`)

  console.log('Mapping properties to eRITS and building tax periods …')
  for (const property of primeProperties) {
    // Industrial Area Business Park is intentionally left unmapped.
    if (property.name.startsWith('Industrial')) continue
    await syncPropertyMapping(primeScope, property.id)
  }

  for (const period of recentPeriods(now, 6)) {
    await buildAllPeriods(primeScope, period.year, period.month)
  }

  const submittable = await db
    .select()
    .from(s.eritsPeriods)
    .where(
      sql`${s.eritsPeriods.organizationId} = ${prime.id}
          and ${s.eritsPeriods.landlordId} = ${wanjiku.id}
          and ${s.eritsPeriods.status} = 'READY_FOR_REVIEW'`,
    )
    .orderBy(s.eritsPeriods.periodYear, s.eritsPeriods.periodMonth)

  for (const period of submittable.slice(0, 2)) {
    await submitPeriod(primeScope, period.id)
    console.log(`  Simulated eRITS submission for ${period.label}`)
  }

  const exceptions = await refreshComplianceExceptions(primeScope)
  console.log(`  ${exceptions} compliance exceptions detected`)

  // =========================================================================
  // Organization 2 — a second management company (isolation proof)
  // =========================================================================
  console.log('Seeding Skyline Property Managers Ltd …')
  const skyline = await createOrganization({
    name: 'Skyline Property Managers Ltd',
    slug: 'skyline',
    legalName: 'Skyline Property Managers Limited',
    status: 'ACTIVE',
    plan: 'STARTER',
    county: 'Mombasa',
    town: 'Mombasa',
    commissionRate: '1.500',
    contactEmail: 'admin@skylinepm.co.ke',
  })
  const skylineScope = systemScope(skyline.id, 'Skyline Property Managers')

  await createUser({
    organizationId: skyline.id,
    email: 'admin@skyline.co.ke',
    fullName: 'Hassan Abdallah',
    role: 'ORG_ADMIN',
  })

  const [skylineLandlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: skyline.id,
      code: 'LL-001',
      type: 'INDIVIDUAL',
      fullName: 'Amina Said',
      nationalId: nationalId(),
      // No KRA PIN — raises a compliance exception inside Skyline only.
      phone: phoneNumber(),
      email: 'amina.said@example.co.ke',
      county: 'Mombasa',
      town: 'Mombasa',
      payoutMethod: 'MPESA',
      mpesaNumber: phoneNumber(),
      taxpayerType: 'INDIVIDUAL',
    })
    .returning()

  const skylineBuild = await createProperty(
    skyline.id,
    skylineLandlord.id,
    null,
    {
      code: 'NY',
      name: 'Nyali Beach Residences',
      type: 'APARTMENT',
      county: 'Mombasa',
      town: 'Mombasa',
      area: 'Nyali',
      managementFeeRate: '7.000',
      occupiedTarget: 8,
      units: [
        { count: 6, type: 'TWO_BEDROOM', bedrooms: 2, bathrooms: 2, rent: 45000, serviceCharge: 5000, prefix: 'N' },
        { count: 6, type: 'THREE_BEDROOM', bedrooms: 3, bathrooms: 3, rent: 60000, serviceCharge: 6500, prefix: 'P' },
      ],
    },
    kraPin(),
  )
  await occupy(skylineScope, skylineBuild.property, skylineBuild.units, 8, now)
  await simulateHistory(
    skylineScope,
    now,
    5,
    [0.96, 0.95, 0.94, 0.9, 0.7],
    new Map([[skylineBuild.property.id, 'NY']]),
  )
  await refreshComplianceExceptions(skylineScope)

  // =========================================================================
  // Organization 3 — an independent landlord on a trial
  // =========================================================================
  console.log('Seeding Mwangi Family Holdings …')
  const independent = await createOrganization({
    name: 'Mwangi Family Holdings',
    slug: 'mwangi',
    legalName: 'Mwangi Family Holdings',
    status: 'TRIAL',
    plan: 'STARTER',
    county: 'Kiambu',
    town: 'Ruiru',
    commissionRate: '1.000',
    contactEmail: 'mwangi.family@example.co.ke',
  })
  const independentScope = systemScope(independent.id, 'Mwangi Family Holdings')

  await db
    .update(s.organizations)
    .set({ trialEndsAt: addDays(now, 21) })
    .where(eq(s.organizations.id, independent.id))

  await createUser({
    organizationId: independent.id,
    email: 'owner@mwangifamily.co.ke',
    fullName: 'Stephen Mwangi',
    role: 'ORG_ADMIN',
  })

  const [independentLandlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: independent.id,
      code: 'LL-001',
      type: 'INDIVIDUAL',
      fullName: 'Stephen Mwangi',
      nationalId: nationalId(),
      kraPin: kraPin(),
      phone: phoneNumber(),
      email: 'stephen.mwangi@example.co.ke',
      county: 'Kiambu',
      town: 'Ruiru',
      payoutMethod: 'MPESA',
      mpesaNumber: phoneNumber(),
      taxpayerType: 'INDIVIDUAL',
      eritsStatus: 'NOT_REGISTERED',
    })
    .returning()

  const independentBuild = await createProperty(
    independent.id,
    independentLandlord.id,
    null,
    {
      code: 'MC',
      name: 'Mwangi Court',
      type: 'BEDSITTER_COMPLEX',
      county: 'Kiambu',
      town: 'Ruiru',
      area: 'Kamakis',
      managementFeeRate: '0.000',
      occupiedTarget: 9,
      units: [{ count: 10, type: 'BEDSITTER', bedrooms: 0, bathrooms: 1, rent: 9500, serviceCharge: 500, prefix: 'M' }],
    },
    kraPin(),
  )
  await occupy(independentScope, independentBuild.property, independentBuild.units, 9, now)
  await simulateHistory(
    independentScope,
    now,
    4,
    [0.95, 0.94, 0.92, 0.8],
    new Map([[independentBuild.property.id, 'MC']]),
  )
  await refreshComplianceExceptions(independentScope)

  // =========================================================================
  // Tenant portal accounts
  // =========================================================================
  console.log('Creating tenant portal accounts …')
  const portalAccounts = await seedPortalAccounts(primeScope, {
    good: 'tenant@example.co.ke',
    arrears: 'tenant.arrears@example.co.ke',
  })
  // A tenant in the second organization, so portal isolation is demonstrable
  // the same way the staff-side isolation is.
  const skylinePortal = await seedPortalAccounts(skylineScope, {
    good: 'tenant@skyline.co.ke',
    arrears: 'tenant.arrears@skyline.co.ke',
  })
  for (const account of [...portalAccounts, ...skylinePortal]) {
    console.log(`  ${account.email} — ${account.note}`)
  }

  // =========================================================================
  // Summary
  // =========================================================================
  const counts = await db.execute(sql`
    select
      (select count(*) from organizations)      as organizations,
      (select count(*) from users)              as users,
      (select count(*) from landlords)          as landlords,
      (select count(*) from properties)         as properties,
      (select count(*) from units)              as units,
      (select count(*) from tenants)            as tenants,
      (select count(*) from leases)             as leases,
      (select count(*) from rent_invoices)      as invoices,
      (select count(*) from payments)           as payments,
      (select count(*) from receipts)           as receipts,
      (select count(*) from ledger_entries)     as ledger_entries,
      (select count(*) from settlements)        as settlements,
      (select count(*) from maintenance_tickets) as tickets,
      (select count(*) from expenses)           as expenses,
      (select count(*) from erits_periods)      as erits_periods,
      (select count(*) from compliance_exceptions) as exceptions,
      (select count(*) from audit_logs)         as audit_logs,
      (select coalesce(sum(gross_amount), 0) from payments where status = 'CONFIRMED') as collected,
      (select coalesce(sum(balance), 0) from rent_invoices where status <> 'CANCELLED') as outstanding
  `)

  const row = (counts.rows?.[0] ?? {}) as Record<string, string>
  console.log('\n─────────────────────────────────────────────')
  for (const [key, value] of Object.entries(row)) {
    if (key === 'collected' || key === 'outstanding') {
      console.log(`  ${key.padEnd(18)} ${formatKES(value)}`)
    } else {
      console.log(`  ${key.padEnd(18)} ${value}`)
    }
  }
  console.log('─────────────────────────────────────────────')
  console.log('\nSign in with any of these (password: Password123):')
  console.log('  admin@prime.co.ke       Company Admin')
  console.log('  manager@prime.co.ke     Property Manager')
  console.log('  accounts@prime.co.ke    Accountant')
  console.log('  landlord@wanjikuholdings.co.ke  Landlord portal')
  console.log('  tenant@example.co.ke    Tenant portal — up to date')
  console.log('  tenant.arrears@example.co.ke  Tenant portal — in arrears')
  console.log('  auditor@prime.co.ke     Read-only auditor')
  console.log('  admin@skyline.co.ke     A different organization')
  console.log('  superadmin@pms.co.ke    Platform super admin')
  console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s.\n`)

  await getPool().end()
}

main().catch(async (error) => {
  console.error(error)
  await getPool().end()
  process.exit(1)
})
