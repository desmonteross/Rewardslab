import { asc, eq } from 'drizzle-orm'
import * as Icons from 'lucide-react'
import { db } from '@/db'
import { integrations } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { fmtDateTime } from '@/lib/dates'
import { Card, EmptyState, Notice, PageHeader, StatusBadge } from '@/components/ui'
import { providerSummary } from '@/server/adapters'

export const metadata = { title: 'Integrations' }
export const dynamic = 'force-dynamic'

const ICONS: Record<string, keyof typeof Icons> = {
  mpesa: 'Smartphone',
  erits: 'Landmark',
  sms: 'MessageSquare',
  email: 'Mail',
  banking: 'Building2',
  etims: 'ReceiptText',
  'credit-reference': 'Gauge',
  lenders: 'HandCoins',
}

export default async function IntegrationsPage() {
  const session = await requirePermission('integrations.view')
  const scope = scopeFromSession(session)

  const rows = await db
    .select()
    .from(integrations)
    .where(scoped(integrations, scope))
    .orderBy(asc(integrations.category), asc(integrations.name))

  const providers = providerSummary()
  const grouped = new Map<string, typeof rows>()
  for (const row of rows) {
    const bucket = grouped.get(row.category)
    if (bucket) bucket.push(row)
    else grouped.set(row.category, [row])
  }

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Every external service sits behind an adapter, so the core system never depends on one vendor."
      />

      <div className="mb-4">
        <Notice tone="brand" title="What is actually wired up right now">
          Payments: <strong>{providers.payments.name}</strong> ({providers.payments.mode}). Tax:{' '}
          <strong>{providers.tax.name}</strong> ({providers.tax.mode}). Notifications:{' '}
          <strong>{providers.notifications.name}</strong>. Switching to a live provider is a configuration change
          plus an implementation of that adapter — no change to billing, reconciliation or compliance.
        </Notice>
      </div>

      {grouped.size === 0 && (
        <Card>
          <EmptyState title="No integrations configured" />
        </Card>
      )}

      <div className="space-y-6">
        {Array.from(grouped.entries()).map(([category, items]) => (
          <section key={category}>
            <h2 className="mb-3 text-sm font-semibold text-ink">{category}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((integration) => {
                const iconName = ICONS[integration.key] ?? 'Plug'
                const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[iconName] ?? Icons.Plug
                const config = (integration.config ?? {}) as Record<string, unknown>
                return (
                  <div key={integration.id} className="card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                        <Icon className="h-4.5 w-4.5" aria-hidden />
                      </span>
                      <StatusBadge status={integration.status} />
                    </div>
                    <p className="mt-3 text-sm font-semibold text-ink">{integration.name}</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{integration.description}</p>

                    <dl className="mt-3 space-y-1 border-t border-line pt-3 text-2xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">Provider</dt>
                        <dd className="font-mono text-muted">{integration.provider}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">Phase</dt>
                        <dd className="text-muted">{integration.phase}</dd>
                      </div>
                      {typeof config.shortCode === 'string' && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-faint">Short code</dt>
                          <dd className="font-mono text-muted">{config.shortCode}</dd>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <dt className="text-faint">Enabled</dt>
                        <dd className="text-muted">{integration.isEnabled ? 'Yes' : 'No'}</dd>
                      </div>
                      {integration.lastCheckedAt && (
                        <div className="flex justify-between gap-2">
                          <dt className="text-faint">Last checked</dt>
                          <dd className="text-muted">{fmtDateTime(integration.lastCheckedAt)}</dd>
                        </div>
                      )}
                    </dl>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-6">
        <Card title="Adapter architecture" description="The interfaces the core system depends on.">
          <ul className="space-y-3 text-sm">
            <li>
              <p className="font-medium text-ink">PaymentProvider</p>
              <p className="text-xs leading-relaxed text-muted">
                requestCollection · parseWebhook · verify. Implemented by the M-Pesa mock today; the live Daraja
                adapter is scaffolded and fails fast until credentials are configured.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">PayoutProvider</p>
              <p className="text-xs leading-relaxed text-muted">
                disburse. Used by the settlement engine to pay landlords, and to surface a failed payout rather
                than silently marking a batch settled.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">TaxProvider</p>
              <p className="text-xs leading-relaxed text-muted">
                registerProperty · submitReturn · checkStatus. The eRITS mock never contacts KRA and stamps every
                result SIMULATED. Production must use officially authorised KRA channels only.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">NotificationProvider</p>
              <p className="text-xs leading-relaxed text-muted">
                send. Rent reminders, receipts and maintenance updates. Console provider in Phase 1.
              </p>
            </li>
            <li>
              <p className="font-medium text-ink">BankingProvider</p>
              <p className="text-xs leading-relaxed text-muted">
                fetchStatement. Reserved for Phase 2 — bank transfers will normalise into the same inbound
                transaction shape M-Pesa uses, so reconciliation needs no change.
              </p>
            </li>
          </ul>
        </Card>
      </div>
    </>
  )
}
