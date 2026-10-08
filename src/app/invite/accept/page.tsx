import Link from 'next/link'
import { Card, Notice } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { userInviteSubjectFor } from '@/server/services/user-invites'
import { acceptUserInviteAction } from '@/app/invite-actions'

export const metadata = { title: 'Set up your account' }
export const dynamic = 'force-dynamic'

const WHAT_YOU_SEE = {
  LANDLORD:
    'You will see the properties you own: rent collected, arrears, tenants, expenses, maintenance and your settlements and statements. Nothing about anyone else’s properties.',
  PROPERTY_MANAGER:
    'You will see the properties you are assigned to manage: units, tenants, leases, rent, payments and maintenance. Your administrator assigns properties to you.',
}

export default async function AcceptUserInvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const subject = token ? await userInviteSubjectFor(token) : null

  if (!subject) {
    return (
      <Notice tone="warning" title="This link is no longer valid">
        Invitations expire after 72 hours and each one can only be used once. Ask whoever invited you to send a new one,
        or{' '}
        <Link href="/login" className="link">
          sign in
        </Link>{' '}
        if you already have an account.
      </Notice>
    )
  }

  const portal = subject.role === 'LANDLORD' ? 'landlord portal' : 'property management workspace'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Set up your account</h1>
        <p className="mt-1.5 text-sm text-muted">
          {subject.organizationName} has invited <span className="font-medium text-ink">{subject.fullName}</span> to the{' '}
          {portal}.
        </p>
        <p className="mt-2 text-sm text-muted">{WHAT_YOU_SEE[subject.role]}</p>
      </div>

      <Card>
        <ActionForm action={acceptUserInviteAction} label="Create my account" pendingLabel="Setting up…">
          <input type="hidden" name="token" value={token} />
          <div className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <p className="mt-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">{subject.email}</p>
            </div>
            <div>
              <label htmlFor="password" className="label">
                Choose a password
              </label>
              <input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} className="field mt-1.5" />
              <p className="mt-1.5 text-xs text-faint">At least 8 characters, including a letter and a number.</p>
            </div>
            <div>
              <label htmlFor="confirm" className="label">
                Confirm password
              </label>
              <input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} className="field mt-1.5" />
            </div>
          </div>
        </ActionForm>
      </Card>

      <p className="text-xs text-faint">
        Already set up?{' '}
        <Link href="/login" className="link">
          Sign in
        </Link>
        .
      </p>
    </div>
  )
}
