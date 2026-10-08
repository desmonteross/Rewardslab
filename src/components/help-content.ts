// ===========================================================================
//  Help content for the staff application
//
//  Each guide is tied to the screen it explains, so the Help page can show a
//  person only the guides for screens their role can actually open.
// ===========================================================================

import type { AppRole, Permission } from '@/lib/rbac'

export interface HelpGuide {
  /** Anchor id on the Help page. */
  id: string
  title: string
  /** Where the screen lives, so the guide can link straight to it. */
  href: string
  /** Shown only to roles holding this permission. */
  permission: Permission
  /** When set, shown only to these roles (on top of the permission). */
  roles?: AppRole[]
  summary: string
  steps: string[]
  tips?: string[]
}

export interface HelpGroup {
  label: string
  guides: HelpGuide[]
}

export const HELP_GROUPS: HelpGroup[] = [
  {
    label: 'Your access',
    guides: [
      {
        id: 'landlord-portal',
        title: 'Your landlord portal',
        href: '/dashboard',
        permission: 'dashboard.view',
        roles: ['LANDLORD'],
        summary: 'What you see as a property owner, and how you got here.',
        steps: [
          'Your property manager invited you from your landlord record. You set your password from the one-time link in the invitation email.',
          'Every screen shows only the properties you own: rent billed and collected, arrears, tenants and leases, expenses, maintenance, settlements and statements.',
          'Reports → Landlord statement gives a month’s rent, commission, expenses and net payout for your portfolio.',
          'You can view but not change records. Ask your property manager for changes.',
        ],
        tips: ['If a property you own is missing, ask your property manager to check which landlord it is recorded under.'],
      },
      {
        id: 'manager-workspace',
        title: 'Your property manager workspace',
        href: '/properties',
        permission: 'dashboard.view',
        roles: ['PROPERTY_MANAGER'],
        summary: 'You see the properties assigned to you, and everything on them.',
        steps: [
          'An administrator invited you from Administration → Users. You set your password from the one-time link.',
          'You see only properties where you are the assigned manager: their units, tenants, leases, rent, payments, listings and maintenance.',
          'A property you add yourself is assigned to you automatically.',
          'To take on another property, ask an administrator to assign you on that property’s page.',
        ],
      },
    ],
  },
  {
    label: 'Overview',
    guides: [
      {
        id: 'dashboard',
        title: 'Dashboard',
        href: '/dashboard',
        permission: 'dashboard.view',
        summary: 'The day at a glance: what was billed, what came in, what is owed and what needs attention.',
        steps: [
          'Use the quick actions at the top to collect rent, add a property, add a tenant or report an issue.',
          'The headline tiles compare this month with last month. Green means the change is good news, red means it is not, whichever way the number moved.',
          'Switch the rent collection trend between 3, 6 and 12 months. The choice is kept in the page address, so you can share or bookmark it.',
          'Use the portfolio performance lenses to find the best properties, the ones needing attention, and vacancies.',
        ],
      },
    ],
  },
  {
    label: 'Portfolio',
    guides: [
      {
        id: 'landlords',
        title: 'Landlords',
        href: '/landlords',
        permission: 'landlords.view',
        summary: 'The owners whose properties you manage, and who settlements are paid to.',
        steps: [
          'Click Add landlord and fill in their name, phone and how they are paid (an M-Pesa number, or a bank account).',
          'Open a landlord to see their properties, collections, expenses and settlements in one place.',
          'Use Add property on the landlord’s page to add a building that is already linked to them.',
        ],
        tips: ['A landlord must exist before you can add their property.'],
      },
      {
        id: 'properties',
        title: 'Properties',
        href: '/properties',
        permission: 'properties.view',
        summary: 'Each building you manage, with its units, tenants, rent, expenses, statements and tax mapping.',
        steps: [
          'Click Add property, choose the landlord, and give the name, type, county and town.',
          'Saving takes you straight to the property’s Units tab so you can add its units.',
          'Use the tabs on a property (Overview, Units, Tenants, Leases, Rent, Payments, Expenses, Maintenance and others) to see everything about that building.',
        ],
        tips: ['A property with no units shows a reminder on its other tabs until units are added.'],
      },
      {
        id: 'units',
        title: 'Units',
        href: '/units',
        permission: 'units.view',
        summary: 'Every door in the portfolio and whether it is occupied, vacant, reserved or under maintenance.',
        steps: [
          'To add units, open a property’s Units tab, or use Add units to… at the top of the Units page and pick the property.',
          'One by one: type a unit number and rent. Set How many to add a numbered run, for example A1 with 10 gives A1 to A10.',
          'Upload a spreadsheet: download the template, fill in one row per unit, save it as CSV and upload it. The format guide is on the same screen.',
          'Switch between the Occupancy grid and the Table view, and filter by property, status, type, floor or rent.',
        ],
        tips: [
          'An upload is all or nothing. If any row has a problem, nothing is added and you are told which rows to fix.',
          'A vacant unit shows a Sign a lease link on its property’s Units tab.',
        ],
      },
      {
        id: 'listings',
        title: 'Listings (Find a Home)',
        href: '/units/listings',
        permission: 'units.view',
        summary: 'Advertise vacant units to house seekers on the Find a Home portal, and take them down again.',
        steps: [
          'Open Units → Listings. Ready to list shows every vacant unit that is not yet on the portal.',
          'Click List, check the headline, asking rent, available date and description, and click List on Find a Home.',
          'Listed shows what is on the portal now. Click De-list to pull a unit off it.',
          'Signing a lease on a listed unit de-lists it automatically, so seekers never see a home that is taken.',
        ],
        tips: [
          'Only vacant units can be listed. A property’s Units tab also shows a List it link on vacant units.',
          'The Find a Home portal is not connected yet. Listings are kept and will be published once it is.',
        ],
      },
    ],
  },
  {
    label: 'Tenancy',
    guides: [
      {
        id: 'tenants',
        title: 'Tenants',
        href: '/tenants',
        permission: 'tenants.view',
        summary: 'Everyone renting from you, their balance, payment history and rental record.',
        steps: [
          'Click Add tenant and give their name and phone number. Payments from that phone are matched to them automatically.',
          'Saving takes you straight to a new lease for that tenant.',
          'Open a tenant to see their invoices, payments, receipts, tickets and rental record.',
          'On the tenant’s Portal tab you can invite them to the tenant portal. The invitation link lasts 72 hours.',
        ],
      },
      {
        id: 'leases',
        title: 'Leases',
        href: '/leases',
        permission: 'leases.view',
        summary: 'The agreement between a tenant and a unit: rent, deposit, due day and term.',
        steps: [
          'Click New lease (or Sign a lease on a vacant unit), choose the tenant and the unit, and set the start date and length.',
          'Leave rent, deposit or service charge blank to use the unit’s own figures.',
          'Signing reserves the unit and schedules the move-in.',
          'Open a lease to renew it, raise this month’s invoice, transfer the tenant to another unit, or end it.',
        ],
        tips: ['Use Expiring in 90 days on the Leases page to plan renewals.'],
      },
      {
        id: 'moves',
        title: 'Move-ins and move-outs',
        href: '/move-ins',
        permission: 'tenants.view',
        summary: 'Handing units over to new tenants and taking them back.',
        steps: [
          'Every signed lease appears on Move-ins as Scheduled.',
          'Click Complete when the tenant takes the keys. The unit then shows as Occupied.',
          'On Move-outs, record the inspection, any deductions from the deposit and the refund. The unit returns to Vacant.',
        ],
      },
    ],
  },
  {
    label: 'Finance',
    guides: [
      {
        id: 'rent',
        title: 'Rent and invoices',
        href: '/rent',
        permission: 'rent.view',
        summary: 'Raising the month’s rent, chasing what is owed, and adding shared charges.',
        steps: [
          'On Rent, run billing for the month. It raises one invoice per active lease and never doubles up if run again.',
          'Mark overdue invoices so arrears show correctly on the dashboard and in reports.',
          'Use Charges to add shared costs such as water or garbage across a property or one unit. Each total is split exactly between the tenants billed.',
          'Open Invoices to see every invoice, its balance and the payments against it.',
        ],
      },
      {
        id: 'payments',
        title: 'Payments and receipts',
        href: '/payments',
        permission: 'payments.view',
        summary: 'Money coming in, how it was matched to a tenant, and the receipt it produced.',
        steps: [
          'M-Pesa payments are matched to a tenant automatically by tenant code, lease code, property and unit, or phone number.',
          'A payment that cannot be matched is parked as Unmatched. An accountant opens it and assigns it to the right tenant.',
          'Use Record payment for cash, cheque or bank transfers.',
          'Every confirmed payment writes a receipt. Open it to print, download, or send it by email or SMS.',
        ],
        tips: ['M-Pesa is simulated in this version. Use Simulate payment to try the full flow without real money.'],
      },
      {
        id: 'expenses',
        title: 'Expenses',
        href: '/expenses',
        permission: 'expenses.view',
        summary: 'Costs charged against a property, such as repairs, that reduce what the landlord is paid.',
        steps: [
          'Record an expense against a property, with the amount, category and vendor.',
          'An accountant approves it. Only approved expenses reach the landlord’s settlement.',
          'Closing a maintenance ticket with a cost can raise the expense for you.',
        ],
      },
      {
        id: 'settlements',
        title: 'Settlements',
        href: '/settlements',
        permission: 'settlements.view',
        summary: 'Paying landlords what they are owed after commission and expenses.',
        steps: [
          'Create a settlement batch for a landlord and period. It totals rent collected, commission, management fees, expenses and adjustments.',
          'An accountant approves the batch, which schedules it for payout.',
          'Process payout sends the money. If a payout fails, open the batch and click Retry payout.',
        ],
        tips: ['A batch must be approved before it can be paid out.'],
      },
      {
        id: 'accounting',
        title: 'Accounting',
        href: '/accounting',
        permission: 'accounting.view',
        summary: 'The double-entry ledger behind every figure in the system.',
        steps: [
          'The trial balance shows every account, and it always balances.',
          'Payments, receipts, commission, expenses and settlements post here automatically. Nothing is edited after the fact: a correction is a reversing entry.',
        ],
      },
    ],
  },
  {
    label: 'Operations',
    guides: [
      {
        id: 'maintenance',
        title: 'Maintenance',
        href: '/maintenance',
        permission: 'maintenance.view',
        summary: 'Repair requests from tenants and staff, from report to close.',
        steps: [
          'Raise a ticket with the property, category, priority and a short title. Tickets tenants report from the portal appear here too.',
          'Open a ticket to change its status, add notes, and record the actual cost. Managers can also assign it to a person or a vendor.',
          'Closing a ticket with a cost can raise an expense for the landlord’s statement.',
        ],
        tips: ['Caretakers can update tickets but cannot assign or close them. They can mark one Resolved for a manager to close.'],
      },
      {
        id: 'vendors',
        title: 'Vendors',
        href: '/vendors',
        permission: 'vendors.view',
        summary: 'The plumbers, electricians and contractors you send work to.',
        steps: ['See each vendor’s contact details and the work assigned to them.'],
      },
    ],
  },
  {
    label: 'Compliance',
    guides: [
      {
        id: 'erits',
        title: 'KRA eRITS and tax records',
        href: '/erits',
        permission: 'compliance.view',
        summary: 'Monthly rental income tax returns for each landlord.',
        steps: [
          'Map each property to KRA eRITS. An unmapped property shows a warning on its page and is left out of returns.',
          'Build the period for the month. It totals each landlord’s rental income from the ledger.',
          'Review and submit. In this version submissions are simulated and stamped as such.',
          'Fix anything listed under exceptions, such as a missing KRA PIN, before submitting.',
        ],
        tips: ['Tax rates and bands are a sample configuration. Confirm them with KRA before relying on them.'],
      },
      {
        id: 'audit',
        title: 'Audit trail',
        href: '/audit-trail',
        permission: 'audit.view',
        summary: 'Who did what and when, for every financial and tax action.',
        steps: ['Filter by date, action or person. Every entry records the user, their role and where they signed in from.'],
      },
    ],
  },
  {
    label: 'Insights',
    guides: [
      {
        id: 'reports',
        title: 'Reports and analytics',
        href: '/reports',
        permission: 'reports.view',
        summary: 'Rent, portfolio, finance, operations and compliance reports, read from the same ledger as the screens.',
        steps: [
          'Pick a report, set the period, property or landlord, and the table updates.',
          'Export to CSV. The file holds exactly the rows on screen.',
          'Landlord statement and Tenant ledger are under Reports too.',
          'Analytics shows trends across the portfolio over time.',
        ],
      },
    ],
  },
  {
    label: 'Administration',
    guides: [
      {
        id: 'invite-landlord',
        title: 'Inviting a landlord to the landlord portal',
        href: '/landlords',
        permission: 'landlords.update',
        summary: 'Give an owner their own login that shows only the properties they own.',
        steps: [
          'Open Landlords and choose the landlord.',
          'Under Landlord portal, check the email address and click Send invitation.',
          'The landlord gets a one-time link, valid for 72 hours, and sets their own password. Until email is connected, the link is also shown to you so you can send it yourself.',
          'Once they accept, the card shows their login and last sign-in. They see only properties recorded under their landlord record.',
        ],
        tips: [
          'Sending a new invitation cancels the old link. Use Revoke to cancel one without sending another.',
          'Each landlord can have one portal login.',
        ],
      },
      {
        id: 'invite-manager',
        title: 'Inviting property managers and assigning properties',
        href: '/users',
        permission: 'users.manage',
        summary: 'Add a property manager who works only on the properties you give them.',
        steps: [
          'Open Administration → Users and fill in Invite a property manager with their name and email.',
          'They get a one-time link, valid for 72 hours, to set their password.',
          'Open each property they will run, and on its Overview choose them under Property manager. They see that property straight away.',
          'Change or clear the manager there at any time. A property with no manager is seen only by administrators.',
        ],
        tips: ['Properties a manager adds themselves are assigned to them automatically.'],
      },
      {
        id: 'admin',
        title: 'Users, settings and integrations',
        href: '/users',
        permission: 'users.view',
        summary: 'Who can sign in, what each role can do, and how the organization is set up.',
        steps: [
          'Users lists everyone with a login and their role.',
          'Settings holds the organization details and commission rules. Tax rules are under Compliance → Tax Records.',
          'Integrations shows the payment, tax and notification providers and whether each is live or simulated.',
        ],
      },
    ],
  },
]

