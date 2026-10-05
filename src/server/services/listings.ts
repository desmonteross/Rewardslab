// ===========================================================================
//  Unit listings (Find a Home)
//
//  A vacant unit can be listed so house seekers can find it on the Find a
//  Home portal, and de-listed to pull it back off. Signing a lease on the
//  unit de-lists it automatically: nobody should be shown a home that has
//  already been let.
//
//  The listing row is written first, then the portal is told. If the portal
//  call fails, the row says so (sync FAILED) rather than pretending; if no
//  portal is connected yet, it stays QUEUED.
// ===========================================================================

import { and, eq } from 'drizzle-orm'
import { db, type Tx } from '@/db'
import { properties, unitListings, units } from '@/db/schema'
import { amount, cents } from '@/lib/money'
import { audit } from '@/lib/audit'
import { assertInScope, scoped, type Scope } from '@/lib/tenancy'
import { getListingProvider, type ListingSyncResult } from '@/server/adapters'

export interface ListUnitInput {
  headline?: string | null
  description?: string | null
  /** Left out, the unit's own rent is advertised. */
  askingRentCents?: number | null
  availableFrom?: Date | null
}

function syncFields(result: ListingSyncResult) {
  return {
    syncStatus: (!result.success ? 'FAILED' : result.delivered ? 'SYNCED' : 'QUEUED') as 'FAILED' | 'SYNCED' | 'QUEUED',
    syncMessage: result.message,
  }
}

export async function listUnit(scope: Scope, unitId: string, input: ListUnitInput = {}) {
  const listing = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ unit: units, propertyName: properties.name, town: properties.town, area: properties.area })
      .from(units)
      .innerJoin(properties, eq(properties.id, units.propertyId))
      .where(scoped(units, scope, eq(units.id, unitId)))
      .limit(1)
    if (!row) throw new Error('That unit does not exist.')
    const { unit } = row
    if (unit.status !== 'VACANT') {
      throw new Error(`Unit ${unit.unitNumber} is ${unit.status.toLowerCase()}. Only a vacant unit can be listed.`)
    }

    const [live] = await tx
      .select({ id: unitListings.id })
      .from(unitListings)
      .where(scoped(unitListings, scope, eq(unitListings.unitId, unitId), eq(unitListings.status, 'LISTED')))
      .limit(1)
    if (live) throw new Error(`Unit ${unit.unitNumber} is already listed.`)

    const askingRentCents = input.askingRentCents ?? cents(unit.monthlyRent)
    if (askingRentCents <= 0) throw new Error('Give the asking rent. The unit has none set.')

    const [created] = await tx
      .insert(unitListings)
      .values({
        organizationId: scope.organizationId,
        unitId,
        propertyId: unit.propertyId,
        headline: input.headline?.trim() || `${row.propertyName} ${unit.unitNumber}, ${row.area ?? row.town}`,
        description: input.description?.trim() ?? '',
        askingRent: amount(askingRentCents),
        availableFrom: input.availableFrom ?? new Date(),
        listedById: scope.userId,
        listedByName: scope.userName,
      })
      .returning()

    await audit(tx, scope, {
      action: 'Unit Listed',
      entityType: 'Unit',
      entityId: unitId,
      reference: created.headline,
      newValue: { listingId: created.id, askingRent: created.askingRent },
    })

    return {
      created,
      payload: {
        listingId: created.id,
        organizationId: scope.organizationId,
        propertyName: row.propertyName,
        town: row.town,
        area: row.area,
        unitNumber: unit.unitNumber,
        unitType: unit.type,
        bedrooms: unit.bedrooms,
        bathrooms: unit.bathrooms,
        askingRentCents,
        depositCents: cents(unit.deposit),
        headline: created.headline,
        description: created.description,
        availableFrom: created.availableFrom,
      },
    }
  })

  // Outside the transaction: a slow or failing portal must not hold locks or
  // undo the listing. The row records how the call went.
  const result = await getListingProvider()
    .publish(listing.payload)
    .catch((error: unknown) => ({
      success: false,
      delivered: false,
      externalRef: null,
      message: error instanceof Error ? error.message : 'The portal did not respond.',
    }))

  const [updated] = await db
    .update(unitListings)
    .set({ ...syncFields(result), externalRef: result.externalRef ?? null, updatedAt: new Date() })
    .where(scoped(unitListings, scope, eq(unitListings.id, listing.created.id)))
    .returning()
  return updated
}

/** Close the live listing inside an existing transaction. Returns it, or null when there was none. */
async function closeListing(tx: Tx, scope: Scope, unitId: string, reason: string) {
  const [closed] = await tx
    .update(unitListings)
    .set({
      status: 'DELISTED',
      delistedAt: new Date(),
      delistedById: scope.userId,
      delistedByName: scope.userName,
      delistReason: reason,
      updatedAt: new Date(),
    })
    .where(scoped(unitListings, scope, eq(unitListings.unitId, unitId), eq(unitListings.status, 'LISTED')))
    .returning()
  if (!closed) return null

  await audit(tx, scope, {
    action: 'Unit Delisted',
    entityType: 'Unit',
    entityId: unitId,
    reference: closed.headline,
    newValue: { listingId: closed.id, reason },
  })
  return closed
}

async function withdrawFromPortal(scope: Scope, listing: { id: string; externalRef: string | null }) {
  const result = await getListingProvider()
    .withdraw(listing.id, listing.externalRef)
    .catch((error: unknown) => ({
      success: false,
      delivered: false,
      externalRef: null,
      message: error instanceof Error ? error.message : 'The portal did not respond.',
    }))
  await db
    .update(unitListings)
    .set({ ...syncFields(result), updatedAt: new Date() })
    .where(scoped(unitListings, scope, eq(unitListings.id, listing.id)))
}

export async function delistUnit(scope: Scope, unitId: string, reason = 'Taken off the market') {
  const closed = await db.transaction(async (tx) => {
    const unit = await tx
      .select()
      .from(units)
      .where(scoped(units, scope, eq(units.id, unitId)))
      .limit(1)
      .then((rows) => rows[0])
    assertInScope(unit, scope, 'unit')
    const listing = await closeListing(tx, scope, unitId, reason)
    if (!listing) throw new Error(`Unit ${unit.unitNumber} is not listed.`)
    return listing
  })
  await withdrawFromPortal(scope, closed)
  return closed
}

/**
 * De-list a unit that is about to be let, inside the caller's transaction.
 * The portal is told after the caller commits, via the returned callback.
 */
export async function delistOnLetting(tx: Tx, scope: Scope, unitId: string, reason: string) {
  const closed = await closeListing(tx, scope, unitId, reason)
  return async () => {
    if (closed) await withdrawFromPortal(scope, closed)
  }
}

/** Live listings keyed by unit id, for badges on unit screens. */
export async function liveListingsByUnit(scope: Scope, unitIds?: string[]) {
  const rows = await db
    .select({ unitId: unitListings.unitId, id: unitListings.id, syncStatus: unitListings.syncStatus })
    .from(unitListings)
    .where(and(scoped(unitListings, scope, eq(unitListings.status, 'LISTED'))))
  const wanted = unitIds ? new Set(unitIds) : null
  return new Map(rows.filter((row) => !wanted || wanted.has(row.unitId)).map((row) => [row.unitId, row]))
}
