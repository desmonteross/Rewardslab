import { requirePermission } from '@/lib/session'
import { landlordTypeEnum, payoutMethodEnum } from '@/db/schema'
import { ActionForm } from '@/components/action-form'
import { Card, PageHeader, humanise } from '@/components/ui'
import { createLandlordAction } from '../../onboarding-actions'

export const metadata = { title: 'Add landlord' }

export default async function NewLandlordPage() {
  await requirePermission('landlords.create')

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Landlords', href: '/landlords' }, { label: 'New' }]}
        title="Add a landlord"
        description="The owner settlements are paid to. Add their properties once they are saved."
      />

      <Card>
        <ActionForm action={createLandlordAction} label="Save landlord" pendingLabel="Saving…">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-xs font-medium text-muted">
              Type
              <select name="type" className="field mt-1" defaultValue="INDIVIDUAL">
                {landlordTypeEnum.enumValues.map((value) => (
                  <option key={value} value={value}>
                    {humanise(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted">
              Full name
              <input name="fullName" className="field mt-1" required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Company name
              <input name="companyName" className="field mt-1" placeholder="If a company" />
            </label>
            <label className="block text-xs font-medium text-muted">
              Phone
              <input name="phone" type="tel" className="field mt-1" placeholder="0712 345 678" required />
            </label>
            <label className="block text-xs font-medium text-muted">
              Email
              <input name="email" type="email" className="field mt-1" />
            </label>
            <label className="block text-xs font-medium text-muted">
              KRA PIN
              <input name="kraPin" className="field mt-1" placeholder="A000000000X" />
            </label>
            <label className="block text-xs font-medium text-muted">
              National ID
              <input name="nationalId" className="field mt-1" />
            </label>
          </div>

          <div className="border-t border-line pt-3">
            <p className="label mb-2">Payout</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-muted">
                Method
                <select name="payoutMethod" className="field mt-1" defaultValue="MPESA">
                  {payoutMethodEnum.enumValues.map((value) => (
                    <option key={value} value={value}>
                      {value === 'MPESA' ? 'M-Pesa' : humanise(value)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-medium text-muted">
                M-Pesa number
                <input name="mpesaNumber" type="tel" className="field mt-1" placeholder="For M-Pesa payouts" />
              </label>
              <label className="block text-xs font-medium text-muted">
                Bank name
                <input name="bankName" className="field mt-1" placeholder="For bank payouts" />
              </label>
              <label className="block text-xs font-medium text-muted">
                Account name
                <input name="bankAccountName" className="field mt-1" />
              </label>
              <label className="block text-xs font-medium text-muted">
                Account number
                <input name="bankAccountNumber" className="field mt-1" />
              </label>
            </div>
          </div>
        </ActionForm>
      </Card>
    </>
  )
}
