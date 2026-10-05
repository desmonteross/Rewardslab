import Link from 'next/link'
import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Building2,
  CalendarCheck,
  FileCheck2,
  Landmark,
  MessageSquareText,
  Minus,
  Plus,
  Receipt,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Wallet,
  Wrench,
} from 'lucide-react'
import { BrandBadge } from '@/components/brand'
import { ActionForm } from '@/components/action-form'
import { PointsTree } from '@/components/portal/points-tree'
import { formatKES } from '@/lib/money'
import { requestDemoAction } from '@/app/landing-actions'
import type { PublicListing } from '@/server/services/listings'

const humanise = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

// ---------------------------------------------------------------------------
// Sample data for illustrations. Clearly product illustrations, not claims.
// ---------------------------------------------------------------------------

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

const PASSPORT_STAMPS = [
  { place: 'Kileleshwa', years: '2022 – 2024', note: '24 months · 23 on time' },
  { place: 'Kilimani', years: '2024 – now', note: '19 months · 19 on time' },
]

const FEATURES = [
  {
    icon: Wallet,
    title: 'Collections and M-Pesa',
    body: 'Rent is invoiced automatically, M-Pesa payments are matched to the right tenant, and a receipt goes out the moment the money lands.',
  },
  {
    icon: BookOpenCheck,
    title: 'Accounting that balances',
    body: 'Every shilling posts to a double-entry ledger. Corrections are reversals, never edits, so the books always reconcile.',
  },
  {
    icon: Landmark,
    title: 'Landlord settlements',
    body: 'Commission, expenses and payouts calculated per owner, approved by your accountant, and paid by M-Pesa or bank.',
  },
  {
    icon: Wrench,
    title: 'Maintenance',
    body: 'Tenants report repairs from their phone. Your team assigns, tracks and closes them, and the cost lands on the owner statement.',
  },
  {
    icon: Smartphone,
    title: 'Tenant portal',
    body: 'Tenants see what they owe, pay by M-Pesa, download receipts and statements, and watch their points and Rental Passport grow.',
  },
  {
    icon: FileCheck2,
    title: 'Compliance and reports',
    body: 'KRA rental income returns prepared from the ledger, an audit trail of every action, and reports that export exactly what you see.',
  },
]

const FAQS = [
  {
    q: 'Who is RentRewards for?',
    a: 'Property management companies, landlords who manage their own buildings, and the tenants who live in them. Each gets their own view of the same records.',
  },
  {
    q: 'How do tenants pay?',
    a: 'By M-Pesa, using their account number, or from the tenant portal with a payment prompt on their phone. Payments are matched to the tenant automatically.',
  },
  {
    q: 'What is the Rental Passport?',
    a: 'A tenant’s rental history in one place: how reliably they have paid, explained point by point, with a stamp for every home. Tenants can download it and share it with their next landlord.',
  },
  {
    q: 'Are reward points cash?',
    a: 'No. Points cannot be redeemed for money. They raise a tenant’s chances when property owners run discounts, giveaways and other perks.',
  },
  {
    q: 'Can landlords see their own properties?',
    a: 'Yes. Landlords get their own login that shows only their portfolio: collections, expenses, statements and payouts.',
  },
  {
    q: 'How long does it take to get started?',
    a: 'Add your landlords and properties, upload your units from a spreadsheet, add tenants and leases, and invite tenants to the portal. Most of it is a one-off.',
  },
]

// ---------------------------------------------------------------------------

function SectionHeading({ eyebrow, title, body, invert }: { eyebrow: string; title: string; body?: string; invert?: boolean }) {
  return (
    <div className="max-w-2xl">
      <p className={invert ? 'text-xs font-semibold uppercase tracking-[0.18em] text-nav-accent' : 'text-xs font-semibold uppercase tracking-[0.18em] text-brand'}>
        {eyebrow}
      </p>
      <h2 className={invert ? 'mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl' : 'mt-3 text-3xl font-semibold tracking-tight text-ink sm:text-4xl'}>
        {title}
      </h2>
      {body && <p className={invert ? 'mt-4 text-base leading-relaxed text-nav-ink/75' : 'mt-4 text-base leading-relaxed text-muted'}>{body}</p>}
    </div>
  )
}

