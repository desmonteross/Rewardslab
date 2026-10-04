import Link from 'next/link'
import { asc, eq } from 'drizzle-orm'
import { db } from '@/db'
import { organizations } from '@/db/schema'
import { Card } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { selfRegisterAction } from '../actions'

export const metadata = { title: 'Register' }

export default async function TenantRegisterPage() {
  // Only organizations that allow self-registration are offered.
  const open = await db
    .select({ slug: organizations.slug, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.portalSelfSignup, true))
    .orderBy(asc(organizations.name))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Register</h1>
        <p className="mt-1.5 text-sm text-muted">
          Use the tenant reference on your lease or receipt, and the phone number your property manager
          has on file for you.
        </p>
      </div>

      <Card>
        <ActionForm action={selfRegisterAction} label="Create my account" pendingLabel="Checking…">
          <div className="space-y-4">
            <div>
              <label htmlFor="organization" className="label">
                Who manages your property?
              </label>
              <select id="organization" name="organization" required className="field mt-1.5">
                <option value="">Select…</option>
                {open.map((organization) => (
                  <option key={organization.slug} value={organization.slug}>
                    {organization.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="tenantCode" className="label">
                Tenant reference
              </label>
              <input
                id="tenantCode"
                name="tenantCode"
                required
                placeholder="TEN-0042"
                className="field mt-1.5 uppercase"
              />
              <p className="mt-1.5 text-xs text-faint">Printed on your lease and on every receipt.</p>
            </div>

            <div>
              <label htmlFor="phone" className="label">
                Phone number on file
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                required
                placeholder="0712 345 678"
                className="field mt-1.5"
              />
            </div>

            <div>
              <label htmlFor="email" className="label">
                Your email address
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                required
                className="field mt-1.5"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="password" className="label">
                  Password
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="field mt-1.5"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="label">
                  Confirm
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  className="field mt-1.5"
                />
              </div>
            </div>
            <p className="text-xs text-faint">
              At least 8 characters, including a letter and a number.
            </p>
          </div>
        </ActionForm>
      </Card>

      <p className="text-xs leading-relaxed text-faint">
        If your details do not match, ask your property manager to send you an invitation instead — that
        link sets up your account without needing any of this.{' '}
        <Link href="/login" className="link">
          Already have an account?
        </Link>
      </p>
    </div>
  )
}
