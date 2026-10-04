'use client'

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="grid place-items-center px-6 py-20">
      <div className="max-w-md text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-negative/10 text-negative">
          <AlertTriangle className="h-6 w-6" aria-hidden />
        </span>
        <h1 className="mt-5 text-xl font-semibold text-ink">Something went wrong on this screen</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {error.message || 'The page could not be loaded.'}
        </p>
        {error.digest && <p className="mt-2 font-mono text-2xs text-faint">Reference {error.digest}</p>}
        <div className="mt-6 flex justify-center gap-2">
          <button type="button" onClick={reset} className="btn-secondary">
            Try again
          </button>
          <Link href="/dashboard" className="btn-primary">
            Back to the dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
