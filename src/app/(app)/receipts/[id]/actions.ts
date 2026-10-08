'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/db'
import { notifications, receipts, tenants, users } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession, scoped } from '@/lib/tenancy'
import { formatKES } from '@/lib/money'
import { getNotificationProvider } from '@/server/adapters'
import type { ActionState } from '@/components/action-form'

/**
 * Send the receipt to the tenant. Phase 1 routes through the console provider,
 * so the message is logged rather than delivered — but the notification row is
 * real, and swapping in an SMS or email adapter needs no change here.
 */
export async function emailReceiptAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const session = await requirePermission('receipts.issue')
    const scope = scopeFromSession(session)
    const receiptId = String(formData.get('receiptId'))
    const channel = String(formData.get('channel') ?? 'EMAIL') as 'EMAIL' | 'SMS'

    const [row] = await db
      .select({ receipt: receipts, tenantName: tenants.fullName, email: tenants.email, phone: tenants.phone })
      .from(receipts)
      .innerJoin(tenants, eq(tenants.id, receipts.tenantId))
      .where(scoped(receipts, scope, eq(receipts.id, receiptId)))
      .limit(1)

    if (!row) return { ok: false, message: 'Receipt not found.' }

    const to = channel === 'EMAIL' ? row.email : row.phone
    if (!to) {
      return {
        ok: false,
        message:
          channel === 'EMAIL'
            ? 'This tenant has no email address on file.'
            : 'This tenant has no phone number on file.',
      }
    }

    const body =
      `Receipt ${row.receipt.number}\n` +
      `${formatKES(row.receipt.amount)} received for ${row.receipt.periodLabel}.\n` +
      `Balance after this payment: ${formatKES(row.receipt.balanceAfter)}.`

    const result = await getNotificationProvider().send({
      channel,
      to,
      subject: `Receipt ${row.receipt.number}`,
      body,
    })

    // Address the row to the tenant's portal login, when they have one, so it
    // also shows on their own Notifications screen.
    const [portalUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(scoped(users, scope, eq(users.tenantId, row.receipt.tenantId)))
      .limit(1)

    await db.insert(notifications).values({
      organizationId: scope.organizationId,
      userId: portalUser?.id ?? null,
      channel,
      status: result.success ? 'SENT' : 'FAILED',
      title: `Receipt ${row.receipt.number} sent to ${row.tenantName}`,
      body,
      entityType: 'Receipt',
      entityId: receiptId,
      recipient: to,
      sentAt: result.success ? new Date() : null,
    })

    return {
      ok: result.success,
      message: result.success
        ? `Receipt queued to ${to} via ${channel.toLowerCase()}. ${getNotificationProvider().info().notice ?? ''}`
        : result.message,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not send the receipt.' }
  }
}
