# Nyumba Zetu - Setup: Organisation, Property/Block, Units, Bulk Upload (reference for RentRewards)

## Summary (10 lines)
1. Hierarchy is Organisation -> Branch (property/scheme/region/office) -> Block (building/estate) -> Unit; Portfolios cut across it.
2. Branch scope is a hard data boundary (not a filter): data outside the active branch is never returned.
3. Block create (Admin -> Blocks -> Add) needs name, address, branch. Unit create (Admin -> Units -> Add) needs house number/name, block, type, category, occupancy type, owner.
4. Unit occupancy/status is derived from lease status, never entered manually; unit financials are computed from the ledger.
5. Units are retired by status change, never deleted once billing history exists.
6. Guided setup wizard has 11 steps (Welcome, Company, Setup Method, Properties, Units, People, Billing Rules, Opening Balances, Payment Channels, Review, Go Live); autosaves, non-linear, admin-only, raises "findings".
7. Unit step accepts ranges (e.g. A101-A120) with preview; overlapping ranges do not duplicate.
8. Bulk upload: 5-step wizard, 11 import types, remembered mapping, strict date-format handling, per-row outcomes, dependency order units -> residents -> leases -> invoices -> payments.
9. Settings and feature flags resolve through lease -> unit -> block -> branch -> organisation -> platform default.
10. NOT FETCHED (HTTP 429): guides/approvals, guides/settings, guides/payment-rules. Their topics below are only what other pages state about them.

## Source URLs (base https://www.nyumbazetu.com/docs/)
Fetched OK: getting-started/quickstart, getting-started/overview, getting-started/navigating-the-app, guides/onboarding, getting-started/roles-and-permissions, getting-started/glossary, guides/organization, guides/branding, guides/portfolios, guides/units, guides/bulk-upload, guides/users-and-roles, guides/feature-flags.
Failed (429 rate limited, not retried): guides/approvals, guides/settings, guides/payment-rules.
Note: content came via a summarising fetch tool; wording is paraphrased, quotes are as returned.

---

# A. ADD PROPERTY / BLOCK (and Branch)

## Purpose
Create the physical containers that units live in. "Block is the building or estate." Branch is the operating scope (property/scheme/region/office). The docs use "property" and "branch" interchangeably in places (wizard step "Properties"; Settings -> Property; branding "this property").

## Entities & fields
| Entity | Field | Required | Type / default |
|---|---|---|---|
| Block | Name | Yes | not specified in docs |
| Block | Address | Yes | not specified in docs |
| Block | Branch assignment | Yes | not specified in docs |
| Branch | Managed at "Organization / Settings -> Property" | - | fields not specified in docs |
| Wizard Property | Name | Yes | text |
| Wizard Property | Short code | Optional | text |
| Wizard Property | Location | not explicitly stated | text |
| Block (units sheet) | Block | Optional in bulk upload ("for properties not using blocks") | - |

## Step-by-step flow
1. Sign in and confirm active branch in the sidebar top (all lists/totals scoped to it).
2. Go to Admin -> Blocks -> Add.
3. Enter name, address, choose branch.
4. Save. Then add units to the block (section B).
5. Alternative: guided wizard step 4 "Properties" (name, short code, location); at least one property required.
6. Optionally assign branding at property scope (Admin -> Branding), and add property to portfolios.

## Rules & validations
- Wizard requires at least one property ("You need at least one").
- Branches keep separate units, leases, residents and financial records; can override org settings; modules (feature flags) can be on in one branch and off in another.
- Users can be assigned to single or multiple branches.
- Most financial reports can group by block.
- Field validation, uniqueness of names/codes: not specified in docs.

## States
Not specified in docs for block/branch.

## Permissions
Not specified in docs for block creation. Admin menu is admin-level; settings/branding are admin-only.

## Dependencies
Needs: organisation, branch. Feeds: units, leases, reports, branding, settings inheritance.

