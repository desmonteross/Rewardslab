// ===========================================================================
//  Find a Home — placeholder until the portal is integrated
//
//  Listing and de-listing already work inside RentRewards: the listing row,
//  its history and the automatic de-list when a unit is let are all real.
//  This adapter is the seam. It accepts every call and reports that nothing
//  left the building, so the screens can say so honestly. Integrating the
//  portal means implementing publish and withdraw here, and nothing else.
// ===========================================================================

import type { ListingProvider, ListingSyncResult, ProviderInfo, UnitListingPayload } from '../types'

export class FindAHomeStubProvider implements ListingProvider {
  info(): ProviderInfo {
    return {
      key: 'find-a-home-stub',
      name: 'Find a Home',
      mode: 'mock',
      notice: 'The Find a Home portal is not connected yet. Listings are kept here and will be published once it is.',
    }
  }

  async publish(listing: UnitListingPayload): Promise<ListingSyncResult> {
    return {
      success: true,
      delivered: false,
      externalRef: null,
      message: `${listing.unitNumber} is listed in RentRewards and queued for Find a Home.`,
    }
  }

  async withdraw(): Promise<ListingSyncResult> {
    return { success: true, delivered: false, externalRef: null, message: 'Listing withdrawn.' }
  }
}
