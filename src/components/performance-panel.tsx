'use client'

// ===========================================================================
//  Portfolio performance, three ways
//
//  All three orderings are computed on the server and sent together, because
//  they are the same handful of properties sorted differently. Switching a tab
//  is then a re-render rather than a round trip, which is what makes it feel
//  like a lens on one thing rather than three separate reports.
// ===========================================================================

import Link from 'next/link'
import clsx from 'clsx'
import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { compactKES, formatKES, formatPercent } from '@/lib/money'

export interface PerformanceRow {
  id: string
  name: string
  area: string | null
  units: number
  occupied: number
  occupancyRate: number
  collectedCents: number
  outstandingCents: number
  collectionRate: number
}

export interface PerformanceLensView {
  key: string
  label: string
  caption: string
  rows: PerformanceRow[]
}

/** What each lens puts in the headline slot, so the number matches the question. */
function headline(lensKey: string, row: PerformanceRow) {
  if (lensKey === 'occupancy') {
    return {
      figure: formatPercent(row.occupancyRate),
      amount: `${row.occupied}/${row.units} let`,
      bar: row.occupancyRate,
      tone: row.occupancyRate >= 90 ? 'positive' : row.occupancyRate >= 70 ? 'warning' : 'negative',
    } as const
  }
  if (lensKey === 'attention') {
    return {
      figure: formatPercent(row.collectionRate),
      amount: `${compactKES(row.outstandingCents / 100)} owed`,
      bar: row.collectionRate,
      tone: 'negative',
    } as const
  }
  return {
    figure: formatPercent(row.collectionRate),
    amount: compactKES(row.collectedCents / 100),
    bar: row.collectionRate,
    tone: 'positive',
  } as const
}

const BAR = {
  positive: 'bg-positive',
  warning: 'bg-warning',
  negative: 'bg-negative',
} as const

export function PerformancePanel({ lenses }: { lenses: PerformanceLensView[] }) {
  const [active, setActive] = useState(lenses[0]?.key ?? '')
  const lens = lenses.find((candidate) => candidate.key === active) ?? lenses[0]

  return (
    <section className="card flex flex-col overflow-hidden">
      <header className="border-b border-line px-5 pb-0 pt-4">
        <h2 className="text-sm font-semibold text-ink">Portfolio performance</h2>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Portfolio performance">
          {lenses.map((candidate) => {
            const selected = candidate.key === lens?.key
            return (
              <button
                key={candidate.key}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(candidate.key)}
                className={clsx(
                  '-mb-px whitespace-nowrap border-b-2 px-2 py-2 text-2xs font-medium transition-colors',
                  selected
                    ? 'border-brand text-ink'
                    : 'border-transparent text-muted hover:border-line hover:text-ink',
                )}
              >
                {candidate.label}
              </button>
            )
          })}
        </div>
      </header>

      {!lens || lens.rows.length === 0 ? (
        <div className="grid flex-1 place-items-center px-6 py-12 text-center">
          <div>
            <p className="text-sm font-medium text-ink">Nothing to show</p>
            <p className="mt-1 text-xs text-muted">{lens?.caption}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="px-5 pt-3 text-xs text-muted">{lens.caption}</p>
          <ul className="divide-y divide-line">
            {lens.rows.map((row) => {
              const head = headline(lens.key, row)
              return (
                <li key={row.id}>
                  <Link
                    href={`/properties/${row.id}`}
                    className="group flex items-center gap-2.5 px-4 py-3 transition-colors hover:bg-canvas"
                  >
                    {/*
                      A tile rather than a photograph. The mockup shows a photo
                      of each block; we hold no property images, and a stock
                      picture standing in for a real building would be a lie
                      about the record. The initial and the icon identify the
                      row without claiming to depict it.
                    */}
                    <span
                      aria-hidden
                      className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-soft text-brand-ink"
                    >
                      <Building2 className="h-4 w-4 opacity-40" />
                      <span className="absolute text-2xs font-semibold">
                        {row.name.trim().charAt(0).toUpperCase()}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink group-hover:text-brand">
                        {row.name}
                      </p>
                      <p className="truncate text-2xs text-faint">{row.area ?? `${row.units} units`}</p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-ink">{head.figure}</p>
                    <div className="w-[5.25rem] shrink-0">
                      <p className="truncate text-right text-xs tabular-nums text-muted">{head.amount}</p>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-canvas">
                        <div
                          className={clsx('h-full rounded-full', BAR[head.tone])}
                          style={{ width: `${Math.min(100, Math.max(0, head.bar))}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                </li>
              )
            })}
          </ul>
          <footer className="mt-auto border-t border-line px-5 py-3">
            <Link href="/properties" className="text-xs text-brand hover:underline">
              All properties
            </Link>
          </footer>
        </>
      )}
    </section>
  )
}

/** Exported for the tooltip copy in tests. */
export { headline as performanceHeadline, formatKES }
