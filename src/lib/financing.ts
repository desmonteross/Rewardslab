// ===========================================================================
//  Financing partners
//
//  The tenant portal can carry a card offering rent advances, emergency
//  credit and home-improvement lending from partner lenders.
//
//  The list below is empty on purpose, and the card does not render while it
//  is empty. Telling a tenant they can "access loans from our partners" when
//  there are no partners is a promise the product cannot keep, and a tenant
//  under rent pressure is exactly the person who would act on it.
//
//  To switch the card on, add a real partner here. Nothing else changes:
//
//    export const FINANCING_PARTNERS: FinancingPartner[] = [
//      {
//        id: 'example-sacco',
//        name: 'Example Sacco',
//        offer: 'Rent advance up to one month',
//        detail: 'Repaid over three months. Members only.',
//        href: 'https://example.co.ke/rent-advance',
//        regulator: 'Regulated by SASRA',
//      },
//    ]
//
//  Two things belong with each entry before it ships: who regulates the
//  lender, and where the terms live. Credit advertised to consumers in Kenya
//  is regulated, and a card that names a rate or a limit without the terms
//  behind it is the kind of thing that gets a platform in trouble — so the
//  card links out to the lender's own page rather than restating the offer.
// ===========================================================================

export interface FinancingPartner {
  id: string
  /** The lender's own name, as they are licensed under. */
  name: string
  /** One line: what is on offer. */
  offer: string
  /** One line: the condition that matters most. */
  detail: string
  /** The lender's page, where the terms actually live. */
  href: string
  /** Who regulates them — CBK, SASRA, or whoever it is. */
  regulator?: string
}

export const FINANCING_PARTNERS: FinancingPartner[] = []

export function hasFinancingPartners(): boolean {
  return FINANCING_PARTNERS.length > 0
}
