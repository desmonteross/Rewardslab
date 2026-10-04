import { describe, expect, it } from 'vitest'
import { balanceOf, type LedgerLine } from '@/server/services/ledger'

const line = (
  account: LedgerLine['account'],
  entryType: LedgerLine['entryType'],
  amountCents: number,
): LedgerLine => ({ account, entryType, amountCents })

describe('double-entry ledger', () => {
  it('balances a rent receipt', () => {
    const result = balanceOf([
      line('CASH_MPESA', 'DEBIT', 25_000 * 100),
      line('RENT_RECEIVABLE', 'CREDIT', 25_000 * 100),
    ])
    expect(result.balanced).toBe(true)
    expect(result.debits).toBe(result.credits)
  })

  it('balances a commission split', () => {
    const result = balanceOf([
      line('RENT_INCOME', 'DEBIT', 25_000 * 100),
      line('COMMISSION_INCOME', 'CREDIT', 250 * 100),
      line('LANDLORD_PAYABLE', 'CREDIT', 24_750 * 100),
    ])
    expect(result.balanced).toBe(true)
  })

  it('detects an unbalanced posting', () => {
    const result = balanceOf([
      line('CASH_MPESA', 'DEBIT', 25_000 * 100),
      line('RENT_RECEIVABLE', 'CREDIT', 24_000 * 100),
    ])
    expect(result.balanced).toBe(false)
    expect(result.debits - result.credits).toBe(1_000 * 100)
  })

  it('refuses negative line amounts — direction is the entry type, not the sign', () => {
    expect(() => balanceOf([line('CASH_MPESA', 'DEBIT', -100)])).toThrow(/positive/)
  })
})
