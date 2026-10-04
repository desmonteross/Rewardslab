'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { AlertCircle, ArrowRight } from 'lucide-react'
import { loginAction, type LoginState } from './actions'

const DEMO_ACCOUNTS = [
  { email: 'admin@prime.co.ke', role: 'Company Admin' },
  { email: 'manager@prime.co.ke', role: 'Property Manager' },
  { email: 'accounts@prime.co.ke', role: 'Accountant' },
  { email: 'landlord@wanjikuholdings.co.ke', role: 'Landlord portal' },
  { email: 'tenant@example.co.ke', role: 'Tenant portal' },
  { email: 'auditor@prime.co.ke', role: 'Read-only auditor' },
  { email: 'superadmin@pms.co.ke', role: 'Platform super admin' },
]

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" className="btn-primary w-full" disabled={pending}>
      {pending ? 'Signing in…' : 'Sign in'}
      {!pending && <ArrowRight className="h-4 w-4" />}
    </button>
  )
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, { error: null })

  return (
    <div className="w-full max-w-sm">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="email" className="block text-sm font-medium text-ink">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            defaultValue="admin@prime.co.ke"
            className="field"
            placeholder="you@company.co.ke"
          />
        </div>

        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-sm font-medium text-ink">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            defaultValue="Password123"
            className="field"
            placeholder="••••••••"
          />
        </div>

        {state.error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-negative/30 bg-negative/5 px-3 py-2 text-sm text-negative"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {state.error}
          </p>
        )}

        <SubmitButton />
      </form>

      <div className="mt-8 rounded-xl border border-line bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-faint">Demo accounts</p>
        <p className="mt-1 text-xs text-muted">
          Every account uses the password <span className="font-mono text-ink">Password123</span>.
        </p>
        <ul className="mt-3 space-y-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email} className="flex items-center justify-between gap-3 text-xs">
              <button
                type="button"
                className="truncate font-mono text-brand hover:underline"
                onClick={() => {
                  const field = document.getElementById('email') as HTMLInputElement | null
                  if (field) field.value = account.email
                }}
              >
                {account.email}
              </button>
              <span className="shrink-0 text-faint">{account.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
