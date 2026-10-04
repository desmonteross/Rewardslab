import type { Permission } from '@/lib/rbac'

export interface NavItem {
  label: string
  href: string
  /** Lucide icon name, resolved in the sidebar. */
  icon: string
  permission: Permission
  /** Also highlight the item for these path prefixes. */
  match?: string[]
}

export interface NavSection {
  label: string | null
  items: NavItem[]
}

export const NAVIGATION: NavSection[] = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard', permission: 'dashboard.view' },
    ],
  },
  {
    label: 'Portfolio',
    items: [
      { label: 'Properties', href: '/properties', icon: 'Building2', permission: 'properties.view' },
      { label: 'Units', href: '/units', icon: 'DoorOpen', permission: 'units.view' },
      { label: 'Landlords', href: '/landlords', icon: 'UserRoundCog', permission: 'landlords.view' },
    ],
  },
  {
    label: 'Tenancy',
    items: [
      { label: 'Tenants', href: '/tenants', icon: 'Users', permission: 'tenants.view' },
      { label: 'Leases', href: '/leases', icon: 'FileSignature', permission: 'leases.view' },
      { label: 'Move-ins', href: '/move-ins', icon: 'LogIn', permission: 'tenants.view' },
      { label: 'Move-outs', href: '/move-outs', icon: 'LogOut', permission: 'tenants.view' },
    ],
  },
  {
    label: 'Finance',
    items: [
      { label: 'Rent', href: '/rent', icon: 'Wallet', permission: 'rent.view' },
      { label: 'Invoices', href: '/invoices', icon: 'FileText', permission: 'invoices.view' },
      { label: 'Payments', href: '/payments', icon: 'ArrowDownToLine', permission: 'payments.view' },
      { label: 'Receipts', href: '/receipts', icon: 'ReceiptText', permission: 'receipts.view' },
      { label: 'Expenses', href: '/expenses', icon: 'ArrowUpFromLine', permission: 'expenses.view' },
      { label: 'Settlements', href: '/settlements', icon: 'Banknote', permission: 'settlements.view' },
      { label: 'Accounting', href: '/accounting', icon: 'BookOpen', permission: 'accounting.view' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Maintenance', href: '/maintenance', icon: 'Wrench', permission: 'maintenance.view' },
      { label: 'Vendors', href: '/vendors', icon: 'Truck', permission: 'vendors.view' },
    ],
  },
  {
    label: 'Compliance',
    items: [
      { label: 'KRA eRITS', href: '/erits', icon: 'Landmark', permission: 'compliance.view' },
      { label: 'Tax Records', href: '/tax-records', icon: 'Scale', permission: 'compliance.view' },
      { label: 'Audit Trail', href: '/audit-trail', icon: 'History', permission: 'audit.view' },
    ],
  },
  {
    label: 'Insights',
    items: [
      { label: 'Reports', href: '/reports', icon: 'ClipboardList', permission: 'reports.view' },
      { label: 'Analytics', href: '/analytics', icon: 'TrendingUp', permission: 'analytics.view' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { label: 'Users', href: '/users', icon: 'UserCog', permission: 'users.view' },
      { label: 'Integrations', href: '/integrations', icon: 'Plug', permission: 'integrations.view' },
      { label: 'Notifications', href: '/notifications', icon: 'Bell', permission: 'notifications.view' },
      { label: 'Settings', href: '/settings', icon: 'Settings', permission: 'settings.view' },
    ],
  },
  {
    label: 'Platform',
    items: [{ label: 'SaaS Admin', href: '/admin', icon: 'ShieldCheck', permission: 'platform.admin' }],
  },
  {
    // Last, and open to every staff role (all of them can see the dashboard).
    label: 'Help',
    items: [
      { label: 'Guides', href: '/help', icon: 'BookOpenText', permission: 'dashboard.view' },
      { label: 'FAQs', href: '/help/faq', icon: 'CircleHelp', permission: 'dashboard.view' },
    ],
  },
]

/** Flattened list used by the command bar. */
export const ALL_NAV_ITEMS: NavItem[] = NAVIGATION.flatMap((section) => section.items)
