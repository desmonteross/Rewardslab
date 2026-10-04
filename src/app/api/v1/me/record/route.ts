import { authenticate, forbidden, handler, ok, unprocessable } from '@/lib/api'
import { can } from '@/lib/rbac'
import { landlordHasTenant } from '@/server/landlord-access'
import { rentalRecordFor } from '@/server/services/rental-record'
import { portalTenancyHistory } from '@/server/queries/portal'

/**
 * GET /api/v1/me/record
 *
 * The rental record and the tenancy history behind it — the same numbers the
 * portal shows, so the Phase 2 mobile app renders one source of truth.
 *
 * The factors are part of the payload, never just the band: any client that
 * displays the score has the reasons in hand and no excuse to show a bare
 * number.
 */
export const GET = handler(async (request: Request) => {
  const { scope } = await authenticate()
  const requested = new URL(request.url).searchParams.get('tenantId')
  const tenantId = scope.tenantId ?? requested
  if (!tenantId) throw unprocessable('Supply tenantId, or sign in as a tenant.')
  if (scope.tenantId && requested && requested !== scope.tenantId) {
    throw forbidden('You can only read your own record.')
  }
  // Staff reading on behalf of a tenant need the same rights as the tenant
  // screens, and a landlord only reaches tenants on their own properties.
  if (!scope.tenantId) {
    if (!can({ role: scope.role, permissions: scope.permissions }, 'tenants.view')) {
      throw forbidden('Your role cannot read tenant records.')
    }
    if (!(await landlordHasTenant(scope, tenantId))) {
      throw forbidden('That tenant is not on your properties.')
    }
  }

  const record = await rentalRecordFor(scope, tenantId)
  const history = scope.tenantId ? await portalTenancyHistory(scope) : []

  return ok({
    band: record.band,
    bandLabel: record.bandLabel,
    score: record.score,
    hasEnoughHistory: record.hasEnoughHistory,
    summary: {
      monthsAssessed: record.invoicesAssessed,
      monthsSettled: record.invoicesSettled,
      onTimeRate: record.onTimeRate,
      averageDaysLate: record.averageDaysLate,
      longestOnTimeStreak: record.longestOnTimeStreak,
      arrears: record.currentArrearsCents / 100,
      arrearsInMonths: record.arrearsInMonths,
      monthsOnRecord: record.monthsOnRecord,
    },
    factors: record.factors,
    months: record.history.map((month) => ({
      periodLabel: month.periodLabel,
      dueDate: month.dueDate,
      amount: month.totalCents / 100,
      balance: month.balanceCents / 100,
      clearedAt: month.clearedAt,
      daysLate: month.daysLate,
      outcome: month.outcome,
    })),
    tenancies: history.map((entry) => ({
      leaseCode: entry.leaseCode,
      status: entry.status,
      property: entry.propertyName,
      unit: entry.unitNumber,
      startDate: entry.startDate,
      endDate: entry.endDate,
      months: entry.months,
      monthlyRent: entry.monthlyRentCents / 100,
    })),
    disclaimer:
      'Not a credit bureau score. Calculated within this property management system from rent invoices and payments only, and not shared with any credit reference bureau.',
    currency: 'KES',
  })
})
