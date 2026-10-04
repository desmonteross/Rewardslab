// ===========================================================================
//  Role-based access control (spec §4)
//
//  Permissions are the unit of authorisation. Roles are bundles of
//  permissions, and an organization can override any bundle by storing its
//  own permission list on the `roles` table — the defaults below are only the
//  starting point a new organization is seeded with.
// ===========================================================================

export const PERMISSIONS = {
  // Dashboard & insight
  'dashboard.view': { module: 'Dashboard', label: 'View dashboard' },
  'reports.view': { module: 'Insights', label: 'View reports' },
  'reports.export': { module: 'Insights', label: 'Export reports' },
  'analytics.view': { module: 'Insights', label: 'View analytics' },

  // Portfolio
  'properties.view': { module: 'Portfolio', label: 'View properties' },
  'properties.create': { module: 'Portfolio', label: 'Create properties' },
  'properties.update': { module: 'Portfolio', label: 'Edit properties' },
  'properties.delete': { module: 'Portfolio', label: 'Archive properties' },
  'units.view': { module: 'Portfolio', label: 'View units' },
  'units.create': { module: 'Portfolio', label: 'Create units' },
  'units.update': { module: 'Portfolio', label: 'Edit units' },
  'landlords.view': { module: 'Portfolio', label: 'View landlords' },
  'landlords.create': { module: 'Portfolio', label: 'Create landlords' },
  'landlords.update': { module: 'Portfolio', label: 'Edit landlords' },

  // Tenancy
  'tenants.view': { module: 'Tenancy', label: 'View tenants' },
  'tenants.create': { module: 'Tenancy', label: 'Create tenants' },
  'tenants.update': { module: 'Tenancy', label: 'Edit tenants' },
  'leases.view': { module: 'Tenancy', label: 'View leases' },
  'leases.create': { module: 'Tenancy', label: 'Create leases' },
  'leases.update': { module: 'Tenancy', label: 'Edit leases' },
  'leases.terminate': { module: 'Tenancy', label: 'Terminate leases' },
  'moves.manage': { module: 'Tenancy', label: 'Manage move-ins and move-outs' },

  // Finance
  'rent.view': { module: 'Finance', label: 'View rent collection' },
  'invoices.view': { module: 'Finance', label: 'View invoices' },
  'invoices.create': { module: 'Finance', label: 'Create invoices' },
  'invoices.cancel': { module: 'Finance', label: 'Cancel invoices' },
  'billing.run': { module: 'Finance', label: 'Run the rent billing engine' },
  'payments.view': { module: 'Finance', label: 'View payments' },
  'payments.record': { module: 'Finance', label: 'Record payments' },
  'payments.reconcile': { module: 'Finance', label: 'Reconcile payments' },
  'payments.reverse': { module: 'Finance', label: 'Reverse payments' },
  'receipts.view': { module: 'Finance', label: 'View receipts' },
  'receipts.issue': { module: 'Finance', label: 'Issue receipts' },
  'expenses.view': { module: 'Finance', label: 'View expenses' },
  'expenses.create': { module: 'Finance', label: 'Record expenses' },
  'expenses.approve': { module: 'Finance', label: 'Approve expenses' },
  'settlements.view': { module: 'Finance', label: 'View settlements' },
  'settlements.create': { module: 'Finance', label: 'Create settlement batches' },
  'settlements.approve': { module: 'Finance', label: 'Approve settlements' },
  'settlements.process': { module: 'Finance', label: 'Process settlements' },
  'accounting.view': { module: 'Finance', label: 'View the accounting ledger' },
  'commission.manage': { module: 'Finance', label: 'Configure commission rules' },

  // Operations
  'maintenance.view': { module: 'Operations', label: 'View maintenance tickets' },
  'maintenance.create': { module: 'Operations', label: 'Raise maintenance tickets' },
  'maintenance.update': { module: 'Operations', label: 'Update maintenance tickets' },
  'maintenance.assign': { module: 'Operations', label: 'Assign maintenance tickets' },
  'maintenance.close': { module: 'Operations', label: 'Close maintenance tickets' },
  'vendors.view': { module: 'Operations', label: 'View vendors' },
  'vendors.manage': { module: 'Operations', label: 'Manage vendors' },

  // Compliance
  'compliance.view': { module: 'Compliance', label: 'View KRA eRITS compliance' },
  'compliance.manage': { module: 'Compliance', label: 'Manage eRITS mapping and periods' },
  'compliance.submit': { module: 'Compliance', label: 'Prepare and submit eRITS returns' },
  'tax.rules.manage': { module: 'Compliance', label: 'Configure tax rules' },
  'audit.view': { module: 'Compliance', label: 'View the audit trail' },

  // Administration
  'users.view': { module: 'Administration', label: 'View users' },
  'users.manage': { module: 'Administration', label: 'Manage users' },
  'roles.manage': { module: 'Administration', label: 'Manage roles and permissions' },
  'integrations.view': { module: 'Administration', label: 'View integrations' },
  'integrations.manage': { module: 'Administration', label: 'Manage integrations' },
  'notifications.view': { module: 'Administration', label: 'View notifications' },
  'settings.view': { module: 'Administration', label: 'View settings' },
  'settings.manage': { module: 'Administration', label: 'Manage settings' },

  // Tenant portal — held by the tenant themselves, always scoped to their own
  // records by src/lib/tenancy.ts. Staff never need these.
  'portal.view': { module: 'Tenant portal', label: 'Use the tenant portal' },
  'portal.issues.report': { module: 'Tenant portal', label: 'Report a maintenance issue' },
  'portal.documents.download': { module: 'Tenant portal', label: 'Download own receipts and statements' },
  'portal.rewards.view': { module: 'Tenant portal', label: 'See own reward points' },
  'portal.rewards.redeem': { module: 'Tenant portal', label: 'Redeem own reward points' },

  // Reward points (staff side). Viewing shows only what THIS organization
  // issued or honoured — never a tenant's balance from another landlord.
  'rewards.view': { module: 'Rewards', label: 'View reward activity' },
  'rewards.configure': { module: 'Rewards', label: 'Configure reward rules' },
  'rewards.adjust': { module: 'Rewards', label: 'Post a manual points adjustment' },

  // Tenant portal administration (staff side)
  'tenants.invite': { module: 'Tenancy', label: 'Invite tenants to the portal' },

  // Platform (SaaS operator only)
  'platform.admin': { module: 'Platform', label: 'Administer the SaaS platform' },
} as const

