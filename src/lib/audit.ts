// ===========================================================================
//  Audit trail (spec §29)
//
//  Financial, tenancy and tax actions are recorded here with before/after
//  values. Audit rows are append-only: nothing in the application updates or
//  deletes them.
// ===========================================================================

import { auditLogs } from '@/db/schema'
import type { Tx } from '@/db'
import type { Actor, Scope } from './tenancy'

export type AuditAction =
  | 'Payment Recorded'
  | 'Payment Reconciled'
  | 'Payment Reversed'
  | 'Payment Allocated'
  | 'Invoice Generated'
  | 'Invoice Cancelled'
  | 'Billing Run Completed'
  | 'Receipt Issued'
  | 'Commission Calculated'
  | 'Commission Rule Changed'
  | 'Settlement Created'
  | 'Settlement Approved'
  | 'Settlement Processed'
  | 'Expense Recorded'
  | 'Expense Approved'
  | 'Property Created'
  | 'Property Updated'
  | 'Unit Created'
  | 'Unit Updated'
  | 'Unit Listed'
  | 'Unit Delisted'
  | 'Landlord Created'
  | 'Landlord Updated'
  | 'Tenant Created'
  | 'Tenant Updated'
  | 'Lease Created'
  | 'Lease Updated'
  | 'Lease Terminated'
  | 'Lease Renewed'
  | 'Move In Completed'
  | 'Move Out Completed'
  | 'Maintenance Ticket Created'
  | 'Maintenance Ticket Updated'
  | 'eRITS Mapping Updated'
  | 'eRITS Period Prepared'
  | 'eRITS Submission Simulated'
  | 'Tax Rule Changed'
  | 'Compliance Exception Resolved'
  | 'User Signed In'
  | 'User Signed Out'
  | 'User Created'
  | 'User Permissions Changed'
  | 'Tenant Portal Invited'
  | 'Tenant Portal Invite Revoked'
  | 'Tenant Portal Account Created'
  | 'Tenant Issue Reported'
  | 'Integration Updated'
  | 'Organization Updated'

export interface AuditEntry {
  action: AuditAction
  entityType: string
  entityId: string
  reference?: string | null
  previousValue?: unknown
  newValue?: unknown
  ipAddress?: string | null
  userAgent?: string | null
}

export async function recordAudit(
  tx: Tx,
  context: { organizationId: string | null; actor: Actor },
  entry: AuditEntry,
) {
  await tx.insert(auditLogs).values({
    organizationId: context.organizationId,
    userId: context.actor.id,
    userName: context.actor.name,
    userRole: context.actor.role,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    reference: entry.reference ?? null,
    previousValue: entry.previousValue === undefined ? null : (entry.previousValue as object),
    newValue: entry.newValue === undefined ? null : (entry.newValue as object),
    ipAddress: entry.ipAddress ?? null,
    userAgent: entry.userAgent ?? null,
    sessionId: context.actor.sessionId,
  })
}

/** Convenience wrapper when a Scope is already in hand. */
export async function audit(tx: Tx, scope: Scope, entry: AuditEntry) {
  await recordAudit(
    tx,
    {
      organizationId: scope.organizationId,
      actor: { id: scope.userId, name: scope.userName, role: scope.role, sessionId: scope.sessionId },
    },
    entry,
  )
}
