import { Download } from 'lucide-react'
import { ActionForm } from '@/components/action-form'
import { humanise } from '@/components/ui'
import { MAX_UPLOAD_ROWS, UNIT_COLUMNS, UNIT_TYPES } from '@/server/units-import'
import { importUnitsAction } from '@/app/(app)/onboarding-actions'

/**
 * The bulk upload form and the guide to the file it expects. The column list
 * comes from the same definition the parser uses.
 */
export function UnitUpload({ propertyId }: { propertyId: string }) {
  return (
    <div className="space-y-5">
      <ol className="space-y-1.5 text-sm text-muted">
        <li>
          <span className="font-medium text-ink">1.</span> Download the template. It has the right headings and four
          example rows.
        </li>
        <li>
          <span className="font-medium text-ink">2.</span> Open it in Excel or Google Sheets, replace the examples with
          your units (one row per unit), and save it as <span className="font-medium text-ink">CSV</span>.
        </li>
        <li>
          <span className="font-medium text-ink">3.</span> Upload it below. Every row is checked first: if any row has a
          problem, nothing is added and you are told which rows to fix.
        </li>
      </ol>

      <a href="/units/template" className="btn-secondary inline-flex items-center gap-2" download>
        <Download className="h-4 w-4" aria-hidden />
        Download the template (CSV)
      </a>

      <ActionForm action={importUnitsAction} label="Upload units" pendingLabel="Checking and uploading…">
        <input type="hidden" name="propertyId" value={propertyId} />
        <label className="block text-xs font-medium text-muted">
          CSV file
          <input name="file" type="file" accept=".csv,text/csv" className="field mt-1" required />
        </label>
      </ActionForm>

      <div className="border-t border-line pt-4">
        <p className="label mb-2">How the file should be laid out</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead className="text-faint">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Column heading</th>
                <th className="py-1.5 pr-3 font-medium">Required</th>
                <th className="py-1.5 pr-3 font-medium">What goes in it</th>
                <th className="py-1.5 font-medium">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-muted">
              {UNIT_COLUMNS.map((column) => (
                <tr key={column.key}>
                  <td className="py-1.5 pr-3 font-mono text-ink">{column.key}</td>
                  <td className="py-1.5 pr-3">{column.required ? 'Yes' : 'No'}</td>
                  <td className="py-1.5 pr-3">{column.description}</td>
                  <td className="py-1.5 font-mono">{column.example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="label mb-1.5 mt-4">Unit types</p>
        <p className="text-xs leading-relaxed text-muted">
          Use the code or the name, in any case:{' '}
          {UNIT_TYPES.map((type, index) => (
            <span key={type}>
              <span className="font-mono text-ink">{type}</span> ({humanise(type)})
              {index < UNIT_TYPES.length - 1 ? ', ' : '.'}
            </span>
          ))}
        </p>

        <p className="label mb-1.5 mt-4">Rules</p>
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted">
          <li>The first row must be the column headings. Column order does not matter, and extra columns are ignored.</li>
          <li>Each unit number may appear once, and must not already exist on this property.</li>
          <li>Amounts are in KES. 25000, 25,000 and KES 25,000 all work.</li>
          <li>Up to {MAX_UPLOAD_ROWS} units per file. Every unit is added as Vacant.</li>
          <li>Excel files (.xlsx) are not read directly. Save as CSV first.</li>
        </ul>
      </div>
    </div>
  )
}
