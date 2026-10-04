// ===========================================================================
//  KENYA PMS — Multi-tenant SaaS Property Management System
//  Phase 1 database schema (PostgreSQL via Drizzle ORM).
//
//  TENANCY RULE
//  Every tenant-scoped table carries `organization_id` and is indexed on it.
//  All reads and writes go through the org-scoped guards in src/lib/tenancy.ts
//  so that one organization can never observe another's data.
//
//  MONEY RULE
//  Every monetary column is numeric(16,2) in KES and is returned to the
//  application as a string. Arithmetic happens in integer cents
//  (src/lib/money.ts) and only the rounded result is written back, so no
//  floating-point error can accumulate anywhere in the financial pipeline.
// ===========================================================================

import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import { newId } from '../lib/ids'

// ---------------------------------------------------------------------------
// Column helpers
// ---------------------------------------------------------------------------

const pk = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => newId())

/** KES amount, numeric(16,2) — up to 99 trillion shillings, exact to the cent. */
const money = (name: string) => numeric(name, { precision: 16, scale: 2 })
/** Percentage rate, numeric(6,3) — e.g. 1.000 for the 1% platform commission. */
const rate = (name: string) => numeric(name, { precision: 6, scale: 3 })
const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' })
const createdAt = () => ts('created_at').notNull().defaultNow()
const updatedAt = () => ts('updated_at').notNull().defaultNow()

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const orgStatusEnum = pgEnum('org_status', ['TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED'])
export const subscriptionPlanEnum = pgEnum('subscription_plan', ['STARTER', 'PROFESSIONAL', 'ENTERPRISE'])
export const userRoleEnum = pgEnum('user_role', [
  'SUPER_ADMIN',
  'ORG_ADMIN',
  'PROPERTY_MANAGER',
  'ACCOUNTANT',
  'LANDLORD',
  'CARETAKER',
  'MAINTENANCE',
  'AUDITOR',
  'TENANT',
])
export const landlordTypeEnum = pgEnum('landlord_type', ['INDIVIDUAL', 'COMPANY'])
export const payoutMethodEnum = pgEnum('payout_method', ['MPESA', 'BANK'])
export const taxpayerTypeEnum = pgEnum('taxpayer_type', ['INDIVIDUAL', 'COMPANY', 'ANY'])
export const propertyTypeEnum = pgEnum('property_type', [
  'RESIDENTIAL',
  'COMMERCIAL',
  'MIXED_USE',
  'APARTMENT',
  'BEDSITTER_COMPLEX',
  'MAISONETTE',
  'HOSTEL',
  'OFFICE',
  'RETAIL',
  'INDUSTRIAL',
  'OTHER',
])
/** How a valuation figure was arrived at — never hard-coded into the value. */
export const valuationBasisEnum = pgEnum('valuation_basis', [
  'PROFESSIONAL',
  'BANK',
  'PURCHASE_PRICE',
  'ESTIMATE',
])
export const propertyStatusEnum = pgEnum('property_status', [
  'ACTIVE',
  'INACTIVE',
  'UNDER_CONSTRUCTION',
  'ARCHIVED',
])
export const unitTypeEnum = pgEnum('unit_type', [
  'BEDSITTER',
  'STUDIO',
  'ONE_BEDROOM',
  'TWO_BEDROOM',
  'THREE_BEDROOM',
  'FOUR_BEDROOM',
  'MAISONETTE',
  'SHOP',
  'OFFICE_SPACE',
  'HOSTEL_ROOM',
  'OTHER',
])
export const unitStatusEnum = pgEnum('unit_status', [
  'OCCUPIED',
  'VACANT',
  'RESERVED',
  'MAINTENANCE',
  'UNAVAILABLE',
])
export const tenantStatusEnum = pgEnum('tenant_status', [
  'PROSPECT',
  'ACTIVE',
  'NOTICE',
  'VACATED',
  'BLACKLISTED',
])
export const leaseStatusEnum = pgEnum('lease_status', [
  'DRAFT',
  'ACTIVE',
  'EXPIRING',
  'EXPIRED',
  'TERMINATED',
  'RENEWED',
])
export const penaltyTypeEnum = pgEnum('penalty_type', ['NONE', 'FIXED', 'PERCENT'])
export const chargeTypeEnum = pgEnum('charge_type', [
  'RENT',
  'SERVICE_CHARGE',
  'UTILITY',
  'WATER',
  'ELECTRICITY',
  'PARKING',
  'PENALTY',
  'DEPOSIT',
  'CREDIT',
  'ADJUSTMENT',
  'OTHER',
])
export const chargeFrequencyEnum = pgEnum('charge_frequency', ['MONTHLY', 'QUARTERLY', 'ANNUAL', 'ONE_OFF'])
export const invoiceStatusEnum = pgEnum('invoice_status', [
  'DRAFT',
  'DUE',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'CANCELLED',
])
export const paymentMethodEnum = pgEnum('payment_method', [
  'MPESA',
  'BANK_TRANSFER',
  'CASH',
  'CHEQUE',
  'CARD',
  'ADJUSTMENT',
])
export const paymentStatusEnum = pgEnum('payment_status', [
  'INITIATED',
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'REVERSED',
  'UNMATCHED',
])
export const reconciliationStatusEnum = pgEnum('reconciliation_status', [
  'UNRECONCILED',
  'AUTO_MATCHED',
  'MANUALLY_MATCHED',
  'PARTIALLY_ALLOCATED',
  'EXCEPTION',
])
export const settlementStatusEnum = pgEnum('settlement_status', [
  'PENDING',
  'SCHEDULED',
  'PROCESSING',
  'SETTLED',
  'FAILED',
  'REVERSED',
])
export const ledgerEntryTypeEnum = pgEnum('ledger_entry_type', ['DEBIT', 'CREDIT'])
export const ledgerAccountEnum = pgEnum('ledger_account', [
  'CASH_MPESA',
  'CASH_BANK',
  'CASH_ON_HAND',
  'RENT_RECEIVABLE',
  'RENT_INCOME',
  'SERVICE_CHARGE_INCOME',
  'PENALTY_INCOME',
  'COMMISSION_INCOME',
  'LANDLORD_PAYABLE',
  'SECURITY_DEPOSIT_LIABILITY',
  'PROPERTY_EXPENSE',
  'SUSPENSE',
  'ADJUSTMENTS',
])
export const ledgerSourceTypeEnum = pgEnum('ledger_source_type', [
  'INVOICE',
  'PAYMENT',
  'COMMISSION',
  'SETTLEMENT',
  'EXPENSE',
  'ADJUSTMENT',
  'REVERSAL',
])
export const commissionScopeEnum = pgEnum('commission_scope', [
  'GLOBAL',
  'ORGANIZATION',
  'LANDLORD',
  'PROPERTY',
])
export const commissionStatusEnum = pgEnum('commission_status', ['PENDING', 'EARNED', 'SETTLED', 'REVERSED'])
export const expenseCategoryEnum = pgEnum('expense_category', [
  'MAINTENANCE',
  'SECURITY',
  'CLEANING',
  'UTILITIES',
  'INSURANCE',
  'RATES',
  'REPAIRS',
  'MANAGEMENT',
  'PROFESSIONAL_FEES',
  'OTHER',
])
export const approvalStatusEnum = pgEnum('approval_status', ['PENDING', 'APPROVED', 'REJECTED'])
export const expensePaymentStatusEnum = pgEnum('expense_payment_status', ['UNPAID', 'PARTIALLY_PAID', 'PAID'])
export const maintenanceCategoryEnum = pgEnum('maintenance_category', [
  'PLUMBING',
  'ELECTRICAL',
  'WATER',
  'STRUCTURAL',
  'SECURITY',
  'APPLIANCE',
  'INTERNET',
  'CLEANING',
  'OTHER',
])
export const priorityEnum = pgEnum('priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT'])
export const ticketStatusEnum = pgEnum('ticket_status', [
  'REPORTED',
  'ACKNOWLEDGED',
  'ASSIGNED',
  'IN_PROGRESS',
  'WAITING',
  'RESOLVED',
  'CLOSED',
])
export const eritsStatusEnum = pgEnum('erits_status', [
  'NOT_REGISTERED',
  'PENDING',
  'REGISTERED',
  'REQUIRES_ATTENTION',
  'SYNC_FAILED',
])
export const eritsPeriodStatusEnum = pgEnum('erits_period_status', [
  'OPEN',
  'READY_FOR_REVIEW',
  'UNDER_REVIEW',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
])
export const submissionStatusEnum = pgEnum('submission_status', [
  'SIMULATED',
  'SUBMITTED',
  'ACCEPTED',
  'REJECTED',
  'FAILED',
])
export const syncStatusEnum = pgEnum('sync_status', ['SUCCESS', 'FAILED', 'SKIPPED'])
export const exceptionSeverityEnum = pgEnum('exception_severity', ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
export const exceptionStatusEnum = pgEnum('exception_status', ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'IGNORED'])
export const integrationStatusEnum = pgEnum('integration_status', [
  'CONNECTED',
  'SANDBOX',
  'AVAILABLE',
  'COMING_SOON',
  'DISCONNECTED',
  'ERROR',
])
export const documentTypeEnum = pgEnum('document_type', [
  'LEASE',
  'NATIONAL_ID',
  'KRA_PIN',
  'RECEIPT',
  'INVOICE',
  'EXPENSE',
  'PROPERTY',
  'INSPECTION',
  'OTHER',
])
export const notificationChannelEnum = pgEnum('notification_channel', ['IN_APP', 'SMS', 'EMAIL'])
export const notificationStatusEnum = pgEnum('notification_status', ['QUEUED', 'SENT', 'FAILED', 'READ'])
export const moveTypeEnum = pgEnum('move_type', ['MOVE_IN', 'MOVE_OUT'])
export const moveStatusEnum = pgEnum('move_status', ['SCHEDULED', 'COMPLETED', 'CANCELLED'])
export const billingRunStatusEnum = pgEnum('billing_run_status', ['RUNNING', 'COMPLETED', 'FAILED'])

