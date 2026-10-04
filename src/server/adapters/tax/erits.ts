// ===========================================================================
//  KRA eRITS — LIVE adapter scaffold
//
//  Intentionally unimplemented. KRA integration must go through officially
//  available or authorised channels, under credentials issued to the
//  deploying organization; this project does not invent or document
//  undisclosed KRA endpoints.
//
//  The seam is what matters: the compliance engine already produces the
//  EritsReturnPayload shape below, so enabling a real integration means
//  implementing these three methods and setting TAX_PROVIDER=erits.
// ===========================================================================

import { env } from '@/lib/env'
import type {
  EritsPropertyRegistration,
  EritsRegistrationResult,
  EritsReturnPayload,
  EritsSubmissionResult,
  ProviderInfo,
  TaxProvider,
} from '../types'

export class EritsNotConfiguredError extends Error {
  constructor() {
    super(
      'The live KRA eRITS adapter is selected but no authorised integration is configured. ' +
        'Set ERITS_BASE_URL, ERITS_CLIENT_ID and ERITS_CLIENT_SECRET to credentials issued to your ' +
        'organization, or set TAX_PROVIDER=erits-mock for development.',
    )
    this.name = 'EritsNotConfiguredError'
  }
}

export class EritsProvider implements TaxProvider {
  private assertConfigured() {
    const { baseUrl, clientId, clientSecret } = env.erits
    if (!baseUrl || !clientId || !clientSecret) throw new EritsNotConfiguredError()
  }

  info(): ProviderInfo {
    return {
      key: 'erits',
      name: 'KRA eRITS',
      mode: env.erits.environment === 'production' ? 'live' : 'sandbox',
      notice:
        'Live eRITS integration is not implemented in Phase 1. Connect only through officially authorised KRA channels.',
    }
  }

  async registerProperty(_registration: EritsPropertyRegistration): Promise<EritsRegistrationResult> {
    this.assertConfigured()
    throw new Error('Live eRITS property registration is not implemented in Phase 1.')
  }

  async submitReturn(_payload: EritsReturnPayload): Promise<EritsSubmissionResult> {
    this.assertConfigured()
    throw new Error('Live eRITS return submission is not implemented in Phase 1.')
  }

  async checkStatus(_acknowledgementRef: string): Promise<{ status: string; message: string }> {
    this.assertConfigured()
    throw new Error('Live eRITS status checks are not implemented in Phase 1.')
  }
}
