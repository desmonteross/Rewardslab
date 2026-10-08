import { asc, eq, sql } from 'drizzle-orm'
import { db } from '@/db'
import { landlords, roles, users } from '@/db/schema'
import { requirePermission } from '@/lib/session'
import { scopeFromSession } from '@/lib/tenancy'
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS, PERMISSION_MODULES, ROLE_LABELS, type AppRole } from '@/lib/rbac'
import { fmtDateTime } from '@/lib/dates'
import { Card, DataTable, EmptyState, KpiCard, PageHeader, StatusBadge, humanise } from '@/components/ui'
import { can } from '@/lib/rbac'
import { fmtDate } from '@/lib/dates'
import { ActionForm } from '@/components/action-form'
import { inviteManagerAction, revokeUserInviteAction } from '@/app/invite-actions'
import { userInvitesFor } from '@/server/services/user-invites'

export const metadata = { title: 'Users' }
export const dynamic = 'force-dynamic'

export default async function UsersPage() {
  const session = await requirePermission('users.view')
  const scope = scopeFromSession(session)

  const [rows, roleRows] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        phone: users.phone,
        role: users.role,
        isActive: users.isActive,
        lastLoginAt: users.lastLoginAt,
        createdAt: users.createdAt,
        landlordName: sql<string>`coalesce(${landlords.companyName}, ${landlords.fullName})`,
      })
      .from(users)
      .leftJoin(landlords, eq(landlords.id, users.landlordId))
      .where(eq(users.organizationId, scope.organizationId))
      .orderBy(asc(users.fullName)),
    db
      .select()
      .from(roles)
      .where(eq(roles.organizationId, scope.organizationId))
      .orderBy(asc(roles.name)),
  ])

  const active = rows.filter((row) => row.isActive).length
  const signedInRecently = rows.filter(
    (row) => row.lastLoginAt && Date.now() - row.lastLoginAt.getTime() < 30 * 86_400_000,
  ).length

  const canManage = can(session, 'users.manage')
  const managerInvites = canManage ? await userInvitesFor(scope, { role: 'PROPERTY_MANAGER' }) : []

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, and what their role lets them do."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Users" value={String(rows.length)} sub={`${active} active`} />
        <KpiCard label="Roles configured" value={String(roleRows.length)} />
        <KpiCard label="Signed in last 30 days" value={String(signedInRecently)} />
        <KpiCard label="Permissions available" value={String(Object.keys(PERMISSIONS).length)} />
      </div>

      {canManage && (
        <div className="mb-4">
          <Card
            title="Invite a property manager"
            description="They set their own password from a one-time link, then see only the properties you assign to them on each property’s page."
          >
            <ActionForm action={inviteManagerAction} label="Send invitation" pendingLabel="Creating…">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-muted">
                  Full name
                  <input name="fullName" className="field mt-1" required />
                </label>
                <label className="block text-xs font-medium text-muted">
                  Email
                  <input name="email" type="email" className="field mt-1" required />
                </label>
              </div>
            </ActionForm>
            {managerInvites.length > 0 && (
              <ul className="mt-4 divide-y divide-line border-t border-line">
                {managerInvites.map((invite) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="text-ink">
                      {invite.fullName} <span className="text-muted">· {invite.email}</span>
                    </span>
                    <span className="text-xs text-muted">
                      {humanise(invite.status)} · sent {fmtDate(invite.createdAt)}
                    </span>
                    {invite.status === 'PENDING' && (
                      <ActionForm action={revokeUserInviteAction} label="Revoke" variant="secondary" pendingLabel="Revoking…">
                        <input type="hidden" name="inviteId" value={invite.id} />
                        <input type="hidden" name="role" value="PROPERTY_MANAGER" />
                      </ActionForm>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      <Card padded={false} title="People">
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          columns={[
            {
              key: 'name',
              header: 'Name',
              render: (row) => (
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{row.fullName}</p>
                  <p className="truncate text-2xs text-faint">{row.email}</p>
                </div>
              ),
            },
            { key: 'role', header: 'Role', render: (row) => <span className="text-sm text-muted">{ROLE_LABELS[row.role as AppRole] ?? row.role}</span> },
            { key: 'landlord', header: 'Landlord portal', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.landlordName ?? '—'}</span> },
            { key: 'phone', header: 'Phone', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.phone ?? '—'}</span> },
            { key: 'lastLogin', header: 'Last signed in', hideOnMobile: true, render: (row) => <span className="text-xs text-muted">{row.lastLoginAt ? fmtDateTime(row.lastLoginAt) : 'Never'}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (row) => <StatusBadge status={row.isActive ? 'ACTIVE' : 'SUSPENDED'} label={row.isActive ? 'Active' : 'Disabled'} /> },
          ]}
          empty={<EmptyState title="No users in this organization" />}
        />
      </Card>

      <div className="mt-4">
        <Card
          title="Roles and permissions"
          description="Each role is a bundle of permissions. An organization can override any bundle without a deployment."
          padded={false}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-faint">Permission</th>
                  {roleRows.map((role) => (
                    <th
                      key={role.id}
                      className="px-3 py-2.5 text-center text-xs font-medium uppercase tracking-wide text-faint"
                    >
                      {role.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_MODULES.map((module) => (
                  <>
                    <tr key={`module-${module}`} className="bg-canvas/60">
                      <td
                        colSpan={roleRows.length + 1}
                        className="px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint"
                      >
                        {module}
                      </td>
                    </tr>
                    {Object.entries(PERMISSIONS)
                      .filter(([, meta]) => meta.module === module)
                      .map(([key, meta]) => (
                        <tr key={key} className="border-b border-line/70 last:border-0">
                          <td className="px-4 py-2">
                            <p className="text-sm text-ink">{meta.label}</p>
                            <p className="font-mono text-2xs text-faint">{key}</p>
                          </td>
                          {roleRows.map((role) => {
                            const granted =
                              role.permissions?.includes(key) ??
                              DEFAULT_ROLE_PERMISSIONS[role.key as AppRole]?.includes(key as never) ??
                              false
                            return (
                              <td key={`${role.id}-${key}`} className="px-3 py-2 text-center">
                                {granted ? (
                                  <span className="text-positive" aria-label="granted">
                                    ●
                                  </span>
                                ) : (
                                  <span className="text-faint/40" aria-label="not granted">
                                    ·
                                  </span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  )
}