## Open questions
- Block/branch field types, uniqueness, deletion rules, deactivation.
- Whether branch is created in Settings -> Property and with which fields.

---

# B. ADD UNIT

## Purpose
Unit = "the billable physical space: an apartment, a shop, a room, a parking bay." Everything financial attaches through leases to units.

## Entities & fields
| Group | Field | Required | Notes |
|---|---|---|---|
| Identity | House number | Yes (with name) | must be consistent: "A101" vs "A 101"/"Apt A101" create separate units |
| Identity | Name | Yes (house number or name) | - |
| Identity | Block | Yes | optional only in bulk upload |
| Identity | Branch | implied | wrong branch => unit not selectable in lease |
| Identity | Main unit | Optional | links sub-units to a parent; parent shows rolled-up totals |
| Classification | Type | Yes | drives occupancy reporting |
| Classification | Category | Yes | - |
| Classification | Classification | not stated | listed in field groups only |
| Classification | Occupancy type | Yes | determines visibility in lists |
| Physical | Size | Optional (quickstart lists it as required) | docs conflict |
| Physical | Beds | Optional | - |
| Physical | Water meter number | Optional | links to smart-meter feature |
| Commercial | Is managed | toggle | whether org manages it |
| Commercial | Points | not specified | - |
| Commercial | Notes | optional | - |
| Ownership | Owner | Yes on unit page; "optional" in quickstart (docs conflict) | drives owner statements/disbursements |
| Derived (read-only) | Status, active leases, all leases, residents and count | - | computed |
| Financial (computed from ledger) | Total invoiced, total paid, total due, prepaid, wallet balance | - | not stored |

## Step-by-step flow (Admin -> Units -> Add)
1. Identify: house number/name, block.
2. Classify: type, category, occupancy type.
3. Physical: size, beds, water meter number.
4. Management/ownership: is managed toggle, owner.
5. Save. Unit becomes selectable when creating leases (Ctrl/Cmd+Enter saves in most add flows).

## Rules & validations
- Occupancy derived from lease status: Occupied = has active lease; Available = active lease ended. No manual entry.
- Occupied-counting statuses never closed (Pending, Expired) inflate occupancy.
- Financials come from ledger so they match invoices/payments; sub-unit totals may roll into parent.
- Do not delete units with billing history; retire via status change (delete breaks statements, aging, owner reports).
- Duplicates (naming inconsistency at import): consolidate future leases on one unit, keep history.
- Unit not selectable at lease creation: wrong branch or already has an active lease.

## States
Unit status derived (occupied/available). Lease status lifecycle: Draft, Pending, Active, Under Notice, Suspended, Defaulted (TPS), Repossessed (TPS), Ended, Terminated, Completed (TPS), Expired, Cancelled. Standard leases use: Draft, Pending, Active, Under Notice, Suspended, Ended, Terminated, Expired, Cancelled. Transition rules: not specified in docs.

## Permissions / approvals / notifications
Not specified in docs.

## Views
Grid (filter, export), Calendar (lease starts/ends per unit with legend). Unit detail: header, financial KPIs, residents, leases, transactions, documents. Edit from detail page.

## Dependencies
Needs block (unless bulk without blocks), branch, owner. Feeds leases, invoices, owner statements, smart meters, portfolios.

## Open questions
Field types/lengths, allowed type/category/occupancy-type values (configurable?), unit "status" values other than derived occupancy, size units, points meaning.

---

# C. BULK UPLOAD

## Purpose
Spreadsheet import with validation and per-row outcomes. Admin -> Bulk Upload (`/file-upload`). Same engine embedded in expenses and leases lists.

## Import types
Utility readings, payments, residents, invoices, units, leases (cross-row validation), recurring invoices, credit notes, expenses, sales opportunities, promises to pay (resolved by unit name to active lease/tenant). (Page text says "ten" but lists eleven.)

## Entities & fields
Template columns per type: not specified in docs (download sample template per type; template defines mappable fields). Column types, required flags, enum values: not specified in docs.

