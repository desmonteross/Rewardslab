import { unitTemplateCsv } from '@/server/units-import'

/** GET /units/template — the CSV the bulk upload expects, with example rows. */
export function GET() {
  return new Response(unitTemplateCsv(), {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="rentrewards-units-template.csv"',
    },
  })
}
