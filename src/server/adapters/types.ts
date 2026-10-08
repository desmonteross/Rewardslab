// ===========================================================================
//  Integration adapter contracts (spec §33)
//
//  The PMS core never talks to Safaricom, KRA, a bank or an SMS gateway
//  directly. It talks to these interfaces, and an adapter implements them.
//  That is what lets Phase 1 ship with mocks and Phase 2 swap in the real
//  provider without touching a single line of billing, reconciliation or
//  compliance logic.
// ===========================================================================

export interface ProviderInfo {
  key: string
  name: string
  mode: 'mock' | 'sandbox' | 'live'
  /** Shown on the Integrations screen so nobody mistakes a mock for the real thing. */
  notice?: string
}

// ---------------------------------------------------------------------------
// Payments — collection from tenants
// ---------------------------------------------------------------------------

export interface CollectionRequest {
  amountCents: number
  /** Payer MSISDN in any common Kenyan format. */
  phone: string
  accountReference: string
  narrative: string
  organizationId: string
  /** Where the provider should post the asynchronous result. */
  callbackUrl?: string
}

export interface CollectionResponse {
  success: boolean
  /** Provider-side identifier for the request (checkout / conversation id). */
  requestId: string
  /** Present once the provider confirms the funds moved. */
  transactionId?: string | null
  status: 'INITIATED' | 'PENDING' | 'CONFIRMED' | 'FAILED'
  message: string
}

/** The provider-agnostic shape of an inbound confirmation. */
export interface InboundTransaction {
  transactionId: string
  transactionType: string
  amountCents: number
  msisdn: string
  payerName?: string | null
  billRefNumber: string
  shortCode: string
  transactionTime: Date
  raw: unknown
}

export interface PaymentProvider {
  info(): ProviderInfo
  /** Ask the payer to authorise a payment (STK push equivalent). */
  requestCollection(request: CollectionRequest): Promise<CollectionResponse>
  /** Normalise a provider webhook body into an InboundTransaction. */
  parseWebhook(body: unknown): InboundTransaction | null
  /** Confirm a transaction id out-of-band, for reconciliation. */
  verify(transactionId: string): Promise<{ found: boolean; amountCents?: number; status?: string }>
}

// ---------------------------------------------------------------------------
// Payouts — disbursement to landlords
// ---------------------------------------------------------------------------

export interface PayoutRequest {
  reference: string
  method: 'MPESA' | 'BANK'
  destination: string
  amountCents: number
  narrative: string
}

export interface PayoutResponse {
  success: boolean
  reference: string
  message: string
}

export interface PayoutProvider {
  info(): ProviderInfo
  disburse(request: PayoutRequest): Promise<PayoutResponse>
}

// ---------------------------------------------------------------------------
// Tax — KRA eRITS
// ---------------------------------------------------------------------------

export interface EritsPropertyRegistration {
  kraPin: string
  propertyName: string
  propertyType: string
  county: string
  town: string
  unitCount: number
  estimatedAnnualRentCents: number
}

export interface EritsRegistrationResult {
  success: boolean
  /** eRITS property reference, when the provider issues one. */
  propertyRef: string | null
  status: 'REGISTERED' | 'PENDING' | 'REQUIRES_ATTENTION' | 'SYNC_FAILED'
  message: string
}

export interface EritsReturnPayload {
  kraPin: string
  taxpayerName: string
  periodYear: number
  periodMonth: number
  grossRentalIncomeCents: number
  allowableDeductionsCents: number
  taxableAmountCents: number
  taxRate: number
  taxPayableCents: number
  properties: {
    propertyRef: string | null
    propertyName: string
    grossRentalIncomeCents: number
    paymentCount: number
  }[]
}

export interface EritsSubmissionResult {
  success: boolean
  /** Always flagged so a simulated filing can never be mistaken for a real one. */
  mode: 'SIMULATED' | 'SUBMITTED'
  acknowledgementRef: string | null
  status: 'SIMULATED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'FAILED'
  message: string
  raw: unknown
}

export interface TaxProvider {
  info(): ProviderInfo
  registerProperty(registration: EritsPropertyRegistration): Promise<EritsRegistrationResult>
  submitReturn(payload: EritsReturnPayload): Promise<EritsSubmissionResult>
  checkStatus(acknowledgementRef: string): Promise<{ status: string; message: string }>
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationMessage {
  channel: 'SMS' | 'EMAIL' | 'IN_APP'
  to: string
  subject?: string
  body: string
}

export interface NotificationProvider {
  info(): ProviderInfo
  send(message: NotificationMessage): Promise<{ success: boolean; providerRef: string | null; message: string }>
}

// ---------------------------------------------------------------------------
// Banking (Phase 2)
// ---------------------------------------------------------------------------

export interface BankingProvider {
  info(): ProviderInfo
  fetchStatement(args: { account: string; from: Date; to: Date }): Promise<InboundTransaction[]>
}

// ---------------------------------------------------------------------------
// Listings — advertising vacant units to house seekers
// ---------------------------------------------------------------------------

/** What a listing portal is told about a vacant unit. */
export interface UnitListingPayload {
  listingId: string
  organizationId: string
  propertyName: string
  town: string
  area?: string | null
  unitNumber: string
  unitType: string
  bedrooms: number
  bathrooms: number
  askingRentCents: number
  depositCents: number
  headline: string
  description: string
  availableFrom: Date
}

export interface ListingSyncResult {
  success: boolean
  /** The portal's own id for the listing, needed to withdraw it later. */
  externalRef?: string | null
  /** False when no portal is connected yet: the listing is kept and sent once one is. */
  delivered: boolean
  message: string
}

export interface ListingProvider {
  info(): ProviderInfo
  /** Put a vacant unit on the portal. */
  publish(listing: UnitListingPayload): Promise<ListingSyncResult>
  /** Pull a unit off the portal. */
  withdraw(listingId: string, externalRef: string | null): Promise<ListingSyncResult>
}
