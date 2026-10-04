'use client'

// ===========================================================================
//  The tenant portal shell.
//
//  A navigation rail, like the staff side, because the portal now has more
//  than four places to go: rent, history, receipts, statements, repairs, the
//  lease, points and announcements. On a phone the rail becomes a drawer —
//  the same navigation, not a reduced one, because a tenant is more likely to
//  be on a phone than at a desk and should not get the lesser product there.
// ===========================================================================

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import type { ReactNode } from 'react'
import {
  Bell,
  CircleHelp,
  FileText,
  Gift,
  Home,
  LogOut,
  Menu,
  ReceiptText,
  ScrollText,
  Smartphone,
  User,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import { BrandBadge } from '@/components/brand'
import { ThemeMenu } from '@/components/theme-menu'

export interface PortalNavCounts {
  maintenance: number
  notifications: number
}

const NAV = [
  { href: '/portal', label: 'Home', icon: Home, exact: true },
  { href: '/portal/pay', label: 'Rent & payments', icon: Wallet },
  { href: '/portal/payments', label: 'Payment history', icon: FileText },
  { href: '/portal/receipts', label: 'Receipts', icon: ReceiptText },
  { href: '/portal/statements', label: 'Statements', icon: ScrollText },
  { href: '/portal/maintenance', label: 'Maintenance', icon: Wrench, badge: 'maintenance' as const },
  { href: '/portal/lease', label: 'My lease', icon: Smartphone },
  { href: '/portal/rewards', label: 'Rewards', icon: Gift },
  { href: '/portal/record', label: 'My record', icon: User },
  {
    href: '/portal/notifications',
    label: 'Notifications',
    icon: Bell,
    badge: 'notifications' as const,
  },
  { href: '/portal/help', label: 'Help & support', icon: CircleHelp },
]

export function PortalShell({
  children,
  platformName,
  organizationName,
  tenantName,
  unitLabel,
  counts,
  logout,
}: {
  children: ReactNode
  platformName: string
  organizationName: string
  tenantName: string
  unitLabel: string | null
  counts: PortalNavCounts
  logout: () => Promise<void>
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // A navigation click should close the drawer, or the tenant lands on the
  // new page with the old menu still covering it.
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  const isActive = (item: (typeof NAV)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href)

  const initials = tenantName
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()

  const rail = (
    <>
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-nav-line px-4">
        <BrandBadge size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-nav-ink">{platformName}</p>
          <p className="truncate text-2xs leading-tight text-nav-muted">{organizationName}</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg p-1 text-nav-muted hover:text-nav-ink lg:hidden"
          aria-label="Close navigation"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Portal">
        <ul className="space-y-0.5">
          {NAV.map((item) => {
            const active = isActive(item)
            const count = item.badge ? counts[item.badge] : 0
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                    active
                      ? 'bg-brand/20 font-medium text-white'
                      : 'text-nav-muted hover:bg-white/5 hover:text-nav-ink',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {count > 0 && (
                    <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-negative px-1.5 text-2xs font-medium text-white">
                      {count > 9 ? '9+' : count}
                    </span>
                  )}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-nav-line p-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/25 text-2xs font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium leading-tight text-nav-ink">{tenantName}</p>
            <p className="truncate text-2xs leading-tight text-nav-muted">
              {unitLabel ?? 'Tenant'}
            </p>
          </div>
        </div>
      </div>
    </>
  )

  return (
    <div className="flex min-h-screen bg-canvas">
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-nav-line bg-nav text-nav-ink transition-transform duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        {rail}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn-ghost -ml-1.5 px-2 lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{tenantName}</p>
            <p className="truncate text-2xs text-faint">{unitLabel ?? organizationName}</p>
          </div>

          {/* Tenants had no way to change the theme at all — the control only
              existed on the staff topbar. */}
          <ThemeMenu />

          <Link
            href="/portal/notifications"
            className="btn-ghost relative shrink-0 px-2"
            aria-label={
              counts.notifications > 0
                ? `Notifications, ${counts.notifications} unread`
                : 'Notifications'
            }
          >
            <Bell className="h-4.5 w-4.5" aria-hidden />
            {counts.notifications > 0 && (
              <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-negative px-1 text-2xs font-medium text-white">
                {counts.notifications > 9 ? '9+' : counts.notifications}
              </span>
            )}
          </Link>

          <form action={logout} className="shrink-0">
            <button type="submit" className="btn-ghost px-2.5" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </form>
        </header>

        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8">{children}</main>

        <footer className="px-4 pb-6 text-xs text-faint sm:px-6 lg:px-8">
          {platformName} · demonstration environment. M-Pesa runs against a mock provider — no real
          payment is taken here.
        </footer>
      </div>
    </div>
  )
}
