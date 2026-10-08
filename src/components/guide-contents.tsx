'use client'

import { useEffect, useState } from 'react'
import clsx from 'clsx'

/**
 * The "On this page" list on the Guides page. The chosen entry is shaded, and
 * the shading follows along as the reader scrolls through the sections.
 */
export function GuideContents({ entries }: { entries: { id: string; label: string }[] }) {
  const [active, setActive] = useState(entries[0]?.id ?? '')

  useEffect(() => {
    const fromHash = window.location.hash.slice(1)
    if (entries.some((entry) => entry.id === fromHash)) setActive(fromHash)

    const sections = entries
      .map((entry) => document.getElementById(entry.id))
      .filter((element): element is HTMLElement => Boolean(element))

    // A section counts as current once its heading passes the top third of
    // the screen; the last one that has done so wins.
    const observer = new IntersectionObserver(
      () => {
        const line = window.innerHeight / 3
        let current = sections[0]?.id
        for (const section of sections) {
          if (section.getBoundingClientRect().top <= line) current = section.id
        }
        if (current) setActive(current)
      },
      { rootMargin: '0px 0px -66% 0px', threshold: [0, 1] },
    )
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [entries])

  return (
    <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start">
      <p className="label mb-2">On this page</p>
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
        {entries.map((entry) => (
          <li key={entry.id}>
            <a
              href={`#${entry.id}`}
              onClick={() => setActive(entry.id)}
              aria-current={active === entry.id ? 'location' : undefined}
              className={clsx(
                'block rounded-lg px-2.5 py-1.5 text-sm transition-colors',
                active === entry.id
                  ? 'bg-ink/10 font-medium text-ink'
                  : 'text-muted hover:bg-ink/5 hover:text-ink',
              )}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
