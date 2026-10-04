'use client'

// ===========================================================================
//  Pay rent from the portal
//
//  The tenant picks an invoice, confirms the amount, and the provider prompts
//  them on their handset. The result is asynchronous, so this component polls
//  rather than pretending the payment completed when the request was sent.
//
//  A part payment earns no points — points are awarded per invoice on full
//  settlement — and the screen says so BEFORE the tenant pays, not after.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, Smartphone, Sparkles, XCircle } from 'lucide-react'
import { formatKES } from '@/lib/money'

export interface PayableInvoice {
  id: string
  number: string
  periodLabel: string
  dueDate: string
  balanceCents: number
}

interface CheckoutStatus {
  requestId: string
  status: 'PENDING' | 'CONFIRMED' | 'FAILED' | 'EXPIRED'
  isSimulated: boolean
  amountCents: number
  message: string
  mpesaReceipt: string | null
  paymentReference: string | null
  pointsAwarded: number | null
  invoicesSettled: number
  outstandingAfterCents: number
}

type Phase = 'idle' | 'sending' | 'waiting' | 'settled'

const POLL_MS = 1_500
const GIVE_UP_MS = 90_000

export function PayForm({ invoices }: { invoices: PayableInvoice[] }) {
  const [selectedId, setSelectedId] = useState(invoices[0]?.id ?? '')
  const selected = invoices.find((invoice) => invoice.id === selectedId) ?? invoices[0]

  const [amount, setAmount] = useState(() => kesString(invoices[0]?.balanceCents ?? 0))
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<CheckoutStatus | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  const choose = (invoiceId: string) => {
    const invoice = invoices.find((row) => row.id === invoiceId)
    setSelectedId(invoiceId)
    setAmount(kesString(invoice?.balanceCents ?? 0))
    setError(null)
  }

  const amountCents = Math.round((Number.parseFloat(amount.replace(/,/g, '')) || 0) * 100)
  const isPartial = Boolean(selected) && amountCents > 0 && amountCents < selected!.balanceCents
  const tooMuch = Boolean(selected) && amountCents > selected!.balanceCents

  const poll = useCallback(async (requestId: string, startedAt: number) => {
    try {
      const response = await fetch(`/api/v1/me/pay/${requestId}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not read the payment status.')

      const next = body.data as CheckoutStatus
      setStatus(next)

      if (next.status === 'PENDING') {
        if (Date.now() - startedAt > GIVE_UP_MS) {
          setError('No response yet. Check your M-Pesa messages before trying again.')
          setPhase('settled')
          return
        }
        timer.current = setTimeout(() => void poll(requestId, startedAt), POLL_MS)
        return
      }
      setPhase('settled')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not read the payment status.')
      setPhase('settled')
    }
  }, [])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selected || amountCents <= 0 || tooMuch) return

    setPhase('sending')
    setError(null)
    setStatus(null)

    try {
      const response = await fetch('/api/v1/me/pay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ invoiceId: selected.id, amount: amountCents / 100 }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error?.message ?? 'The payment request could not be sent.')

      setPhase('waiting')
      void poll(body.data.requestId as string, Date.now())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The payment request could not be sent.')
      setPhase('idle')
    }
  }

  if (invoices.length === 0) {
    return (
      <div className="rounded-xl border border-positive/30 bg-positive/5 p-5 text-sm text-muted">
        Nothing to pay right now. Your next invoice will appear here when it is issued.
      </div>
    )
  }

  // ---- The outcome --------------------------------------------------------
  if (phase === 'settled' && status) {
    const good = status.status === 'CONFIRMED'
    return (
      <div className="space-y-4">
        <div
          className={
            good
              ? 'rounded-xl border border-positive/30 bg-positive/5 p-5'
              : 'rounded-xl border border-negative/30 bg-negative/5 p-5'
          }
        >
          <div className="flex items-start gap-3">
            {good ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-positive" aria-hidden />
            ) : (
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-negative" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-ink">
                {good
                  ? status.invoicesSettled > 0
                    ? 'Rent paid'
                    : 'Part payment received'
                  : 'Payment not completed'}
              </p>
              <p className="mt-1 text-sm text-muted">{error ?? status.message}</p>

              {good && (
                <dl className="mt-3 space-y-1 text-sm">
                  <Row label="Amount" value={formatKES(status.amountCents / 100)} />
                  {status.mpesaReceipt && <Row label="M-Pesa receipt" value={status.mpesaReceipt} />}
                  {status.paymentReference && <Row label="Reference" value={status.paymentReference} />}
                  {status.invoicesSettled > 0 && (
                    <Row
                      label="Invoices cleared"
                      value={String(status.invoicesSettled)}
                    />
                  )}
                  <Row
                    label="Still outstanding"
                    value={formatKES(status.outstandingAfterCents / 100)}
                  />
                </dl>
              )}
            </div>
          </div>
        </div>

        {good && status.pointsAwarded !== null && status.pointsAwarded > 0 && (
          <div className="rounded-xl border border-brand/30 bg-brand/5 p-5">
            <div className="flex items-start gap-3">
              <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand" aria-hidden />
              <div>
                <p className="text-base font-semibold text-ink">
                  {status.pointsAwarded.toLocaleString()} points earned
                </p>
                <p className="mt-1 text-sm text-muted">
                  They will be available to redeem in 30 days. Until then they show as pending on
                  your points balance.
                </p>
              </div>
            </div>
          </div>
        )}

        {good && status.pointsAwarded === 0 && status.invoicesSettled === 0 && (
          <div className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
            No points this time — points are earned per invoice once it is settled in full. Clearing
            the remaining balance will earn them.
          </div>
        )}

        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setPhase('idle')
            setStatus(null)
            setError(null)
          }}
        >
          Done
        </button>
      </div>
    )
  }

  // ---- Waiting for the handset -------------------------------------------
  if (phase === 'waiting' || phase === 'sending') {
    return (
      <div className="rounded-xl border border-brand/30 bg-brand/5 p-6 text-center">
        <Loader2 className="mx-auto h-7 w-7 animate-spin text-brand" aria-hidden />
        <p className="mt-3 text-base font-semibold text-ink">Check your phone</p>
        <p className="mt-1 text-sm text-muted">
          {phase === 'sending'
            ? 'Sending the request…'
            : 'Enter your M-Pesa PIN on the prompt to complete the payment.'}
        </p>
        {status?.isSimulated && (
          <p className="mt-3 text-xs font-medium uppercase tracking-wide text-faint">
            Simulated payment — no request reaches Safaricom
          </p>
        )}
      </div>
    )
  }

  // ---- The form -----------------------------------------------------------
  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="invoice" className="label mb-1.5 block">
          Invoice
        </label>
        <select
          id="invoice"
          className="field"
          value={selectedId}
          onChange={(event) => choose(event.target.value)}
        >
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.periodLabel} · {invoice.number} · {formatKES(invoice.balanceCents / 100)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="amount" className="label mb-1.5 block">
          Amount (KES)
        </label>
        <input
          id="amount"
          className="field"
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        {selected && (
          <p className="mt-1.5 text-xs text-faint">
            Outstanding on this invoice: {formatKES(selected.balanceCents / 100)}
          </p>
        )}
      </div>

      {tooMuch && (
        <p className="text-sm text-negative">
          That is more than this invoice is for. Pay at most{' '}
          {formatKES((selected?.balanceCents ?? 0) / 100)}.
        </p>
      )}

      {isPartial && !tooMuch && (
        <div className="rounded-lg border border-line bg-surface p-3 text-sm text-muted">
          This is a part payment, so it earns no points. Points are awarded per invoice once it is
          settled in full.
        </div>
      )}

      {invoices.length > 1 && (
        <p className="text-xs leading-relaxed text-faint">
          Payments clear your oldest unpaid invoice first, so this may settle an earlier month
          before the one selected above.
        </p>
      )}

      {error && <p className="text-sm text-negative">{error}</p>}

      <button type="submit" className="btn-primary w-full sm:w-auto" disabled={amountCents <= 0 || tooMuch}>
        <Smartphone className="h-4 w-4" aria-hidden />
        Pay {amountCents > 0 ? formatKES(amountCents / 100) : ''} with M-Pesa
      </button>
    </form>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium text-ink">{value}</dd>
    </div>
  )
}

function kesString(valueInCents: number): string {
  return (valueInCents / 100).toFixed(2)
}
