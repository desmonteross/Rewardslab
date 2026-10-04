'use client'

// ===========================================================================
//  Theme control
//
//  Previously a button that cycled system → light → dark with nothing on
//  screen to say so. On a machine set to light — which is most of them — the
//  first press moved from "system" to "light" and changed not one pixel, so
//  it read as a dead button and the setting read as unavailable.
//
//  A menu instead: the three options are visible, the current one is ticked,
//  and choosing one is a single decision rather than a guess about how many
//  more times to press.
// ===========================================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Check, Monitor, Moon, Sun } from 'lucide-react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'system', label: 'Match system', icon: Monitor },
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
]

const STORAGE_KEY = 'pms-theme'

export function ThemeMenu({ align = 'right' }: { align?: 'left' | 'right' }) {
  const [theme, setTheme] = useState<ThemeChoice>('system')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // The stored choice is applied before first paint by the inline script in
  // the root layout; this only brings React's copy into line with it.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'dark' || stored === 'light') setTheme(stored)
    } catch {
      /* private mode — the default stands */
    }
  }, [])

  useEffect(() => {
    if (!open) return
    function onClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const apply = useCallback((next: ThemeChoice) => {
    setTheme(next)
    setOpen(false)
    try {
      if (next === 'system') {
        localStorage.removeItem(STORAGE_KEY)
        document.documentElement.removeAttribute('data-theme')
      } else {
        localStorage.setItem(STORAGE_KEY, next)
        document.documentElement.setAttribute('data-theme', next)
      }
    } catch {
      // Storage is unavailable, but the attribute still applies for this
      // visit — a theme that does not persist beats one that never applies.
      if (next === 'system') document.documentElement.removeAttribute('data-theme')
      else document.documentElement.setAttribute('data-theme', next)
    }
  }, [])

  const current = OPTIONS.find((option) => option.value === theme) ?? OPTIONS[0]
  const Glyph = current.icon

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="btn-ghost px-2"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Appearance: ${current.label}`}
        title={`Appearance: ${current.label}`}
      >
        <Glyph className="h-4.5 w-4.5" aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={clsx(
            'absolute top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface shadow-pop',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <p className="border-b border-line px-3 py-2 text-2xs font-medium uppercase tracking-wide text-faint">
            Appearance
          </p>
          <div className="p-1.5">
            {OPTIONS.map((option) => {
              const Icon = option.icon
              const selected = option.value === theme
              return (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  onClick={() => apply(option.value)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                    selected ? 'bg-brand-soft text-brand-ink' : 'text-muted hover:bg-canvas hover:text-ink',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden />
                  <span className="flex-1">{option.label}</span>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
