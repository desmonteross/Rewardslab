// ===========================================================================
//  Dashboard aggregates
//
//  Two things are worth pinning down here.
//
//  Portfolio value is as-of a date, against a real database: a valuation dated
//  yesterday must not appear in last month's figure, or every dashboard would
//  report growth that is really just newer paperwork. And it must not leak
//  across organizations — the isolation rule applies to a headline tile as
//  much as to a ledger.
//
//  The three performance lenses are pure sorting, and the interesting part is
//  what they leave out: a property with nothing billed has a collection rate
//  of 0% by arithmetic, and ranking it as the worst performer would be a lie.
// ===========================================================================

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inArray } from 'drizzle-orm'
import { closePool, db } from '@/db'
import * as s from '@/db/schema'
import { amount } from '@/lib/money'
import { systemScope, type Scope } from '@/lib/tenancy'
import {
  portfolioValue,
  rankPerformance,
  type PropertyPerformance,
} from '@/server/queries/dashboard'

// ---------------------------------------------------------------------------
// Pure ranking
// ---------------------------------------------------------------------------

function property(overrides: Partial<PropertyPerformance> & { id: string }): PropertyPerformance {
  return {
    code: overrides.id,
    name: overrides.id,
    area: null,
    landlord: 'Landlord',
    units: 10,
    occupied: 10,
    occupancyRate: 100,
    expectedCents: 1_000_000,
    collectedCents: 1_000_000,
    outstandingCents: 0,
    collectionRate: 100,
    ...overrides,
  }
}

const ROWS: PropertyPerformance[] = [
  property({ id: 'strong', collectionRate: 96, collectedCents: 960_000, outstandingCents: 40_000 }),
  property({ id: 'middling', collectionRate: 74, collectedCents: 740_000, outstandingCents: 260_000 }),
  property({ id: 'weak', collectionRate: 31, collectedCents: 310_000, outstandingCents: 690_000 }),
  property({ id: 'empty-ish', occupancyRate: 40, occupied: 4, collectionRate: 88, outstandingCents: 120_000 }),
  // Not billed at all this month — has no collection rate worth ranking.
  property({ id: 'unbilled', expectedCents: 0, collectedCents: 0, outstandingCents: 0, collectionRate: 0 }),
]