export type Permission = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export type AppRole =
  | 'SUPER_ADMIN'
  | 'ORG_ADMIN'
  | 'PROPERTY_MANAGER'
  | 'ACCOUNTANT'
  | 'LANDLORD'
  | 'CARETAKER'
  | 'MAINTENANCE'
  | 'AUDITOR'
  | 'TENANT'

const READ_ONLY: Permission[] = [
  'dashboard.view',
  'properties.view',
  'units.view',
  'landlords.view',
  'tenants.view',
  'leases.view',
  'rent.view',
  'invoices.view',
  'payments.view',
  'receipts.view',
  'expenses.view',
  'settlements.view',
  'accounting.view',
  'maintenance.view',
  'vendors.view',
  'compliance.view',
  'reports.view',
  'analytics.view',
  'notifications.view',
]

export const DEFAULT_ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,

  ORG_ADMIN: ALL_PERMISSIONS.filter((p) => p !== 'platform.admin' && !p.startsWith('portal.')),

  PROPERTY_MANAGER: [
    ...READ_ONLY,
    'properties.create',
    'properties.update',
    'units.create',
    'units.update',
    'landlords.create',
    'landlords.update',
    'tenants.create',
    'tenants.update',
    'tenants.invite',
    'leases.create',
    'leases.update',
    'leases.terminate',
    'moves.manage',
    'invoices.create',
    'billing.run',
    'payments.record',
    'receipts.issue',
    'expenses.create',
    'maintenance.create',
    'maintenance.update',
    'maintenance.assign',
    'maintenance.close',
    'vendors.manage',
    'reports.export',
    'rewards.view',
  ],

  ACCOUNTANT: [
    ...READ_ONLY,
    'invoices.create',
    'invoices.cancel',
    'billing.run',
    'payments.record',
    'payments.reconcile',
    'payments.reverse',
    'receipts.issue',
    'expenses.create',
    'expenses.approve',
    'settlements.create',
    'settlements.approve',
    'settlements.process',
    'commission.manage',
    'compliance.manage',
    'compliance.submit',
    'tax.rules.manage',
    'audit.view',
    'reports.export',
    'rewards.view',
    'rewards.adjust',
  ],

  // Scoped further to the landlord's own portfolio by src/lib/tenancy.ts.
  LANDLORD: [
    'dashboard.view',
    'properties.view',
    'units.view',
    'tenants.view',
    'leases.view',
    'rent.view',
    'invoices.view',
    'payments.view',
    'receipts.view',
    'expenses.view',
    'settlements.view',
    'maintenance.view',
    'compliance.view',
    'reports.view',
    'reports.export',
    'analytics.view',
    'notifications.view',
  ],

  CARETAKER: [
    'dashboard.view',
    'properties.view',
    'units.view',
    'tenants.view',
    'maintenance.view',
    'maintenance.create',
    'maintenance.update',
    'notifications.view',
  ],

  MAINTENANCE: [
    'dashboard.view',
    'properties.view',
    'units.view',
    'maintenance.view',
    'maintenance.update',
    'maintenance.close',
    'vendors.view',
    'notifications.view',
  ],

  AUDITOR: [...READ_ONLY, 'audit.view', 'reports.export'],

  // The tenant portal. Every one of these is further narrowed to this tenant's
  // own rows by ownTenantScoped() — the permission grants the screen, the
  // scope grants the data.
  TENANT: [
    'portal.view',
    'portal.issues.report',
    'portal.documents.download',
    'portal.rewards.view',
    'portal.rewards.redeem',
  ],
}

export interface Principal {
  role: AppRole
  permissions?: string[] | null
}

/** Does this principal hold the permission? Explicit role permissions win. */
export function can(principal: Principal | null | undefined, permission: Permission): boolean {
  if (!principal) return false
  if (principal.role === 'SUPER_ADMIN') return true
  const granted = principal.permissions?.length
    ? principal.permissions
    : DEFAULT_ROLE_PERMISSIONS[principal.role] ?? []
  return granted.includes('*') || granted.includes(permission)
}

export function canAny(principal: Principal | null | undefined, permissions: Permission[]): boolean {
  return permissions.some((permission) => can(principal, permission))
}

export function permissionsFor(role: AppRole): Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role] ?? []
}

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  ORG_ADMIN: 'Company Admin',
  PROPERTY_MANAGER: 'Property Manager',
  ACCOUNTANT: 'Accountant',
  LANDLORD: 'Landlord / Property Owner',
  CARETAKER: 'Caretaker',
  MAINTENANCE: 'Maintenance',
  AUDITOR: 'Read-only / Auditor',
  TENANT: 'Tenant',
}

export const PERMISSION_MODULES = Array.from(
  new Set(Object.values(PERMISSIONS).map((permission) => permission.module)),
)
