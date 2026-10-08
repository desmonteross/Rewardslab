'use client'

import { useState } from 'react'
import clsx from 'clsx'
import { Gift, Home, Stamp } from 'lucide-react'

const TABS = [
  {
    key: 'rent',
    label: 'Rent',
    icon: Home,
    text: 'Earn points on every on-time rent payment, see what you owe in one place, and pay by M-Pesa from your phone.',
    rows: [
      { label: 'Monthly rent', value: 'KES 55,000' },
      { label: 'Paid on time', value: '11 of 12 months' },
      { label: 'Points this year', value: '3,300 pts', accent: true },
    ],
  },
  {
    key: 'passport',
    label: 'Rental Passport',
    icon: Stamp,
    text: 'Every on-time month builds your Rental Passport: a record you carry to your next landlord, explained point by point.',
    rows: [
      { label: 'Rental Passport', value: 'Excellent', pill: true },
      { label: 'Score', value: '91 / 100' },
      { label: 'Homes on record', value: '2' },
    ],
  },
  {
    key: 'perks',
    label: 'Owner perks',
    icon: Gift,
    text: 'The more points you hold, the better your chances when property owners run discounts, giveaways and other perks.',
    rows: [
      { label: 'This month', value: 'Rent-day giveaway' },
      { label: 'Your entries', value: '3 (from points)', accent: true },
      { label: 'Renewal discount', value: 'Eligible', pill: true },
    ],
  },
] as const

/**
 * The Rent / Rental Passport / Owner perks switcher over the full-width
 * building photo. Sample figures, shown as a product illustration.
 */
export function RentTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('rent')
  const tab = TABS.find((entry) => entry.key === active) ?? TABS[0]

  return (
    <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-2 lg:items-center lg:py-28">
      <div>
        <div role="tablist" aria-label="What RentRewards does for tenants" className="inline-flex flex-wrap gap-1 rounded-2xl border border-white/10 sm:rounded-full bg-white/[0.06] p-1 backdrop-blur-md">
          {TABS.map((entry) => (
            <button
              key={entry.key}
              type="button"
              role="tab"
              aria-selected={active === entry.key}
              onClick={() => setActive(entry.key)}
              className={clsx(
                'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors',
                active === entry.key ? 'bg-white text-[#0a1620]' : 'text-white/75 hover:text-white',
              )}
            >
              <entry.icon className="h-3.5 w-3.5" aria-hidden />
              {entry.label}
            </button>
          ))}
        </div>
        <p className="mt-6 max-w-md text-xl font-light leading-snug text-white sm:text-2xl">{tab.text}</p>
        <a href="/tenant/register" className="mt-6 inline-flex rounded-lg bg-[#9fe6c4] px-4 py-2 text-sm font-medium text-[#0a1620] hover:bg-[#b8eed3]">
          Start earning
        </a>
      </div>

      <div className="lg:justify-self-end">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0a1620]/70 p-5 text-white shadow-2xl backdrop-blur-xl">
          <p className="text-sm font-medium">Kileleshwa Heights</p>
          <p className="text-2xs text-white/50">Unit K07 · Kileleshwa, Nairobi</p>
          <dl className="mt-4 divide-y divide-white/10">
            {tab.rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-6 py-3 text-sm">
                <dt className="text-white/70">{row.label}</dt>
                <dd>
                  {'pill' in row && row.pill ? (
                    <span className="rounded-full border border-[#9fe6c4]/40 bg-[#9fe6c4]/10 px-2.5 py-0.5 text-xs text-[#9fe6c4]">{row.value}</span>
                  ) : (
                    <span className={clsx('tabular-nums', 'accent' in row && row.accent ? 'font-mono text-[#9fe6c4]' : 'text-white')}>{row.value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-right text-2xs text-white/35">Sample</p>
        </div>
      </div>
    </div>
  )
}
