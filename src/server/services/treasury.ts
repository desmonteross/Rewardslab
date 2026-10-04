// ===========================================================================
//  Treasury
//
//  Rent arrives in the M-Pesa float but landlords on bank payout are paid from
//  the bank account, so cash has to be swept between the two. Without this the
//  bank balance drifts negative and the trial balance stops telling the truth.
// ===========================================================================

import { sql } from 'drizzle-orm'
import { db } from '@/db'
import { ledgerEntries } from '@/db/schema'
import { cents } from '@/lib/money'
import { scoped, type Scope } from '@/lib/tenancy'
import { postLedgerGroup, type LedgerAccountName } from './ledger'

export interface SweepArgs {
  from: LedgerAccountName
  to: LedgerAccountName
  amountCents: number
  when?: Date
  narrative?: string
}

export async function sweepCash(scope: Scope, args: SweepArgs) {
  if (args.amountCents <= 0) return null
  const when = args.when ?? new Date()

  return db.transaction(async (tx) =>
    postLedgerGroup(tx, scope, {
      sourceType: 'ADJUSTMENT',
      sourceId: `sweep:${args.from}:${args.to}:${when.getTime()}`,
      sourceReference: 'Treasury sweep',
      transactionDate: when,
      narrative: args.narrative ?? `Treasury sweep from ${args.from} to ${args.to}`,
      lines: [
        { account: args.to, entryType: 'DEBIT', amountCents: args.amountCents },
        { account: args.from, entryType: 'CREDIT', amountCents: args.amountCents },
      ],
    }),
  )
}

/** Current balance of a cash account in cents (debit positive). */
export async function accountBalanceCents(scope: Scope, account: LedgerAccountName): Promise<number> {
  const [row] = await db
    .select({
      balance: sql<string>`coalesce(sum(case when ${ledgerEntries.entryType} = 'DEBIT' then ${ledgerEntries.amount} else -${ledgerEntries.amount} end), 0)`,
    })
    .from(ledgerEntries)
    .where(scoped(ledgerEntries, scope, sql`${ledgerEntries.account} = ${account}`))
  return cents(row?.balance ?? '0')
}

/**
 * Make sure a payout account can cover an amount, sweeping from the M-Pesa
 * float if it cannot. Returns the amount swept.
 */
export async function ensureFunded(
  scope: Scope,
  account: LedgerAccountName,
  requiredCents: number,
  when?: Date,
): Promise<number> {
  if (account === 'CASH_MPESA') return 0
  const balance = await accountBalanceCents(scope, account)
  if (balance >= requiredCents) return 0
  const shortfall = requiredCents - balance
  await sweepCash(scope, {
    from: 'CASH_MPESA',
    to: account,
    amountCents: shortfall,
    when,
    narrative: 'Transfer from the M-Pesa float to fund landlord payouts',
  })
  return shortfall
}
