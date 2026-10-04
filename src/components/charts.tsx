'use client'

// ===========================================================================
//  Chart primitives
//
//  Colour comes from the CSS custom properties defined in globals.css, read at
//  runtime, so light and dark are each their own selected steps rather than an
//  automatic inversion — and a theme change repaints without a reload.
//
//  House rules applied here: one y-axis ever, thin marks, 4px rounded data-ends
//  anchored to the baseline, 2px lines, a 2px surface gap between adjacent
//  bars, recessive grid and axes, a legend whenever there are two or more
//  series, and a hover tooltip on every plot.
// ===========================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { compactKES, formatKES } from '@/lib/money'

// ---------------------------------------------------------------------------
// Theme tokens
// ---------------------------------------------------------------------------

interface Tokens {
  series: string[]
  /** De-emphasis fill for a context series that must not compete with the data. */
  seriesMuted: string
  grid: string
  axis: string
  muted: string
  ink: string
  surface: string
  line: string
  positive: string
  negative: string
  warning: string
}

const FALLBACK: Tokens = {
  series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  seriesMuted: '#d6d5cc',
  grid: '#e1e0d9',
  axis: '#c3c2b7',
  muted: '#52514e',
  ink: '#0b0b0b',
  surface: '#fcfcfb',
  line: '#e1e0d9',
  positive: '#0ca30c',
  negative: '#d03b3b',
  warning: '#fab219',
}

function readTokens(): Tokens {
  if (typeof window === 'undefined') return FALLBACK
  const style = getComputedStyle(document.documentElement)
  const rgb = (name: string, fallback: string) => {
    const value = style.getPropertyValue(name).trim()
    return value ? `rgb(${value})` : fallback
  }
  return {
    series: [
      rgb('--series-1', FALLBACK.series[0]),
      rgb('--series-2', FALLBACK.series[1]),
      rgb('--series-3', FALLBACK.series[2]),
      rgb('--series-4', FALLBACK.series[3]),
    ],
    seriesMuted: rgb('--series-muted', FALLBACK.seriesMuted),
    grid: rgb('--grid', FALLBACK.grid),
    axis: rgb('--axis', FALLBACK.axis),
    muted: rgb('--muted', FALLBACK.muted),
    ink: rgb('--ink', FALLBACK.ink),
    surface: rgb('--surface', FALLBACK.surface),
    line: rgb('--line', FALLBACK.line),
    positive: rgb('--positive', FALLBACK.positive),
    negative: rgb('--negative', FALLBACK.negative),
    warning: rgb('--warning', FALLBACK.warning),
  }
}

function useTokens(): Tokens {
  const [tokens, setTokens] = useState<Tokens>(FALLBACK)

  useEffect(() => {
    const update = () => setTokens(readTokens())
    update()

    const observer = new MutationObserver(update)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', update)

    return () => {
      observer.disconnect()
      media.removeEventListener('change', update)
    }
  }, [])

  return tokens
}

// ---------------------------------------------------------------------------
// Shared chrome
// ---------------------------------------------------------------------------

const AXIS_FONT = 11

