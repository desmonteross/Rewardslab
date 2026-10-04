// ===========================================================================
//  Where each role lands
//
//  This exists because of a real bug: the root sent every signed-in session
//  to /dashboard, a tenant has no `dashboard.view`, so they were redirected
//  to /forbidden — whose only way out was the dashboard. A loop with no exit
//  that locked tenants out of their own portal.
//
//  The rule is simple enough to state as a test: every role's landing screen
//  must be one that role can actually open.
// ===========================================================================

import { describe, expect, it } from 'vitest'
import { homePathFor } from '@/lib/home-path'
import { DEFAULT_ROLE_PERMISSIONS, ROLE_LABELS, type AppRole } from '@/lib/rbac'

/** The permission each landing screen requires to render. */
const REQUIRED: Record<string, string> = {
  '/dashboard': 'dashboard.view',
  '/portal': 'portal.view',
  '/admin': 'platform.admin',
}

const ROLES = Object.keys(ROLE_LABELS) as AppRole[]

describe('every role lands somewhere it can actually open', () => {
  it.each(ROLES)('%s', (role) => {
    const path = homePathFor(role)
    const needed = REQUIRED[path]
    expect(needed, `no permission recorded for ${path}`).toBeDefined()
    expect(
      DEFAULT_ROLE_PERMISSIONS[role].includes(needed as never),
      `${role} lands on ${path} but lacks ${needed}`,
    ).toBe(true)
  })
})

describe('the specific cases', () => {
  it('sends a tenant to their portal, never the dashboard', () => {
    expect(homePathFor('TENANT')).toBe('/portal')
  })

  it('sends the platform operator to the admin area', () => {
    expect(homePathFor('SUPER_ADMIN')).toBe('/admin')
  })

  it('sends office roles to the dashboard', () => {
    for (const role of ['ORG_ADMIN', 'PROPERTY_MANAGER', 'ACCOUNTANT', 'AUDITOR'] as AppRole[]) {
      expect(homePathFor(role)).toBe('/dashboard')
    }
  })

  it('sends a signed-out visitor nowhere — the caller handles that', () => {
    // A null role must not throw; the root redirects to /login before asking.
    expect(homePathFor(null)).toBe('/dashboard')
    expect(homePathFor(undefined)).toBe('/dashboard')
  })
})
