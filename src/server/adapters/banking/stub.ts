// ===========================================================================
//  Banking — Phase 2 placeholder
//
//  Bank statement ingestion will reconcile direct transfers the same way
//  M-Pesa receipts are reconciled today: normalise to InboundTransaction, then
//  hand to the existing pipeline. The interface is fixed now so the Phase 1
//  reconciliation engine needs no change later.
// ===========================================================================

import type { BankingProvider, InboundTransaction, ProviderInfo } from '../types'

export class BankingStubProvider implements BankingProvider {
  info(): ProviderInfo {
    return {
      key: 'banking-stub',
      name: 'Banking',
      mode: 'mock',
      notice: 'Bank statement ingestion is planned for a later phase.',
    }
  }

  async fetchStatement(): Promise<InboundTransaction[]> {
    return []
  }
}