## Step-by-step flow (5-step wizard)
1. File information: choose import type, download sample template.
2. File upload (file retained for review).
3. Data mapping: map columns to fields; mapping remembered per type; choose date format (year-first, day-first, month-first, month names, Excel serial numbers).
4. Review & submit: server- and browser-side validation; malformed files cannot proceed.
5. Confirmation: rows created / skipped / failed.

## Rules & validations
- Dates: unambiguous shows "Reading 3 July 2026"; ambiguous flagged ("could be read two ways", shown reading applied unless changed); unreadable rejected. System will not guess 03/07/2026.
- Dependency order required: units -> residents -> leases -> invoices -> payments (then credit notes, expenses, readings). Out of order = mass "not found" failures.
- Blocks optional on units sheets.
- Duplicate person in org is refused at row level only; run continues.
- One tenant, multiple units: list tenant once per unit; extra rows add the unit to the person (not rejected). Old runs that left units unattached are not fixed by re-upload.
- Utility readings: per-row reason for non-billing; billing period is part of duplicate check (consecutive months for same meter not duplicates).
- Rows written in small batches; interruption loses at most one batch; interrupted runs auto-close after grace period flagged "unverified counts" and may already have written rows (check history before re-uploading).
- Numeric: thousands separators/currency symbols misread amounts. Spreadsheet date formats shift dates; use template format.
- Payments, invoices, credit notes write real records; no one-click undo once allocated/posted.
- Skipped rows are silent: read skipped, not only failed.
- Best practice: test 10 rows, verify active branch, reconcile counts afterwards.
- Limits (max rows/file size/encoding/decimal precision): not specified in docs.

## States
Run outcome: succeeded, failed, partial, processing (plus auto-closed "unverified counts"). Row outcome: created, updated, skipped, failed (with reason). Per-row detail only for residents, units, credit notes, leases.

## Permissions
Operators and administrators see history; imported files not exposed to residents. Specific permission verb: not specified in docs.

## History / audit
Who, when, type, outcome; per-row outcomes; download original file; retry rows that did not land.

## Dependencies
Needs branch selected, parent records in order. Feeds units/residents/leases/ledger.

## Open questions
Column schemas, enum values, matching keys for "updated", limits, retry specifics.

---

# D. GUIDED SETUP WIZARD (11 steps) - route `/onboarding`

