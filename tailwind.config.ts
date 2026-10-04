import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        raised: 'rgb(var(--raised) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        brand: {
          DEFAULT: 'rgb(var(--brand) / <alpha-value>)',
          soft: 'rgb(var(--brand-soft) / <alpha-value>)',
          ink: 'rgb(var(--brand-ink) / <alpha-value>)',
          /* The RentRewards logo colours. Identity only — never text on a
             light surface, where lime falls far below readable contrast. */
          navy: 'rgb(var(--brand-navy) / <alpha-value>)',
          lime: 'rgb(var(--brand-lime) / <alpha-value>)',
        },
        /* The navigation rail and the dark panels. Fixed dark surfaces in
           both themes, so they carry their own ink and line steps. */
        nav: {
          DEFAULT: 'rgb(var(--nav) / <alpha-value>)',
          raised: 'rgb(var(--nav-raised) / <alpha-value>)',
          ink: 'rgb(var(--nav-ink) / <alpha-value>)',
          muted: 'rgb(var(--nav-muted) / <alpha-value>)',
          line: 'rgb(var(--nav-line) / <alpha-value>)',
        },
        panel: 'rgb(var(--panel) / <alpha-value>)',
        positive: 'rgb(var(--positive) / <alpha-value>)',
        warning: 'rgb(var(--warning) / <alpha-value>)',
        negative: 'rgb(var(--negative) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      spacing: {
        /* Used across the topbar and tiles. Tailwind's default scale jumps
           from 4 to 5, and a class it does not know renders as nothing. */
        '4.5': '1.125rem',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.04), 0 1px 3px rgb(15 23 42 / 0.06)',
        pop: '0 12px 32px -8px rgb(15 23 42 / 0.18)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
}

export default config
