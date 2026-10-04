'use client'

// ===========================================================================
//  Charge lines on the raise-charges form
//
//  Each line's amount is the TOTAL for the run, not the amount per tenant.
//  That distinction is the whole point of the screen, so the running split is
//  shown live rather than left for the manager to work out.
// ===========================================================================

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { formatKES } from '@/lib/money'

const CHARGE_TYPES = [
  { value: 'SERVICE_CHARGE', label: 'Service charge' },
  { value: 'WATER', label: 'Water' },
  { value: 'ELECTRICITY', label: 'Electricity' },
  { value: 'UTILITY', label: 'Utility' },
  { value: 'PARKING', label: 'Parking' },
  { value: 'OTHER', label: 'Other' },
]

interface Line {
  key: number
  type: string
  description: string
  total: string
}

let nextKey = 1

export function ChargeLines({ tenantCount }: { tenantCount: number }) {
  const [lines, setLines] = useState<Line[]>([
    { key: 0, type: 'WATER', description: '', total: '' },
  ])

  const update = (key: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const grandTotal = lines.reduce(
    (total, line) => total + (Number.parseFloat(line.total.replace(/,/g, '')) || 0),
    0,
  )

  return (
    <div className="space-y-3">
      {lines.map((line) => {
        const total = Number.parseFloat(line.total.replace(/,/g, '')) || 0
        const each = tenantCount > 0 ? total / tenantCount : 0
        return (
          <div key={line.key} className="rounded-lg border border-line bg-raised p-3">
            <div className="grid gap-2 sm:grid-cols-[9rem_1fr_9rem_auto] sm:items-end">
              <div>
                <label className="label mb-1 block">Type</label>
                <select
                  name="chargeType"
                  className="field"
                  value={line.type}
                  onChange={(event) => update(line.key, { type: event.target.value })}
                >
                  {CHARGE_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="label mb-1 block">Description</label>
                <input
                  name="chargeDescription"
                  className="field"
                  placeholder="Borehole repair, October"
                  value={line.description}
                  onChange={(event) => update(line.key, { description: event.target.value })}
                />
              </div>

              <div>
                <label className="label mb-1 block">Total (KES)</label>
                <input
                  name="chargeTotal"
                  className="field"
                  inputMode="decimal"
                  placeholder="24000"
                  value={line.total}
                  onChange={(event) => update(line.key, { total: event.target.value })}
                />
              </div>

              <button
                type="button"
                className="btn-ghost h-9 px-2"
                aria-label="Remove this line"
                onClick={() => setLines((rows) => rows.filter((row) => row.key !== line.key))}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {total > 0 && (
              <p className="mt-2 text-xs text-faint">
                {tenantCount > 0
                  ? `${formatKES(each)} each across ${tenantCount} tenant${tenantCount === 1 ? '' : 's'}`
                  : 'No tenants selected yet'}
              </p>
            )}
          </div>
        )
      })}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            setLines((rows) => [...rows, { key: nextKey++, type: 'OTHER', description: '', total: '' }])
          }
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add a charge
        </button>

        {grandTotal > 0 && (
          <p className="text-sm text-muted">
            {formatKES(grandTotal)} of charges, on top of each tenant&rsquo;s rent
          </p>
        )}
      </div>
    </div>
  )
}
