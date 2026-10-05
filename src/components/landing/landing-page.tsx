import Link from 'next/link'
import {
  ArrowRight,
  BookOpenCheck,
  CalendarCheck,
  FileCheck2,
  Gift,
  Home,
  Landmark,
  Minus,
  Plus,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stamp,
  Wallet,
  Wrench,
} from 'lucide-react'
import { BrandBadge } from '@/components/brand'
import { ActionForm } from '@/components/action-form'
import { PointsTree } from '@/components/portal/points-tree'
import { formatKES } from '@/lib/money'
import { requestDemoAction } from '@/app/landing-actions'
import type { PublicListing } from '@/server/services/listings'
import { RentTabs } from './rent-tabs'

// ===========================================================================
//  Public landing page.
//
//  Always dark (data-theme="dark" on the wrapper), on a deep navy taken from
//  the logo badge, with a mint accent. Figures in the illustrations are
//  samples and are labelled as such where they could be read as claims.
// ===========================================================================

const NAVY = 'bg-[#0a1620]'
const MINT_BUTTON =
  'inline-flex items-center gap-2 rounded-lg bg-[#9fe6c4] px-4 py-2 text-sm font-medium text-[#0a1620] transition-colors hover:bg-[#b8eed3]'

const humanise = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

const SAMPLE_TREE = [
  { periodYear: 2026, periodMonth: 4, points: 250, daysLate: 0, streakMonths: 1, pending: false },
  { periodYear: 2026, periodMonth: 5, points: 260, daysLate: 0, streakMonths: 2, pending: false },
  { periodYear: 2026, periodMonth: 6, points: 120, daysLate: 6, streakMonths: 0, pending: false },
  { periodYear: 2026, periodMonth: 7, points: 255, daysLate: 0, streakMonths: 1, pending: false },
  { periodYear: 2026, periodMonth: 8, points: 290, daysLate: 0, streakMonths: 2, pending: false },
  { periodYear: 2026, periodMonth: 9, points: 310, daysLate: 0, streakMonths: 3, pending: true },
]

const PASSPORT_FACTORS = [
  { label: 'Paid on time', weight: 45, earned: 41 },
  { label: 'How late, when late', weight: 20, earned: 18 },
  { label: 'Nothing outstanding', weight: 20, earned: 20 },
  { label: 'Unbroken run', weight: 10, earned: 8 },
  { label: 'Length of tenancy', weight: 5, earned: 4 },
]

const MANAGER_FEATURES = [
  { icon: Wallet, title: 'Collections and M-Pesa', body: 'Invoices go out on their own and M-Pesa payments match themselves to the right tenant.' },
  { icon: BookOpenCheck, title: 'Accounting that balances', body: 'A double-entry ledger behind every shilling. Corrections are reversals, never edits.' },
  { icon: Landmark, title: 'Landlord settlements', body: 'Commission, expenses and payouts per owner, approved and paid by M-Pesa or bank.' },
  { icon: Wrench, title: 'Maintenance', body: 'Tenants report repairs from their phone; your team assigns, tracks and closes them.' },
  { icon: Smartphone, title: 'Tenant portal', body: 'Balances, M-Pesa payments, receipts, statements, points and the Rental Passport.' },
  { icon: FileCheck2, title: 'Compliance and reports', body: 'KRA rental income returns from the ledger, an audit trail and exportable reports.' },
]

const FAQS = [
  {
    q: 'How do I start earning points?',
    a: 'Your property manager needs to be on RentRewards. Activate your tenant account with the details they gave you, then pay rent on time as usual. Points arrive when each invoice is cleared.',
  },
  {
    q: 'How many points do I get?',
    a: '1 point for every KES 100 of rent paid on time. Paying late earns less, and nothing after 15 days. An unbroken run of on-time months adds a bonus of up to 30%.',
  },
  {
    q: 'Can I cash in my points?',
    a: 'No. Points are not cash and cannot be redeemed. They raise your chances when property owners run discounts, giveaways and other perks for their tenants.',
  },
  {
    q: 'What is the Rental Passport?',
    a: 'Your rental history in one place: how reliably you have paid, explained factor by factor, with a stamp for each home. Download it and share it with the landlord you choose.',
  },
  {
    q: 'What goes into my Rental Passport?',
    a: 'Only your rent invoices and payments. No ID number, employer or personal details, and nothing is sent to a credit bureau.',
  },
  {
    q: 'I manage properties. How do I get my buildings on RentRewards?',
    a: 'Request a demo below. We will set up your landlords, properties and units with you, and invite your tenants to their portal.',
  },
]

