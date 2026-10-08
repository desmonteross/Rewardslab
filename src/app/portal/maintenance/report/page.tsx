import Link from 'next/link'
import { requireTenantSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { Card, Notice, PageHeader } from '@/components/ui'
import { ActionForm } from '@/components/action-form'
import { portalTenancy } from '@/server/queries/portal'
import { PORTAL_CATEGORIES, PORTAL_URGENCY } from '@/server/services/portal'
import { reportIssueAction } from '../actions'

export const metadata = { title: 'Report an issue' }

export default async function ReportIssuePage() {
  const session = await requireTenantSession()
  const tenancy = await portalTenancy(scopeFromSession(session))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Report an issue"
        description="This goes straight to your property manager's repair board."
        breadcrumb={[{ label: 'Repairs', href: '/portal/maintenance' }, { label: 'Report an issue' }]}
      />

      {!tenancy?.lease || tenancy.lease.status !== 'ACTIVE' ? (
        <Notice tone="warning" title="No active tenancy">
          Your account is not linked to an active tenancy, so an issue cannot be raised here. Please
          contact your property manager directly.
        </Notice>
      ) : (
        <>
          <Notice tone="neutral">
            Reporting for <span className="font-medium text-ink">{tenancy.lease.propertyName}</span>, unit{' '}
            <span className="font-medium text-ink">{tenancy.lease.unitNumber}</span>.
          </Notice>

          <Card>
            <ActionForm action={reportIssueAction} label="Report it" pendingLabel="Sending…">
              <div className="space-y-4">
                <div>
                  <label htmlFor="title" className="label">
                    What is wrong?
                  </label>
                  <input
                    id="title"
                    name="title"
                    required
                    maxLength={120}
                    placeholder="Kitchen tap is leaking"
                    className="field mt-1.5"
                  />
                </div>

                <div>
                  <label htmlFor="category" className="label">
                    What sort of issue is it?
                  </label>
                  <select id="category" name="category" defaultValue="PLUMBING" className="field mt-1.5">
                    {PORTAL_CATEGORIES.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                <fieldset>
                  <legend className="label">How urgent is it?</legend>
                  <div className="mt-2 space-y-2">
                    {PORTAL_URGENCY.map((level) => (
                      <label
                        key={level.value}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-raised px-3 py-2.5 transition-colors hover:border-brand/40"
                      >
                        <input
                          type="radio"
                          name="priority"
                          value={level.value}
                          defaultChecked={level.value === 'MEDIUM'}
                          className="mt-0.5 h-4 w-4 accent-[rgb(var(--brand))]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-ink">{level.label}</span>
                          <span className="block text-xs text-faint">{level.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <div>
                  <label htmlFor="description" className="label">
                    Tell us more
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    required
                    rows={5}
                    maxLength={4000}
                    placeholder="When it started, what you have tried, and the best time to visit."
                    className="field mt-1.5 resize-y"
                  />
                  <p className="mt-1.5 text-xs text-faint">
                    The more detail you give, the less likely someone has to visit twice.
                  </p>
                </div>
              </div>
            </ActionForm>
          </Card>

          <p className="text-xs text-faint">
            For a genuine emergency — a burst pipe, a gas leak, no water or power at all — call your
            property manager as well as reporting it here.{' '}
            <Link href="/portal/maintenance" className="link">
              Back to repairs
            </Link>
            .
          </p>
        </>
      )}
    </div>
  )
}
