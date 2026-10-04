// ===========================================================================
//  Payment allocation
//
//  Deciding which invoices a receipt clears is pure arithmetic, so it lives
//  here on its own and is unit-tested directly. Oldest due date first, then
//  oldest invoice — the convention Kenyan property managers expect, because it
//  clears arrears before current rent.
// ===========================================================================

export interface AllocatableInvoice {
  id: string
  /** Outstanding balance in integer cents. */
  balanceCents: number
  dueDate: Date
  createdAt?: Date
}

export interface PlannedAllocation {
  invoiceId: string
  amountCents: number
  /** Invoice balance once this allocation is applied. */
  remainingCents: number
  clears: boolean
}

export interface AllocationPlan {
  allocations: PlannedAllocation[]
  allocatedCents: number
  unallocatedCents: number
  /** True when money is left over after every open invoice is cleared. */
  hasCredit: boolean
}

/**
 * Spread `paymentCents` across open invoices, oldest first.
 * Never allocates more than an invoice's balance, and never more than the
 * payment; whatever is left over is reported as unallocated credit.
 */
export function planAllocation(paymentCents: number, invoices: AllocatableInvoice[]): AllocationPlan {
  if (paymentCents <= 0) {
    return { allocations: [], allocatedCents: 0, unallocatedCents: Math.max(0, paymentCents), hasCredit: false }
  }

  const open = invoices
    .filter((invoice) => invoice.balanceCents > 0)
    .sort((a, b) => {
      const byDue = a.dueDate.getTime() - b.dueDate.getTime()
      if (byDue !== 0) return byDue
      const aCreated = a.createdAt?.getTime() ?? 0
      const bCreated = b.createdAt?.getTime() ?? 0
      if (aCreated !== bCreated) return aCreated - bCreated
      return a.id.localeCompare(b.id)
    })

  const allocations: PlannedAllocation[] = []
  let remaining = paymentCents

  for (const invoice of open) {
    if (remaining <= 0) break
    const applied = Math.min(remaining, invoice.balanceCents)
    if (applied <= 0) continue
    remaining -= applied
    allocations.push({
      invoiceId: invoice.id,
      amountCents: applied,
      remainingCents: invoice.balanceCents - applied,
      clears: invoice.balanceCents - applied === 0,
    })
  }

  return {
    allocations,
    allocatedCents: paymentCents - remaining,
    unallocatedCents: remaining,
    hasCredit: remaining > 0,
  }
}

export type InvoiceStatusName = 'DRAFT' | 'DUE' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED'

/**
 * The status an invoice should carry given what has been paid against it.
 * Cancelled and draft invoices are left alone.
 */
export function invoiceStatusFor(
  current: InvoiceStatusName,
  totalCents: number,
  paidCents: number,
  dueDate: Date,
  gracePeriodDays = 0,
  asOf: Date = new Date(),
): InvoiceStatusName {
  if (current === 'CANCELLED' || current === 'DRAFT') return current
  if (paidCents <= 0) {
    const graceEnd = new Date(dueDate.getTime() + gracePeriodDays * 86_400_000)
    return asOf > graceEnd ? 'OVERDUE' : 'DUE'
  }
  if (paidCents >= totalCents) return 'PAID'
  return 'PARTIALLY_PAID'
}