## Purpose
First-run configuration of the organisation to go live. Admin role required (known issue: menu entry doesn't check permission; non-admins bounced to dashboard).

## Step-by-step flow
1. Welcome: informational, no fields.
2. Company: legal name (required); optional trading name, KRA PIN, email, phone, address. Types/validation not specified.
3. Setup method: Guided setup / Upload spreadsheet (validate row by row) / Assisted migration (team-led). Only guided runs inside the wizard today; spreadsheet = Bulk Upload feature; migration = contact support.
4. Properties: at least one; name (required), short code (optional), location.
5. Units: range entry (e.g. `A101-A120`), preview of exactly which units will be created, overlapping range creates no duplicates. Blocked with message if no property saved yet.
6. People: tenants, owners, payers, guarantors; attach to unit with role and start/end dates; second person on same unit adds a role to the same tenancy rather than a second tenancy; skippable.
7. Billing rules: name, frequency, due day, first charge date, last charge date. No amount: rule says when; amount set on the charge after setup.
8. Opening balances: account, balance type (rent arrears / deposit / overpayment / advance / owner), debit/credit amount. Trust and operating totals must each balance on their own before posting. Skippable for fresh start.
9. Payment channels: at least one; types M-Pesa paybill, M-Pesa till, bank account, cash; provider, account name, account number, reference tenants quote.
10. Review: readiness score, checklist (completed/pending/blocking), each unresolved item links to fixing step; findings can be snoozed one week (auto-reappear) or marked non-issue.
11. Go live: requires readiness checks pass; opens dashboard; billing and reminders start on schedule; setup remains available afterwards.

## Rules
- Autosave a few moments after typing stops; header shows last save time.
- Non-linear: all steps clickable; statuses done / skipped / blocked / needs attention.
- "Findings" (blockers or warnings): most urgent shown per step, all in Review.
- Returning to `/onboarding` resumes last step.
- Permissions beyond admin, approvals, notifications: not specified in docs.

## Dependencies
Properties before units; units before people; accounts for opening balances; channels before go-live.

## Open questions
What exactly "readiness checks" test; what Go Live changes technically (jobs enabled?); how shadow mode interacts.

---

# E. ORGANISATION & BRANCHES
- Levels: Organisation (branding, settings, users, chart of accounts; managed in Settings) -> Branch -> Block (Admin -> Blocks) -> Unit (Admin -> Units).
- Branch scope is data boundary; switch branch from sidebar top before starting tasks.
- Settings inheritance: lease -> unit -> block -> branch -> organisation -> platform default (most specific wins).
- Multi-tenancy: white-label, org-specific branding; Super Admin surfaces hidden from org admins.
- Dashboard/Home cached 15 minutes (refresh forces recompute); sessions 12 hours with auto-renew.
- Not specified: branch fields, creation steps, validation.

# F. BRANDING (Admin -> Branding, `/branding-studio`, admin only)
- Scopes: Organisation (default for all properties) or This property (override); studio edits the property currently selected in the switcher.
- Sections: identity; logo (PNG/JPG/WebP in studio, SVG rejected); five colours (primary, secondary, tertiary, success, danger) with contrast hints; typography (font stack, body + two heading sizes); page (A4/Letter/Legal, four margins mm, presets compact/standard/spacious); header/footer print toggles with variables `{{org_name}} {{phone}} {{email}} {{website}} {{page_number}} {{generated_at}}`; organisation details (legal name, tax PIN, address, phone, email, website); legal notes (disclaimer, confidentiality).
- Full profile applies to letters, demand letters, ad-hoc documents (invoices, quotes, proformas, receipts), owner statements, security deposit reports, branded email, public forms. Logo only on invoices, receipts, statements, sidebar/property switcher. Colours/fonts/margins do not yet apply to invoices/receipts/statements.
- Alt logo upload on Organisation Edit and property Edit: applies immediately, JPG/PNG/GIF/WebP/AVIF up to 3 MB; property falls back to org logo; Remove shown only if property has own logo.
- Save: Cmd/Ctrl+S, unsaved-change confirmation.

# G. PORTFOLIOS (`/portfolios`)
Purpose: named group of units cutting across the physical hierarchy (ownership, management or reporting).
| Field | Required | Notes |
|---|---|---|
| Name | Yes | renaming safe |
| Code | Yes | short, stable; re-coding breaks saved exports |
| Description | No | - |
| Kind | Yes | ownership / management / reporting |
| Category | No | - |
| Colour | No | visual identity |
| Owner/Landlord | No | - |
| Effective start | Yes | date |
| Effective end | No | blank = open-ended |
| Assigned units | No | multi-select; a unit can be in several portfolios |
| Active/Inactive | - | two states |
| Internal notes | No | not visible to owners |
Rules: close by end date rather than delete. Permissions, approvals, deletion rules, bulk creation, defaults: not specified.

# H. USERS AND ROLES (Settings -> Team -> Add; roles at Settings -> Team/Roles)
- Flow: invite by work email -> assign role -> assign branches -> set module permissions (view/create/edit/delete plus approve, generate, allocate, reverse, assign, complete, download) -> have user sign in to verify.
- No self-service sign-up; admin creates operator accounts. Disabled user sees "Account disabled".
- Three layers must all align: role, module permissions, branch scope. Least privilege by default.
- Roles: Super Admin (platform staff, cross-org), Admin (org config: settings, service types, chart of accounts, users, roles, strategies, policies, feature flags, approval policy; keep 1-2), Manager (branch/portfolio, approves, assigns, dashboards), Operator/Staff (day-to-day), Resident and Owner (portal only; access derived from resident/owner record, not operator accounts; one person may hold multiple resident-side roles).
- Denial: menu absent, buttons disabled with hover reason, direct URL shows "not authorised".
- Separation of duties (must not sit with one person): record + approve expense; fund + spend expense wallet; raise + approve credit note; configure collections strategy + approve demand letters.
- Changes: role change needs permission recheck; branch transfer remove old branch; leave -> approval delegate; departure -> deactivate, never delete (preserves audit attribution).
- Quarterly review: remove 90+ days inactive, review admins, branch assignments, delegates.
- Super Admin -> User Sessions (`/user-sessions`) shows active sessions.
- Not specified: invitation email details, branch count limits, whether zero branches allowed (but "no data appears" if none assigned), forced session termination, bulk user import.

# I. APPROVALS, SETTINGS, PAYMENT RULES - NOT FETCHED (HTTP 429)
Only what other pages say:
- Approvals: high-impact actions routed for secondary approval (invoice issuance above thresholds, expense payments, demand letters, debt write-offs, message publishing); decisions and rationales recorded on record timelines; approvals stall if no active user has approve verb; delegates for leave. Thresholds/states: not fetched.
- Settings: a configuration value resolved through the scope chain lease -> unit -> block -> branch -> organisation -> platform default; settings gear is category-scoped. Field list: not fetched.
- Payment rules: not referenced beyond wizard step 7 (billing rules: when, not amount) and step 9 (channels). Content: not fetched.

# J. FEATURE FLAGS
- A flag answers "is this available here?". Resolves lease -> unit -> block -> branch -> organisation -> platform default; a flag disabled at a level overrides broader enablement.
- UI: New flag, Module, Toggle, Filters (module/status), Refresh.
- Availability = feature flag AND permission AND job switch (scheduled tasks).
- Shadow mode: money/messaging engines start recommendation-only; enabling flag and switching to autonomous are separate decisions. Rollout: single-branch pilot -> shadow -> supervised -> multi-branch -> autonomous per branch.
- Flag names, defaults, toggle permission: not specified in docs.

# K. NAVIGATION / OVERVIEW / QUICKSTART / GLOSSARY (context)
- Sidebar: Workspace (Home, Dashboard, Leases, Residents), Finance (Receivables, Payables, Collections, Accounting, TPS, Reports), Operations (Communications, Operations, CRM, Admin), Super Admin.
- Grids: AG-Grid server-side paging, column filters, chip quick filters, grouping, column chooser, CSV/Excel export, bulk actions; filters persist in URL; Grid/Kanban/Calendar views; global search; bell notifications; delivery tracker; dark mode; update banner.
- Quickstart order: sign in -> block -> units -> verify chart of accounts (every billable item = service type mapped to income account; billing can't post without it) -> resident (name, phone, email, ID; phone drives SMS and payment matching) -> lease (unit, resident, start, end, rent, billing day, deposit) -> recurring charges -> deposit tracked separately -> invoice (tax exclusive) -> send (email/SMS) -> payment (M-Pesa, bank, cash) -> allocation (preview, execute, logged, reversible) -> trial balance -> close period.
- Glossary highlights: Occupancy derived from lease status; Wallet amount = unallocated received money on a lease; Suspense = unmatched money; Void reverses ledger posting; Write-off keeps invoice, removes receivable as bad debt; Tax class default "D (Non-VAT)"; Aging buckets current, 1-30, 31-60, 61-90, 90+.

# L. Implications for RentRewards (derived, not from docs)
- Model branch_id on every tenant-scoped table and enforce in every query.
- Derive unit occupancy from leases; compute unit financials from ledger.
- Soft-retire units; never delete with history.
- Wizard: store per-step state, findings table with snooze_until, readiness score.
- Bulk import: staged runs table, per-row result table, ordered dependencies, explicit date format.
