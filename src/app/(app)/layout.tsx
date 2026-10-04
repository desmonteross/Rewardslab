import { desc, eq, isNull, and } from 'drizzle-orm'
import { db } from '@/db'
import { notifications as notificationsTable } from '@/db/schema'
import { requireSession } from '@/lib/session'
import { env } from '@/lib/env'
import { can, ROLE_LABELS, type Permission } from '@/lib/rbac'
import { NAVIGATION } from '@/components/nav'
import { AppShell } from '@/components/shell/app-shell'
import { fmtDateTime } from '@/lib/dates'
import { logoutAction } from '@/app/login/actions'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  // Platform staff are not bound to an organization, so the tenant-scoped
  // modules have no data to show them — they get the SaaS admin area only.
  const platformOnly = session.role === 'SUPER_ADMIN' && !session.organizationId

  const sections = NAVIGATION.filter((section) => (platformOnly ? section.label === 'Platform' : true))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => can(session, item.permission as Permission)),
    }))
    .filter((section) => section.items.length > 0)

  const recent = session.organizationId
    ? await db
        .select()
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.organizationId, session.organizationId),
            eq(notificationsTable.channel, 'IN_APP'),
          ),
        )
        .orderBy(desc(notificationsTable.createdAt))
        .limit(8)
    : []

  const unread = session.organizationId
    ? await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(
          and(
            eq(notificationsTable.organizationId, session.organizationId),
            isNull(notificationsTable.readAt),
          ),
        )
    : []

  return (
    <AppShell
      sections={sections}
      platformName={env.platformName}
      organizationName={session.organizationName ?? 'Platform'}
      userName={session.fullName}
      userRole={ROLE_LABELS[session.role] ?? session.role}
      permissions={session.permissions}
      notifications={recent.map((notification) => ({
        id: notification.id,
        title: notification.title,
        body: notification.body,
        createdAt: fmtDateTime(notification.createdAt),
        unread: !notification.readAt,
      }))}
      unreadCount={unread.length}
      logout={logoutAction}
    >
      {children}
    </AppShell>
  )
}
