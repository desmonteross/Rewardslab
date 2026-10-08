# RentRewards v3.1 — persona workflow audit

Date: 4 Oct 2026. Read-only review of the code plus a live walk of every demo account against the running app (http://localhost:3000). Nothing was changed.

Severity: **Blocker** = a core job for that persona cannot be done, or data leaks to the wrong person. **Major** = the workflow works badly or a promised feature is missing. **Minor** = dead links and rough edges.

Items marked ✅ were reproduced live; the rest were confirmed by reading the code.

---

## Fix first (top 10)

1. **Staff cannot create anything.** No way to add a landlord, property, unit, tenant, lease, vendor or user, or to complete a move-in. ✅
2. **Landlords can open other landlords' records** by ID (properties, leases, tenants, payments, settlements…). ✅
3. **Landlords can see org-wide data** through reports and notifications: the audit log, every M-Pesa transaction with phone numbers, every tenant's ledger. ✅
4. **Tenant invite links are broken** (`/portal/accept` does not exist; the page is `/tenant/accept`). ✅
5. **Reward points can never be redeemed or mature**; "Available" is stuck at 0.
6. **The platform admin crashes on every company screen** and cannot create or select an organization. ✅
7. **Any staff login can read any tenant's balance and rental record** through `/api/v1/me/summary?tenantId=` (tried with the caretaker). ✅
8. **The M-Pesa webhook accepts unauthenticated posts**, so fake payments can be receipted and earn points.
9. **Caretakers can assign and close tickets, and closing raises a landlord expense**, though they hold neither permission.
10. **A failed settlement payout cannot be retried**, even though the screen offers "Retry payout".

---

## Company Admin and Property Manager

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 1 | Blocker | "Add property", "Add tenant" and "Add landlord" open pages that don't exist (404). | `properties/page.tsx:106`, `tenants/page.tsx:103`, `landlords/page.tsx:89` ✅ |
| 2 | Blocker | Units and leases cannot be created: no form, action or service (`units.create` is never checked). | `units/page.tsx`, `leases/[id]/actions.ts` |
| 3 | Blocker | Move-in cannot be completed: `completeMoveIn` exists but nothing calls it, and the Move-ins page has no form. | `services/leases.ts:228`, `move-ins/page.tsx` |
| 4 | Major | Dashboard "Add property" and "Add tenant" quick actions just open the list (`?new=1` is ignored). | `dashboard/page.tsx:148,155` |
| 5 | Major | Users, Settings, Integrations and Vendors are display-only. Nobody can add staff, change roles, configure M-Pesa or add a vendor. | `users.manage`, `roles.manage`, `settings.manage`, `integrations.manage`, `vendors.manage` are never checked |
| 6 | Minor | The staff "raise ticket" form has no unit field, though the action supports one. | `maintenance/page.tsx:132-197` |
| 7 | Minor | Role changes only take effect after the user signs in again (permissions live in the session token). | `lib/auth.ts:68` |

## Accountant

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 8 | Blocker | "Retry payout" on a FAILED settlement always errors; the service only accepts SCHEDULED/PENDING. | `settlements/[id]/page.tsx:187`, `services/settlements.ts:353` |
| 9 | Major | The approval step can be skipped: processing accepts PENDING batches, and one person can create, approve and pay out the same batch. | `services/settlements.ts:243,320,353` |
| 10 | Major | No staff rewards screen. `rewards.view`/`rewards.adjust` are granted but unused, and there is no manual adjustment. | `services/rewards.ts:753` unused |
| 11 | Major | No editor for commission rules or tax rules, and invoices cannot be cancelled. Commission rules are only on Settings, which the accountant can't open. | `commission.manage`, `tax.rules.manage`, `invoices.cancel` never checked |
| 12 | Minor | Expenses can only be approved, not rejected (the action supports rejecting). | `expenses/page.tsx:252` |
| 13 | Minor | "Reverse payment" shows on payments already paid to the landlord, and the server then refuses. | `payments/[id]/page.tsx:202` vs `services/payments.ts:528` |

## Landlord

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 14 | Blocker | Detail pages filter by organization, not by landlord, so another landlord's property, lease, tenant, invoice, payment, receipt, settlement or ticket opens by ID. | `properties/[id]/page.tsx:77` and 8 similar pages ✅ |
| 15 | Blocker | Reports leak org-wide data: the audit log, M-Pesa reconciliation (payer phones), and every tenant in the Tenant Ledger picker. | `server/reports/index.ts:517,1027`, `reports/tenant-ledger/page.tsx:33` ✅ |
| 16 | Blocker | The Notifications page shows every message the org has sent, including those to other tenants. | `notifications/page.tsx:25` |
| 17 | Major | Every "Landlord" link (statement, property, settlement, payment, expense) goes to /forbidden, because the role lacks `landlords.view`. | `rbac.ts:204-222`, `landlords/[id]/page.tsx:38` |
| 18 | Major | Landlord scoping fails open: a landlord login without a linked landlord record sees the whole organization. | `lib/tenancy.ts:50,104,117` |

## Auditor

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 19 | Major | The read-only auditor (and the landlord) can trigger receipt email and SMS sends; the action checks only `receipts.view`. | `receipts/[id]/actions.ts:19`, `page.tsx:181,189` |

## Caretaker and Maintenance

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 20 | Blocker | The caretaker can assign and close tickets; only `maintenance.update` is checked. `maintenance.assign`/`.close` gate nothing. | `maintenance/actions.ts:47`, `[id]/page.tsx:122-157` |
| 21 | Major | Closing a ticket raises a landlord expense by default, with no `expenses.create` check. | `[id]/page.tsx:178`, `services/maintenance.ts:192` |
| 22 | Major | The dashboard shows rent and settlement figures to caretaker and maintenance staff, and every tile link sends them to /forbidden. | `dashboard/page.tsx:86,222,237,258` |
| 23 | Major | The ticket assignee dropdown lists every user in the org, including tenant and landlord logins. | `maintenance/page.tsx:101` |
| 24 | Minor | Forbidden links: Move-ins/Move-outs → lease, tenant → "Open lease"/"Tenant ledger", property → "Landlord"/"Rent collection", ticket → "Tenant" (maintenance role). | `nav.ts:38`, `tenants/[id]/page.tsx:240`, `properties/[id]/page.tsx:176` |

## Tenant

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 25 | Blocker | Invite links point to `/portal/accept`, which doesn't exist. Invited tenants can't get in. | `services/portal-accounts.ts:126` ✅ |
| 26 | Blocker | Points can never be redeemed (no button or action) and never mature (the job is never called), so "Available" stays at 0. | `services/rewards.ts:501,800`, `portal/rewards/page.tsx` |
| 27 | Major | A tenant whose lease has ended but still owes rent is offered Pay, and the payment then fails as "not completed". | `checkout.ts:53`, `matching.ts:172` |
| 28 | Major | Notifications are always empty for tenants (nothing writes a `userId`), and the unread badge never clears. | `queries/portal.ts:556`, `receipts/[id]/actions.ts:56` |
| 29 | Major | Home and Pay can show different balances (Home counts draft invoices). | `queries/portal.ts:154`, `checkout.ts:65` |
| 30 | Major | Redirect loop between /portal and /login if the tenant record is missing. | `portal/layout.tsx:20`, `login/page.tsx:14` |
| 31 | Minor | After paying, the Pay page keeps the old invoices and points until refreshed. | `components/portal/pay-form.tsx` |
| 32 | Minor | Self-registration isn't linked from sign-in, and the "reset the password" message refers to a flow that doesn't exist. | `portal-accounts.ts:340` |
| 33 | Minor | An ended lease shows as "0 days… renewing" with a Pay button. Reported tickets don't link to the new ticket. Help promises an assignee that isn't shown. Reversals are hidden from the points statement. | `portal/lease/page.tsx:41`, `rewards.ts:731` |

## Platform super admin

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 34 | Blocker | Every company page returns a server error. The nav and command bar show them all, and the error page's only exit loops back to the dashboard. | `lib/tenancy.ts:44`, `(app)/error.tsx:22` ✅ |
| 35 | Major | `/admin` is read-only: there is no way to create, suspend or switch into an organization, or to create its first admin. | `(app)/admin/page.tsx` |

## API and integrations

| # | Severity | Issue | Evidence |
|---|---|---|---|
| 36 | Blocker | `/api/v1/me/summary` and `/me/record` accept `?tenantId=` from any staff login, with no permission or landlord scoping. | `me/summary/route.ts:19-30` ✅ |
| 37 | Major | The M-Pesa webhook has no signature, secret or IP check. | `webhooks/mpesa/route.ts:19-48` |
| 38 | Major | There is no STK callback route, so live (non-mock) payments would expire as "nothing was charged". | `checkout.ts:211-217,281` |

---

### What works

Billing runs, raising charges, reconciling unmatched M-Pesa payments out of suspense, receipts, the double-entry ledger, eRITS mapping and submission, the audit trail, move-out, maintenance tickets (apart from the permission gaps above), and the tenant's pay, receipt and statement downloads all hold together. Every persona has a seeded demo login.