function Header() {
  const links = [
    { href: '#features', label: 'Features' },
    { href: '#tenants', label: 'For tenants' },
    { href: '#passport', label: 'Rental Passport' },
    { href: '#homes', label: 'Find a home' },
    { href: '#faq', label: 'FAQ' },
  ]
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandBadge size="sm" />
          <span className="text-base font-semibold tracking-tight text-ink">RentRewards</span>
        </Link>
        <nav className="hidden flex-1 items-center gap-1 md:flex" aria-label="Sections">
          {links.map((link) => (
            <a key={link.href} href={link.href} className="rounded-lg px-3 py-2 text-sm text-muted hover:bg-ink/5 hover:text-ink">
              {link.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/login" className="rounded-lg px-3 py-2 text-sm font-medium text-ink hover:bg-ink/5">
            Sign in
          </Link>
          <a href="#demo" className="btn-primary hidden sm:inline-flex">
            Request a demo
          </a>
        </div>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand">Property management for Kenya</p>
          <h1 className="mt-4 text-[2.75rem] font-semibold leading-[1.02] tracking-tight text-ink sm:text-6xl">
            Rent collected.
            <br />
            <span className="text-brand">Tenants rewarded.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
            RentRewards runs your buildings end to end: M-Pesa collection, accounting, landlord payouts and repairs. Your
            tenants earn points and a Rental Passport for paying on time, so they have a reason to.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#demo" className="btn-primary px-5 py-3 text-base">
              Request a demo
              <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
            <Link href="/tenant/register" className="btn-secondary px-5 py-3 text-base">
              I’m a tenant
            </Link>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            {['M-Pesa matched automatically', 'Double-entry ledger', 'KRA-ready returns'].map((item) => (
              <li key={item} className="flex items-center gap-1.5">
                <BadgeCheck className="h-4 w-4 text-brand" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <div className="relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-panel sm:aspect-[5/5] lg:aspect-[4/5]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/hero-portrait.jpg" alt="" className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
          </div>

          {/* Product illustration, built from the app's own visual language */}
          <div className="absolute -left-4 top-8 w-64 rounded-2xl border border-line bg-surface p-4 shadow-xl sm:-left-10">
            <p className="text-2xs font-semibold uppercase tracking-wider text-faint">Good morning, Wanjiru</p>
            <p className="mt-1 text-sm font-semibold text-ink">Everything is on track.</p>
            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-2xs text-muted">Rent collected</p>
                <p className="text-2xl font-semibold tabular-nums text-ink">92%</p>
              </div>
              <span className="rounded-full bg-positive/10 px-2 py-0.5 text-2xs font-medium text-positive">↑ this month</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full w-[92%] rounded-full bg-brand" />
            </div>
          </div>

          <div className="absolute -bottom-6 right-2 w-60 rounded-2xl border border-line bg-surface p-4 shadow-xl sm:-right-6">
            <div className="flex items-center gap-3">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand/15 text-brand">
                <Receipt className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">KES 25,000 received</p>
                <p className="truncate text-2xs text-muted">Matched to Unit B4 · receipt sent</p>
              </div>
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-2xs font-medium text-brand">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> +250 points to the tenant
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function BeforeAfter() {
  const before = ['Payments hiding in M-Pesa statements', 'Tenants asking what they owe', 'Owner reports that take a week']
  const after = ['Every payment matched and receipted', 'Tenants see it in their own portal', 'Statements ready the day you need them']
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading eyebrow="The difference" title="From chasing to calm." />
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-line p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-faint">Before</p>
            <p className="mt-2 text-lg font-semibold text-ink">Another day of putting out fires.</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted">
              {before.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-faint">—</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-brand/30 bg-brand/5 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">With RentRewards</p>
            <p className="mt-2 text-lg font-semibold text-ink">Everything moving, without the drama.</p>
            <ul className="mt-4 space-y-2.5 text-sm text-ink/80">
              {after.map((item) => (
                <li key={item} className="flex gap-2">
                  <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

function Features() {
  return (
    <section id="features" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <SectionHeading
          eyebrow="For property managers and landlords"
          title="Everything a building needs, in one place."
          body="From the first invoice to the owner’s payout, every step reads and writes the same records. Nothing to copy between spreadsheets."
        />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="rounded-2xl border border-line bg-surface p-6 transition-colors hover:border-brand/40">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand/10 text-brand">
                <feature.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-base font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function TenantsBand() {
  const steps = [
    { icon: CalendarCheck, title: 'Pay rent on time', body: '1 point for every KES 100, in full when you pay by the due date.' },
    { icon: Sparkles, title: 'Grow your tree', body: 'Every month of rent grows a new branch. An unbroken run earns a bonus.' },
    { icon: Building2, title: 'Stand out for perks', body: 'More points mean better chances when owners run discounts and giveaways.' },
  ]
  return (
    <section id="tenants" className="scroll-mt-20 border-y border-nav-line bg-nav bg-[radial-gradient(ellipse_at_top_right,rgba(52,199,145,0.16),transparent_55%)] text-nav-ink">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHeading
            invert
            eyebrow="For tenants"
            title="Your rent, finally working for you."
            body="Paying rent is the biggest bill you have. With RentRewards, paying it on time grows your points and builds a record that follows you to your next home."
          />
          <ol className="mt-8 space-y-5">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-nav-raised text-nav-accent">
                  <step.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {index + 1}. {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-nav-ink/70">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-nav-muted">Points are not cash and cannot be redeemed. Offers are set by each property owner.</p>
          <Link href="/tenant/register" className="mt-8 inline-flex items-center gap-2 rounded-lg bg-nav-accent px-5 py-3 text-sm font-semibold text-nav">
            Activate my tenant account
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {/* The real points tree, drawn with sample months. Forced dark so it reads on the band. */}
        <div data-theme="dark" className="rounded-3xl border border-nav-line bg-nav-raised/50 p-5 text-ink">
          <p className="mb-2 text-center text-xs font-medium uppercase tracking-wider text-nav-muted">Sample points tree</p>
          <PointsTree earnings={SAMPLE_TREE} total={1485} />
        </div>
      </div>
    </section>
  )
}

function Passport() {
  const score = PASSPORT_FACTORS.reduce((sum, factor) => sum + factor.earned, 0)
  return (
    <section id="passport" className="scroll-mt-20">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.05fr]">
        {/* Passport illustration */}
        <div className="order-2 lg:order-1">
          <div className="relative mx-auto max-w-md">
            <div className="absolute -inset-3 -rotate-3 rounded-[2rem] bg-brand/15" aria-hidden />
            <div className="relative overflow-hidden rounded-[1.75rem] bg-[#0e3b2c] p-6 text-white shadow-2xl">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xs font-semibold uppercase tracking-[0.25em] text-white/60">RentRewards</p>
                  <p className="mt-1 text-xl font-semibold tracking-tight">Rental Passport</p>
                </div>
                <span className="rounded-full bg-white/10 px-2.5 py-1 text-2xs font-medium text-white/80">Sample</span>
              </div>

              <div className="mt-6 flex items-center gap-4">
                <span className="grid h-14 w-14 place-items-center rounded-full bg-white/10 text-lg font-semibold">AW</span>
                <div>
                  <p className="text-sm font-semibold">Amina W.</p>
                  <p className="text-2xs text-white/60">Tenant since 2022 · 43 months on record</p>
                </div>
                <div className="ml-auto text-right">
                  <p className="text-3xl font-semibold tabular-nums">{score}</p>
                  <p className="text-2xs font-medium uppercase tracking-wider text-[#7fe0b0]">Excellent</p>
                </div>
              </div>

              <div className="mt-6 space-y-2.5">
                {PASSPORT_FACTORS.map((factor) => (
                  <div key={factor.label}>
                    <div className="flex justify-between text-2xs text-white/70">
                      <span>{factor.label}</span>
                      <span className="tabular-nums">
                        {factor.earned} / {factor.weight}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-[#7fe0b0]" style={{ width: `${(factor.earned / factor.weight) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {PASSPORT_STAMPS.map((stamp, index) => (
                  <div
                    key={stamp.place}
                    className="rounded-xl border-2 border-dashed border-[#7fe0b0]/50 p-3"
                    style={{ transform: `rotate(${index === 0 ? -2 : 2}deg)` }}
                  >
                    <p className="text-2xs font-semibold uppercase tracking-wider text-[#7fe0b0]">{stamp.place}</p>
                    <p className="mt-0.5 text-xs font-medium">{stamp.years}</p>
                    <p className="text-2xs text-white/60">{stamp.note}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <SectionHeading
            eyebrow="Rental Passport"
            title="Your good record, ready for your next home."
            body="Every on-time month is proof you are a good tenant. The Rental Passport gathers it into one record you can carry from landlord to landlord."
          />
          <ul className="mt-8 space-y-4">
            {[
              { icon: ShieldCheck, title: 'Built only from rent paid', body: 'No ID number, employer or personal details go into it. Just how you have paid.' },
              { icon: MessageSquareText, title: 'Every point explained', body: 'Five plain factors, each with its weight, so you can see exactly why your score is what it is.' },
              { icon: FileCheck2, title: 'You decide who sees it', body: 'Download it as a PDF and share it with the landlord you choose.' },
            ].map((item) => (
              <li key={item.title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand">
                  <item.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">For landlords</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Ask applicants for their Rental Passport. It tells you how they have actually paid, not just what they say.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/tenant/register" className="btn-primary px-5 py-3">
              Get your Rental Passport
            </Link>
            <a href="#demo" className="btn-secondary px-5 py-3">
              See it in a demo
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Homes({ listings }: { listings: PublicListing[] }) {
  return (
    <section id="homes" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionHeading
            eyebrow="Find a home"
            title="Homes available now."
            body="Vacant homes listed by property managers on RentRewards. More are added as they become available."
          />
        </div>
        {listings.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">
            No homes are listed right now. Check back soon.
          </div>
        ) : (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {listings.map((listing) => (
              <article key={listing.id} className="flex flex-col rounded-2xl border border-line bg-canvas p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="rounded-full bg-brand/10 px-2.5 py-1 text-2xs font-medium text-brand">{humanise(listing.unitType)}</span>
                  <span className="text-2xs text-faint">From {listing.availableFrom.toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}</span>
                </div>
                <h3 className="mt-3 text-base font-semibold leading-snug text-ink">{listing.headline}</h3>
                <p className="mt-1 text-sm text-muted">
                  {[listing.area, listing.bedrooms > 0 ? `${listing.bedrooms} bed` : null, `${listing.bathrooms} bath`]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <p className="mt-auto pt-4 text-lg font-semibold tabular-nums text-ink">
                  {formatKES(listing.askingRent)}
                  <span className="text-sm font-normal text-muted"> / month</span>
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function Steps() {
  const steps = [
    { title: 'Add your properties', body: 'Landlords, buildings and units, with a spreadsheet upload for the units.' },
    { title: 'Bring in your tenants', body: 'Add tenants and leases, then invite them to their own portal.' },
    { title: 'Collect and relax', body: 'Bill each month, let M-Pesa payments match themselves, and pay owners on time.' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <SectionHeading eyebrow="Getting started" title="Up and running in three steps." />
      <ol className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title} className="rounded-2xl border border-line bg-surface p-6">
            <span className="text-3xl font-semibold tabular-nums text-brand">0{index + 1}</span>
            <p className="mt-3 text-base font-semibold text-ink">{step.title}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-t border-line">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
        <SectionHeading eyebrow="FAQ" title="Questions people ask." />
        <div className="divide-y divide-line rounded-2xl border border-line bg-surface">
          {FAQS.map((faq) => (
            <details key={faq.q} className="group px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink">
                {faq.q}
                <Plus className="h-4 w-4 shrink-0 text-muted group-open:hidden" aria-hidden />
                <Minus className="hidden h-4 w-4 shrink-0 text-brand group-open:block" aria-hidden />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-muted">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function Demo() {
  return (
    <section id="demo" className="scroll-mt-20 border-y border-nav-line bg-nav bg-[radial-gradient(ellipse_at_bottom_left,rgba(52,199,145,0.14),transparent_55%)] text-nav-ink">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-2">
        <SectionHeading
          invert
          eyebrow="Request a demo"
          title="See RentRewards on your own buildings."
          body="Tell us a little about your portfolio and we’ll walk you through it: collections, owner statements, the tenant portal and the Rental Passport."
        />
        <div data-theme="dark" className="rounded-2xl border border-nav-line bg-nav-raised/60 p-6 text-ink">
          <ActionForm action={requestDemoAction} label="Request a demo" pendingLabel="Sending…">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-muted">
                Your name
                <input name="name" className="field mt-1" autoComplete="name" required />
              </label>
              <label className="block text-xs font-medium text-muted">
                Company
                <input name="company" className="field mt-1" autoComplete="organization" />
              </label>
              <label className="block text-xs font-medium text-muted">
                Phone
                <input name="phone" type="tel" className="field mt-1" autoComplete="tel" placeholder="0712 345 678" />
              </label>
              <label className="block text-xs font-medium text-muted">
                Email
                <input name="email" type="email" className="field mt-1" autoComplete="email" />
              </label>
              <label className="block text-xs font-medium text-muted sm:col-span-2">
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

function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2.5">
          <BrandBadge size="sm" />
          <span className="font-semibold text-ink">RentRewards</span>
          <span className="text-faint">· Nairobi, Kenya</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#passport" className="hover:text-ink">Rental Passport</a>
          <a href="#homes" className="hover:text-ink">Find a home</a>
          <Link href="/login" className="hover:text-ink">Sign in</Link>
          <Link href="/tenant/register" className="hover:text-ink">Tenant activation</Link>
        </nav>
      </div>
    </footer>
  )
}

export function LandingPage({ listings }: { listings: PublicListing[] }) {
  return (
    <div className="min-h-screen bg-canvas">
      <Header />
      <main>
        <Hero />
        <BeforeAfter />
        <Features />
        <TenantsBand />
        <Passport />
        <Homes listings={listings} />
        <Steps />
        <Faq />
        <Demo />
      </main>
      <Footer />
    </div>
  )
}
