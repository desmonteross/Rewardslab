// ===========================================================================
//  Accounting ledger (spec §17)
//
//  Payments do not "set a paid flag". Every financial event posts a balanced
//  group of double-entry lines that are never updated or deleted. A mistake is
//  corrected by posting a reversing group, so the history stays auditable.
// ===========================================================================

import { and, eq, sql } from 'drizzle-orm'
import { ledgerEntries } from '@/db/schema'
import type { Tx } from '@/db'
import { db } from '@/db'
import { amount, cents } from '@/lib/money'
import { newId } from '@/lib/ids'
import { scoped, type Scope } from '@/lib/tenancy'

export type LedgerAccountName =
  | 'CASH_MPESA'
  | 'CASH_BANK'
  | 'CASH_ON_HAND'
  | 'RENT_RECEIVABLE'
  | 'RENT_INCOME'
  | 'SERVICE_CHARGE_INCOME'
  | 'PENALTY_INCOME'
  | 'COMMISSION_INCOME'
  | 'LANDLORD_PAYABLE'
  | 'SECURITY_DEPOSIT_LIABILITY'
  | 'PROPERTY_EXPENSE'
  | 'SUSPENSE'
  | 'ADJUSTMENTS'

export type LedgerSource =
  | 'INVOICE'
  | 'PAYMENT'
  | 'COMMISSION'
  | 'SETTLEMENT'
  | 'EXPENSE'
  | 'ADJUSTMENT'
  | 'REVERSAL'

export interface LedgerLine {
  account: LedgerAccountName
  entryType: 'DEBIT' | 'CREDIT'
  /** Integer cents. */
  amountCents: number
  narrative?: string
}

export interface LedgerPosting {
  sourceType: LedgerSource
  sourceId: string
  sourceReference?: string | null
  transactionDate: Date
  narrative: string
  landlordId?: string | null
  propertyId?: string | null
  unitId?: string | null
  tenantId?: string | null
  lines: LedgerLine[]
}

export class UnbalancedLedgerError extends Error {
  constructor(debits: number, credits: number) {
    super(
      `Ledger posting is not balanced: debits ${amount(debits)} ≠ credits ${amount(credits)}. ` +
        'The posting was rejected and nothing was written.',
    )
    this.name = 'UnbalancedLedgerError'
  }
}

/** Sum debits and credits of a posting, in cents. */
export function balanceOf(lines: LedgerLine[]) {
  let debits = 0
  let credits = 0
  for (const line of lines) {
    if (line.amountCents < 0) {
      throw new Error('Ledger lines must be positive — use the DEBIT/CREDIT side to express direction.')
    }
    if (line.entryType === 'DEBIT') debits += line.amountCents
    else credits += line.amountCents
  }
  return { debits, credits, balanced: debits === credits }
}

/**
 * Write one balanced group. Returns the group id so related records (payment,
 * settlement …) can point back at the exact accounting entries they produced.
 */
export async function postLedgerGroup(tx: Tx, scope: Scope, posting: LedgerPosting): Promise<string> {
  const lines = posting.lines.filter((line) => line.amountCents !== 0)
  if (lines.length === 0) return ''

  const { debits, credits, balanced } = balanceOf(lines)
  if (!balanced) throw new UnbalancedLedgerError(debits, credits)

  const entryGroupId = newId('grp')
  await tx.insert(ledgerEntries).values(
    lines.map((line) => ({
      organizationId: scope.organizationId,
      entryGroupId,
      account: line.account,
      entryType: line.entryType,
      amount: amount(line.amountCents),
      narrative: line.narrative ?? posting.narrative,
      sourceType: posting.sourceType,
      sourceId: posting.sourceId,
      sourceReference: posting.sourceReference ?? null,
      landlordId: posting.landlordId ?? null,
      propertyId: posting.propertyId ?? null,
      unitId: posting.unitId ?? null,
      tenantId: posting.tenantId ?? null,
      transactionDate: posting.transactionDate,
      createdById: scope.userId,
      createdByName: scope.userName,
    })),
  )
  return entryGroupId
}

