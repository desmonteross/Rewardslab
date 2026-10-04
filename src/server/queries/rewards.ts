// ===========================================================================
//  Reward points — portal reads
//
//  Every function here goes through `requireOwnTenant`, which refuses any
//  session that is not a tenant portal session at all. A balance spans every
//  organization the tenant has rented from, so this is the one read in the
//  system that deliberately crosses that boundary — it gets the narrowest
//  possible door.
// ===========================================================================

import { db } from '@/db'
import type { Scope } from '@/lib/tenancy'
import {
  requireOwnTenant,
  rewardBalanceForTenant,
  rewardEarningsForTenant,
  rewardStatementForTenant,
  type RewardBalance,
  type RewardEarning,
  type RewardStatementRow,
} from '@/server/services/rewards'

export interface PortalRewards {
  balance: RewardBalance
  recent: RewardStatementRow[]
  /** One row per rent month earned, oldest first — the branches of the points tree. */
  earnings: RewardEarning[]
}

export async function portalRewards(scope: Scope, limit = 20): Promise<PortalRewards> {
  const tenantId = requireOwnTenant(scope)
  const [balance, recent, earnings] = await Promise.all([
    rewardBalanceForTenant(db, tenantId),
    rewardStatementForTenant(db, tenantId, limit),
    rewardEarningsForTenant(db, tenantId),
  ])
  return { balance, recent, earnings }
}

/** Just the numbers, for the home screen card. */
export async function portalRewardBalance(scope: Scope): Promise<RewardBalance> {
  return rewardBalanceForTenant(db, requireOwnTenant(scope))
}