describe('performance lenses', () => {
  it('ranks top performers by collection rate, best first', () => {
    const rows = rankPerformance(ROWS, 'top')
    expect(rows[0].id).toBe('strong')
    expect(rows.map((row) => row.collectionRate)).toEqual([...rows.map((row) => row.collectionRate)].sort((a, b) => b - a))
  })

  it('never ranks an unbilled property as a performer, top or bottom', () => {
    expect(rankPerformance(ROWS, 'top').map((row) => row.id)).not.toContain('unbilled')
    expect(rankPerformance(ROWS, 'attention').map((row) => row.id)).not.toContain('unbilled')
  })

  it('surfaces the largest arrears first under "needs attention"', () => {
    const rows = rankPerformance(ROWS, 'attention')
    expect(rows[0].id).toBe('weak')
    expect(rows.every((row) => row.outstandingCents > 0)).toBe(true)
  })

  it('ranks lowest occupancy first, and includes a property that is paying well', () => {
    const rows = rankPerformance(ROWS, 'occupancy')
    expect(rows[0].id).toBe('empty-ish')
  })

  it('includes an unbilled property in the occupancy lens, where billing is irrelevant', () => {
    expect(rankPerformance(ROWS, 'occupancy', 10).map((row) => row.id)).toContain('unbilled')
  })

  it('honours the limit', () => {
    expect(rankPerformance(ROWS, 'top', 2)).toHaveLength(2)
  })

  it('returns nothing rather than throwing on an empty portfolio', () => {
    expect(rankPerformance([], 'top')).toEqual([])
    expect(rankPerformance([], 'occupancy')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Portfolio value, against a real database
// ---------------------------------------------------------------------------

const created: string[] = []

async function buildPortfolio(slug: string) {
  const [organization] = await db
    .insert(s.organizations)
    .values({
      name: slug,
      slug,
      status: 'ACTIVE',
      plan: 'PROFESSIONAL',
      commissionRate: '1.000',
      county: 'Nairobi',
      town: 'Nairobi',
    })
    .returning()
  created.push(organization.id)

  const [landlord] = await db
    .insert(s.landlords)
    .values({
      organizationId: organization.id,
      code: 'LL-001',
      type: 'COMPANY',
      fullName: 'Valuation Landlord',
      kraPin: 'A012345678Z',
      phone: '0722000000',
      payoutMethod: 'MPESA',
      taxpayerType: 'COMPANY',
    })
    .returning()

  const rows = await db
    .insert(s.properties)
    .values(
      ['VP-1', 'VP-2', 'VP-3'].map((code) => ({
        organizationId: organization.id,
        code,
        name: `${slug} ${code}`,
        type: 'APARTMENT' as const,
        landlordId: landlord.id,
        county: 'Nairobi',
        town: 'Nairobi',
        unitCount: 1,
        expectedMonthlyRent: amount(100_000),
      })),
    )
    .returning()

  return { scope: systemScope(organization.id, 'Test Harness'), organizationId: organization.id, rows }
}

const daysAgo = (count: number) => new Date(Date.now() - count * 86_400_000)

let alpha: Awaited<ReturnType<typeof buildPortfolio>>
let beta: Awaited<ReturnType<typeof buildPortfolio>>

beforeAll(async () => {
  const stamp = Date.now().toString(36)
  alpha = await buildPortfolio(`val-alpha-${stamp}`)
  beta = await buildPortfolio(`val-beta-${stamp}`)

  await db.insert(s.propertyValuations).values([
    // Property 1: valued a year ago, then revalued a week ago — the movement.
    {
      organizationId: alpha.organizationId,
      propertyId: alpha.rows[0].id,
      amount: amount(10_000_000_00),
      valuedAt: daysAgo(365),
      basis: 'PURCHASE_PRICE',
    },
    {
      organizationId: alpha.organizationId,
      propertyId: alpha.rows[0].id,
      amount: amount(12_000_000_00),
      valuedAt: daysAgo(7),
      basis: 'PROFESSIONAL',
    },
    // Property 2: one old valuation and nothing since — steady.
    {
      organizationId: alpha.organizationId,
      propertyId: alpha.rows[1].id,
      amount: amount(5_000_000_00),
      valuedAt: daysAgo(400),
      basis: 'BANK',
    },
    // Property 3 is deliberately never valued.

    // Another organization's valuation, which must never be counted here.
    {
      organizationId: beta.organizationId,
      propertyId: beta.rows[0].id,
      amount: amount(99_000_000_00),
      valuedAt: daysAgo(2),
      basis: 'PROFESSIONAL',
    },
  ])
}, 60_000)

afterAll(async () => {
  if (created.length > 0) {
    await db.delete(s.organizations).where(inArray(s.organizations.id, created))
  }
  await closePool()
})

describe('portfolio value', () => {
  it('sums the latest valuation held for each property', async () => {
    const value = await portfolioValue(alpha.scope)
    expect(value.totalCents).toBe(12_000_000_00 + 5_000_000_00)
  })

  it('counts valued and unvalued properties separately', async () => {
    const value = await portfolioValue(alpha.scope)
    expect(value.valued).toBe(2)
    expect(value.unvalued).toBe(1)
  })

  it('excludes a revaluation newer than the date asked for', async () => {
    const value = await portfolioValue(alpha.scope)
    // A month ago, property 1 was still on its purchase price.
    expect(value.previousCents).toBe(10_000_000_00 + 5_000_000_00)
    expect(value.totalCents).toBeGreaterThan(value.previousCents)
  })

  it('reports the most recent valuation date in the portfolio', async () => {
    const value = await portfolioValue(alpha.scope)
    expect(value.lastValuedAt).not.toBeNull()
    expect(value.lastValuedAt!.getTime()).toBeGreaterThan(daysAgo(10).getTime())
  })

  it('never counts another organization’s valuations', async () => {
    const value = await portfolioValue(alpha.scope)
    expect(value.totalCents).toBeLessThan(99_000_000_00)

    const other = await portfolioValue(beta.scope)
    expect(other.totalCents).toBe(99_000_000_00)
    expect(other.valued).toBe(1)
    expect(other.unvalued).toBe(2)
  })

  it('reports zero rather than failing when nothing is valued', async () => {
    const empty = await buildPortfolio(`val-empty-${Date.now().toString(36)}`)
    const value = await portfolioValue(empty.scope)
    expect(value.totalCents).toBe(0)
    expect(value.valued).toBe(0)
    expect(value.lastValuedAt).toBeNull()
  })
})

/** Keeps the scope type referenced, so a signature change is caught here too. */
export type _Scope = Scope
