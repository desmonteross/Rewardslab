'use client'

// ===========================================================================
//  Filter bar
//
//  Filters live in the URL, not in component state: a filtered view is
//  shareable, bookmarkable, survives a refresh, and the server does the
//  filtering so a 10,000-row table never reaches the browser.
// ===========================================================================

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Search, X } from 'lucide-react'
import clsx from 'clsx'

export interface FilterOption {
  value: string
  label: string
}

export interface SelectFilter {
  name: string
  label: string
  options: FilterOption[]
  width?: string
}

export function FilterBar({
  selects = [],
  searchPlaceholder = 'Search…',
  showSearch = true,
  children,
}: {
  selects?: SelectFilter[]
  searchPlaceholder?: string
  showSearch?: boolean
  children?: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [pending, startTransition] = useTransition()
  const [query, setQuery] = useState(params.get('q') ?? '')

  useEffect(() => {
    setQuery(params.get('q') ?? '')
  }, [params])

  function apply(next: URLSearchParams) {
    next.delete('page')
    startTransition(() => {
      const qs = next.toString()
      router.push(qs ? `${pathname}?${qs}` : pathname)
    })
  }

  function setParam(name: string, value: string) {
    const next = new URLSearchParams(params.toString())
    if (value) next.set(name, value)
    else next.delete(name)
    apply(next)
  }

  function onSearch(event: React.FormEvent) {
    event.preventDefault()
    setParam('q', query.trim())
  }

  const active = Array.from(params.keys()).filter((key) => key !== 'page' && params.get(key))

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {showSearch && (
        <form onSubmit={onSearch} className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="field pl-9"
          />
        </form>
      )}

      {selects.map((select) => (
        <label key={select.name} className="sr-only-label">
          <span className="sr-only">{select.label}</span>
          <select
            value={params.get(select.name) ?? ''}
            onChange={(event) => setParam(select.name, event.target.value)}
            className={clsx('field py-2 text-sm', select.width ?? 'w-auto min-w-[9rem]')}
          >
            <option value="">{select.label}</option>
            {select.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {children}

      {active.length > 0 && (
        <button
          type="button"
          onClick={() => apply(new URLSearchParams())}
          className="btn-ghost gap-1.5 px-2 text-xs"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}

      {pending && <span className="text-xs text-faint">Updating…</span>}
    </div>
  )
}

/** Small segmented control for a handful of mutually exclusive views. */
export function ViewSwitch({
  name,
  options,
  fallback,
}: {
  name: string
  options: FilterOption[]
  fallback: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const current = params.get(name) ?? fallback

  return (
    <div className="inline-flex rounded-lg border border-line bg-raised p-0.5">
      {options.map((option) => {
        const active = option.value === current
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              const next = new URLSearchParams(params.toString())
              if (option.value === fallback) next.delete(name)
              else next.set(name, option.value)
              const qs = next.toString()
              router.push(qs ? `${pathname}?${qs}` : pathname)
            }}
            className={clsx(
              'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              active ? 'bg-brand text-white' : 'text-muted hover:text-ink',
            )}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
