// ===========================================================================
//  Tenant identification for inbound payments (spec §15)
//
//  A Kenyan tenant paying by M-Pesa types an account number at the till, and
//  types it badly: "a12", "GV A12", "GV-A12 ", "greenview a12", or nothing at
//  all. This module turns that string into a tenant, or says honestly that it
//  cannot — in which case the payment lands in the unmatched queue rather than
//  being guessed onto the wrong account.
// ===========================================================================

import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { leases, properties, tenants, units } from '@/db/schema'
import type { Tx } from '@/db'
import { scoped, type Scope } from '@/lib/tenancy'

export interface MatchCandidateInput {
  accountReference?: string | null
  payerPhone?: string | null
}

export interface MatchResult {
  tenantId: string | null
  leaseId: string | null
  unitId: string | null
  propertyId: string | null
  landlordId: string | null
  confidence: 'exact' | 'high' | 'medium' | 'none'
  strategy: string
  /** Set when more than one tenant matched — never auto-allocate in that case. */
  ambiguous: boolean
}

export const NO_MATCH: MatchResult = {
  tenantId: null,
  leaseId: null,
  unitId: null,
  propertyId: null,
  landlordId: null,
  confidence: 'none',
  strategy: 'no match',
  ambiguous: false,
}

/** Uppercase, strip punctuation and collapse whitespace. */
export function normaliseReference(reference: string | null | undefined): string {
  return (reference ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

/**
 * Kenyan mobile numbers arrive as 254722123456, 0722123456 or +254722123456.
 * Reduce them all to the last nine digits so they compare equal.
 */
export function normalisePhone(phone: string | null | undefined): string {
  const digits = (phone ?? '').replace(/\D/g, '')
  return digits.length >= 9 ? digits.slice(-9) : digits
}

export interface ParsedReference {
  raw: string
  normalised: string
  tokens: string[]
  /** Looks like "GV-A12" — a property code followed by a unit number. */
  propertyToken: string | null
  unitToken: string | null
}

export function parseReference(reference: string | null | undefined): ParsedReference {
  const normalised = normaliseReference(reference)
  const tokens = normalised.split(' ').filter(Boolean)
  let propertyToken: string | null = null
  let unitToken: string | null = null

  if (tokens.length >= 2) {
    propertyToken = tokens[0]
    unitToken = tokens.slice(1).join('')
  } else if (tokens.length === 1) {
    unitToken = tokens[0]
  }

  return { raw: reference ?? '', normalised, tokens, propertyToken, unitToken }
}

/**
 * Resolve a payment to a tenant. Strategies run most-specific first and stop
 * at the first unambiguous hit.
 */
export async function identifyTenant(
  tx: Tx,
  scope: Scope,
  input: MatchCandidateInput,
): Promise<MatchResult> {
  const parsed = parseReference(input.accountReference)
  const phone = normalisePhone(input.payerPhone)

  // 1 — the reference is a tenant code (TNT-0001).
  if (parsed.normalised) {
    const compact = parsed.tokens.join('-')
    const byTenantCode = await activeLeaseRows(tx, scope, eq(tenants.code, compact))
    if (byTenantCode.length === 1) return toResult(byTenantCode[0], 'exact', 'tenant code')
  }

  // 2 — the reference is a lease code (LSE-0042).
  if (parsed.normalised) {
    const compact = parsed.tokens.join('-')
    const byLeaseCode = await activeLeaseRows(tx, scope, eq(leases.code, compact))
    if (byLeaseCode.length === 1) return toResult(byLeaseCode[0], 'exact', 'lease code')
  }

  // 3 — property code + unit number ("GV-A12").
  if (parsed.propertyToken && parsed.unitToken) {
    const rows = await activeLeaseRows(
      tx,
      scope,
      and(
        or(eq(properties.code, parsed.propertyToken), ilike(properties.name, `${parsed.propertyToken}%`)),
        sql`upper(replace(${units.unitNumber}, '-', '')) = ${parsed.unitToken}`,
      ),
    )
    if (rows.length === 1) return toResult(rows[0], 'exact', 'property code + unit number')
    if (rows.length > 1) return { ...toResult(rows[0], 'none', 'ambiguous unit'), ambiguous: true }
  }

  // 4 — a bare unit number, unique across the organization ("A12").
  if (parsed.unitToken) {
    const rows = await activeLeaseRows(
      tx,
      scope,
      sql`upper(replace(${units.unitNumber}, '-', '')) = ${parsed.unitToken}`,
    )
    if (rows.length === 1) return toResult(rows[0], 'high', 'unit number')
    if (rows.length > 1) {
      return { ...NO_MATCH, strategy: `unit number "${parsed.unitToken}" matches ${rows.length} units`, ambiguous: true }
    }
  }

  // 5 — the paying phone number belongs to exactly one active tenant.
  if (phone.length === 9) {
    const rows = await activeLeaseRows(tx, scope, sql`right(regexp_replace(${tenants.phone}, '\\D', '', 'g'), 9) = ${phone}`)
    if (rows.length === 1) return toResult(rows[0], 'medium', 'payer phone number')
    if (rows.length > 1) {
      return { ...NO_MATCH, strategy: 'payer phone matches multiple tenants', ambiguous: true }
    }
  }

  return { ...NO_MATCH, strategy: parsed.raw ? `no match for "${parsed.raw}"` : 'no account reference supplied' }
}

interface LeaseRow {
  tenantId: string
  leaseId: string
  unitId: string
  propertyId: string
  landlordId: string
}

async function activeLeaseRows(tx: Tx, scope: Scope, condition: ReturnType<typeof eq> | undefined) {
  return tx
    .select({
      tenantId: tenants.id,
      leaseId: leases.id,
      unitId: units.id,
      propertyId: properties.id,
      landlordId: properties.landlordId,
    })
    .from(leases)
    .innerJoin(tenants, eq(tenants.id, leases.tenantId))
    .innerJoin(units, eq(units.id, leases.unitId))
    .innerJoin(properties, eq(properties.id, leases.propertyId))
    .where(scoped(leases, scope, sql`${leases.status} in ('ACTIVE', 'EXPIRING')`, condition))
    .limit(5) as Promise<LeaseRow[]>
}

function toResult(row: LeaseRow, confidence: MatchResult['confidence'], strategy: string): MatchResult {
  return { ...row, confidence, strategy, ambiguous: false }
}
