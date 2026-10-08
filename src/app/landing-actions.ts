'use server'

import type { ActionState } from '@/components/action-form'

/**
 * Demo request from the public landing page.
 *
 * PROTOTYPE: the request is checked and acknowledged but not stored yet. The
 * agreed next step is a demo_requests table shown on the platform admin's
 * /admin screen.
 */
export async function requestDemoAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const name = String(formData.get('name') ?? '').trim()
  const phone = String(formData.get('phone') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  if (!name) return { ok: false, message: 'Tell us your name.' }
  if (!phone && !email) return { ok: false, message: 'Give a phone number or an email so we can reach you.' }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: 'That email address does not look right.' }
  const first = name.split(/\s+/)[0]
  return { ok: true, message: `Thanks, ${first}. We'll be in touch on ${phone || email} to set up your demo.` }
}
