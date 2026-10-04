// ===========================================================================
//  Notifications — console provider (Phase 1)
//
//  Writes rent reminders, receipts and maintenance updates to the server log
//  and returns a provider reference, so the notification pipeline is exercised
//  without an SMS or email bill. Swap in an Africa's Talking / Twilio / SES
//  adapter behind the same interface when going live.
// ===========================================================================

import { randomInt } from 'node:crypto'
import type { NotificationMessage, NotificationProvider, ProviderInfo } from '../types'

export class ConsoleNotificationProvider implements NotificationProvider {
  info(): ProviderInfo {
    return {
      key: 'console',
      name: 'Console (Development)',
      mode: 'mock',
      notice: 'Messages are written to the server log — no SMS or email is actually delivered.',
    }
  }

  async send(message: NotificationMessage) {
    const providerRef = `LOG-${Date.now().toString(36)}-${randomInt(100, 999)}`
    const subject = message.subject ? ` [${message.subject}]` : ''
    console.info(`[notification:${message.channel}] → ${message.to}${subject}\n${message.body}\n`)
    return { success: true, providerRef, message: 'Logged to the server console.' }
  }
}
