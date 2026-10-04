import { describe, expect, it } from 'vitest'
import { invoiceStatusFor, planAllocation, type AllocatableInvoice } from '@/server/services/allocation'

const invoice = (id: string, balanceKes: number, due: string): AllocatableInvoice => ({
  id,
  balanceCents: balanceKes * 100,
  dueDate: new Date(due),
})

describe('payment allocation', () => {
  it('clears the oldest arrears before current rent', () => {
    const plan = planAllocation(50_000 * 100, [
      invoice('sep', 25_000, '2026-09-05'),
      invoice('jul', 25_000, '2026-07-05'),
      invoice('aug', 25_000, '2026-08-05'),
    ])

    expect(plan.allocations.map((a) => a.invoiceId)).toEqual(['jul', 'aug'])
    expect(plan.allocatedCents).toBe(50_000 * 100)
    expect(plan.unallocatedCents).toBe(0)
    expect(plan.allocations.every((a) => a.clears)).toBe(true)
  })

  it('part-pays the next invoice when the money runs out', () => {
    const plan = planAllocation(30_000 * 100, [
      invoice('aug', 25_000, '2026-08-05'),
      invoice('sep', 25_000, '2026-09-05'),
    ])

    expect(plan.allocations).toHaveLength(2)
    expect(plan.allocations[1]).toMatchObject({ invoiceId: 'sep', amountCents: 5_000 * 100, clears: false })
    expect(plan.allocations[1].remainingCents).toBe(20_000 * 100)
  })

  it('never allocates more than an invoice balance', () => {
    const plan = planAllocation(100_000 * 100, [invoice('sep', 25_000, '2026-09-05')])
    expect(plan.allocatedCents).toBe(25_000 * 100)
    expect(plan.unallocatedCents).toBe(75_000 * 100)
    expect(plan.hasCredit).toBe(true)
  })

  it('treats a payment with no open invoices as credit, not an error', () => {
    const plan = planAllocation(25_000 * 100, [])
    expect(plan.allocations).toEqual([])
    expect(plan.unallocatedCents).toBe(25_000 * 100)
  })

  it('ignores invoices that are already settled', () => {
    const plan = planAllocation(10_000 * 100, [
      { ...invoice('paid', 0, '2026-07-05') },
      invoice('sep', 25_000, '2026-09-05'),
    ])
    expect(plan.allocations.map((a) => a.invoiceId)).toEqual(['sep'])
  })

  it('is deterministic when two invoices share a due date', () => {
    const first = planAllocation(30_000 * 100, [
      invoice('b', 25_000, '2026-09-05'),
      invoice('a', 25_000, '2026-09-05'),
    ])
    const second = planAllocation(30_000 * 100, [
      invoice('a', 25_000, '2026-09-05'),
      invoice('b', 25_000, '2026-09-05'),
    ])
    expect(first.allocations.map((a) => a.invoiceId)).toEqual(second.allocations.map((a) => a.invoiceId))
  })

  it('rejects zero and negative payments', () => {
    expect(planAllocation(0, [invoice('sep', 25_000, '2026-09-05')]).allocations).toEqual([])
    expect(planAllocation(-500, [invoice('sep', 25_000, '2026-09-05')]).allocations).toEqual([])
  })
})

describe('invoice status', () => {
  const due = new Date('2026-09-05')

  it('is DUE before the grace period expires', () => {
    expect(invoiceStatusFor('DUE', 25_000_00, 0, due, 5, new Date('2026-09-08'))).toBe('DUE')
  })

  it('becomes OVERDUE after the grace period', () => {
    expect(invoiceStatusFor('DUE', 25_000_00, 0, due, 5, new Date('2026-09-14'))).toBe('OVERDUE')
  })

  it('becomes PARTIALLY_PAID then PAID', () => {
    expect(invoiceStatusFor('DUE', 25_000_00, 10_000_00, due, 5, new Date('2026-09-14'))).toBe('PARTIALLY_PAID')
    expect(invoiceStatusFor('OVERDUE', 25_000_00, 25_000_00, due, 5, new Date('2026-09-14'))).toBe('PAID')
  })

  it('treats an overpayment as paid', () => {
    expect(invoiceStatusFor('DUE', 25_000_00, 30_000_00, due)).toBe('PAID')
  })

  it('leaves cancelled and draft invoices alone', () => {
    expect(invoiceStatusFor('CANCELLED', 25_000_00, 25_000_00, due)).toBe('CANCELLED')
    expect(invoiceStatusFor('DRAFT', 25_000_00, 0, due)).toBe('DRAFT')
  })
})
