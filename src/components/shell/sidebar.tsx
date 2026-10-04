'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import clsx from 'clsx'
import * as Icons from 'lucide-react'
import { NAVIGATION, type NavSection } from '@/components/nav'
import { BrandBadge } from '@/components/brand'

function Icon({ name, className }: { name: string; className?: string }) {
  const Resolved = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle
  return <Resolved className={className} aria-hidden />
}

export function Sidebar({
  sections,
  organizationName,
  platformName,
  mobileOpen,
  onCloseMobile,
}: {
  sections: NavSection[]
  organizationName: string
  platformName: string
  mobileOpen: boolean
  onCloseMobile: () => void
}) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('pms-sidebar') === 'collapsed')
    } catch {
      /* private mode — keep the default */
    }
  }, [])

  function toggle() {
    setCollapsed((previous) => {
      const next = !previous
      try {
        localStorage.setItem('pms-sidebar', next ? 'collapsed' : 'expanded')
      } catch {
        /* nothing to persist to */
      }
      return next
    })
  }

  // The most specific matching item wins, so /help/faq lights FAQs and not
  // Guides (/help) as well.
  const matches = (href: string) => pathname === href || pathname.startsWith(`${href}/`)
  const activeHref = sections
    .flatMap((section) => section.items.map((item) => item.href))
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0]
  const isActive = (href: string) => href === activeHref

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onCloseMobile}
          aria-hidden
        />
      )}

      <aside
        className={clsx(
          /* A fixed dark rail in both themes — the navigation is chrome, not
             content, and holding it constant keeps the eye on the figures. */
          'fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col border-r border-nav-line bg-nav text-nav-ink transition-[width,transform] duration-200 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0',
          collapsed ? 'w-[4.25rem]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-nav-line px-4">
          <BrandBadge size="sm" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold leading-tight text-nav-ink">{platformName}</p>
              <p className="truncate text-2xs leading-tight text-nav-muted">{organizationName}</p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-3" aria-label="Main">
          {sections.map((section, index) => (
            <div key={section.label ?? `section-${index}`} className="mb-3 last:mb-0">
              {section.label && !collapsed && (
                <p className="px-3 pb-1.5 pt-3 text-xs text-nav-muted">
                  {section.label}
                </p>
              )}
              {section.label && collapsed && index > 0 && <hr className="mx-2 my-2 border-nav-line" />}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onCloseMobile}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? item.label : undefined}
                        className={clsx(
                          'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors',
                          collapsed && 'justify-center',
                          active
                            ? 'bg-nav-raised font-medium text-nav-accent'
                            : 'text-nav-ink hover:bg-nav-raised/60 hover:text-white',
                        )}
                      >
                        <Icon name={item.icon} className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-nav-line p-2.5">
          <button
            type="button"
            onClick={toggle}
            className={clsx(
              'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-nav-muted transition-colors hover:bg-nav-raised/60 hover:text-nav-ink',
              collapsed && 'justify-center',
            )}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <Icons.PanelLeftOpen className="h-4 w-4" aria-hidden />
            ) : (
              <>
                <Icons.PanelLeftClose className="h-4 w-4" aria-hidden />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  )
}

export { NAVIGATION }
