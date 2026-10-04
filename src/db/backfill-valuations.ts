// ===========================================================================
//  Backfill property valuations
//
//  For a database that already holds properties from before the
//  property_valuations table existed. Gives every unvalued property a short
//  dated history derived from the rent it produces at a gross yield, which is
//  how a Kenyan residential block is actually valued — rather than wiping and
//  reseeding, which would throw away real billing and payment history.
//
//  Safe to run more than once: a property that already has a valuation is
//  left alone.
//
//    npx tsx src/db/backfill-valuations.ts
// ===========================================================================

import { config } from '../lib/env-file'
config()

import { eq, ne, sql } from 'drizzle-orm'
import { db, getPool } from './index'
import { properties, propertyValuations } from './schema'
import { amount, cents } from '../lib/money'

const int = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1))

function monthsAgo(count: number) {
  const date = new Date()
  date.setMonth(date.getMonth() - count)
  return date
}

const daysAgo = (count: number) => new Date(Date.now() - count * 86_400_000)

async function main() {
  const rows = await db
    .select({
      id: properties.id,
      organizationId: properties.organizationId,
      name: properties.name,
      expectedMonthlyRent: properties.expectedMonthlyRent,
      valuations: sql<number>`(
        select count(*)::int
          from property_valuations v
         where v.property_id = properties.id
      )`,
    })
    .from(properties)
    .where(ne(properties.status, 'ARCHIVED'))

  const pending = rows.filter((row) => row.valuations === 0)
  if (pending.length === 0) {
    console.log(`Nothing to do — all ${rows.length} properties already have a valuation.`)
    return
  }

  console.log(`Backfilling ${pending.length} of ${rows.length} properties …`)

  for (const property of pending) {
    const monthlyKes = cents(property.expectedMonthlyRent) / 100
    if (monthlyKes <= 0) {
      console.log(`  skipped ${property.name} — no expected rent to value it from`)
      continue
    }

    const yieldPercent = 6 + Math.random() * 2.5
    const current = Math.round((monthlyKes * 12) / (yieldPercent / 100) / 100_000) * 100_000

    const values: (typeof propertyValuations.$inferInsert)[] = [
      {
        organizationId: property.organizationId,
        propertyId: property.id,
        amount: amount(Math.round(current * 0.82) * 100),
        valuedAt: monthsAgo(int(24, 34)),
        basis: 'PURCHASE_PRICE',
        note: 'Backfilled from expected rent at a market yield.',
      },
      {
        organizationId: property.organizationId,
        propertyId: property.id,
        amount: amount(Math.round(current * 0.94) * 100),
        valuedAt: monthsAgo(int(11, 16)),
        basis: 'ESTIMATE',
        note: 'Backfilled from expected rent at a market yield.',
      },
      {
        organizationId: property.organizationId,
        propertyId: property.id,
        amount: amount(current * 100),
        valuedAt: daysAgo(int(3, 25)),
        basis: 'ESTIMATE',
        note: 'Backfilled from expected rent at a market yield.',
      },
    ]

    await db.insert(propertyValuations).values(values)
    console.log(`  ${property.name} — KES ${current.toLocaleString('en-KE')}`)
  }

  console.log('\nDone. These are estimates, flagged as such; replace them with real')
  console.log('valuations as they come in — the table is dated and append-only, so')
  console.log('adding a newer row is all it takes.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await getPool().end()
  })

export { eq }
