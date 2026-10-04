import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import { homePathFor } from '@/lib/home-path'
import { env } from '@/lib/env'
import { BrandLockup } from '@/components/brand'
import { LoginForm } from './login-form'

export const metadata = { title: 'Sign in' }

export default async function LoginPage() {
  const session = await getSession()
  // A signed-in tenant sent to /dashboard has no permission for it and
  // bounces to /forbidden — so route by role here too.
  if (session) redirect(homePathFor(session.role))

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <BrandLockup size="lg" subtitle="Property management platform" className="mb-8" />

          <h1 className="text-2xl font-semibold tracking-tight text-ink">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted">
            Manage your portfolio, rent collection and compliance in one place.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </div>
      </div>

      {/*
        The photograph belongs to this page alone — the dashboard and portal
        bands keep their own artwork. `bg-panel` sits underneath so the column
        is never briefly white while the file loads.
      */}
      <aside className="relative hidden overflow-hidden bg-panel lg:block">
        <div
          aria-hidden
          className="absolute inset-0 bg-[url('/brand/login-hero.jpg')] bg-cover bg-center"
        />
        {/*
          Two scrims, doing different jobs. The first tints the whole frame
          towards the brand green so the photograph belongs to this product
          rather than sitting in it. The second is a plain vertical darkening
          under the text — a tint alone does not guarantee contrast, and the
          headline has to stay readable over the brightest part of a sunlit
          sky.
        */}
        <div aria-hidden className="absolute inset-0 bg-panel/55 mix-blend-multiply" />
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-panel via-panel/70 to-panel/15"
        />

        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div />
          <div className="max-w-md">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-lime">
              Built for Kenya
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight">
              Rent collected, reconciled, settled and reported — from one ledger.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/75">
              M-Pesa receipts match themselves to tenants, commission and landlord payables fall out
              automatically, and every shilling lands in a double-entry ledger that feeds your KRA eRITS
              reporting.
            </p>

            <dl className="mt-10 grid grid-cols-3 gap-6 border-t border-white/20 pt-6">
              <div>
                <dt className="text-xs uppercase tracking-wide text-white/55">Reconciliation</dt>
                <dd className="mt-1 text-sm font-medium">Automatic</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-white/55">Settlements</dt>
                <dd className="mt-1 text-sm font-medium">Batched</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide text-white/55">Compliance</dt>
                <dd className="mt-1 text-sm font-medium">eRITS-ready</dd>
              </div>
            </dl>
          </div>
          <p className="text-xs text-white/55">
            Demonstration environment. M-Pesa and KRA eRITS run against mock providers — nothing is sent
            to Safaricom or KRA.
          </p>
        </div>
      </aside>
    </main>
  )
}