// ---------------------------------------------------------------------------

/** A street-map texture: two crossing grids and a few avenues. */
function StreetMap() {
  const lines: string[] = []
  for (let i = -6; i < 30; i++) lines.push(`M ${i * 70} -50 L ${i * 70 + 260} 950`)
  for (let i = -6; i < 22; i++) lines.push(`M -100 ${i * 64} L 1700 ${i * 64 - 300}`)
  const avenues = [
    'M -50 620 Q 500 520 820 300 T 1700 -40',
    'M 300 980 Q 620 600 760 420 T 980 -60',
    'M -60 260 Q 520 380 1000 560 T 1700 860',
  ]
  const blocks = [
    [180, 140, 110, 60],
    [900, 220, 140, 80],
    [1220, 520, 120, 70],
    [520, 640, 160, 70],
    [1080, 90, 90, 50],
  ]
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <g stroke="white" strokeOpacity="0.06" strokeWidth="1.2" fill="none">
        {lines.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g stroke="white" strokeOpacity="0.12" strokeWidth="5" fill="none" strokeLinecap="round">
        {avenues.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g fill="#9fe6c4" fillOpacity="0.05">
        {blocks.map(([x, y, w, h]) => (
          <rect key={`${x}-${y}`} x={x} y={y} width={w} height={h} rx="4" transform={`rotate(-16 ${x} ${y})`} />
        ))}
      </g>
    </svg>
  )
}

function Chip({
  icon: Icon,
  title,
  note,
  className,
  highlight,
}: {
  icon: typeof Home
  title: string
  note: string
  className: string
  highlight?: boolean
}) {
  return (
    <div className={`absolute flex flex-col items-center ${className}`}>
      <div
        className={
          highlight
            ? 'flex items-center gap-2.5 rounded-xl border border-[#9fe6c4]/40 bg-[#9fe6c4]/15 px-3 py-2 shadow-2xl backdrop-blur-md'
            : 'flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2 shadow-2xl backdrop-blur-md'
        }
      >
        <span
          className={
            highlight
              ? 'grid h-8 w-8 place-items-center rounded-lg bg-[#9fe6c4] text-[#0a1620]'
              : 'grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white'
          }
        >
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span>
          <span className="block whitespace-nowrap text-sm text-white">{title}</span>
          <span className="block whitespace-nowrap text-2xs text-[#9fe6c4]">{note}</span>
        </span>
      </div>
      <span className="mt-3 h-1.5 w-1.5 rounded-full bg-white/60 shadow-[0_0_12px_rgba(255,255,255,0.8)]" aria-hidden />
    </div>
  )
}

function Header() {
  const links = [
    { href: '#rent', label: 'Rent', icon: Home },
    { href: '#passport', label: 'Rental Passport', icon: Stamp },
    { href: '#homes', label: 'Find a home', icon: Sparkles },
    { href: '#managers', label: 'For managers', icon: Landmark },
  ]
  return (
    <header className="absolute inset-x-0 top-0 z-30">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandBadge size="sm" />
          <span className="hidden text-sm font-medium uppercase tracking-[0.3em] text-white sm:inline">RentRewards</span>
        </Link>
        <nav
          className="mx-auto hidden items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] p-1 backdrop-blur-md lg:flex"
          aria-label="Sections"
        >
          {links.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/80 hover:bg-white/10 hover:text-white"
            >
              <link.icon className="h-3.5 w-3.5" aria-hidden />
              {link.label}
            </a>
          ))}
        </nav>
        <Link
          href="/login"
          className="ml-auto rounded-lg bg-white px-3.5 py-1.5 text-sm font-medium text-[#0a1620] hover:bg-white/90 lg:ml-0"
        >
          Sign up / Log in
        </Link>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className={`relative min-h-[100svh] overflow-hidden ${NAVY}`}>
      <StreetMap />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_70%_45%,transparent_0%,#0a1620_70%)]" />
      <div className="relative mx-auto flex min-h-[100svh] max-w-7xl flex-col justify-center px-4 pb-16 pt-28 sm:px-6 lg:flex-row lg:items-center">
        <div className="max-w-xl">
          <h1 className="text-4xl font-light leading-[1.12] tracking-tight text-white sm:text-5xl">
            Earn points on every rent payment.
            <span className="block text-white/55">Carry a Rental Passport to your next home.</span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/tenant/register" className={MINT_BUTTON}>
              Start earning today
            </Link>
            <a href="#managers" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm text-white/75 hover:text-white">
              I manage properties
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>

        {/* The journey, floating over the map (desktop) */}
        <div className="relative mt-16 hidden h-[520px] flex-1 lg:mt-0 lg:block">
          <Chip icon={Home} title="You pay rent on time" note="+250 pts" className="left-[38%] top-[44%]" highlight />
          <Chip icon={Receipt} title="Receipt sent by M-Pesa" note="Matched in seconds" className="left-[8%] top-[18%]" />
          <Chip icon={CalendarCheck} title="Six on-time months" note="Streak bonus" className="right-[4%] top-[10%]" />
          <Chip icon={Stamp} title="Rental Passport" note="Excellent" className="right-[2%] top-[58%]" />
          <Chip icon={Gift} title="Owner giveaway" note="You’re in the draw" className="left-[4%] top-[70%]" />
          <Chip icon={Wrench} title="Repair reported" note="Fixed in 2 days" className="left-[46%] top-[82%]" />
        </div>

        {/* Phone: the same journey as a simple stack */}
        <div className="mt-12 grid gap-2.5 lg:hidden">
          {[
            { icon: Home, title: 'You pay rent on time', note: '+250 pts' },
            { icon: Stamp, title: 'Rental Passport', note: 'Excellent' },
            { icon: Gift, title: 'Owner giveaway', note: 'You’re in the draw' },
          ].map((chip) => (
            <div
              key={chip.title}
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.07] px-3 py-2.5 backdrop-blur-md"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/10 text-white">
                <chip.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-sm text-white">{chip.title}</span>
              <span className="ml-auto text-xs text-[#9fe6c4]">{chip.note}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function PhotoBand() {
  return (
    <section id="rent" className="relative scroll-mt-4 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover brightness-[0.35] saturate-[0.6]" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1620] via-[#0a1620]/40 to-[#0a1620]" />
      <RentTabs />
    </section>
  )
}

function GlassCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0a1620]/70 p-4 text-white shadow-2xl backdrop-blur-xl">{children}</div>
  )
}