/** Post the exact opposite of an existing group — the only way to "undo". */
export async function reverseLedgerGroup(
  tx: Tx,
  scope: Scope,
  entryGroupId: string,
  reason: string,
  when: Date = new Date(),
): Promise<string> {
  const rows = await tx
    .select()
    .from(ledgerEntries)
    .where(scoped(ledgerEntries, scope, eq(ledgerEntries.entryGroupId, entryGroupId)))

  if (rows.length === 0) return ''
  const first = rows[0]

  return postLedgerGroup(tx, scope, {
    sourceType: 'REVERSAL',
    sourceId: first.sourceId,
    sourceReference: first.sourceReference,
    transactionDate: when,
    narrative: `Reversal — ${reason}`,
    landlordId: first.landlordId,
    propertyId: first.propertyId,
    unitId: first.unitId,
    tenantId: first.tenantId,
    lines: rows.map((row) => ({
      account: row.account as LedgerAccountName,
      entryType: row.entryType === 'DEBIT' ? ('CREDIT' as const) : ('DEBIT' as const),
      amountCents: cents(row.amount),
      narrative: `Reversal of ${row.narrative}`,
    })),
  })
}

export interface TrialBalanceRow {
  account: LedgerAccountName
  debits: number
  credits: number
  balance: number
}

/** Trial balance in cents, for the Accounting screen and for tests. */
export async function trialBalance(scope: Scope, opts: { from?: Date; to?: Date } = {}) {
  const conditions = [
    opts.from ? sql`${ledgerEntries.transactionDate} >= ${opts.from}` : undefined,
    opts.to ? sql`${ledgerEntries.transactionDate} <= ${opts.to}` : undefined,
  ]

  const rows = await db
    .select({
      account: ledgerEntries.account,
      debits: sql<string>`coalesce(sum(case when ${ledgerEntries.entryType} = 'DEBIT' then ${ledgerEntries.amount} else 0 end), 0)`,
      credits: sql<string>`coalesce(sum(case when ${ledgerEntries.entryType} = 'CREDIT' then ${ledgerEntries.amount} else 0 end), 0)`,
    })
    .from(ledgerEntries)
    .where(scoped(ledgerEntries, scope, ...conditions))
    .groupBy(ledgerEntries.account)

  return rows.map<TrialBalanceRow>((row) => {
    const debits = cents(row.debits)
    const credits = cents(row.credits)
    return { account: row.account as LedgerAccountName, debits, credits, balance: debits - credits }
  })
}

export async function ledgerTotals(scope: Scope) {
  const rows = await trialBalance(scope)
  const debits = rows.reduce((total, row) => total + row.debits, 0)
  const credits = rows.reduce((total, row) => total + row.credits, 0)
  return { debits, credits, balanced: debits === credits }
}

export const ACCOUNT_LABELS: Record<LedgerAccountName, string> = {
  CASH_MPESA: 'Cash — M-Pesa',
  CASH_BANK: 'Cash — Bank',
  CASH_ON_HAND: 'Cash on Hand',
  RENT_RECEIVABLE: 'Rent Receivable',
  RENT_INCOME: 'Rent Income',
  SERVICE_CHARGE_INCOME: 'Service Charge Income',
  PENALTY_INCOME: 'Penalty Income',
  COMMISSION_INCOME: 'Platform Commission Income',
  LANDLORD_PAYABLE: 'Landlord Payable',
  SECURITY_DEPOSIT_LIABILITY: 'Security Deposits Held',
  PROPERTY_EXPENSE: 'Property Expenses',
  SUSPENSE: 'Suspense — Unmatched Receipts',
  ADJUSTMENTS: 'Adjustments',
}

export const ACCOUNT_KIND: Record<LedgerAccountName, 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE'> = {
  CASH_MPESA: 'ASSET',
  CASH_BANK: 'ASSET',
  CASH_ON_HAND: 'ASSET',
  RENT_RECEIVABLE: 'ASSET',
  RENT_INCOME: 'INCOME',
  SERVICE_CHARGE_INCOME: 'INCOME',
  PENALTY_INCOME: 'INCOME',
  COMMISSION_INCOME: 'INCOME',
  LANDLORD_PAYABLE: 'LIABILITY',
  SECURITY_DEPOSIT_LIABILITY: 'LIABILITY',
  PROPERTY_EXPENSE: 'EXPENSE',
  SUSPENSE: 'LIABILITY',
  ADJUSTMENTS: 'EXPENSE',
}

export { and }