export interface HelpTopic {
  title: string
  points: string[]
}

/** How to move around the application, for everyone. */
export const GETTING_AROUND: HelpTopic[] = [
  {
    title: 'The sidebar',
    points: [
      'Every screen you can use is in the sidebar on the left, grouped by area. The page you are on is shown in green.',
      'You only see what your role allows. If something is missing, ask an administrator about your role.',
      'Click Collapse at the bottom to shrink the sidebar to icons. On a phone, open it with the menu button at the top left.',
    ],
  },
  {
    title: 'Search and shortcuts',
    points: [
      'Press ⌘K (Ctrl+K on Windows) or click the search bar to jump to any page, or to find a property, unit, tenant, landlord, invoice or payment by name or number.',
      'Most lists have filters at the top. The filters are kept in the page address, so you can bookmark or share a filtered view.',
      'Click any row in a list to open the full record.',
    ],
  },
  {
    title: 'The top bar',
    points: [
      'The bell shows recent notifications.',
      'The screen icon switches between light and dark themes, or follows your device.',
      'Your name opens a menu to sign out.',
    ],
  },
  {
    title: 'The usual order of work',
    points: [
      'Landlord → Property → Units → Tenant → Lease → Move-in.',
      'Then each month: Run billing → Payments come in and are matched → Receipts → Settlements to landlords.',
      'Alongside: Maintenance tickets, Expenses, and the KRA eRITS return.',
    ],
  },
]

