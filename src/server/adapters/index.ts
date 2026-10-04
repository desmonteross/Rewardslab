// ===========================================================================
//  Adapter registry
//
//  One place decides which implementation backs each capability, driven by
//  environment configuration. Nothing else in the PMS imports a concrete
//  provider, which is what keeps the core independent of any single vendor.
// ===========================================================================

import { env } from '@/lib/env'
import type { BankingProvider, NotificationProvider, PaymentProvider, PayoutProvider, TaxProvider } from './types'
import { MpesaMockProvider } from './payments/mpesa-mock'
import { MpesaProvider } from './payments/mpesa'
import { EritsMockProvider } from './tax/erits-mock'
import { EritsProvider } from './tax/erits'
import { ConsoleNotificationProvider } from './notifications/console'
import { BankingStubProvider } from './banking/stub'

let paymentProvider: PaymentProvider & Partial<PayoutProvider>
let taxProvider: TaxProvider
let notificationProvider: NotificationProvider
let bankingProvider: BankingProvider

export function getPaymentProvider(): PaymentProvider {
  if (!paymentProvider) {
    paymentProvider = env.paymentsProvider === 'mpesa' ? new MpesaProvider() : new MpesaMockProvider()
  }
  return paymentProvider
}

export function getPayoutProvider(): PayoutProvider {
  const provider = getPaymentProvider() as PaymentProvider & Partial<PayoutProvider>
  if (!provider.disburse) {
    throw new Error(`Payment provider ${env.paymentsProvider} does not support payouts.`)
  }
  return provider as PayoutProvider
}

export function getTaxProvider(): TaxProvider {
  if (!taxProvider) {
    taxProvider = env.taxProvider === 'erits' ? new EritsProvider() : new EritsMockProvider()
  }
  return taxProvider
}

export function getNotificationProvider(): NotificationProvider {
  if (!notificationProvider) notificationProvider = new ConsoleNotificationProvider()
  return notificationProvider
}

export function getBankingProvider(): BankingProvider {
  if (!bankingProvider) bankingProvider = new BankingStubProvider()
  return bankingProvider
}

/** Everything the Integrations screen needs to describe the current wiring. */
export function providerSummary() {
  return {
    payments: getPaymentProvider().info(),
    tax: getTaxProvider().info(),
    notifications: getNotificationProvider().info(),
    banking: getBankingProvider().info(),
  }
}

export * from './types'
export { MpesaMockProvider } from './payments/mpesa-mock'
