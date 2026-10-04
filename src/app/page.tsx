import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { homePathFor } from '@/lib/home-path'

/**
 * The root sends each session to the screen its role can actually open.
 *
 * Sending everyone to /dashboard looks harmless until a tenant signs in: they
 * have no `dashboard.view`, so they land on /forbidden, whose only way out is
 * the dashboard — a loop with no exit that locks them out of their own portal.
 */
export default async function Home() {
  const session = await getSession()
  redirect(session ? homePathFor(session.role) : '/login')
}
