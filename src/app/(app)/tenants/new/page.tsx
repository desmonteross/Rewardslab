import { requirePermission } from '@/lib/session'
import { ActionForm } from '@/components/action-form'
import { Card, PageHeader } from '@/components/ui'
import { createTenantAction } from '../../onboarding-actions'

export const metadata = { title: 'Add tenant' }

export default async function NewTenantPage() {
  await requirePermission('tenants.create')

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Tenants', href: '/tenants' }, { label: 'New' }]}
        title="Add a tenant"
        description="Once saved you go straight on to the lease, which reserves the unit and schedules the move-in."
      />

      <Card>
        <ActionForm action={createTenantAction} label="Save and create lease" pendingLabel="Saving…">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Full name
              <input name="fullName" className="field mt-1" required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Phone
              <input name="phone" type="tel" className="field mt-1" placeholder="0712 345 678" required />
              <span className="mt-1 block text-2xs text-faint">M-Pesa payments from this number match automatically.</span>
            </label>
            <label className="block text-xs font-medium text-muted">
              Email
              <input name="email" type="email" className="field mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted">
              National ID
              <input name="nationalId" className="field mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted">
              KRA PIN
              <input name="kraPin" className="field mt-1" />
            </label>
            <span className="hidden sm:block" />
            <label className="block text-xs font-medium text-muted">
              Emergency contact
              <input name="emergencyName" className="field mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Emergency phone
              <input name="emergencyPhone" type="tel" className="field mt-1" />
            </label>
          </div>
        </ActionForm>
      </Card>
    </>
  )
}
