import clsx from 'clsx'

// ===========================================================================
//  RentRewards brand marks.
//
//  The mark is vector geometry rather than the supplied PNG: the original is
//  438x154 with the navy baked into it, which would show as a dark rectangle
//  on a light surface and blur on a retina screen. This path was measured off
//  that artwork — 45-degree edges and two circles, fitted to a fifth of a
//  pixel — so it is the same mark, sharp at any size and free to take its
//  colour from the theme.
//
//  The original file is kept at public/brand/rentrewards-logo.png.
// ===========================================================================

/** The mark alone, inheriting `currentColor`. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden focusable="false">
      <path d="M0.0 0.0L64.882 0.0A43.713 43.713 0 0 1 100.728 44.868L100.728 50.147L74.985 50.147L74.985 43.324A21.316 21.316 0 0 0 53.669 24.985L24.985 24.985ZM0.0 36.838L36.838 36.838L100.0 100.0L62.088 100.0Z" fill="currentColor" />
    </svg>
  )
}

/**
 * The mark in its own navy badge, which is how the logo is drawn: lime on
 * navy. Keeping the badge means the mark never sits lime-on-white, where it
 * would all but disappear.
 */
export function BrandBadge({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const box = size === 'sm' ? 'h-8 w-8 rounded-lg' : size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-9 w-9 rounded-lg'
  const mark = size === 'sm' ? 'h-4 w-4' : size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'
  return (
    <span className={clsx('grid shrink-0 place-items-center bg-brand-navy', box, className)}>
      <BrandMark className={clsx('text-brand-lime', mark)} />
    </span>
  )
}

/**
 * Badge plus wordmark. The wordmark is live text, not an image, so it stays
 * sharp, recolours itself in dark mode and is read aloud by a screen reader.
 */
export function BrandLockup({
  size = 'md',
  subtitle,
  className,
}: {
  size?: 'sm' | 'md' | 'lg'
  subtitle?: string
  className?: string
}) {
  const name = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base'
  return (
    <span className={clsx('flex min-w-0 items-center gap-2.5', className)}>
      <BrandBadge size={size} />
      <span className="min-w-0">
        <span className={clsx('block truncate font-semibold leading-tight tracking-tight text-ink', name)}>
          RentRewards
        </span>
        {subtitle && <span className="block truncate text-xs leading-tight text-faint">{subtitle}</span>}
      </span>
    </span>
  )
}
