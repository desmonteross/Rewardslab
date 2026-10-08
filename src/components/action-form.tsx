'use client'

// ===========================================================================
//  A small wrapper around a server action that shows the result inline.
//  Every mutating control in the app uses this, so success and failure look
//  the same everywhere and nothing is ever silently swallowed.
// ===========================================================================

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import clsx from 'clsx'
import { AlertCircle, CheckCircle2 } from 'lucide-react'

export interface ActionState {
  ok: boolean
  message: string
}

const INITIAL: ActionState = { ok: false, message: '' }

function Submit({
  label,
  pendingLabel,
  variant = 'primary',
  confirm,
  className,
}: {
  label: string
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'danger'
  confirm?: string
  className?: string
}) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault()
      }}
      className={clsx(
        variant === 'primary' && 'btn-primary',
        variant === 'secondary' && 'btn-secondary',
        variant === 'danger' && 'btn border border-negative/40 bg-negative/5 text-negative hover:bg-negative/10',
        className,
      )}
    >
      {pending ? (pendingLabel ?? 'Working…') : label}
    </button>
  )
}

export function ActionForm({
  action,
  label,
  pendingLabel,
  variant,
  confirm,
  children,
  className,
  buttonClassName,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>
  label: string
  pendingLabel?: string
  variant?: 'primary' | 'secondary' | 'danger'
  confirm?: string
  children?: React.ReactNode
  className?: string
  buttonClassName?: string
}) {
  const [state, formAction] = useActionState(action, INITIAL)

  return (
    <form action={formAction} className={clsx('space-y-3', className)}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <Submit
          label={label}
          pendingLabel={pendingLabel}
          variant={variant}
          confirm={confirm}
          className={buttonClassName}
        />
        {state.message && (
          <p
            role="status"
            className={clsx(
              'flex items-start gap-1.5 whitespace-pre-line text-xs leading-relaxed',
              state.ok ? 'text-positive' : 'text-negative',
            )}
          >
            {state.ok ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            )}
            {state.message}
          </p>
        )}
      </div>
    </form>
  )
}
