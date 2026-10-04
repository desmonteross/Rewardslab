export type SearchParams = Record<string, string | string[] | undefined>
export type SearchParamsPromise = Promise<SearchParams>

export function one(params: SearchParams, key: string): string | undefined {
  const value = params[key]
  if (Array.isArray(value)) return value[0]
  return value && value.length > 0 ? value : undefined
}

export function pageOf(params: SearchParams, fallback = 1): number {
  const raw = Number(one(params, 'page') ?? fallback)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback
}

/** Build a href that keeps the current filters and changes only some keys. */
export function withParams(
  pathname: string,
  params: SearchParams,
  overrides: Record<string, string | number | undefined>,
): string {
  const next = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    next.set(key, Array.isArray(value) ? value[0] : value)
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined || value === '') next.delete(key)
    else next.set(key, String(value))
  }
  const qs = next.toString()
  return qs ? `${pathname}?${qs}` : pathname
}

export const PAGE_SIZE = 25