export const FAQS: { question: string; answer: string }[] = [
  {
    question: 'How do I give a landlord access to their properties?',
    answer:
      'Open the landlord’s page and send an invitation under Landlord portal. They set their own password from the link and then see only the properties they own: collections, arrears, tenants, expenses, maintenance, settlements and statements.',
  },
  {
    question: 'How do I add a property manager?',
    answer:
      'Invite them from Administration → Users, then assign them to properties on each property’s Overview tab. A property manager sees only the properties assigned to them.',
  },
  {
    question: 'A property manager cannot see a property. Why?',
    answer:
      'They are not its assigned manager. An administrator can assign them on the property’s Overview tab under Property manager. The change applies straight away.',
  },
  {
    question: 'An invitation link has expired or was lost.',
    answer:
      'Links last 72 hours and work once. Send a new invitation from the same place: the landlord’s page for landlords, or Administration → Users for property managers. The new link replaces the old one.',
  },
  {
    question: 'I cannot see a page a colleague can see.',
    answer:
      'Each role sees only the screens it is allowed to use. For example, caretakers do not see finance, and landlords see only their own properties. Ask an administrator if your role needs changing. After a role change, sign out and back in for it to take effect.',
  },
  {
    question: 'How do I add a new building and its tenants?',
    answer:
      'Add the landlord, then the property, then its units (one by one or by spreadsheet). Add the tenant, sign a lease on a vacant unit, and complete the move-in when they take the keys.',
  },
  {
    question: 'What format should a units spreadsheet be in?',
    answer:
      'CSV, with a heading row. Only unit_number and monthly_rent are required. Download the template from the property’s Units tab, under Upload a spreadsheet. The full column guide is on that screen.',
  },
  {
    question: 'A tenant paid but the payment is not on their account.',
    answer:
      'It was probably paid with an account number the system could not match. Look under Payments for an Unmatched payment with that M-Pesa code, open it and assign it to the tenant. The tenant’s account number is shown on their invoices and in their portal.',
  },
  {
    question: 'Why did running billing not create any invoices?',
    answer:
      'Billing skips leases that already have an invoice for that month, so running it twice is safe. It also skips leases that have not started or have ended.',
  },
  {
    question: 'Can I undo a payment?',
    answer:
      'An accountant can reverse a payment from its page. The reversal is a new entry, so the history stays intact. A payment already paid out to a landlord cannot be reversed. Correct it with an adjustment on the next settlement instead.',
  },
  {
    question: 'A landlord payout failed. What now?',
    answer: 'Open the settlement, check the payout details on the landlord’s record, and click Retry payout.',
  },
  {
    question: 'How does a tenant get into the tenant portal?',
    answer:
      'Open the tenant, go to the Portal tab and send an invitation, or let them self-register if your organization allows it. In the portal they see what is due, pay by M-Pesa, download receipts and statements, and report repairs.',
  },
  {
    question: 'What are reward points?',
    answer:
      'Tenants earn points for paying rent on time: 1 point per KES 100, with a bonus for a streak of on-time months. Late payments earn less, and nothing if more than 15 days late. Points cannot be redeemed for cash. They raise a tenant’s chances when property owners offer discounts or giveaways. Tenants see their points as a tree in the portal, one branch per month of rent.',
  },
  {
    question: 'Are M-Pesa and KRA real in this version?',
    answer:
      'No. Both are simulated, and every simulated payment and filing is labelled. They use the same processing as the live versions will, so switching on is a matter of credentials and approval.',
  },
  {
    question: 'Can I export data?',
    answer: 'Yes. Every report exports to CSV, and tenant statements and receipts download as PDF.',
  },
]
