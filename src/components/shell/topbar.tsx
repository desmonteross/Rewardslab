'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Bell, Check, ChevronDown, LogOut, Menu, Search } from 'lucide-react'
import { ALL_NAV_ITEMS } from '@/components/nav'
import { ThemeMenu } from '@/components/theme-menu'

export interface TopbarNotification {
  id: string
  title: string
  body: string
  createdAt: string
  unread: boolean
}

interface SearchHit {
  type: string
  label: string
  detail: string
  href: string
}

export function Topbar({
  userName,
  userRole,
  organizationName,
  permissions,
  notifications,
  unreadCount,
  onOpenMobileNav,
  logout,
}: {
  userName: string
  userRole: string
  organizationName: string
  permissions: string[]
  notifications: TopbarNotification[]
  unreadCount: number
  onOpenMobileNav: () => void
  logout: () => Promise<void>
}) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
      if (event.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-surface/85 px-3 backdrop-blur sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="btn-ghost -ml-1.5 px-2 lg:hidden"
          aria-label="Open navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          /*
            `min-w-0` is what stops the whole page scrolling sideways on a
            phone: a flex item's minimum width defaults to its content, so
            without it this button refuses to shrink below the width of its
            own label and pushes the user menu off the screen.
          */
          className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-canvas px-3 text-sm text-faint transition-colors hover:border-brand/40 sm:max-w-md"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">
            <span className="sm:hidden">Search…</span>
            <span className="hidden sm:inline">Search properties, tenants, invoices…</span>
          </span>
          <kbd className="ml-auto hidden rounded border border-line bg-surface px-1.5 py-0.5 text-2xs text-faint sm:inline">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ThemeMenu />
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
          <UserMenu
            userName={userName}
            userRole={userRole}
            organizationName={organizationName}
            showSettings={permissions.includes('*') || permissions.includes('settings.view')}
            logout={logout}
          />
        </div>
      </header>

      {paletteOpen && <CommandPalette permissions={permissions} onClose={() => setPaletteOpen(false)} />}
    </>
  )
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: TopbarNotification[]
  unreadCount: number
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn-ghost relative px-2"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
      >
        <Bell className="h-4.5 w-4.5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-negative px-1 text-2xs font-medium text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <Link href="/notifications" className="text-xs text-brand hover:underline">
              View all
            </Link>
          </div>
          {notifications.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Nothing new right now.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className="border-b border-line/70 px-4 py-3 last:border-0 hover:bg-canvas"
                >
                  <div className="flex items-start gap-2">
                    {notification.unread && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ink">{notification.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">
                        {notification.body}
                      </p>
                      <p className="mt-1 text-2xs text-faint">{notification.createdAt}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function UserMenu({
  userName,
  userRole,
  organizationName,
  showSettings,
  logout,
}: {
  userName: string
  userRole: string
  organizationName: string
  showSettings: boolean
  logout: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const initials = userName
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join('')
    .toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-canvas"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand/10 text-2xs font-semibold text-brand">
          {initials}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-xs font-medium leading-tight text-ink">{userName}</span>
          <span className="block text-2xs leading-tight text-faint">{userRole}</span>
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-faint" aria-hidden />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-60 overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-medium text-ink">{userName}</p>
            <p className="truncate text-xs text-muted">{organizationName}</p>
            <p className="mt-1 text-2xs text-faint">{userRole}</p>
          </div>
          <div className="p-1.5">
            {showSettings && (
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="block rounded-lg px-2.5 py-2 text-sm text-muted hover:bg-canvas hover:text-ink"
            >
              Settings
            </Link>
            )}
            <form action={logout}>
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-muted hover:bg-canvas hover:text-ink"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Sign out
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function CommandPalette({ permissions, onClose }: { permissions: string[]; onClose: () => void }) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)

  const allowed = (permission: string) => permissions.includes('*') || permissions.includes(permission)
  const pages = ALL_NAV_ITEMS.filter(
    (item) => allowed(item.permission) && item.label.toLowerCase().includes(query.toLowerCase()),
  ).slice(0, 6)

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await fetch(`/api/v1/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (response.ok) {
          const payload = (await response.json()) as { data: SearchHit[] }
          setHits(payload.data ?? [])
        }
      } catch {
        /* aborted or offline — leave the previous results */
      } finally {
        setLoading(false)
      }
    }, 180)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const results: SearchHit[] = [
    ...pages.map((page) => ({
      type: 'Page',
      label: page.label,
      detail: page.href,
      href: page.href,
    })),
    ...hits,
  ]

  function go(index: number) {
    const target = results[index]
    if (!target) return
    onClose()
    router.push(target.href)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]">
      <div
        className="absolute inset-0"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden />
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCursor((value) => Math.min(value + 1, results.length - 1))
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCursor((value) => Math.max(value - 1, 0))
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                go(cursor)
              }
            }}
            placeholder="Search pages, properties, tenants, invoices, payments…"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
          {loading && <span className="text-2xs text-faint">Searching…</span>}
        </div>

        {results.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted">
            {query.trim().length < 2 ? 'Start typing to search.' : 'No matches.'}
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1.5">
            {results.map((result, index) => (
              <li key={`${result.type}-${result.href}-${index}`}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(index)}
                  className={clsx(
                    'flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm',
                    index === cursor ? 'bg-brand/10 text-ink' : 'text-muted hover:bg-canvas',
                  )}
                >
                  <span className="w-20 shrink-0 text-2xs uppercase tracking-wide text-faint">
                    {result.type}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{result.label}</span>
                  <span className="hidden shrink-0 truncate text-xs text-faint sm:block">
                    {result.detail}
                  </span>
                  {index === cursor && <Check className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between border-t border-line px-4 py-2 text-2xs text-faint">
          <span>↑↓ to navigate · ↵ to open · esc to close</span>
          <span>Scoped to {`your organization`}</span>
        </div>
      </div>
    </div>
  )
}
