import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { homePathFor } from '@/lib/home-path'
import { LandingPage } from '@/components/landing/landing-page'
import { publicListings } from '@/server/services/listings'

export const metadata = {
  title: { absolute: 'RentRewards · Rent collected. Tenants rewarded.' },
  description:
    'Property management for Kenya: M-Pesa rent collection, accounting, landlord payouts and repairs, with points and a Rental Passport for tenants who pay on time.',
}

export const dynamic = 'force-dynamic'

/**
 * Signed-in sessions go straight to the screen their role can open (a tenant
 * to the portal, staff to the dashboard). Everyone else sees the landing page.
 */
export default async function Home() {
  const session = await getSession()
  if (session) redirect(homePathFor(session.role))
  return <LandingPage listings={await publicListings(6)} />
}
