// ===========================================================================
//  Document numbering
//
//  Human-facing references (INV-2026-001023, PAY-102938, RCP-2026-000042) come
//  from per-organization counters incremented atomically, so concurrent
//  requests can never be issued the same number.
// ===========================================================================

import { sql } from 'drizzle-orm'
import { documentCounters } from '@/db/schema'
import type { Tx } from '@/db'
import { documentNumber } from '@/lib/ids'

export type CounterKey =
  | 'invoice'
  | 'payment'
  | 'receipt'
  | 'expense'
  | 'settlement'
  | 'ticket'
  | 'landlord'
  | 'property'
  | 'tenant'
  | 'lease'
  | 'erits_submission'

const PREFIX: Record<CounterKey, string> = {
  invoice: 'INV',
  payment: 'PAY',
  receipt: 'RCP',
  expense: 'EXP',
  settlement: 'SET',
  ticket: 'TCK',
  landlord: 'LL',
  property: 'PROP',
  tenant: 'TNT',
  lease: 'LSE',
  erits_submission: 'ERITS',
}

/** Counters that restart each calendar year and embed the year in the number. */
const YEARLY: CounterKey[] = ['invoice', 'receipt', 'erits_submission']

const WIDTH: Partial<Record<CounterKey, number>> = {
  payment: 6,
  landlord: 3,
  property: 3,
  tenant: 4,
  lease: 4,
  ticket: 5,
  settlement: 5,
  expense: 5,
}

export async function nextSequence(tx: Tx, organizationId: string, key: string): Promise<number> {
  const [row] = await tx
    .insert(documentCounters)
    .values({ organizationId, key, value: 1 })
    .onConflictDoUpdate({
      target: [documentCounters.organizationId, documentCounters.key],
      set: { value: sql`${documentCounters.value} + 1`, updatedAt: new Date() },
    })
    .returning({ value: documentCounters.value })
  return row.value
}

export async function nextNumber(
  tx: Tx,
  organizationId: string,
  key: CounterKey,
  when: Date = new Date(),
): Promise<string> {
  const yearly = YEARLY.includes(key)
  const year = when.getFullYear()
  const counterKey = yearly ? `${key}:${year}` : key
  const sequence = await nextSequence(tx, organizationId, counterKey)
  return documentNumber(PREFIX[key], sequence, {
    year: yearly ? year : undefined,
    width: WIDTH[key] ?? 6,
  })
}
