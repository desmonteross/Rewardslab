import { NextResponse } from 'next/server'

/** GET /units/add?property=… — the Units page's "Add units" picker lands here. */
export function GET(request: Request) {
  const url = new URL(request.url)
  const property = url.searchParams.get('property')
  const target = property ? `/properties/${encodeURIComponent(property)}?tab=units` : '/units'
  return NextResponse.redirect(new URL(target, url))
}
