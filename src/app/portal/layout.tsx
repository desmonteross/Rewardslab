import { redirect } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { env } from '@/lib/env'
import { scopeFromSession } from '@/lib/tenancy'
import { PortalShell } from '@/components/shell/portal-shell'
import { portalNavCounts, portalTenancy } from '@/server/queries/portal'
import { logoutAction } from '@/app/login/actions'

export const metadata = { title: 'Tenant portal' }

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  // Staff have no tenancy of their own, so the portal has nothing to show
  // them — and a tenant has no business outside it.
  if (session.role !== 'TENANT' || !session.tenantId) redirect('/dashboard')

  const scope = scopeFromSession(session)
  const [tenancy, counts] = await Promise.all([portalTenancy(scope), portalNavCounts(scope)])
  if (!tenancy) redirect('/login')

  const unitLabel = tenancy.lease
    ? `${tenancy.lease.propertyName} · ${tenancy.lease.unitNumber}`
    : null

  return (
    <PortalShell
      platformName={env.platformName}
      organizationName={tenancy.organizationName}
      tenantName={tenancy.fullName}
      unitLabel={unitLabel}
      counts={counts}
      logout={logoutAction}
    >
      {children}
    </PortalShell>
  )
}
