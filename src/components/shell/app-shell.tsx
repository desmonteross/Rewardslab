'use client'

import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './sidebar'
import { Topbar, type TopbarNotification } from './topbar'
import type { NavSection } from '@/components/nav'

export function AppShell({
  children,
  sections,
  platformName,
  organizationName,
  userName,
  userRole,
  permissions,
  notifications,
  unreadCount,
  logout,
  banner,
}: {
  children: ReactNode
  sections: NavSection[]
  platformName: string
  organizationName: string
  userName: string
  userRole: string
  permissions: string[]
  notifications: TopbarNotification[]
  unreadCount: number
  logout: () => Promise<void>
  banner?: ReactNode
}) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar
        sections={sections}
        organizationName={organizationName}
        platformName={platformName}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          userName={userName}
          userRole={userRole}
          organizationName={organizationName}
          permissions={permissions}
          notifications={notifications}
          unreadCount={unreadCount}
          onOpenMobileNav={() => setMobileOpen(true)}
          logout={logout}
        />
        {banner}
        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  )
}
