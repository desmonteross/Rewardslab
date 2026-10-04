// ===========================================================================
//  Where a role belongs
//
//  One function, used by the root redirect, the sign-in action and the
//  "not permitted" screen, so all three agree. When they disagree, a role
//  with no dashboard access can be bounced between two screens forever.
// ===========================================================================

import type { AppRole } from './rbac'

/** The first screen a signed-in session should land on. */
export function homePathFor(role: AppRole | null | undefined): string {
  if (role === 'TENANT') return '/portal'
  if (role === 'SUPER_ADMIN') return '/admin'
  return '/dashboard'
}
