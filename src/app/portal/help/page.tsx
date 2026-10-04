import Link from 'next/link'
import { Mail, Phone, Wrench } from 'lucide-react'
import { requireSession } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { Card, DetailList, PageHeader } from '@/components/ui'
import { portalTenancy } from '@/server/queries/portal'

export const metadata = { title: 'Help & support' }
export const dynamic = 'force-dynamic'

export default async function PortalHelpPage() {
  const session = await requireSession()
  const tenancy = await portalTenancy(scopeFromSession(session))

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help & support"
        description="How to get a problem looked at, and who to ask when the portal cannot answer it."
      />

      <Card title="Something is broken in your home">
        <p className="text-sm leading-relaxed text-muted">
          Raise it as a maintenance request rather than by message. A request is logged against your
          unit, given a number, and you can see who it has been assigned to and what has been done —
          none of which happens if it is only mentioned in passing.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/portal/maintenance/report" className="btn-primary">
            <Wrench className="h-4 w-4" aria-hidden />
            Report an issue
          </Link>
          <Link href="/portal/maintenance" className="btn-secondary">
            My requests
          </Link>
        </div>
      </Card>

      <Card title="A payment has not appeared">
        <p className="text-sm leading-relaxed text-muted">
          M-Pesa payments are matched to your tenancy by the account number on the transaction. If a
          payment was made with the wrong account number it may take a little longer, because
          somebody has to match it by hand. Keep the M-Pesa confirmation message — the code in it is
          what lets your property manager find the payment.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Your account number is shown on the home page beside the amount due, and on every invoice.
        </p>
      </Card>

      <Card title="Who to contact">
        <DetailList
          columns={2}
          items={[
            { label: 'Managed by', value: tenancy?.organizationName ?? '—' },
            { label: 'Your reference', value: tenancy?.code ?? '—' },
            {
              label: 'Your phone on file',
              value: (
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-faint" aria-hidden />
                  {tenancy?.phone ?? '—'}
                </span>
              ),
            },
            {
              label: 'Your email on file',
              value: (
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-faint" aria-hidden />
                  {tenancy?.email ?? 'None recorded'}
                </span>
              ),
            },
          ]}
        />
        <p className="mt-4 text-xs leading-relaxed text-faint">
          If the phone number or email above is wrong, tell your property manager — those are the
          details rent reminders and receipts are sent to.
        </p>
      </Card>
    </div>
  )
}
