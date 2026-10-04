// ===========================================================================
//  KRA eRITS — MOCK provider (Phase 1)
//
//  eRITS is the Electronic Rental Income Tax System. This adapter NEVER
//  contacts KRA. It exists so the compliance workflow — property mapping,
//  monthly aggregation, review, submission, status tracking — can be built and
//  demonstrated end to end against a stable contract.
//
//  Every result it returns is stamped SIMULATED, and the UI surfaces that
//  stamp, so a demo filing can never be mistaken for a real one.
//
//  Production integration must use officially available or authorised KRA
//  integration mechanisms only. No endpoint is invented here.
// ===========================================================================

import { randomInt } from 'node:crypto'
import type {
  EritsPropertyRegistration,
  EritsRegistrationResult,
  EritsReturnPayload,
  EritsSubmissionResult,
  ProviderInfo,
  TaxProvider,
} from '../types'

const acknowledgements = new Map<string, { status: string; message: string }>()

function reference(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomInt(1000, 9999)}`
}

export class EritsMockProvider implements TaxProvider {
  info(): ProviderInfo {
    return {
      key: 'erits-mock',
      name: 'KRA eRITS (Mock)',
      mode: 'mock',
      notice:
        'Simulated eRITS. Nothing is transmitted to KRA. Submissions are recorded locally and marked SIMULATED.',
    }
  }

  async registerProperty(registration: EritsPropertyRegistration): Promise<EritsRegistrationResult> {
    if (!registration.kraPin) {
      return {
        success: false,
        propertyRef: null,
        status: 'REQUIRES_ATTENTION',
        message: 'A KRA PIN is required before a rental property can be mapped to eRITS.',
      }
    }
    if (!/^[A-Z]\d{9}[A-Z]$/i.test(registration.kraPin)) {
      return {
        success: false,
        propertyRef: null,
        status: 'REQUIRES_ATTENTION',
        message: `"${registration.kraPin}" is not a valid KRA PIN format (e.g. A012345678Z).`,
      }
    }
    return {
      success: true,
      propertyRef: reference('ERP'),
      status: 'REGISTERED',
      message: 'Simulated eRITS property registration completed.',
    }
  }

  async submitReturn(payload: EritsReturnPayload): Promise<EritsSubmissionResult> {
    const problems: string[] = []
    if (!payload.kraPin) problems.push('missing KRA PIN')
    if (payload.grossRentalIncomeCents <= 0) problems.push('no rental income for the period')
    if (payload.properties.some((property) => !property.propertyRef)) {
      problems.push('one or more properties have no eRITS property reference')
    }

    if (problems.length > 0) {
      return {
        success: false,
        mode: 'SIMULATED',
        acknowledgementRef: null,
        status: 'REJECTED',
        message: `Simulated eRITS rejection: ${problems.join('; ')}.`,
        raw: { payload, problems },
      }
    }

    const acknowledgementRef = reference('ERITS-ACK')
    acknowledgements.set(acknowledgementRef, {
      status: 'ACCEPTED',
      message: 'Simulated acknowledgement — no return was filed with KRA.',
    })

    return {
      success: true,
      mode: 'SIMULATED',
      acknowledgementRef,
      status: 'SIMULATED',
      message:
        'SIMULATED eRITS SUBMISSION — this return was recorded locally only and was not transmitted to KRA.',
      raw: { payload, acknowledgementRef, transmitted: false },
    }
  }

  async checkStatus(acknowledgementRef: string) {
    return (
      acknowledgements.get(acknowledgementRef) ?? {
        status: 'UNKNOWN',
        message: 'No simulated acknowledgement found for that reference.',
      }
    )
  }
}
