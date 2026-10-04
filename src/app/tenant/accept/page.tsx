import Link from 'next/link'
import { Card, Notice } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { inviteSubjectFor } from '@/server/services/portal-accounts'
import { acceptInviteAction } from '../actions'

export const metadata = { title: 'Set up your account' }

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const subject = token ? await inviteSubjectFor(token) : null

  if (!subject) {
    return (
      <Notice tone="warning" title="This link is no longer valid">
        Invitations expire after a few days, and each one can only be used once. Ask your property
        manager to send a new invitation, or{' '}
        <Link href="/tenant/register" className="link">
          register with your tenant code
        </Link>
        .
      </Notice>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Set up your account</h1>
        <p className="mt-1.5 text-sm text-muted">
          {subject.organizationName} has invited you to the tenant portal as{' '}
          <span className="font-medium text-ink">{subject.tenantName}</span> ({subject.tenantCode}).
        </p>
      </div>

      <Card>
        <ActionForm action={acceptInviteAction} label="Create my account" pendingLabel="Setting up…">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={subject.email} />

          <div className="space-y-4">
            <div>
              <label className="label">Email address</label>
              <p className="mt-1.5 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted">
                {subject.email}
              </p>
            </div>

            <div>
              <label htmlFor="password" className="label">
                Choose a password
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
              <p className="mt-1.5 text-xs text-faint">
                At least 8 characters, including a letter and a number.
              </p>
            </div>

            <div>
              <label htmlFor="confirm" className="label">
                Confirm password
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
