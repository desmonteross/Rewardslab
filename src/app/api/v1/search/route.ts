import { ilike, or, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, payments, properties, rentInvoices, tenants, units } from '@/db/schema'
import { authenticate, handler, ok } from '@/lib/api'
import { landlordScoped, ownLandlordScoped, scoped } from '@/lib/tenancy'
import { formatKES } from '@/lib/money'
import { can } from '@/lib/rbac'

interface Hit {
  type: string
  label: string
  detail: string
  href: string
}

/** GET /api/v1/search?q= — powers the command bar. Always org-scoped. */
export const GET = handler(async (request: Request) => {
  const { scope, session } = await authenticate()
  const query = new URL(request.url).searchParams.get('q')?.trim() ?? ''
  if (query.length < 2) return ok<Hit[]>([])

  const like = `%${query}%`
  const hits: Hit[] = []

  if (can(session, 'properties.view')) {
    const rows = await db
      .select({ id: properties.id, name: properties.name, code: properties.code, area: properties.area })
      .from(properties)
      .where(landlordScoped(properties, scope, or(ilike(properties.name, like), ilike(properties.code, like))))
      .limit(4)
    hits.push(
      ...rows.map((row) => ({
        type: 'Property',
        label: row.name,
        detail: `${row.code}${row.area ? ` · ${row.area}` : ''}`,
        href: `/properties/${row.id}`,
      })),
    )
  }

  if (can(session, 'tenants.view')) {
    const rows = await db
      .select({ id: tenants.id, fullName: tenants.fullName, code: tenants.code, phone: tenants.phone })
      .from(tenants)
      .where(
        scoped(
          tenants,
          scope,
          or(ilike(tenants.fullName, like), ilike(tenants.code, like), ilike(tenants.phone, like)),
        ),
      )
      .limit(4)
    hits.push(
      ...rows.map((row) => ({
        type: 'Tenant',
        label: row.fullName,
        detail: `${row.code} · ${row.phone}`,
        href: `/tenants/${row.id}`,
      })),
    )
  }

  if (can(session, 'units.view')) {
    const rows = await db
      .select({ id: units.id, unitNumber: units.unitNumber, propertyId: units.propertyId, propertyName: properties.name })
      .from(units)
      .innerJoin(properties, sql`${properties.id} = ${units.propertyId}`)
      .where(landlordScoped(properties, scope, ilike(units.unitNumber, like)))
      .limit(4)
    hits.push(
      ...rows.map((row) => ({
        type: 'Unit',
        label: `${row.propertyName} · ${row.unitNumber}`,
        detail: 'Unit',
        href: `/properties/${row.propertyId}?tab=units`,
      })),
    )
  }

  if (can(session, 'invoices.view')) {
    const rows = await db
      .select({ id: rentInvoices.id, number: rentInvoices.number, periodLabel: rentInvoices.periodLabel, total: rentInvoices.total })
      .from(rentInvoices)
      .where(landlordScoped(rentInvoices, scope, ilike(rentInvoices.number, like)))
      .limit(3)
    hits.push(
      ...rows.map((row) => ({
        type: 'Invoice',
        label: row.number,
        detail: `${row.periodLabel} · ${formatKES(row.total)}`,
        href: `/invoices/${row.id}`,
      })),
    )
  }

  if (can(session, 'payments.view')) {
    const rows = await db
      .select({ id: payments.id, reference: payments.reference, externalReference: payments.externalReference, grossAmount: payments.grossAmount })
      .from(payments)
      .where(
        landlordScoped(
          payments,
          scope,
          or(ilike(payments.reference, like), ilike(payments.externalReference, like)),
        ),
      )
      .limit(3)
    hits.push(
      ...rows.map((row) => ({
        type: 'Payment',
        label: row.reference,
        detail: `${row.externalReference ?? ''} ${formatKES(row.grossAmount)}`.trim(),
        href: `/payments/${row.id}`,
      })),
    )
  }

  if (can(session, 'landlords.view')) {
    const rows = await db
      .select({ id: landlords.id, fullName: landlords.fullName, companyName: landlords.companyName, code: landlords.code })
      .from(landlords)
      .where(
        ownLandlordScoped(
          landlords,
          scope,
          or(ilike(landlords.fullName, like), ilike(landlords.companyName, like), ilike(landlords.code, like)),
        ),
      )
      .limit(3)
    hits.push(
      ...rows.map((row) => ({
        type: 'Landlord',
        label: row.companyName ?? row.fullName,
        detail: row.code,
        href: `/landlords/${row.id}`,
      })),
    )
  }

  return ok(hits.slice(0, 12))
})
