import Link from 'next/link'
import { notFound } from 'next/navigation'
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import {
  commissions,
  eritsPeriods,
  expenses,
  landlords,
  payments,
  properties,
  rentInvoices,
  settlements,
  taxProfiles,
  units,
} from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { can } from '@/lib/rbac'
import { ownLandlordScoped, scopeFromSession, scoped } from '@/lib/tenancy'
import { cents, formatKES, formatPercent, percent } from '@/lib/money'
import { fmtDate, fmtDayMonth, periodOf } from '@/lib/dates'
import {
  Card,
  DataTable,
  DetailList,
  EmptyState,
  KpiCard,
  Money,
  MoneyKpi,
  PageHeader,
  StatusBadge,
  humanise,
} from '@/components/ui'

export const dynamic = 'force-dynamic'

export default async function LandlordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requirePermission('landlords.view')
  const scope = scopeFromSession(session)
  const period = periodOf(new Date())

  const [landlord] = await db
    .select()
    .from(landlords)
    .where(ownLandlordScoped(landlords, scope, eq(landlords.id, id)))
    .limit(1)

  if (!landlord) notFound()

  const [portfolio, propertyRows, settlementRows, expenseRows, eritsRows, taxProfile] = await Promise.all([
    db
      .select({
        properties: sql<number>`(select count(*)::int from properties p where p.landlord_id = ${id} and p.organization_id = ${scope.organizationId})`,
        units: sql<number>`(select count(*)::int from units u join properties p on p.id = u.property_id where p.landlord_id = ${id})`,
        occupied: sql<number>`(select count(*)::int from units u join properties p on p.id = u.property_id where p.landlord_id = ${id} and u.status = 'OCCUPIED')`,
        expected: sql<string>`(select coalesce(sum(p.expected_monthly_rent), 0) from properties p where p.landlord_id = ${id})`,
        collectedMonth: sql<string>`(select coalesce(sum(pm.gross_amount), 0) from payments pm where pm.landlord_id = ${id} and pm.status = 'CONFIRMED' and pm.paid_at >= ${period.start} and pm.paid_at <= ${period.end})`,
        collectedAll: sql<string>`(select coalesce(sum(pm.gross_amount), 0) from payments pm where pm.landlord_id = ${id} and pm.status = 'CONFIRMED')`,
        outstanding: sql<string>`(select coalesce(sum(i.balance), 0) from rent_invoices i where i.landlord_id = ${id} and i.status <> 'CANCELLED')`,
        commissionAll: sql<string>`(select coalesce(sum(c.commission_amount), 0) from commissions c where c.landlord_id = ${id})`,
        managementFees: sql<string>`(select coalesce(sum(si.gross_amount), 0) from settlement_items si join settlements s on s.id = si.settlement_id where s.landlord_id = ${id} and si.type = 'MANAGEMENT_FEE')`,
        expensesAll: sql<string>`(select coalesce(sum(e.amount), 0) from expenses e where e.landlord_id = ${id} and e.approval_status = 'APPROVED')`,
        settledAll: sql<string>`(select coalesce(sum(s.net_amount), 0) from settlements s where s.landlord_id = ${id} and s.status = 'SETTLED')`,
        payable: sql<string>`(select coalesce(sum(c.net_amount), 0) from commissions c join payments pm on pm.id = c.payment_id where c.landlord_id = ${id} and pm.status = 'CONFIRMED' and pm.settlement_status <> 'SETTLED')`,
      })
      .from(landlords)
      .where(eq(landlords.id, id))
      .limit(1)
      .then((rows) => rows[0]),

    db
      .select({
        id: properties.id,
        code: properties.code,
        name: properties.name,
        type: properties.type,
        area: properties.area,
        status: properties.status,
        expectedMonthlyRent: properties.expectedMonthlyRent,
        managementFeeRate: properties.managementFeeRate,
        eritsPropertyRef: properties.eritsPropertyRef,
        unitCount: sql<number>`(select count(*)::int from units u where u.property_id = properties.id)`,
        occupied: sql<number>`(select count(*)::int from units u where u.property_id = properties.id and u.status = 'OCCUPIED')`,
        collected: sql<string>`(select coalesce(sum(pm.gross_amount), 0) from payments pm where pm.property_id = properties.id and pm.status = 'CONFIRMED' and pm.paid_at >= ${period.start} and pm.paid_at <= ${period.end})`,
      })
      .from(properties)
      .where(scoped(properties, scope, eq(properties.landlordId, id)))
      .orderBy(asc(properties.name)),

    db
      .select()
      .from(settlements)
      .where(scoped(settlements, scope, eq(settlements.landlordId, id)))
      .orderBy(desc(settlements.createdAt))
      .limit(8),

    db
      .select({
        id: expenses.id,
        reference: expenses.reference,
        category: expenses.category,
        amount: expenses.amount,
        expenseDate: expenses.expenseDate,
        description: expenses.description,
        approvalStatus: expenses.approvalStatus,
        propertyName: properties.name,
      })
      .from(expenses)
      .innerJoin(properties, eq(properties.id, expenses.propertyId))
      .where(scoped(expenses, scope, eq(expenses.landlordId, id)))
      .orderBy(desc(expenses.expenseDate))
      .limit(8),

    db
      .select()
      .from(eritsPeriods)
      .where(scoped(eritsPeriods, scope, eq(eritsPeriods.landlordId, id)))
      .orderBy(desc(eritsPeriods.periodYear), desc(eritsPeriods.periodMonth))
      .limit(6),

    db
      .select()
      .from(taxProfiles)
      .where(scoped(taxProfiles, scope, eq(taxProfiles.landlordId, id)))
      .limit(1)
      .then((rows) => rows[0]),
  ])

  const displayName = landlord.companyName ?? landlord.fullName
  const collectionRate = percent(cents(portfolio.collectedMonth), cents(portfolio.expected))

  return (
    <>
      <PageHeader
        breadcrumb={[{ label: 'Landlords', href: '/landlords' }, { label: displayName }]}
        title={displayName}
        description={`${landlord.code} · ${humanise(landlord.type)} · ${landlord.county ?? '—'}`}
        actions={
          <>
            {can(session, 'properties.create') && (
              <Link href={`/properties/new?landlord=${id}`} className="btn-secondary">
                Add property
              </Link>
            )}
            <Link href={`/reports/landlord-statement?landlord=${id}`} className="btn-secondary">
              Landlord statement
            </Link>
            <Link href={`/settlements?landlord=${id}`} className="btn-primary">
              Settlements
            </Link>
          </>
        }
      />

      {/* Portfolio value metrics (spec §7) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Properties" value={String(portfolio.properties)} />
        <KpiCard label="Units" value={String(portfolio.units)} sub={`${portfolio.occupied} occupied`} />
        <KpiCard
          label="Occupancy"
          value={formatPercent(percent(portfolio.occupied, portfolio.units))}
          tone={percent(portfolio.occupied, portfolio.units) >= 85 ? 'positive' : 'warning'}
        />
        <MoneyKpi label="Expected / month" amount={portfolio.expected} />
        <MoneyKpi label="Collected this month" amount={portfolio.collectedMonth} tone="positive" sub={`${formatPercent(collectionRate)} of expected`} />
        <MoneyKpi
          label="Outstanding"
          amount={portfolio.outstanding}
          tone={cents(portfolio.outstanding) > 0 ? 'warning' : 'positive'}
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MoneyKpi label="Approved expenses" amount={portfolio.expensesAll} />
        <MoneyKpi label="Management fees" amount={portfolio.managementFees} />
        <MoneyKpi label="Platform commission" amount={portfolio.commissionAll} tone="brand" />
        <MoneyKpi label="Settled to date" amount={portfolio.settledAll} tone="positive" />
        <MoneyKpi label="Net payable now" amount={portfolio.payable} />
        <MoneyKpi label="Collected all time" amount={portfolio.collectedAll} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card title="Owner details" className="lg:col-span-2">
          <DetailList
            columns={3}
            items={[
              { label: 'Landlord ID', value: landlord.code },
              { label: 'Type', value: humanise(landlord.type) },
              { label: landlord.type === 'COMPANY' ? 'Registration number' : 'National ID', value: landlord.registrationNumber ?? landlord.nationalId ?? '—' },
              { label: 'KRA PIN', value: landlord.kraPin ? <span className="font-mono">{landlord.kraPin}</span> : <span className="text-negative">Missing</span> },
              { label: 'Phone', value: landlord.phone },
              { label: 'Email', value: landlord.email ?? '—' },
              { label: 'Address', value: landlord.address ?? '—' },
              { label: 'County / town', value: `${landlord.county ?? '—'} · ${landlord.town ?? '—'}` },
              { label: 'Contact person', value: landlord.fullName },
            ]}
          />
        </Card>

        <Card title="Payment preference" description="Where settlements are paid.">
          <DetailList
            columns={1}
            items={
              landlord.payoutMethod === 'MPESA'
                ? [
                    { label: 'Method', value: 'M-Pesa' },
                    { label: 'M-Pesa number', value: landlord.mpesaNumber ?? '—' },
                    {
                      label: 'Commission rate',
                      value: landlord.commissionRate ? `${landlord.commissionRate}% (override)` : 'Organization default',
                    },
                  ]
                : [
                    { label: 'Method', value: 'Bank transfer' },
                    { label: 'Bank', value: `${landlord.bankName ?? '—'} · ${landlord.bankBranch ?? '—'}` },
                    { label: 'Account name', value: landlord.bankAccountName ?? '—' },
                    { label: 'Account number', value: landlord.bankAccountNumber ?? '—' },
                    {
                      label: 'Commission rate',
                      value: landlord.commissionRate ? `${landlord.commissionRate}% (override)` : 'Organization default',
                    },
                  ]
            }
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Properties owned" padded={false}>
          <DataTable
            rows={propertyRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/properties/${row.id}`}
            columns={[
              {
                key: 'name',
                header: 'Property',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{row.name}</p>
                    <p className="truncate text-2xs text-faint">{row.code} · {humanise(row.type)}</p>
                  </div>
                ),
              },
              { key: 'area', header: 'Area', hideOnMobile: true, render: (row) => <span className="text-sm text-muted">{row.area ?? '—'}</span> },
              { key: 'units', header: 'Units', align: 'right', render: (row) => <span className="tabular-nums text-sm">{row.occupied}/{row.unitCount}</span> },
              { key: 'fee', header: 'Management fee', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.managementFeeRate}%</span> },
              { key: 'expected', header: 'Expected', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.expectedMonthlyRent} muted /> },
              { key: 'collected', header: 'Collected', align: 'right', render: (row) => <Money value={row.collected} tone="positive" /> },
              { key: 'erits', header: 'eRITS ref', align: 'right', render: (row) => row.eritsPropertyRef ? <span className="font-mono text-2xs text-muted">{row.eritsPropertyRef}</span> : <StatusBadge status="REQUIRES_ATTENTION" label="Unmapped" /> },
            ]}
            empty={<EmptyState title="No properties on this landlord yet" />}
          />
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <Card title="Settlements" padded={false} actions={<Link href={`/settlements?landlord=${id}`} className="text-xs text-brand hover:underline">View all</Link>}>
          <DataTable
            dense
            rows={settlementRows}
            rowKey={(row) => row.id}
            rowHref={(row) => `/settlements/${row.id}`}
            columns={[
              { key: 'reference', header: 'Reference', render: (row) => <span className="font-mono text-xs">{row.reference}</span> },
              { key: 'period', header: 'Period', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDayMonth(row.periodStart)}–{fmtDayMonth(row.periodEnd)}</span> },
              { key: 'gross', header: 'Gross', align: 'right', hideOnMobile: true, render: (row) => <Money value={row.grossAmount} muted /> },
              { key: 'net', header: 'Net', align: 'right', render: (row) => <Money value={row.netAmount} /> },
              { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
            ]}
            empty={<EmptyState title="No settlements yet" />}
          />
        </Card>

        <Card title="Recent expenses" padded={false} actions={<Link href={`/expenses?landlord=${id}`} className="text-xs text-brand hover:underline">View all</Link>}>
          <DataTable
            dense
            rows={expenseRows}
            rowKey={(row) => row.id}
            columns={[
              {
                key: 'description',
                header: 'Expense',
                render: (row) => (
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{row.description}</p>
                    <p className="truncate text-2xs text-faint">{row.reference} · {row.propertyName}</p>
                  </div>
                ),
              },
              { key: 'category', header: 'Category', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{humanise(row.category)}</span> },
              { key: 'date', header: 'Date', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{fmtDate(row.expenseDate)}</span> },
              { key: 'amount', header: 'Amount', align: 'right', render: (row) => <Money value={row.amount} /> },
              { key: 'status', header: '', align: 'right', render: (row) => <StatusBadge status={row.approvalStatus} /> },
            ]}
            empty={<EmptyState title="No expenses recorded" />}
          />
        </Card>
      </div>

      <div className="mt-4">
        <Card
          title="Tax information"
          description="KRA registration and the rental income periods prepared for this landlord."
          actions={<Link href="/erits" className="text-xs text-brand hover:underline">eRITS dashboard</Link>}
        >
          <DetailList
            columns={3}
            items={[
              { label: 'KRA PIN', value: taxProfile?.kraPin ?? landlord.kraPin ?? '—' },
              { label: 'Taxpayer type', value: humanise(landlord.taxpayerType) },
              { label: 'Tax obligation', value: taxProfile?.taxObligation ?? 'Monthly Rental Income' },
              { label: 'eRITS status', value: <StatusBadge status={landlord.eritsStatus} /> },
              { label: 'eRITS taxpayer reference', value: landlord.eritsTaxpayerRef ?? '—' },
              { label: 'Registered on', value: taxProfile?.registrationDate ? fmtDate(taxProfile.registrationDate) : '—' },
            ]}
          />

          <div className="mt-5 border-t border-line pt-4">
            <DataTable
              dense
              rows={eritsRows}
              rowKey={(row) => row.id}
              rowHref={(row) => `/erits/${row.id}`}
              columns={[
                { key: 'period', header: 'Period', render: (row) => <span className="text-sm">{row.label}</span> },
                { key: 'gross', header: 'Gross rental income', align: 'right', render: (row) => <Money value={row.grossRentalIncome} /> },
                { key: 'rate', header: 'Rate', align: 'right', hideOnMobile: true, render: (row) => <span className="tabular-nums text-sm text-muted">{row.taxRate}%</span> },
                { key: 'tax', header: 'Tax', align: 'right', render: (row) => <Money value={row.taxAmount} muted /> },
                { key: 'rule', header: 'Rule applied', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.taxRuleName ?? '—'}</span> },
                { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.status} /> },
              ]}
              empty={<EmptyState title="No tax periods prepared yet" description="Periods are built from confirmed rent receipts." />}
            />
          </div>
        </Card>
      </div>
    </>
  )
}

