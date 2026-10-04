import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { getSession } from '@/lib/session'
import { homePathFor } from '@/lib/home-path'

export const metadata = { title: 'Not permitted' }

/**
 * The way out has to be a screen this session can actually open. Sending a
 * tenant "back to the dashboard" bounces them straight into this page again.
 */
export default async function ForbiddenPage() {
  const session = await getSession()
  const home = homePathFor(session?.role)
  const label = home === '/portal' ? 'Back to your portal' : 'Back to the dashboard'

  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-warning/10 text-warning">
          <ShieldAlert className="h-6 w-6" />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-ink">You don’t have access to that</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Your role doesn’t include this permission. If you need it, ask an administrator in your
          organization to adjust your role under Administration → Users.
        </p>
        <div className="mt-6 flex items-center justify-center gap-2">
          <Link href={home} className="btn-secondary">
            {label}
          </Link>
          <Link href="/login" className="btn-ghost">
            Sign in as someone else
          </Link>
        </div>
      </div>
    </main>
  )
}