// ---------------------------------------------------------------------------
// Tenancy root
// ---------------------------------------------------------------------------

export const organizations = pgTable(
  'organizations',
  {
    id: pk(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    legalName: text('legal_name'),
    kraPin: text('kra_pin'),
    status: orgStatusEnum('status').notNull().default('TRIAL'),
    plan: subscriptionPlanEnum('plan').notNull().default('STARTER'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    county: text('county'),
    town: text('town'),
    address: text('address'),
    logoUrl: text('logo_url'),
    /** Default platform commission for this organization, percent (spec §16). */
    commissionRate: rate('commission_rate').notNull().default('1.000'),
    currency: text('currency').notNull().default('KES'),
    timezone: text('timezone').notNull().default('Africa/Nairobi'),
    /**
     * Whether tenants may create their own portal login from their tenant code
     * and the phone number on file. Off means invitation only.
     */
    portalSelfSignup: boolean('portal_self_signup').notNull().default(true),
    trialEndsAt: ts('trial_ends_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('organizations_status_idx').on(t.status)],
)

const orgRef = () =>
  text('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' })

const orgRefNullable = () => text('organization_id').references(() => organizations.id, { onDelete: 'cascade' })

// ---------------------------------------------------------------------------
// Identity & access
// ---------------------------------------------------------------------------

export const permissions = pgTable(
  'permissions',
  {
    id: pk(),
    key: text('key').notNull().unique(),
    module: text('module').notNull(),
    label: text('label').notNull(),
    description: text('description'),
  },
  (t) => [index('permissions_module_idx').on(t.module)],
)

export const roles = pgTable(
  'roles',
  {
    id: pk(),
    organizationId: orgRefNullable(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    isSystem: boolean('is_system').notNull().default(false),
    /** Permission keys granted to this role — configurable per organization. */
    permissions: text('permissions')
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('roles_org_key_uq').on(t.organizationId, t.key), index('roles_org_idx').on(t.organizationId)],
)

export const users = pgTable(
  'users',
  {
    id: pk(),
    /** Null only for SUPER_ADMIN platform staff. */
    organizationId: orgRefNullable(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    role: userRoleEnum('role').notNull(),
    roleId: text('role_id'),
    /** Set when this login belongs to a landlord / property-owner portal user. */
    landlordId: text('landlord_id'),
    /** Set when this login belongs to a tenant portal user (spec: tenant role). */
    tenantId: text('tenant_id'),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: ts('last_login_at'),
    avatarUrl: text('avatar_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('users_org_idx').on(t.organizationId), index('users_role_idx').on(t.role)],
)

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export const landlords = pgTable(
  'landlords',
  {
    id: pk(),
    organizationId: orgRef(),
    code: text('code').notNull(),
    type: landlordTypeEnum('type').notNull().default('INDIVIDUAL'),
    fullName: text('full_name').notNull(),
    companyName: text('company_name'),
    nationalId: text('national_id'),
    registrationNumber: text('registration_number'),
    kraPin: text('kra_pin'),
    phone: text('phone').notNull(),
    email: text('email'),
    address: text('address'),
    county: text('county'),
    town: text('town'),
    payoutMethod: payoutMethodEnum('payout_method').notNull().default('MPESA'),
    mpesaNumber: text('mpesa_number'),
    bankName: text('bank_name'),
    bankBranch: text('bank_branch'),
    bankAccountName: text('bank_account_name'),
    bankAccountNumber: text('bank_account_number'),
    taxpayerType: taxpayerTypeEnum('taxpayer_type').notNull().default('INDIVIDUAL'),
    eritsStatus: eritsStatusEnum('erits_status').notNull().default('NOT_REGISTERED'),
    eritsTaxpayerRef: text('erits_taxpayer_ref'),
    /** Overrides the organization commission rate when set, percent. */
    commissionRate: rate('commission_rate'),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('landlords_org_code_uq').on(t.organizationId, t.code),
    index('landlords_org_idx').on(t.organizationId),
  ],
)

export const properties = pgTable(
  'properties',
  {
    id: pk(),
    organizationId: orgRef(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    type: propertyTypeEnum('type').notNull().default('APARTMENT'),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    managerId: text('manager_id').references(() => users.id),
    kraPin: text('kra_pin'),
    /** Reference issued by KRA eRITS for this rental property (spec §23). */
    eritsPropertyRef: text('erits_property_ref'),
    county: text('county').notNull(),
    town: text('town').notNull(),
    area: text('area'),
    address: text('address'),
    unitCount: integer('unit_count').notNull().default(0),
    expectedMonthlyRent: money('expected_monthly_rent').notNull().default('0'),
    /** Management fee charged to the landlord, percent. */
    managementFeeRate: rate('management_fee_rate').notNull().default('0'),
    /** Platform commission override for this property, percent. */
    commissionRate: rate('commission_rate'),
    settlementAccount: text('settlement_account'),
    status: propertyStatusEnum('status').notNull().default('ACTIVE'),
    yearBuilt: integer('year_built'),
    description: text('description'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('properties_org_code_uq').on(t.organizationId, t.code),
    index('properties_org_idx').on(t.organizationId),
    index('properties_landlord_idx').on(t.landlordId),
  ],
)

/**
 * What a property is worth, and when someone decided so.
 *
 * Append-only and dated, rather than a single `market_value` column on
 * `properties`. A valuation is an opinion with an author and a date attached:
 * overwriting it loses the only thing that makes the number defensible, and a
 * portfolio value that moves has to be explainable by pointing at the
 * valuations that moved it. The current value of a property is simply its
 * latest row by `valued_at`.
 */
export const propertyValuations = pgTable(
  'property_valuations',
  {
    id: pk(),
    organizationId: orgRef(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    valuedAt: ts('valued_at').notNull(),
    basis: valuationBasisEnum('basis').notNull().default('ESTIMATE'),
    /** Who produced the figure — a firm, a bank, or the manager's own estimate. */
    valuerName: text('valuer_name'),
    reference: text('reference'),
    note: text('note'),
    recordedBy: text('recorded_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('property_valuations_org_idx').on(t.organizationId),
    index('property_valuations_property_idx').on(t.propertyId, t.valuedAt),
  ],
)

export const units = pgTable(
  'units',
  {
    id: pk(),
    organizationId: orgRef(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    unitNumber: text('unit_number').notNull(),
    floor: integer('floor').notNull().default(0),
    type: unitTypeEnum('type').notNull().default('ONE_BEDROOM'),
    bedrooms: integer('bedrooms').notNull().default(1),
    bathrooms: integer('bathrooms').notNull().default(1),
    sizeSqm: integer('size_sqm'),
    monthlyRent: money('monthly_rent').notNull().default('0'),
    deposit: money('deposit').notNull().default('0'),
    serviceCharge: money('service_charge').notNull().default('0'),
    status: unitStatusEnum('status').notNull().default('VACANT'),
    currentLeaseId: text('current_lease_id'),
    currentTenantId: text('current_tenant_id'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('units_property_number_uq').on(t.propertyId, t.unitNumber),
    index('units_org_idx').on(t.organizationId),
    index('units_property_idx').on(t.propertyId),
    index('units_status_idx').on(t.status),
  ],
)

// ---------------------------------------------------------------------------
// Tenancy
// ---------------------------------------------------------------------------

export const tenants = pgTable(
  'tenants',
  {
    id: pk(),
    organizationId: orgRef(),
    code: text('code').notNull(),
    fullName: text('full_name').notNull(),
    nationalId: text('national_id'),
    passportNumber: text('passport_number'),
    kraPin: text('kra_pin'),
    phone: text('phone').notNull(),
    email: text('email'),
    emergencyName: text('emergency_name'),
    emergencyPhone: text('emergency_phone'),
    emergencyRelationship: text('emergency_relationship'),
    occupation: text('occupation'),
    employer: text('employer'),
    status: tenantStatusEnum('status').notNull().default('ACTIVE'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tenants_org_code_uq').on(t.organizationId, t.code),
    index('tenants_org_idx').on(t.organizationId),
    index('tenants_phone_idx').on(t.phone),
  ],
)

export const tenantNotes = pgTable(
  'tenant_notes',
  {
    id: pk(),
    organizationId: orgRef(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    authorId: text('author_id'),
    authorName: text('author_name'),
    body: text('body').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('tenant_notes_org_idx').on(t.organizationId), index('tenant_notes_tenant_idx').on(t.tenantId)],
)

export const leases = pgTable(
  'leases',
  {
    id: pk(),
    organizationId: orgRef(),
    code: text('code').notNull(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id),
    startDate: ts('start_date').notNull(),
    endDate: ts('end_date').notNull(),
    monthlyRent: money('monthly_rent').notNull(),
    deposit: money('deposit').notNull().default('0'),
    serviceCharge: money('service_charge').notNull().default('0'),
    /** Day of month rent falls due (spec §12 — e.g. the 5th). */
    dueDayOfMonth: integer('due_day_of_month').notNull().default(5),
    gracePeriodDays: integer('grace_period_days').notNull().default(5),
    penaltyType: penaltyTypeEnum('penalty_type').notNull().default('PERCENT'),
    penaltyValue: money('penalty_value').notNull().default('0'),
    escalationPercent: rate('escalation_percent').notNull().default('0'),
    escalationMonths: integer('escalation_months').notNull().default(12),
    noticePeriodDays: integer('notice_period_days').notNull().default(60),
    status: leaseStatusEnum('status').notNull().default('ACTIVE'),
    moveInDate: ts('move_in_date'),
    moveOutDate: ts('move_out_date'),
    terminationReason: text('termination_reason'),
    renewedFromId: text('renewed_from_id'),
    documentUrl: text('document_url'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('leases_org_code_uq').on(t.organizationId, t.code),
    index('leases_org_idx').on(t.organizationId),
    index('leases_tenant_idx').on(t.tenantId),
    index('leases_unit_idx').on(t.unitId),
    index('leases_status_idx').on(t.status),
  ],
)

export const leaseCharges = pgTable(
  'lease_charges',
  {
    id: pk(),
    organizationId: orgRef(),
    leaseId: text('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    type: chargeTypeEnum('type').notNull(),
    label: text('label').notNull(),
    amount: money('amount').notNull(),
    frequency: chargeFrequencyEnum('frequency').notNull().default('MONTHLY'),
    isActive: boolean('is_active').notNull().default(true),
    startDate: ts('start_date'),
    endDate: ts('end_date'),
    createdAt: createdAt(),
  },
  (t) => [index('lease_charges_org_idx').on(t.organizationId), index('lease_charges_lease_idx').on(t.leaseId)],
)

export const moveEvents = pgTable(
  'move_events',
  {
    id: pk(),
    organizationId: orgRef(),
    type: moveTypeEnum('type').notNull(),
    leaseId: text('lease_id')
      .notNull()
      .references(() => leases.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id),
    scheduledDate: ts('scheduled_date').notNull(),
    completedDate: ts('completed_date'),
    status: moveStatusEnum('status').notNull().default('SCHEDULED'),
    inspectionNotes: text('inspection_notes'),
    depositHeld: money('deposit_held').notNull().default('0'),
    deductions: money('deductions').notNull().default('0'),
    depositRefunded: money('deposit_refunded').notNull().default('0'),
    handledById: text('handled_by_id'),
    handledByName: text('handled_by_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('move_events_org_idx').on(t.organizationId), index('move_events_type_status_idx').on(t.type, t.status)],
)

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const billingRuns = pgTable(
  'billing_runs',
  {
    id: pk(),
    organizationId: orgRef(),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    label: text('label').notNull(),
    invoicesCreated: integer('invoices_created').notNull().default(0),
    invoicesSkipped: integer('invoices_skipped').notNull().default(0),
    totalBilled: money('total_billed').notNull().default('0'),
    status: billingRunStatusEnum('status').notNull().default('RUNNING'),
    message: text('message'),
    runById: text('run_by_id'),
    runByName: text('run_by_name'),
    startedAt: ts('started_at').notNull().defaultNow(),
    completedAt: ts('completed_at'),
  },
  (t) => [index('billing_runs_org_period_idx').on(t.organizationId, t.periodYear, t.periodMonth)],
)

export const rentInvoices = pgTable(
  'rent_invoices',
  {
    id: pk(),
    organizationId: orgRef(),
    number: text('number').notNull(),
    leaseId: text('lease_id')
      .notNull()
      .references(() => leases.id),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    periodLabel: text('period_label').notNull(),
    periodStart: ts('period_start').notNull(),
    periodEnd: ts('period_end').notNull(),
    issueDate: ts('issue_date').notNull(),
    dueDate: ts('due_date').notNull(),
    subtotal: money('subtotal').notNull().default('0'),
    penaltyAmount: money('penalty_amount').notNull().default('0'),
    discountAmount: money('discount_amount').notNull().default('0'),
    total: money('total').notNull().default('0'),
    amountPaid: money('amount_paid').notNull().default('0'),
    balance: money('balance').notNull().default('0'),
    status: invoiceStatusEnum('status').notNull().default('DUE'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('rent_invoices_org_number_uq').on(t.organizationId, t.number),
    unique('rent_invoices_lease_period_uq').on(t.leaseId, t.periodYear, t.periodMonth),
    index('rent_invoices_org_idx').on(t.organizationId),
    index('rent_invoices_status_idx').on(t.status),
    index('rent_invoices_due_idx').on(t.dueDate),
  ],
)

export const invoiceItems = pgTable(
  'invoice_items',
  {
    id: pk(),
    organizationId: orgRef(),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => rentInvoices.id, { onDelete: 'cascade' }),
    type: chargeTypeEnum('type').notNull(),
    description: text('description').notNull(),
    quantity: integer('quantity').notNull().default(1),
    unitAmount: money('unit_amount').notNull(),
    amount: money('amount').notNull(),
  },
  (t) => [index('invoice_items_org_idx').on(t.organizationId), index('invoice_items_invoice_idx').on(t.invoiceId)],
)

// ---------------------------------------------------------------------------
// Payments, reconciliation and the immutable ledger
// ---------------------------------------------------------------------------

/**
 * Raw inbound M-Pesa C2B transactions, stored exactly as received before they
 * are matched to a tenant. Unmatched rows drive the "Unmatched Payments"
 * queue an accountant works through (spec §15).
 */
export const mpesaTransactions = pgTable(
  'mpesa_transactions',
  {
    id: pk(),
    organizationId: orgRefNullable(),
    transactionId: text('transaction_id').notNull().unique(),
    transactionType: text('transaction_type').notNull().default('Pay Bill'),
    msisdn: text('msisdn').notNull(),
    payerName: text('payer_name'),
    amount: money('amount').notNull(),
    billRefNumber: text('bill_ref_number').notNull(),
    shortCode: text('short_code').notNull(),
    transactionTime: ts('transaction_time').notNull(),
    status: paymentStatusEnum('status').notNull().default('PENDING'),
    reconciliationStatus: reconciliationStatusEnum('reconciliation_status').notNull().default('UNRECONCILED'),
    matchedPaymentId: text('matched_payment_id'),
    failureReason: text('failure_reason'),
    rawPayload: jsonb('raw_payload').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    processedAt: ts('processed_at'),
  },
  (t) => [
    index('mpesa_tx_org_idx').on(t.organizationId),
    index('mpesa_tx_reconciliation_idx').on(t.reconciliationStatus),
    index('mpesa_tx_billref_idx').on(t.billRefNumber),
  ],
)

export const payments = pgTable(
  'payments',
  {
    id: pk(),
    organizationId: orgRef(),
    reference: text('reference').notNull(),
    /** Provider reference — e.g. the M-Pesa receipt number. */
    externalReference: text('external_reference'),
    method: paymentMethodEnum('method').notNull().default('MPESA'),
    status: paymentStatusEnum('status').notNull().default('CONFIRMED'),
    reconciliationStatus: reconciliationStatusEnum('reconciliation_status').notNull().default('UNRECONCILED'),
    tenantId: text('tenant_id').references(() => tenants.id),
    leaseId: text('lease_id').references(() => leases.id),
    propertyId: text('property_id').references(() => properties.id),
    unitId: text('unit_id').references(() => units.id),
    landlordId: text('landlord_id').references(() => landlords.id),
    payerName: text('payer_name'),
    payerPhone: text('payer_phone'),
    /** What the payer typed as the account number at the till. */
    accountReference: text('account_reference'),
    grossAmount: money('gross_amount').notNull(),
    commissionAmount: money('commission_amount').notNull().default('0'),
    netAmount: money('net_amount').notNull().default('0'),
    allocatedAmount: money('allocated_amount').notNull().default('0'),
    unallocatedAmount: money('unallocated_amount').notNull().default('0'),
    settlementStatus: settlementStatusEnum('settlement_status').notNull().default('PENDING'),
    settlementId: text('settlement_id'),
    paidAt: ts('paid_at').notNull(),
    receivedAt: ts('received_at').notNull().defaultNow(),
    narrative: text('narrative'),
    rawPayload: jsonb('raw_payload'),
    createdById: text('created_by_id'),
    createdByName: text('created_by_name'),
    reversedAt: ts('reversed_at'),
    reversalReason: text('reversal_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('payments_org_reference_uq').on(t.organizationId, t.reference),
    index('payments_org_idx').on(t.organizationId),
    index('payments_status_idx').on(t.status),
    index('payments_reconciliation_idx').on(t.reconciliationStatus),
    index('payments_settlement_status_idx').on(t.settlementStatus),
    index('payments_paid_at_idx').on(t.paidAt),
  ],
)

export const paymentAllocations = pgTable(
  'payment_allocations',
  {
    id: pk(),
    organizationId: orgRef(),
    paymentId: text('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    invoiceId: text('invoice_id')
      .notNull()
      .references(() => rentInvoices.id, { onDelete: 'cascade' }),
    amount: money('amount').notNull(),
    allocatedById: text('allocated_by_id'),
    allocatedByName: text('allocated_by_name'),
    isAutomatic: boolean('is_automatic').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [
    index('payment_allocations_org_idx').on(t.organizationId),
    index('payment_allocations_payment_idx').on(t.paymentId),
    index('payment_allocations_invoice_idx').on(t.invoiceId),
  ],
)

export const receipts = pgTable(
  'receipts',
  {
    id: pk(),
    organizationId: orgRef(),
    number: text('number').notNull(),
    paymentId: text('payment_id')
      .notNull()
      .unique()
      .references(() => payments.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    unitId: text('unit_id')
      .notNull()
      .references(() => units.id),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    invoiceId: text('invoice_id').references(() => rentInvoices.id),
    periodLabel: text('period_label').notNull(),
    amount: money('amount').notNull(),
    method: paymentMethodEnum('method').notNull(),
    mpesaReference: text('mpesa_reference'),
    paidAt: ts('paid_at').notNull(),
    balanceAfter: money('balance_after').notNull().default('0'),
    issuedById: text('issued_by_id'),
    issuedByName: text('issued_by_name'),
    createdAt: createdAt(),
  },
  (t) => [unique('receipts_org_number_uq').on(t.organizationId, t.number),
    index('receipts_org_idx').on(t.organizationId), index('receipts_tenant_idx').on(t.tenantId)],
)

/**
 * Append-only double-entry ledger. Rows are never updated or deleted — a
 * correction is posted as a balancing reversal group (spec §17).
 */
export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: pk(),
    organizationId: orgRef(),
    entryGroupId: text('entry_group_id').notNull(),
    account: ledgerAccountEnum('account').notNull(),
    entryType: ledgerEntryTypeEnum('entry_type').notNull(),
    amount: money('amount').notNull(),
    currency: text('currency').notNull().default('KES'),
    narrative: text('narrative').notNull(),
    sourceType: ledgerSourceTypeEnum('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    sourceReference: text('source_reference'),
    landlordId: text('landlord_id'),
    propertyId: text('property_id'),
    unitId: text('unit_id'),
    tenantId: text('tenant_id'),
    transactionDate: ts('transaction_date').notNull(),
    createdById: text('created_by_id'),
    createdByName: text('created_by_name'),
    createdAt: createdAt(),
  },
  (t) => [
    index('ledger_org_idx').on(t.organizationId),
    index('ledger_group_idx').on(t.entryGroupId),
    index('ledger_account_idx').on(t.account),
    index('ledger_source_idx').on(t.sourceType, t.sourceId),
    index('ledger_date_idx').on(t.transactionDate),
  ],
)

// ---------------------------------------------------------------------------
// Commission
// ---------------------------------------------------------------------------

export const commissionRules = pgTable(
  'commission_rules',
  {
    id: pk(),
    /** Null organizationId = platform-wide default rule. */
    organizationId: orgRefNullable(),
    name: text('name').notNull(),
    scope: commissionScopeEnum('scope').notNull(),
    landlordId: text('landlord_id').references(() => landlords.id),
    propertyId: text('property_id').references(() => properties.id),
    rate: rate('rate').notNull(),
    effectiveFrom: ts('effective_from').notNull(),
    effectiveUntil: ts('effective_until'),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('commission_rules_org_idx').on(t.organizationId), index('commission_rules_scope_idx').on(t.scope)],
)

export const commissions = pgTable(
  'commissions',
  {
    id: pk(),
    organizationId: orgRef(),
    paymentId: text('payment_id')
      .notNull()
      .unique()
      .references(() => payments.id, { onDelete: 'cascade' }),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    ruleId: text('rule_id').references(() => commissionRules.id),
    scope: commissionScopeEnum('scope').notNull(),
    rate: rate('rate').notNull(),
    grossAmount: money('gross_amount').notNull(),
    commissionAmount: money('commission_amount').notNull(),
    netAmount: money('net_amount').notNull(),
    status: commissionStatusEnum('status').notNull().default('EARNED'),
    settlementId: text('settlement_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('commissions_org_idx').on(t.organizationId),
    index('commissions_landlord_idx').on(t.landlordId),
    index('commissions_status_idx').on(t.status),
  ],
)

// ---------------------------------------------------------------------------
// Landlord settlement
// ---------------------------------------------------------------------------

export const settlements = pgTable(
  'settlements',
  {
    id: pk(),
    organizationId: orgRef(),
    reference: text('reference').notNull(),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    periodStart: ts('period_start').notNull(),
    periodEnd: ts('period_end').notNull(),
    grossAmount: money('gross_amount').notNull().default('0'),
    commissionAmount: money('commission_amount').notNull().default('0'),
    managementFee: money('management_fee').notNull().default('0'),
    expenseAmount: money('expense_amount').notNull().default('0'),
    adjustmentAmount: money('adjustment_amount').notNull().default('0'),
    netAmount: money('net_amount').notNull().default('0'),
    status: settlementStatusEnum('status').notNull().default('PENDING'),
    method: payoutMethodEnum('method').notNull().default('MPESA'),
    destination: text('destination'),
    externalReference: text('external_reference'),
    scheduledFor: ts('scheduled_for'),
    processedAt: ts('processed_at'),
    failureReason: text('failure_reason'),
    createdById: text('created_by_id'),
    createdByName: text('created_by_name'),
    approvedById: text('approved_by_id'),
    approvedByName: text('approved_by_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('settlements_org_reference_uq').on(t.organizationId, t.reference),
    index('settlements_org_idx').on(t.organizationId),
    index('settlements_landlord_idx').on(t.landlordId),
    index('settlements_status_idx').on(t.status),
  ],
)

export const settlementItems = pgTable(
  'settlement_items',
  {
    id: pk(),
    organizationId: orgRef(),
    settlementId: text('settlement_id')
      .notNull()
      .references(() => settlements.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    description: text('description').notNull(),
    propertyId: text('property_id').references(() => properties.id),
    paymentId: text('payment_id').references(() => payments.id),
    expenseId: text('expense_id'),
    grossAmount: money('gross_amount').notNull().default('0'),
    commissionAmount: money('commission_amount').notNull().default('0'),
    netAmount: money('net_amount').notNull().default('0'),
    createdAt: createdAt(),
  },
  (t) => [
    index('settlement_items_org_idx').on(t.organizationId),
    index('settlement_items_settlement_idx').on(t.settlementId),
  ],
)

// ---------------------------------------------------------------------------
// Expenses & vendors
// ---------------------------------------------------------------------------

export const vendors = pgTable(
  'vendors',
  {
    id: pk(),
    organizationId: orgRef(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    contactName: text('contact_name'),
    phone: text('phone'),
    email: text('email'),
    kraPin: text('kra_pin'),
    rating: integer('rating'),
    isActive: boolean('is_active').notNull().default(true),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('vendors_org_idx').on(t.organizationId)],
)

export const expenses = pgTable(
  'expenses',
  {
    id: pk(),
    organizationId: orgRef(),
    reference: text('reference').notNull(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    unitId: text('unit_id').references(() => units.id),
    vendorId: text('vendor_id').references(() => vendors.id),
    ticketId: text('ticket_id'),
    category: expenseCategoryEnum('category').notNull(),
    amount: money('amount').notNull(),
    expenseDate: ts('expense_date').notNull(),
    description: text('description').notNull(),
    documentUrl: text('document_url'),
    approvalStatus: approvalStatusEnum('approval_status').notNull().default('PENDING'),
    approvedById: text('approved_by_id'),
    approvedByName: text('approved_by_name'),
    approvedAt: ts('approved_at'),
    paymentStatus: expensePaymentStatusEnum('payment_status').notNull().default('UNPAID'),
    /** When true the expense is deducted from the landlord settlement. */
    rechargeToLandlord: boolean('recharge_to_landlord').notNull().default(true),
    settlementId: text('settlement_id').references(() => settlements.id),
    createdById: text('created_by_id'),
    createdByName: text('created_by_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('expenses_org_reference_uq').on(t.organizationId, t.reference),
    index('expenses_org_idx').on(t.organizationId),
    index('expenses_property_idx').on(t.propertyId),
    index('expenses_approval_idx').on(t.approvalStatus),
  ],
)

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export const maintenanceTickets = pgTable(
  'maintenance_tickets',
  {
    id: pk(),
    organizationId: orgRef(),
    number: text('number').notNull(),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    unitId: text('unit_id').references(() => units.id),
    tenantId: text('tenant_id').references(() => tenants.id),
    category: maintenanceCategoryEnum('category').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    priority: priorityEnum('priority').notNull().default('MEDIUM'),
    status: ticketStatusEnum('status').notNull().default('REPORTED'),
    reportedById: text('reported_by_id'),
    reportedByName: text('reported_by_name'),
    assignedToId: text('assigned_to_id').references(() => users.id),
    vendorId: text('vendor_id').references(() => vendors.id),
    estimatedCost: money('estimated_cost').notNull().default('0'),
    actualCost: money('actual_cost').notNull().default('0'),
    reportedAt: ts('reported_at').notNull().defaultNow(),
    dueDate: ts('due_date'),
    resolvedAt: ts('resolved_at'),
    closedAt: ts('closed_at'),
    resolutionNotes: text('resolution_notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tickets_org_number_uq').on(t.organizationId, t.number),
    index('tickets_org_idx').on(t.organizationId),
    index('tickets_status_idx').on(t.status),
    index('tickets_priority_idx').on(t.priority),
  ],
)

export const maintenanceUpdates = pgTable(
  'maintenance_updates',
  {
    id: pk(),
    organizationId: orgRef(),
    ticketId: text('ticket_id')
      .notNull()
      .references(() => maintenanceTickets.id, { onDelete: 'cascade' }),
    authorId: text('author_id'),
    authorName: text('author_name'),
    status: ticketStatusEnum('status'),
    note: text('note').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('ticket_updates_org_idx').on(t.organizationId),
    index('ticket_updates_ticket_idx').on(t.ticketId),
  ],
)

// ---------------------------------------------------------------------------
// Tax & KRA eRITS compliance
// ---------------------------------------------------------------------------

export const taxProfiles = pgTable(
  'tax_profiles',
  {
    id: pk(),
    organizationId: orgRef(),
    landlordId: text('landlord_id')
      .notNull()
      .unique()
      .references(() => landlords.id, { onDelete: 'cascade' }),
    kraPin: text('kra_pin'),
    taxpayerType: taxpayerTypeEnum('taxpayer_type').notNull().default('INDIVIDUAL'),
    taxObligation: text('tax_obligation').notNull().default('Monthly Rental Income'),
    eritsRegistered: boolean('erits_registered').notNull().default(false),
    eritsTaxpayerRef: text('erits_taxpayer_ref'),
    registrationDate: ts('registration_date'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tax_profiles_org_idx').on(t.organizationId)],
)

/**
 * Configurable tax rules (spec §25) — rates and thresholds are data, never
 * hard-coded in the application, because tax legislation changes.
 */
export const taxRules = pgTable(
  'tax_rules',
  {
    id: pk(),
    /** Null organizationId = platform default rule available to every tenant. */
    organizationId: orgRefNullable(),
    name: text('name').notNull(),
    code: text('code').notNull(),
    rate: rate('rate').notNull(),
    thresholdMin: money('threshold_min'),
    thresholdMax: money('threshold_max'),
    propertyType: propertyTypeEnum('property_type'),
    taxpayerType: taxpayerTypeEnum('taxpayer_type').notNull().default('ANY'),
    effectiveFrom: ts('effective_from').notNull(),
    effectiveUntil: ts('effective_until'),
    isActive: boolean('is_active').notNull().default(true),
    source: text('source'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('tax_rules_org_idx').on(t.organizationId), index('tax_rules_code_idx').on(t.code)],
)

export const eritsProperties = pgTable(
  'erits_properties',
  {
    id: pk(),
    organizationId: orgRef(),
    propertyId: text('property_id')
      .notNull()
      .unique()
      .references(() => properties.id, { onDelete: 'cascade' }),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    kraPin: text('kra_pin'),
    eritsPropertyRef: text('erits_property_ref'),
    propertyType: propertyTypeEnum('property_type').notNull(),
    county: text('county').notNull(),
    town: text('town').notNull(),
    unitCount: integer('unit_count').notNull().default(0),
    estimatedAnnualRent: money('estimated_annual_rent').notNull().default('0'),
    actualRentalIncome: money('actual_rental_income').notNull().default('0'),
    registrationStatus: eritsStatusEnum('registration_status').notNull().default('NOT_REGISTERED'),
    lastSyncedAt: ts('last_synced_at'),
    lastSyncStatus: syncStatusEnum('last_sync_status'),
    notes: text('notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('erits_properties_org_idx').on(t.organizationId),
    index('erits_properties_status_idx').on(t.registrationStatus),
  ],
)

export const eritsPeriods = pgTable(
  'erits_periods',
  {
    id: pk(),
    organizationId: orgRef(),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    periodYear: integer('period_year').notNull(),
    periodMonth: integer('period_month').notNull(),
    label: text('label').notNull(),
    grossRentalIncome: money('gross_rental_income').notNull().default('0'),
    allowableDeductions: money('allowable_deductions').notNull().default('0'),
    taxableAmount: money('taxable_amount').notNull().default('0'),
    taxRuleId: text('tax_rule_id'),
    taxRuleName: text('tax_rule_name'),
    taxRate: rate('tax_rate').notNull().default('0'),
    taxAmount: money('tax_amount').notNull().default('0'),
    propertyCount: integer('property_count').notNull().default(0),
    paymentCount: integer('payment_count').notNull().default(0),
    unreconciledCount: integer('unreconciled_count').notNull().default(0),
    exceptionCount: integer('exception_count').notNull().default(0),
    status: eritsPeriodStatusEnum('status').notNull().default('OPEN'),
    preparedById: text('prepared_by_id'),
    preparedByName: text('prepared_by_name'),
    preparedAt: ts('prepared_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('erits_periods_uq').on(t.organizationId, t.landlordId, t.periodYear, t.periodMonth),
    index('erits_periods_org_idx').on(t.organizationId),
    index('erits_periods_status_idx').on(t.status),
  ],
)

export const eritsPeriodProperties = pgTable(
  'erits_period_properties',
  {
    id: pk(),
    organizationId: orgRef(),
    periodId: text('period_id')
      .notNull()
      .references(() => eritsPeriods.id, { onDelete: 'cascade' }),
    propertyId: text('property_id')
      .notNull()
      .references(() => properties.id),
    grossRentalIncome: money('gross_rental_income').notNull().default('0'),
    paymentCount: integer('payment_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('erits_period_property_uq').on(t.periodId, t.propertyId),
    index('erits_period_properties_org_idx').on(t.organizationId),
  ],
)

export const eritsSubmissions = pgTable(
  'erits_submissions',
  {
    id: pk(),
    organizationId: orgRef(),
    periodId: text('period_id')
      .notNull()
      .references(() => eritsPeriods.id, { onDelete: 'cascade' }),
    landlordId: text('landlord_id')
      .notNull()
      .references(() => landlords.id),
    reference: text('reference').notNull(),
    /** Always "SIMULATED" in Phase 1 — mock data is never sent to KRA. */
    mode: text('mode').notNull().default('SIMULATED'),
    payload: jsonb('payload').notNull(),
    status: submissionStatusEnum('status').notNull().default('SIMULATED'),
    submittedAt: ts('submitted_at').notNull().defaultNow(),
    acknowledgedAt: ts('acknowledged_at'),
    acknowledgementRef: text('acknowledgement_ref'),
    responseMessage: text('response_message'),
    submittedById: text('submitted_by_id'),
    submittedByName: text('submitted_by_name'),
  },
  (t) => [
    unique('erits_submissions_org_reference_uq').on(t.organizationId, t.reference),
    index('erits_submissions_org_idx').on(t.organizationId),
    index('erits_submissions_status_idx').on(t.status),
  ],
)

export const eritsSyncLogs = pgTable(
  'erits_sync_logs',
  {
    id: pk(),
    organizationId: orgRef(),
    propertyId: text('property_id'),
    periodId: text('period_id'),
    operation: text('operation').notNull(),
    status: syncStatusEnum('status').notNull(),
    message: text('message'),
    request: jsonb('request'),
    response: jsonb('response'),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('erits_sync_logs_org_idx').on(t.organizationId), index('erits_sync_logs_status_idx').on(t.status)],
)

export const complianceExceptions = pgTable(
  'compliance_exceptions',
  {
    id: pk(),
    organizationId: orgRef(),
    code: text('code').notNull(),
    severity: exceptionSeverityEnum('severity').notNull().default('MEDIUM'),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    propertyId: text('property_id').references(() => properties.id),
    landlordId: text('landlord_id').references(() => landlords.id),
    tenantId: text('tenant_id').references(() => tenants.id),
    paymentId: text('payment_id').references(() => payments.id),
    title: text('title').notNull(),
    detail: text('detail').notNull(),
    recommendedAction: text('recommended_action').notNull(),
    status: exceptionStatusEnum('status').notNull().default('OPEN'),
    resolvedById: text('resolved_by_id'),
    resolvedByName: text('resolved_by_name'),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('compliance_exceptions_uq').on(t.organizationId, t.code, t.entityType, t.entityId),
    index('compliance_exceptions_org_idx').on(t.organizationId),
    index('compliance_exceptions_status_idx').on(t.status, t.severity),
  ],
)

// ---------------------------------------------------------------------------
// Platform services
// ---------------------------------------------------------------------------

export const documents = pgTable(
  'documents',
  {
    id: pk(),
    organizationId: orgRef(),
    type: documentTypeEnum('type').notNull().default('OTHER'),
    name: text('name').notNull(),
    url: text('url').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: integer('size_bytes'),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    uploadedById: text('uploaded_by_id'),
    uploadedByName: text('uploaded_by_name'),
    createdAt: createdAt(),
  },
  (t) => [index('documents_org_idx').on(t.organizationId), index('documents_entity_idx').on(t.entityType, t.entityId)],
)

export const portalInviteStatusEnum = pgEnum('portal_invite_status', ['PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED'])

/**
 * A one-time invitation that turns a tenant record into a portal login.
 * Only the hash of the token is stored, so a leaked database row cannot be
 * replayed as an invitation.
 */
export const tenantInvites = pgTable(
  'tenant_invites',
  {
    id: pk(),
    organizationId: orgRef(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    status: portalInviteStatusEnum('status').notNull().default('PENDING'),
    expiresAt: ts('expires_at').notNull(),
    acceptedAt: ts('accepted_at'),
    invitedById: text('invited_by_id'),
    invitedByName: text('invited_by_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('tenant_invites_token_uq').on(t.tokenHash),
    index('tenant_invites_org_idx').on(t.organizationId),
    index('tenant_invites_tenant_idx').on(t.tenantId),
  ],
)

export const notifications = pgTable(
  'notifications',
  {
    id: pk(),
    organizationId: orgRef(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    channel: notificationChannelEnum('channel').notNull().default('IN_APP'),
    status: notificationStatusEnum('status').notNull().default('QUEUED'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    recipient: text('recipient'),
    sentAt: ts('sent_at'),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_org_idx').on(t.organizationId), index('notifications_user_idx').on(t.userId, t.readAt)],
)

export const integrations = pgTable(
  'integrations',
  {
    id: pk(),
    organizationId: orgRef(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    provider: text('provider').notNull(),
    status: integrationStatusEnum('status').notNull().default('AVAILABLE'),
    phase: text('phase').notNull().default('Phase 1'),
    description: text('description'),
    config: jsonb('config').notNull().default({}),
    isEnabled: boolean('is_enabled').notNull().default(false),
    lastCheckedAt: ts('last_checked_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('integrations_org_key_uq').on(t.organizationId, t.key),
    index('integrations_org_idx').on(t.organizationId),
  ],
)

/**
 * Atomic, per-organization counters behind human-facing document numbers
 * (INV-2026-001023, PAY-102938, RCP-2026-0042 …). Incremented with a single
 * `INSERT … ON CONFLICT DO UPDATE … RETURNING`, so two concurrent invoices can
 * never be handed the same number.
 */
export const documentCounters = pgTable(
  'document_counters',
  {
    id: pk(),
    organizationId: orgRef(),
    key: text('key').notNull(),
    value: integer('value').notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [unique('document_counters_org_key_uq').on(t.organizationId, t.key)],
)

/** Immutable audit trail for financial, tenancy and tax actions (spec §29). */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: pk(),
    organizationId: orgRefNullable(),
    userId: text('user_id'),
    userName: text('user_name'),
    userRole: text('user_role'),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    reference: text('reference'),
    previousValue: jsonb('previous_value'),
    newValue: jsonb('new_value'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_org_idx').on(t.organizationId),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
)

// ---------------------------------------------------------------------------
// Relations (used by the relational query API)
// ---------------------------------------------------------------------------

export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  landlords: many(landlords),
  properties: many(properties),
  units: many(units),
  tenants: many(tenants),
  leases: many(leases),
}))

export const usersRelations = relations(users, ({ one }) => ({
  organization: one(organizations, { fields: [users.organizationId], references: [organizations.id] }),
  landlord: one(landlords, { fields: [users.landlordId], references: [landlords.id] }),
}))

export const landlordsRelations = relations(landlords, ({ one, many }) => ({
  organization: one(organizations, { fields: [landlords.organizationId], references: [organizations.id] }),
  properties: many(properties),
  settlements: many(settlements),
  taxProfile: one(taxProfiles),
}))

export const propertiesRelations = relations(properties, ({ one, many }) => ({
  organization: one(organizations, { fields: [properties.organizationId], references: [organizations.id] }),
  landlord: one(landlords, { fields: [properties.landlordId], references: [landlords.id] }),
  manager: one(users, { fields: [properties.managerId], references: [users.id] }),
  units: many(units),
  leases: many(leases),
  valuations: many(propertyValuations),
  eritsProperty: one(eritsProperties),
}))

export const propertyValuationsRelations = relations(propertyValuations, ({ one }) => ({
  organization: one(organizations, {
    fields: [propertyValuations.organizationId],
    references: [organizations.id],
  }),
  property: one(properties, {
    fields: [propertyValuations.propertyId],
    references: [properties.id],
  }),
  recorder: one(users, { fields: [propertyValuations.recordedBy], references: [users.id] }),
}))

export const unitsRelations = relations(units, ({ one, many }) => ({
  organization: one(organizations, { fields: [units.organizationId], references: [organizations.id] }),
  property: one(properties, { fields: [units.propertyId], references: [properties.id] }),
  leases: many(leases),
}))

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  organization: one(organizations, { fields: [tenants.organizationId], references: [organizations.id] }),
  leases: many(leases),
  invoices: many(rentInvoices),
  payments: many(payments),
  receipts: many(receipts),
  notes: many(tenantNotes),
}))

export const leasesRelations = relations(leases, ({ one, many }) => ({
  organization: one(organizations, { fields: [leases.organizationId], references: [organizations.id] }),
  tenant: one(tenants, { fields: [leases.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [leases.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [leases.unitId], references: [units.id] }),
  charges: many(leaseCharges),
  invoices: many(rentInvoices),
}))

export const leaseChargesRelations = relations(leaseCharges, ({ one }) => ({
  lease: one(leases, { fields: [leaseCharges.leaseId], references: [leases.id] }),
}))

export const tenantNotesRelations = relations(tenantNotes, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantNotes.tenantId], references: [tenants.id] }),
}))

export const rentInvoicesRelations = relations(rentInvoices, ({ one, many }) => ({
  organization: one(organizations, { fields: [rentInvoices.organizationId], references: [organizations.id] }),
  lease: one(leases, { fields: [rentInvoices.leaseId], references: [leases.id] }),
  tenant: one(tenants, { fields: [rentInvoices.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [rentInvoices.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [rentInvoices.unitId], references: [units.id] }),
  landlord: one(landlords, { fields: [rentInvoices.landlordId], references: [landlords.id] }),
  items: many(invoiceItems),
  allocations: many(paymentAllocations),
}))

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  invoice: one(rentInvoices, { fields: [invoiceItems.invoiceId], references: [rentInvoices.id] }),
}))

export const paymentsRelations = relations(payments, ({ one, many }) => ({
  organization: one(organizations, { fields: [payments.organizationId], references: [organizations.id] }),
  tenant: one(tenants, { fields: [payments.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [payments.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [payments.unitId], references: [units.id] }),
  landlord: one(landlords, { fields: [payments.landlordId], references: [landlords.id] }),
  lease: one(leases, { fields: [payments.leaseId], references: [leases.id] }),
  allocations: many(paymentAllocations),
  receipt: one(receipts),
  commission: one(commissions),
}))

export const paymentAllocationsRelations = relations(paymentAllocations, ({ one }) => ({
  payment: one(payments, { fields: [paymentAllocations.paymentId], references: [payments.id] }),
  invoice: one(rentInvoices, { fields: [paymentAllocations.invoiceId], references: [rentInvoices.id] }),
}))

export const receiptsRelations = relations(receipts, ({ one }) => ({
  payment: one(payments, { fields: [receipts.paymentId], references: [payments.id] }),
  tenant: one(tenants, { fields: [receipts.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [receipts.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [receipts.unitId], references: [units.id] }),
  landlord: one(landlords, { fields: [receipts.landlordId], references: [landlords.id] }),
  invoice: one(rentInvoices, { fields: [receipts.invoiceId], references: [rentInvoices.id] }),
}))

export const commissionsRelations = relations(commissions, ({ one }) => ({
  payment: one(payments, { fields: [commissions.paymentId], references: [payments.id] }),
  landlord: one(landlords, { fields: [commissions.landlordId], references: [landlords.id] }),
  property: one(properties, { fields: [commissions.propertyId], references: [properties.id] }),
  rule: one(commissionRules, { fields: [commissions.ruleId], references: [commissionRules.id] }),
}))

export const settlementsRelations = relations(settlements, ({ one, many }) => ({
  organization: one(organizations, { fields: [settlements.organizationId], references: [organizations.id] }),
  landlord: one(landlords, { fields: [settlements.landlordId], references: [landlords.id] }),
  items: many(settlementItems),
}))

export const settlementItemsRelations = relations(settlementItems, ({ one }) => ({
  settlement: one(settlements, { fields: [settlementItems.settlementId], references: [settlements.id] }),
  property: one(properties, { fields: [settlementItems.propertyId], references: [properties.id] }),
  payment: one(payments, { fields: [settlementItems.paymentId], references: [payments.id] }),
}))

export const expensesRelations = relations(expenses, ({ one }) => ({
  organization: one(organizations, { fields: [expenses.organizationId], references: [organizations.id] }),
  property: one(properties, { fields: [expenses.propertyId], references: [properties.id] }),
  landlord: one(landlords, { fields: [expenses.landlordId], references: [landlords.id] }),
  unit: one(units, { fields: [expenses.unitId], references: [units.id] }),
  vendor: one(vendors, { fields: [expenses.vendorId], references: [vendors.id] }),
}))

export const vendorsRelations = relations(vendors, ({ many }) => ({
  expenses: many(expenses),
  tickets: many(maintenanceTickets),
}))

export const maintenanceTicketsRelations = relations(maintenanceTickets, ({ one, many }) => ({
  organization: one(organizations, { fields: [maintenanceTickets.organizationId], references: [organizations.id] }),
  property: one(properties, { fields: [maintenanceTickets.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [maintenanceTickets.unitId], references: [units.id] }),
  tenant: one(tenants, { fields: [maintenanceTickets.tenantId], references: [tenants.id] }),
  vendor: one(vendors, { fields: [maintenanceTickets.vendorId], references: [vendors.id] }),
  assignedTo: one(users, { fields: [maintenanceTickets.assignedToId], references: [users.id] }),
  updates: many(maintenanceUpdates),
}))

export const maintenanceUpdatesRelations = relations(maintenanceUpdates, ({ one }) => ({
  ticket: one(maintenanceTickets, { fields: [maintenanceUpdates.ticketId], references: [maintenanceTickets.id] }),
}))

export const taxProfilesRelations = relations(taxProfiles, ({ one }) => ({
  landlord: one(landlords, { fields: [taxProfiles.landlordId], references: [landlords.id] }),
}))

export const eritsPropertiesRelations = relations(eritsProperties, ({ one }) => ({
  property: one(properties, { fields: [eritsProperties.propertyId], references: [properties.id] }),
  landlord: one(landlords, { fields: [eritsProperties.landlordId], references: [landlords.id] }),
}))

export const eritsPeriodsRelations = relations(eritsPeriods, ({ one, many }) => ({
  organization: one(organizations, { fields: [eritsPeriods.organizationId], references: [organizations.id] }),
  landlord: one(landlords, { fields: [eritsPeriods.landlordId], references: [landlords.id] }),
  breakdown: many(eritsPeriodProperties),
  submissions: many(eritsSubmissions),
}))

export const eritsPeriodPropertiesRelations = relations(eritsPeriodProperties, ({ one }) => ({
  period: one(eritsPeriods, { fields: [eritsPeriodProperties.periodId], references: [eritsPeriods.id] }),
  property: one(properties, { fields: [eritsPeriodProperties.propertyId], references: [properties.id] }),
}))

export const eritsSubmissionsRelations = relations(eritsSubmissions, ({ one }) => ({
  period: one(eritsPeriods, { fields: [eritsSubmissions.periodId], references: [eritsPeriods.id] }),
  landlord: one(landlords, { fields: [eritsSubmissions.landlordId], references: [landlords.id] }),
}))

export const complianceExceptionsRelations = relations(complianceExceptions, ({ one }) => ({
  property: one(properties, { fields: [complianceExceptions.propertyId], references: [properties.id] }),
  landlord: one(landlords, { fields: [complianceExceptions.landlordId], references: [landlords.id] }),
  tenant: one(tenants, { fields: [complianceExceptions.tenantId], references: [tenants.id] }),
  payment: one(payments, { fields: [complianceExceptions.paymentId], references: [payments.id] }),
}))

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}))

export const moveEventsRelations = relations(moveEvents, ({ one }) => ({
  lease: one(leases, { fields: [moveEvents.leaseId], references: [leases.id] }),
  tenant: one(tenants, { fields: [moveEvents.tenantId], references: [tenants.id] }),
  property: one(properties, { fields: [moveEvents.propertyId], references: [properties.id] }),
  unit: one(units, { fields: [moveEvents.unitId], references: [units.id] }),
}))

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type Organization = typeof organizations.$inferSelect
export type User = typeof users.$inferSelect
export type Role = typeof roles.$inferSelect
export type Landlord = typeof landlords.$inferSelect
export type Property = typeof properties.$inferSelect
export type Unit = typeof units.$inferSelect
export type Tenant = typeof tenants.$inferSelect
export type Lease = typeof leases.$inferSelect
export type LeaseCharge = typeof leaseCharges.$inferSelect
export type RentInvoice = typeof rentInvoices.$inferSelect
export type InvoiceItem = typeof invoiceItems.$inferSelect
export type Payment = typeof payments.$inferSelect
export type PaymentAllocation = typeof paymentAllocations.$inferSelect
export type Receipt = typeof receipts.$inferSelect
export type LedgerEntry = typeof ledgerEntries.$inferSelect
export type Commission = typeof commissions.$inferSelect
export type CommissionRule = typeof commissionRules.$inferSelect
export type Settlement = typeof settlements.$inferSelect
export type SettlementItem = typeof settlementItems.$inferSelect
export type Expense = typeof expenses.$inferSelect
export type Vendor = typeof vendors.$inferSelect
export type MaintenanceTicket = typeof maintenanceTickets.$inferSelect
export type MaintenanceUpdate = typeof maintenanceUpdates.$inferSelect
export type TaxProfile = typeof taxProfiles.$inferSelect
export type TaxRule = typeof taxRules.$inferSelect
export type EritsProperty = typeof eritsProperties.$inferSelect
export type EritsPeriod = typeof eritsPeriods.$inferSelect
export type EritsSubmission = typeof eritsSubmissions.$inferSelect
export type EritsSyncLog = typeof eritsSyncLogs.$inferSelect
export type ComplianceException = typeof complianceExceptions.$inferSelect
export type MpesaTransaction = typeof mpesaTransactions.$inferSelect
export type MoveEvent = typeof moveEvents.$inferSelect
export type AuditLog = typeof auditLogs.$inferSelect
export type Integration = typeof integrations.$inferSelect
export type NotificationRow = typeof notifications.$inferSelect
export type DocumentRow = typeof documents.$inferSelect
export type TenantInvite = typeof tenantInvites.$inferSelect
export type BillingRun = typeof billingRuns.$inferSelect

// ---------------------------------------------------------------------------
// Tenant-initiated payment (STK push)
//
// A tenant taps Pay, the provider prompts them on their handset, and the
// result arrives asynchronously. The request is recorded before the prompt
// goes out, so a confirmation that arrives late — or twice — has something to
// land against.
// ---------------------------------------------------------------------------

export const stkStatusEnum = pgEnum('stk_status', ['PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED'])

export const stkRequests = pgTable(
  'stk_requests',
  {
    id: pk(),
    organizationId: orgRef(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    invoiceId: text('invoice_id').references(() => rentInvoices.id, { onDelete: 'set null' }),
    /** The provider's checkout identifier — ws_CO_… for Daraja. */
    checkoutRequestId: text('checkout_request_id').notNull(),
    phone: text('phone').notNull(),
    accountReference: text('account_reference').notNull(),
    amount: money('amount').notNull(),
    status: stkStatusEnum('status').notNull().default('PENDING'),
    /**
     * When the SIMULATED confirmation becomes due. Null against a live
     * provider, where the real callback is the only thing that confirms.
     */
    simulateAfter: ts('simulate_after'),
    /** True when this request will be confirmed by the mock, not by Safaricom. */
    isSimulated: boolean('is_simulated').notNull().default(false),
    providerMessage: text('provider_message'),
    mpesaReceipt: text('mpesa_receipt'),
    paymentId: text('payment_id'),
    paymentReference: text('payment_reference'),
    pointsAwarded: integer('points_awarded'),
    failureReason: text('failure_reason'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('stk_requests_checkout_uq').on(t.organizationId, t.checkoutRequestId),
    index('stk_requests_tenant_idx').on(t.tenantId),
    index('stk_requests_status_idx').on(t.status),
  ],
)

export type StkRequest = typeof stkRequests.$inferSelect

// ---------------------------------------------------------------------------
// Reward points
//
// Points are a currency, so they are stored the way money is stored: an
// append-only ledger of balanced postings, never a mutable total on the
// tenant row. A counter cannot say why a balance is what it is, cannot be
// audited, loses the history a reversal needs, and corrupts silently when two
// M-Pesa callbacks arrive at once.
//
// Every posting balances within an `entry_group_id`, exactly as the money
// ledger does, so outstanding points liability is a query rather than an
// estimate.
// ---------------------------------------------------------------------------

export const rewardFundingModelEnum = pgEnum('reward_funding_model', ['PLATFORM', 'ORGANIZATION', 'PARTNER'])

export const rewardAccountKindEnum = pgEnum('reward_account_kind', [
  /** A tenant's own points. */
  'TENANT',
  /** The counterparty every issuance debits — who is paying for the points. */
  'FUNDING',
  /** Where redeemed points go to die. */
  'REDEEMED',
  /** Where expired points go. */
  'EXPIRED',
])

export const rewardEntryTypeEnum = pgEnum('reward_entry_type', [
  'EARN',
  'MATURE',
  'REDEEM',
  'EXPIRE',
  'REVERSAL',
  'ADJUSTMENT',
])

/**
 * Points are earned into PENDING and become spendable once matured. The
 * window is what makes a reversal survivable: without it, a recalled payment
 * whose points are already spent drives the balance negative.
 */
export const rewardBucketEnum = pgEnum('reward_bucket', ['PENDING', 'AVAILABLE'])

export const rewardRedemptionTypeEnum = pgEnum('reward_redemption_type', [
  'DEPOSIT_FUND',
  'AIRTIME',
  'VOUCHER',
  'RENT_CREDIT',
])

export const rewardRedemptionStatusEnum = pgEnum('reward_redemption_status', [
  'REQUESTED',
  'FULFILLED',
  'FAILED',
  'REVERSED',
])

/** Points-per-KES peg, numeric(10,4) — a point may be worth a fraction of a shilling. */
const peg = (name: string) => numeric(name, { precision: 10, scale: 4 })

export const rewardProgrammes = pgTable(
  'reward_programmes',
  {
    id: pk(),
    /** Null means platform-wide: one balance per tenant across organizations. */
    organizationId: orgRefNullable(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    pegKesPerPoint: peg('peg_kes_per_point').notNull().default('1.0000'),
    maturationDays: integer('maturation_days').notNull().default(30),
    expiryMonths: integer('expiry_months').notNull().default(24),
    fundingModel: rewardFundingModelEnum('funding_model').notNull().default('PLATFORM'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('reward_programmes_platform_uq')
      .on(t.name)
      .where(sql`organization_id is null`),
    index('reward_programmes_org_idx').on(t.organizationId),
  ],
)

/**
 * Versioned and effective-dated. A tenant asking in March why a January
 * payment earned 250 points must be answered by the rule in force in January,
 * so an award stores the rule version it was computed under and rules are
 * never updated in place.
 */
export const rewardRules = pgTable(
  'reward_rules',
  {
    id: pk(),
    programmeId: text('programme_id')
      .notNull()
      .references(() => rewardProgrammes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    effectiveFrom: ts('effective_from').notNull(),
    effectiveTo: ts('effective_to'),
    earnDivisorKes: integer('earn_divisor_kes').notNull().default(100),
    graceDays: integer('grace_days').notNull().default(5),
    lateDays: integer('late_days').notNull().default(15),
    onTimeBp: integer('on_time_bp').notNull().default(10000),
    slightlyLateBp: integer('slightly_late_bp').notNull().default(5000),
    lateBp: integer('late_bp').notNull().default(2500),
    streak3Bp: integer('streak_3_bp').notNull().default(1000),
    streak6Bp: integer('streak_6_bp').notNull().default(2000),
    streak12Bp: integer('streak_12_bp').notNull().default(3000),
    maxMultiplierBp: integer('max_multiplier_bp').notNull().default(13000),
    includeServiceCharge: boolean('include_service_charge').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique('reward_rules_programme_version_uq').on(t.programmeId, t.version),
    index('reward_rules_effective_idx').on(t.programmeId, t.effectiveFrom),
  ],
)

/**
 * Holds no balance — it anchors entries. A balance is a sum over the ledger,
 * so there is nothing here that can drift out of step with the postings.
 */
export const rewardAccounts = pgTable(
  'reward_accounts',
  {
    id: pk(),
    programmeId: text('programme_id')
      .notNull()
      .references(() => rewardProgrammes.id, { onDelete: 'cascade' }),
    kind: rewardAccountKindEnum('kind').notNull(),
    /** Set for TENANT accounts only. */
    tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    /** Set for FUNDING accounts under the ORGANIZATION funding model. */
    organizationId: orgRefNullable(),
    label: text('label').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('reward_accounts_tenant_uq')
      .on(t.programmeId, t.tenantId)
      .where(sql`kind = 'TENANT'`),
    index('reward_accounts_programme_idx').on(t.programmeId),
    index('reward_accounts_tenant_idx').on(t.tenantId),
  ],
)

/**
 * The ledger. Append-only: rows are never updated or deleted, and a mistake
 * is corrected by posting a reversing group that references the original.
 */
export const rewardEntries = pgTable(
  'reward_entries',
  {
    id: pk(),
    entryGroupId: text('entry_group_id').notNull(),
    programmeId: text('programme_id')
      .notNull()
      .references(() => rewardProgrammes.id, { onDelete: 'cascade' }),
    accountId: text('account_id')
      .notNull()
      .references(() => rewardAccounts.id),
    /**
     * The organization whose activity caused this entry. Staff reads filter
     * on it, so one organization never sees another's rows even though the
     * tenant's balance spans all of them.
     */
    originOrganizationId: orgRefNullable(),
    /** Denormalised from the account so a tenant's statement is one scan. */
    tenantId: text('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    ruleVersionId: text('rule_version_id').references(() => rewardRules.id),
    type: rewardEntryTypeEnum('type').notNull(),
    bucket: rewardBucketEnum('bucket').notNull().default('AVAILABLE'),
    /** Signed. Positive credits the account, negative debits it. Never zero. */
    points: integer('points').notNull(),
    narrative: text('narrative').notNull(),
    sourceAllocationId: text('source_allocation_id'),
    sourcePaymentId: text('source_payment_id'),
    sourceInvoiceId: text('source_invoice_id'),
    sourceRedemptionId: text('source_redemption_id'),
    /** Set on REVERSAL entries — the group being undone. */
    reversesGroupId: text('reverses_group_id'),
    /** Carried on EARN entries so a streak can be walked back by period. */
    periodYear: integer('period_year'),
    periodMonth: integer('period_month'),
    daysLate: integer('days_late'),
    streakMonths: integer('streak_months'),
    transactionDate: ts('transaction_date').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    /**
     * The idempotency guarantee, and it belongs in the database. Checking for
     * an existing award in application code and then inserting is a race, and
     * under concurrent M-Pesa callbacks it will lose.
     *
     * Keyed on the account as well because one EARN group writes two rows —
     * the tenant's credit and the funding debit — which share an allocation.
     */
    /*
     * `rule_version_id` is coalesced because SQL treats two NULLs as distinct:
     * without it, two awards made under no recorded rule version would not
     * collide and the same allocation could be paid twice.
     */
    uniqueIndex('reward_entries_earn_idempotency_uq')
      .on(t.sourceAllocationId, sql`coalesce(${t.ruleVersionId}, '')`, t.accountId)
      .where(sql`type = 'EARN'`),
    index('reward_entries_group_idx').on(t.entryGroupId),
    index('reward_entries_account_idx').on(t.accountId),
    index('reward_entries_tenant_idx').on(t.tenantId),
    index('reward_entries_origin_idx').on(t.originOrganizationId),
    index('reward_entries_type_idx').on(t.type),
    index('reward_entries_date_idx').on(t.transactionDate),
  ],
)

export const rewardRedemptions = pgTable(
  'reward_redemptions',
  {
    id: pk(),
    programmeId: text('programme_id')
      .notNull()
      .references(() => rewardProgrammes.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** Where the redemption was made — not where the points were earned. */
    organizationId: orgRefNullable(),
    type: rewardRedemptionTypeEnum('type').notNull(),
    status: rewardRedemptionStatusEnum('status').notNull().default('REQUESTED'),
    points: integer('points').notNull(),
    /** The peg this redemption was priced at, frozen at request time. */
    pegKesPerPoint: peg('peg_kes_per_point').notNull(),
    valueAmount: money('value_amount').notNull(),
    entryGroupId: text('entry_group_id'),
    invoiceId: text('invoice_id').references(() => rentInvoices.id, { onDelete: 'set null' }),
    providerReference: text('provider_reference'),
    /** Caller-supplied key — a retried request must not spend twice. */
    requestKey: text('request_key').notNull(),
    failureReason: text('failure_reason'),
    requestedById: text('requested_by_id'),
    requestedByName: text('requested_by_name'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('reward_redemptions_request_key_uq').on(t.programmeId, t.requestKey),
    index('reward_redemptions_tenant_idx').on(t.tenantId),
    index('reward_redemptions_status_idx').on(t.status),
  ],
)

export type RewardProgramme = typeof rewardProgrammes.$inferSelect
export type RewardRule = typeof rewardRules.$inferSelect
export type RewardAccount = typeof rewardAccounts.$inferSelect
export type RewardEntry = typeof rewardEntries.$inferSelect
export type RewardRedemption = typeof rewardRedemptions.$inferSelect
export type NewRewardEntry = typeof rewardEntries.$inferInsert

export type NewPayment = typeof payments.$inferInsert
export type NewRentInvoice = typeof rentInvoices.$inferInsert
export type NewLedgerEntry = typeof ledgerEntries.$inferInsert
export type NewAuditLog = typeof auditLogs.$inferInsert