function Tip({
  active,
  payload,
  label,
  formatter,
  tokens,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[]
  label?: string | number
  formatter: (value: number) => string
  tokens: Tokens
}) {
  if (!active || !payload?.length) return null
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-pop"
      style={{ background: tokens.surface, borderColor: tokens.line }}
    >
      <p className="mb-1 font-medium" style={{ color: tokens.ink }}>
        {label}
      </p>
      <ul className="space-y-0.5">
        {payload.map((entry, index) => (
          <li key={`${entry.dataKey}-${index}`} className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-2 w-2 shrink-0 rounded-[2px]"
              style={{ background: entry.color }}
            />
            <span style={{ color: tokens.muted }}>{entry.name}</span>
            <span className="ml-auto pl-3 font-medium tabular-nums" style={{ color: tokens.ink }}>
              {typeof entry.value === 'number' ? formatter(entry.value) : entry.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function legendStyle(tokens: Tokens) {
  return { fontSize: 11, color: tokens.muted, paddingTop: 8 }
}

export function ChartFrame({ height = 260, children }: { height?: number; children: React.ReactNode }) {
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Expected vs collected — the collected series is the point, expected is the
// context it is read against, so expected is de-emphasised rather than made a
// competing colour.
// ---------------------------------------------------------------------------

export interface CollectionPoint {
  period: string
  expected: number
  collected: number
}

export function CollectionBars({ data, height = 280 }: { data: CollectionPoint[]; height?: number }) {
  const tokens = useTokens()

  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={tokens.grid} strokeDasharray="0" />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={{ stroke: tokens.axis }}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          dy={4}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={62}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          tickFormatter={(value: number) => compactKES(value, { currency: false })}
        />
        <Tooltip
          cursor={{ fill: tokens.grid, opacity: 0.35 }}
          content={<Tip formatter={(value) => formatKES(value)} tokens={tokens} />}
        />
        <Legend wrapperStyle={legendStyle(tokens)} iconType="square" iconSize={9} />
        <Bar
          dataKey="expected"
          name="Expected"
          fill={tokens.seriesMuted}
          radius={[4, 4, 0, 0]}
          maxBarSize={26}
        />
        <Bar
          dataKey="collected"
          name="Collected"
          fill={tokens.series[0]}
          radius={[4, 4, 0, 0]}
          maxBarSize={26}
        />
      </BarChart>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------
// Single-series trends
// ---------------------------------------------------------------------------

export interface TrendPoint {
  period: string
  value: number
}

export function TrendLine({
  data,
  height = 240,
  unit = 'percent',
  name = 'Value',
  tone = 'brand',
  domain,
}: {
  data: TrendPoint[]
  height?: number
  unit?: 'percent' | 'money' | 'count'
  name?: string
  tone?: 'brand' | 'positive' | 'negative' | 'warning'
  domain?: [number, number]
}) {
  const tokens = useTokens()
  const colour =
    tone === 'positive'
      ? tokens.positive
      : tone === 'negative'
        ? tokens.negative
        : tone === 'warning'
          ? tokens.warning
          : tokens.series[0]

  const format = useMemo(
    () =>
      unit === 'percent'
        ? (value: number) => `${value.toFixed(1)}%`
        : unit === 'money'
          ? (value: number) => formatKES(value)
          : (value: number) => value.toLocaleString(),
    [unit],
  )

  const axisFormat =
    unit === 'percent'
      ? (value: number) => `${value}%`
      : unit === 'money'
        ? (value: number) => compactKES(value, { currency: false })
        : (value: number) => value.toLocaleString()

  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={tokens.grid} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={{ stroke: tokens.axis }}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          dy={4}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={unit === 'money' ? 62 : 52}
          domain={domain ?? ['auto', 'auto']}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          tickFormatter={axisFormat}
        />
        <Tooltip
          cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
          content={<Tip formatter={format} tokens={tokens} />}
        />
        <Line
          type="monotone"
          dataKey="value"
          name={name}
          stroke={colour}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: tokens.surface }}
        />
      </LineChart>
    </ChartFrame>
  )
}

export function AreaTrend({
  data,
  height = 220,
  name = 'Value',
  unit = 'money',
}: {
  data: TrendPoint[]
  height?: number
  name?: string
  unit?: 'money' | 'count'
}) {
  const tokens = useTokens()
  const gradientId = useMemo(() => `area-${Math.random().toString(36).slice(2, 8)}`, [])
  const format = unit === 'money' ? (value: number) => formatKES(value) : (value: number) => value.toLocaleString()

  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tokens.series[0]} stopOpacity={0.22} />
            <stop offset="100%" stopColor={tokens.series[0]} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={tokens.grid} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={{ stroke: tokens.axis }}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          dy={4}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={unit === 'money' ? 62 : 44}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          tickFormatter={(value: number) =>
            unit === 'money' ? compactKES(value, { currency: false }) : value.toLocaleString()
          }
        />
        <Tooltip
          cursor={{ stroke: tokens.axis, strokeWidth: 1 }}
          content={<Tip formatter={format} tokens={tokens} />}
        />
        <Area
          type="monotone"
          dataKey="value"
          name={name}
          stroke={tokens.series[0]}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          activeDot={{ r: 4.5, strokeWidth: 2, stroke: tokens.surface }}
        />
      </AreaChart>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------
// Horizontal comparison — magnitude across named things. One hue, more-is-
// darker, so rank is readable without a legend.
// ---------------------------------------------------------------------------

export interface RankedBar {
  label: string
  value: number
}

const SEQUENTIAL_LIGHT = ['#86b6ef', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95']
const SEQUENTIAL_DARK = ['#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec']

export function RankedBars({
  data,
  height = 260,
  unit = 'money',
}: {
  data: RankedBar[]
  height?: number
  unit?: 'money' | 'percent' | 'count'
}) {
  const tokens = useTokens()
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const check = () => {
      const attr = document.documentElement.getAttribute('data-theme')
      setDark(attr === 'dark' || (attr !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches))
    }
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', check)
    return () => {
      observer.disconnect()
      media.removeEventListener('change', check)
    }
  }, [])

  const ramp = dark ? SEQUENTIAL_DARK : SEQUENTIAL_LIGHT
  const max = Math.max(...data.map((row) => row.value), 1)
  const format =
    unit === 'money'
      ? (value: number) => formatKES(value)
      : unit === 'percent'
        ? (value: number) => `${value.toFixed(1)}%`
        : (value: number) => value.toLocaleString()

  return (
    <ChartFrame height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }} barGap={2}>
        <CartesianGrid horizontal={false} stroke={tokens.grid} />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={{ stroke: tokens.axis }}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          tickFormatter={(value: number) =>
            unit === 'money' ? compactKES(value, { currency: false }) : unit === 'percent' ? `${value}%` : String(value)
          }
        />
        <YAxis
          type="category"
          dataKey="label"
          width={130}
          tickLine={false}
          axisLine={false}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
        />
        <Tooltip
          cursor={{ fill: tokens.grid, opacity: 0.35 }}
          content={<Tip formatter={format} tokens={tokens} />}
        />
        <Bar dataKey="value" name="Value" radius={[0, 4, 4, 0]} maxBarSize={18}>
          {data.map((row, index) => {
            const step = Math.min(ramp.length - 1, Math.round((row.value / max) * (ramp.length - 1)))
            return <Cell key={`${row.label}-${index}`} fill={ramp[step]} />
          })}
        </Bar>
      </BarChart>
    </ChartFrame>
  )
}

// ---------------------------------------------------------------------------
// Stacked composition — part-to-whole across months.
// ---------------------------------------------------------------------------

export interface StackPoint {
  period: string
  [series: string]: string | number
}

export function StackedBars({
  data,
  series,
  height = 260,
  unit = 'money',
}: {
  data: StackPoint[]
  series: { key: string; name: string }[]
  height?: number
  unit?: 'money' | 'count'
}) {
  const tokens = useTokens()
  const format = unit === 'money' ? (value: number) => formatKES(value) : (value: number) => value.toLocaleString()

  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke={tokens.grid} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={{ stroke: tokens.axis }}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          dy={4}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={unit === 'money' ? 62 : 44}
          tick={{ fill: tokens.muted, fontSize: AXIS_FONT }}
          tickFormatter={(value: number) =>
            unit === 'money' ? compactKES(value, { currency: false }) : value.toLocaleString()
          }
        />
        <Tooltip
          cursor={{ fill: tokens.grid, opacity: 0.35 }}
          content={<Tip formatter={format} tokens={tokens} />}
        />
        <Legend wrapperStyle={legendStyle(tokens)} iconType="square" iconSize={9} />
        {series.map((entry, index) => (
          <Bar
            key={entry.key}
            dataKey={entry.key}
            name={entry.name}
            stackId="stack"
            fill={tokens.series[index % tokens.series.length]}
            maxBarSize={28}
            // 2px surface gap between stacked segments.
            stroke={tokens.surface}
            strokeWidth={2}
            radius={index === series.length - 1 ? [4, 4, 0, 0] : undefined}
          />
        ))}
      </BarChart>
    </ChartFrame>
  )
}