function EarnOnRent() {
  const columns = [
    {
      image: '/brand/login-hero.jpg',
      title: 'Earn points on rent',
      body: 'Pay through your tenant portal or by M-Pesa with your account number. Every invoice cleared on time earns points, 1 for every KES 100.',
      card: (
        <GlassCard>
          <div className="flex justify-between text-sm">
            <span className="text-white/70">Your rent</span>
            <span className="tabular-nums">KES 25,000</span>
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <span className="text-white/70">Points</span>
            <span className="font-mono text-[#9fe6c4]">+250 pts</span>
          </div>
          <p className="mt-3 border-t border-white/10 pt-3 text-2xs uppercase tracking-wider text-white/50">Paid via M-Pesa</p>
        </GlassCard>
      ),
    },
    {
      image: '/brand/hero-portrait.jpg',
      title: 'Build your Rental Passport',
      body: 'Each month you pay on time strengthens a record you own. Five plain factors, every point explained, ready to share with your next landlord.',
      card: (
        <GlassCard>
          <p className="text-sm">Rental Passport</p>
          <p className="text-2xs text-white/50">From rent payments only</p>
          <svg viewBox="0 0 120 70" className="mx-auto mt-3 w-36" aria-hidden>
            <path d="M 10 62 A 50 50 0 0 1 110 62" fill="none" stroke="white" strokeOpacity="0.15" strokeWidth="8" strokeLinecap="round" />
            <path d="M 10 62 A 50 50 0 0 1 103 34" fill="none" stroke="#9fe6c4" strokeWidth="8" strokeLinecap="round" />
            <text x="60" y="58" textAnchor="middle" fill="white" fontSize="20" fontWeight="300">
              91
            </text>
          </svg>
          <p className="text-center text-2xs uppercase tracking-wider text-[#9fe6c4]">Excellent</p>
        </GlassCard>
      ),
    },
    {
      image: '/brand/hero.jpg',
      title: 'Stand out for owner perks',
      body: 'Property owners run discounts, giveaways and other perks for their tenants. The more points you hold, the better your chances.',
      card: (
        <GlassCard>
          <p className="flex items-center justify-between text-sm">
            Owner perks <Gift className="h-4 w-4 text-[#9fe6c4]" aria-hidden />
          </p>
          <ul className="mt-3 space-y-2 text-xs text-white/80">
            <li className="rounded-lg bg-white/5 px-2.5 py-2">Rent-day giveaway entries</li>
            <li className="rounded-lg bg-white/5 px-2.5 py-2">Renewal discounts</li>
            <li className="rounded-lg bg-white/5 px-2.5 py-2">First pick of upgrades</li>
          </ul>
          <p className="mt-2 text-2xs text-white/40">Set by each owner. Points are not cash.</p>
        </GlassCard>
      ),
    },
  ]
  return (
    <section className={`${NAVY} px-4 py-24 sm:px-6`}>
      <div className="mx-auto max-w-7xl">
        <h2 className="text-3xl font-light tracking-tight text-white sm:text-4xl">Earn rewards on rent</h2>
        <p className="mt-3 max-w-2xl text-base font-light leading-relaxed text-white/60">
          Turn your biggest monthly bill into something that works for you: points, a record you own, and a better shot at
          the perks owners offer.
        </p>
        <div className="mt-12 grid gap-8 md:grid-cols-3">
          {columns.map((column) => (
            <div key={column.title}>
              <div className="relative grid aspect-[4/3.4] place-items-center overflow-hidden rounded-2xl p-6">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={column.image} alt="" className="absolute inset-0 h-full w-full object-cover brightness-[0.45] saturate-[0.5]" />
                <div className="relative w-full max-w-[15rem]">{column.card}</div>
              </div>
              <h3 className="mt-5 text-lg font-normal text-white">{column.title}</h3>
              <p className="mt-2 text-sm font-light leading-relaxed text-white/60">{column.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TreeBand() {
  return (
    <section className={`${NAVY} border-t border-white/5 px-4 py-24 sm:px-6`}>
      <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          <h2 className="text-3xl font-light tracking-tight text-white sm:text-4xl">Watch your points grow.</h2>
          <p className="mt-3 max-w-md text-base font-light leading-relaxed text-white/60">
            Every month of rent grows a new branch on your points tree: green when you paid on time, amber when you were
            late, so you always see how you are doing.
          </p>
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
          <PointsTree earnings={SAMPLE_TREE} total={1485} />
          <p className="mt-2 text-center text-2xs text-white/35">Sample tree</p>
        </div>
      </div>
    </section>
  )
}

function Passport() {
  const score = PASSPORT_FACTORS.reduce((sum, factor) => sum + factor.earned, 0)
  return (
    <section id="passport" className={`${NAVY} scroll-mt-4 border-t border-white/5 px-4 py-24 sm:px-6`}>
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[#9fe6c4]">Rental Passport</p>
          <h2 className="mt-4 text-3xl font-light tracking-tight text-white sm:text-5xl">
            Your good record,
            <span className="block text-white/55">ready for your next home.</span>
          </h2>
          <ul className="mt-8 space-y-5">
            {[
              { icon: ShieldCheck, title: 'Built only from rent paid', body: 'No ID number, employer or personal details. Just how you have paid.' },
              { icon: BookOpenCheck, title: 'Every point explained', body: 'Five plain factors with their weights, so your score is never a mystery.' },
              { icon: FileCheck2, title: 'You decide who sees it', body: 'Download it and share it with the landlord you choose.' },
            ].map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-[#9fe6c4]">
                  <item.icon className="h-4 w-4" aria-hidden />
                </span>
                <div>
                  <p className="text-sm text-white">{item.title}</p>
                  <p className="mt-0.5 text-sm font-light text-white/60">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 max-w-md border-l-2 border-[#9fe6c4]/50 pl-4 text-sm font-light text-white/70">
            Landlords: ask applicants for their Rental Passport. It shows how they have actually paid, not just what they say.
          </p>
          <Link href="/tenant/register" className={`${MINT_BUTTON} mt-8`}>
            Get your Rental Passport
          </Link>
        </div>

        <div className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-10 rounded-full bg-[#9fe6c4]/10 blur-3xl" aria-hidden />
          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-[#123326] to-[#0a1620] p-6 text-white shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-2xs uppercase tracking-[0.3em] text-white/50">RentRewards</p>
                <p className="mt-1 text-xl font-light">Rental Passport</p>
              </div>
              <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-2xs text-white/60">Sample</span>
            </div>
            <div className="mt-6 flex items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-sm">AW</span>
              <div>
                <p className="text-sm">Amina W.</p>
                <p className="text-2xs text-white/50">43 months on record · 2 homes</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-3xl font-light tabular-nums">{score}</p>
                <p className="text-2xs uppercase tracking-wider text-[#9fe6c4]">Excellent</p>
              </div>
            </div>
            <div className="mt-6 space-y-2.5">
              {PASSPORT_FACTORS.map((factor) => (
                <div key={factor.label}>
                  <div className="flex justify-between text-2xs text-white/60">
                    <span>{factor.label}</span>
                    <span className="tabular-nums">
                      {factor.earned} / {factor.weight}
                    </span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#9fe6c4]" style={{ width: `${(factor.earned / factor.weight) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {[
                { place: 'Kileleshwa', years: '2022 – 2024', note: '23 of 24 on time' },
                { place: 'Kilimani', years: '2024 – now', note: '19 of 19 on time' },
              ].map((stamp, index) => (
                <div
                  key={stamp.place}
                  className="rounded-xl border border-dashed border-[#9fe6c4]/40 p-3"
                  style={{ transform: `rotate(${index === 0 ? -2 : 2}deg)` }}
                >
                  <p className="text-2xs uppercase tracking-wider text-[#9fe6c4]">{stamp.place}</p>
                  <p className="mt-0.5 text-xs">{stamp.years}</p>
                  <p className="text-2xs text-white/50">{stamp.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function Homes({ listings }: { listings: PublicListing[] }) {
  return (
    <section id="homes" className={`${NAVY} scroll-mt-4 border-t border-white/5 px-4 py-24 sm:px-6`}>
      <div className="mx-auto max-w-7xl">
        <h2 className="text-3xl font-light tracking-tight text-white sm:text-4xl">Homes available now</h2>
        <p className="mt-3 max-w-2xl text-base font-light text-white/60">
          Vacant homes listed by property managers on RentRewards. Move in, pay on time, and start earning from your first
          month.
        </p>
        {listings.length === 0 ? (
          <p className="mt-10 rounded-2xl border border-dashed border-white/10 p-10 text-center text-sm text-white/50">
            No homes are listed right now. Check back soon.
          </p>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <article
                key={listing.id}
                className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:border-[#9fe6c4]/40"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-2xs text-white/80">{humanise(listing.unitType)}</span>
                  <span className="text-2xs text-white/40">
                    From {listing.availableFrom.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
                <h3 className="mt-4 text-base font-normal leading-snug text-white">{listing.headline}</h3>
                <p className="mt-1 text-sm font-light text-white/55">
                  {[listing.area, listing.bedrooms > 0 ? `${listing.bedrooms} bed` : null, `${listing.bathrooms} bath`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-auto pt-5 text-lg font-light tabular-nums text-white">
                  {formatKES(listing.askingRent)}
                  <span className="text-sm text-white/45"> / month</span>
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Managers() {
  return (
    <section id="managers" className="scroll-mt-4 border-t border-white/5 bg-[#0d1d2a] px-4 py-24 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <p className="text-xs uppercase tracking-[0.3em] text-[#9fe6c4]">For property managers and landlords</p>
        <h2 className="mt-4 max-w-3xl text-3xl font-light tracking-tight text-white sm:text-5xl">
          Run the building.
          <span className="block text-white/55">We’ll reward the tenants who pay.</span>
        </h2>
        <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-3">
          {MANAGER_FEATURES.map((feature) => (
            <div key={feature.title} className="bg-[#0d1d2a] p-6">
              <feature.icon className="h-5 w-5 text-[#9fe6c4]" aria-hidden />
              <h3 className="mt-4 text-base font-normal text-white">{feature.title}</h3>
              <p className="mt-1.5 text-sm font-light leading-relaxed text-white/60">{feature.body}</p>
            </div>
          ))}
        </div>

        <div
          id="demo"
          className="mt-16 grid scroll-mt-4 gap-10 rounded-3xl border border-white/10 bg-[#0a1620] p-6 sm:p-10 lg:grid-cols-[1fr_1.2fr]"
        >
          <div>
            <h3 className="text-2xl font-light text-white">See it on your own buildings.</h3>
            <p className="mt-3 text-sm font-light leading-relaxed text-white/60">
              Tell us about your portfolio and we’ll walk you through collections, owner statements, the tenant portal and
              the Rental Passport.
            </p>
          </div>
          <ActionForm
            action={requestDemoAction}
            label="Request a demo"
            pendingLabel="Sending…"
            buttonClassName="!bg-[#9fe6c4] !text-[#0a1620] hover:!bg-[#b8eed3]"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs text-white/60">
                Your name
                <input name="name" className="field mt-1" autoComplete="name" required />
              </label>
              <label className="block text-xs text-white/60">
                Company
                <input name="company" className="field mt-1" autoComplete="organization" />
              </label>
              <label className="block text-xs text-white/60">
                Phone
                <input name="phone" type="tel" className="field mt-1" autoComplete="tel" placeholder="0712 345 678" />
              </label>
              <label className="block text-xs text-white/60">
                Email
                <input name="email" type="email" className="field mt-1" autoComplete="email" />
              </label>
              <label className="block text-xs text-white/60 sm:col-span-2">
                Units you manage
                <select name="units" className="field mt-1" defaultValue="">
                  <option value="">Choose…</option>
                  <option>Under 50</option>
                  <option>50 – 200</option>
                  <option>200 – 1,000</option>
                  <option>Over 1,000</option>
                </select>
              </label>
            </div>
          </ActionForm>
        </div>
      </div>
    </section>
  )
}

function Faq() {
  return (
    <section className={`${NAVY} border-t border-white/5 px-4 py-24 sm:px-6`}>
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_1.5fr]">
        <h2 className="text-3xl font-light tracking-tight text-white sm:text-4xl">Questions, answered.</h2>
        <div className="divide-y divide-white/10 border-y border-white/10">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-light text-white">
                {faq.q}
                <Plus className="h-4 w-4 shrink-0 text-white/50 group-open:hidden" aria-hidden />
                <Minus className="hidden h-4 w-4 shrink-0 text-[#9fe6c4] group-open:block" aria-hidden />
              </summary>
              <p className="mt-3 text-sm font-light leading-relaxed text-white/60">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function FinalCta() {
  return (
    <section className={`relative overflow-hidden ${NAVY} border-t border-white/5 px-4 py-28 text-center sm:px-6`}>
      <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#9fe6c4]/10 blur-3xl" aria-hidden />
      <div className="relative mx-auto max-w-2xl">
        <h2 className="text-3xl font-light tracking-tight text-white sm:text-5xl">Ready to get rewarded for rent?</h2>
        <p className="mt-4 text-base font-light text-white/60">
          Activate your tenant account and start growing your points and your Rental Passport.
        </p>
        <Link href="/tenant/register" className={`${MINT_BUTTON} mt-8`}>
          Start earning today
        </Link>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-white/5 bg-[#071017] px-4 py-10 text-sm text-white/50 sm:px-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <BrandBadge size="sm" />
          <span className="text-xs uppercase tracking-[0.3em] text-white/80">RentRewards</span>
          <span>· Nairobi, Kenya</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <a href="#rent" className="hover:text-white">Rent</a>
          <a href="#passport" className="hover:text-white">Rental Passport</a>
          <a href="#homes" className="hover:text-white">Find a home</a>
          <a href="#managers" className="hover:text-white">For managers</a>
          <Link href="/login" className="hover:text-white">Log in</Link>
        </nav>
      </div>
    </footer>
  )
}

export function LandingPage({ listings }: { listings: PublicListing[] }) {
  return (
    <div data-theme="dark" className={`min-h-screen ${NAVY} text-white antialiased`}>
      <Header />
      <main>
        <Hero />
        <PhotoBand />
        <EarnOnRent />
        <TreeBand />
        <Passport />
        <Homes listings={listings} />
        <Managers />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
