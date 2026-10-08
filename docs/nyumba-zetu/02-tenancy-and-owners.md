# Nyumba Zetu - Tenancy and Owners (public docs capture)

Purpose: reference for re-implementing these flows in RentRewards. Everything below comes from the public docs only. Anything absent is marked "not specified in docs". WebFetch returns summaries produced by a small model, so exact wording and details may be lossy.

## Summary (10 lines)
1. A Resident is a person linked to a unit with a role (tenant/owner/contact), a status and start/end dates. One person can hold many associations.
2. Residents are deduplicated: a strong match (phone, email or national ID) blocks the save; a name-only match only warns.
3. Applications are an intake pipeline: Draft, Submitted, Pending, Approved, Rejected, Activated, Cancelled. Approved is not Activated.
4. Activation is a separate, resumable step that creates or attaches the resident and creates or activates the lease. Ownership schemes get a TPS contract instead.
5. A Lease is the billing foundation. Saving it bills nothing; it bills only once recurring charges are attached.
6. Editing rent or dates affects future billing only. Past invoices are corrected by adjustments.
7. Security deposits are a liability, not income. withheld = paid - refunded - deducted(applied).
8. Offboarding is a linear, maker-checker workflow (inspection, financials, approval, finalize) with many finalize guards. Finalized is read-only.
9. Owners have bank accounts (one default), units in scope, and versioned management contracts (commission, cadence, settlement lag, minimum disbursement).
10. Statement = B/F + income - commission - expenses = net payable, C/F. A disbursement is a record only; it does not move money.

## Source URLs
- https://www.nyumbazetu.com/docs/guides/residents
- https://www.nyumbazetu.com/docs/guides/applications
- https://www.nyumbazetu.com/docs/guides/managing-leases
- https://www.nyumbazetu.com/docs/guides/security-deposits
- https://www.nyumbazetu.com/docs/guides/offboarding
- https://www.nyumbazetu.com/docs/guides/owners-landlords
- https://www.nyumbazetu.com/docs/guides/owner-contracts
- https://www.nyumbazetu.com/docs/guides/owner-statements
- https://www.nyumbazetu.com/docs/guides/owner-disbursements

All nine fetched successfully.

---

## 1. Residents

### Purpose
Register every person the platform knows about in relation to a unit: tenant, unit owner, next of kin, or other contact. It is the person record that leases, portal access and statements hang off.

### Entities & fields
| Group | Field | Notes |
|---|---|---|
| Identity | first name, last name, full name | required/optional not specified in docs |
| Identity | national ID, passport, birthday, occupation, company | not specified in docs |
| Legal identity | legal type | Individual, company, trust, joint owners, non-profit, government, other |
| Legal identity | registered name | not specified in docs |
| Legal identity | KRA PIN | validated on entry and on the server |
| Contact | primary phone, primary email | consistent format advised |
| Contact | secondary phone/email, other phones/emails, address | |
| Association | company (organisation), property (branch), block, unit | |
| Association | role | tenant, owner, contact |
| Association | status | reflects whether the association is current |
| Association | start date, end date | bound the period |
| Extras | vehicles, licence plates, comments, notes, documents | documents: IDs, agreements, KYC files |
| Audit | created by/at, updated by/at | exposed as list columns |

Types, defaults and required flags: not specified in docs.

### Flow: add a resident
1. Residents list, then Add.
2. Capture identity (name, national ID).
3. Capture contact details.
4. Set association: block, unit, role, start date.
5. Save. The resident becomes selectable in lease create/edit.

Other flows:
- Bulk import: Residents list "Import residents", or Admin, Bulk Upload (Residents). Columns are mapped, rows validated before commit, and each row is recorded as created, skipped or failed with a reason.
- "Make owner" action in the residents grid promotes a resident to an owner. It reuses the same record. Do not also add the person from the Owners hub, or their money splits across two identities.

### Rules & validations
- Strong duplicate (same phone, email or national ID): save refused; the user must pick the existing record or change the entry.
- Name-only duplicate: save proceeds, and an advisory shows what differs (for example "same name, different phone"). Dismissible with "Not the same person" or "Open their record".
- Set legal type whenever a company or trust holds the unit. If left as individual, invoices address the login holder, which is the wrong counterparty and flows into tax filing.
- Role: tenant and owner carry paying responsibility; others are contacts.
- One person can be tenant of one unit and owner of another. Each association has its own role, unit, status and dates.
- Ending a tenancy does not delete the resident. Set the end date and status; history stays.
- Editing phone/email redirects future communications only; sent messages are unchanged.
- Duplicates are merged by moving associations to the correct record and closing the duplicate. Do not delete records with billing history.
- A statement showing old units is fixed by setting an end date on the old association.
- List: filter, sort, group, column chooser, export.

### States
No formal state machine. Status is "current or not", bounded by start/end date.

### Permissions
Not specified in docs.

### Dependencies
Leases (name the responsible resident; one resident can have many leases), tenant portal (needs a valid email; sees bills, statements, payments, service requests, amenity booking; inherits associated units), screening section (when enabled: background and reference checks before lease signing), Delivery Tracker (SMS), Applications, Owners.

### Open questions (not in docs)
Field requiredness and types, role permissions, approvals, notification content, exact status values, merge tooling beyond the manual process, screening fields.

---

## 2. Lease Applications

### Purpose
Intake pipeline from prospective tenant to live lease: collect documents, run checks, decide, then activate.

### Entities & fields
Application workspace sections (not a field list):
| Section | Contents |
|---|---|
| Overview | applicant summary, requested unit, dates, next step |
| Parties | applicant, co-applicants, guarantors, next of kin |
| Documents | ID, payslips, references; upload actions |
| Checklist | stage-gating items |
| Decisions | decision record and reasoning |
| Assignment | application owner, assign action |
| Timeline | chronological log |
| Notes | working notes |
| Blockers | what is missing/obstructing |

A "next step panel" tells the assignee what to do. Field-level spec (required/optional, types): not specified in docs.

Pages: Overview `/applications/overview`, My Work `/applications/inbox`, All Applications `/applications/dashboard`, Review `/applications/review`, Activations `/applications/activation`, Import `/applications/bulk-import`, Issues `/applications/integration-exceptions`, Settings `/applications/settings`.

### Flow
Intake channels: public form `/apply`; in-app staff entry for walk-ins; bulk spreadsheet import; external integration (failures go to Issues).
1. Triage from inbox and assign an owner (unassigned applications go stale).
2. Work the checklist: collect documents, complete checks; the blockers card shows gaps.
3. Screen the applicant: background and reference checks recorded on the resident record.
4. Decide: approve or reject with a documented reason; recorded on the timeline.
5. Activate (separate, deliberate step) from the Activations page.

### Rules & validations
- Checklists are stage gates. Templates (set in Settings, can differ per scheme) define required items per stage, for example ID copy, employer reference, deposit payment. The application cannot progress until items are satisfied.
- Editing a template does not change in-flight applications. A "refresh checklist" action re-evaluates them.
- Approved is not Activated: a decision exists but no lease.
- Activation creates or attaches the resident, creates or activates the lease, and applies the agreed terms. It is resumable after a partial failure; the Activations page shows completed and incomplete steps. Never create the lease manually as well, or the applicant gets two tenancies.
- For ownership schemes, activation produces a TPS contract instead of a rental lease.
- Duplicate applications: cancel one and record the reason on the survivor.
- Integration failures (validation/mapping) appear in Issues with a detail panel and resolution action; clearing the queue prevents silent intake loss.
- Overview metrics: volume and source, stage distribution, age of oldest per stage, conversion to activated leases.

### States
Draft, Submitted (awaiting triage), Pending (outstanding items), Approved, Rejected (with reason), Activated, Cancelled. Exact transition table is not specified in docs; the order above is the documented progression.

### Permissions
Not specified in docs.

### Dependencies
Residents, Managing Leases, Forms (profiling questionnaires), Ownership Plans (TPS), integrations.

### Open questions (not in docs)
Fields, roles, notifications to applicant, whether approval needs a second approver, which statuses can transition to Cancelled, what exactly "terms" are applied at activation, deposit handling at activation.

---

## 3. Managing Leases

### Purpose
The contract between the organisation and a resident for a unit. It is the base for invoices, statements, arrears and collections.

### Entities & fields
| Field | Notes |
|---|---|
| Unit | must exist and have no active lease; same branch |
| Resident | the tenant; create first if needed |
| Start date, end date | drive expiry reporting, renewals, pro-rating |
| Rent amount, frequency, billing day | the billing cycle |
| Security deposit amount and terms | |
| Recurring charges | attached separately; each has an end date |
Types, defaults, limits: not specified in docs.

### Flow: create
Leases, then Add.
1. Select unit.
2. Select resident.
3. Set term.
4. Set rent and billing cycle.
5. Record deposit.
6. Save (does not bill).
7. Add recurring charges (from Lease detail, Charges page).
Bulk import: Admin, Bulk Upload (Leases); rows are grouped and validated, with per-row outcomes.

### Flow: renew
1. Find expiring leases (Lease Expiry Report or end-date filter).
2. Agree new terms.
3. Extend the existing lease (same parties and unit) or create a new lease if materially different.
4. Apply new rent from the renewal date, not today. Escalation schedules handle rent increases over time.

### Flow: end (move-out)
1. Record notice: set Under Notice with a vacate date.
2. Stop future billing: set end dates on recurring charges.
3. Final bill and reconcile: final charges, apply wallet balance, settle invoices.
4. Settle deposit: agree deductions, refund the balance.
5. Close the lease: Ended (natural) or Terminated (early exit).
6. Unit becomes free.
(The formal controlled version of this is Offboarding, section 5.)

### Rules & validations
- A lease with no recurring charges bills nothing (the most common onboarding mistake).
- Editing rent/dates changes future billing only. Issued invoices are not rewritten; use adjustments.
- Charges are ended with an end date, not deleted. Add mid-term charges (for example parking) without disturbing others.
- A charge with no end date keeps billing a vacated unit. A lease left Active after move-out keeps billing and creates arrears.
- Lease and unit are separate records; a unit has many leases over time and a lease keeps its history.
- Cannot create a lease on a unit that has an active lease or is in another branch.
- Views: grid and calendar (start and end plotted per row). Reports: Lease Report, Lease Expiry Report, Debt Aging by lease, Tenant Ledger/Statement.
- Changeable fields: dates, rent, charges, responsible resident.

### States
Draft, Pending, Active, Under Notice, then Ended / Terminated / Expired; Active can go to Suspended. TPS adds Defaulted, Repossessed, Completed (full reference not given). Status controls occupancy, billing eligibility and arrears generation. Transition rules: not specified in docs.

### Permissions
Not specified in docs.

### Dependencies
Units, Residents, recurring charges and escalation schedules, invoices, wallet, security deposits, offboarding, reports.

### Open questions (not in docs)
Field types/defaults, what triggers Pending vs Active, what Suspended does to billing, how Expired is set (automatic or manual), pro-rating formula, who may edit.

---

## 4. Security Deposits

### Purpose
Track funds held against a lease for damage, unpaid rent or breaches. Treated as a liability held on the tenant's behalf, never income.

### Entities & fields
Menu: Finance, Accounting, Security Deposits (`/deposits`).
| Field | Required | Type |
|---|---|---|
| Amount | yes | numeric |
| Date received | yes | date |
| Lease or tenant | yes | reference |
| Bank account holding the deposit | yes | reference |
Deductions: rows with an "applied" status. Refunds: rows. Technically a deposit is a charge billed against a deposit service type and settled by payment, linked to an invoice.

### Flow
1. Record at lease setup or when funds arrive.
2. At move-out, record deductions first.
3. Then record refunds up to the eligible amount; balance updates automatically.
4. Download the PDF report from deposit detail (identifiers, lease context, balance breakdown, deduction and refund activity).

### Rules & validations
- withheld = paid - refunded - deducted (deducted counts only entries with "applied" status).
- New deduction/refund rows require withheld > 0.
- On create: amount > 0 and <= current withheld. On edit: allowed up to existing row amount + current withheld.
- Add actions appear only while withheld is positive.
- Refund progress: none (no refund), partial (refunded < paid), full (refunded = paid).
- Local law may govern deductions; apply organisational policy and document deductions.

### States
Derived refund progress only (none, partial, full). No other status model specified in docs.

### Permissions
Not specified in docs (refers to a Roles and Permissions guide not fetched).

### Dependencies
Leases, invoices, refunds ledger guards, accounting (liability treatment), offboarding.

### Open questions (not in docs)
Deduction status values beyond "applied", approval of refunds, refund method (M-Pesa/bank), interest on deposits, journal entries posted.

---

## 5. Offboarding

### Purpose
Close a tenancy in controlled order: inspection, financial review, approval, finalize.

### Entities & fields
Menu: Leases, Offboarding (`/v2/offboarding`). Creation inputs: lease (unit, tenant, branch auto-populate) and target offboarding date.
Tabs: Inspection (checklist, damages as a single amount, waiver option), Financials (computed totals), Documents (exit paperwork, each marked pending until ready), Approval, Activity (audit trail with timestamp and actor).
Computed outputs: total invoiced, total paid, balance, held deposit, deductions (damages and arrears), refund amount.

### Flow
1. Offboarding, New.
2. Select lease.
3. Set target date; record created as Draft.
4. Inspection: work the checklist, record damages, or waive the walkthrough (recorded as a waiver).
5. Financials: run the computation (at least once; rerun after any change; reads live figures).
6. Resolve arrears/adjustments to reach Financials cleared.
7. Forward for approval; a different user (checker) approves or rejects.
8. Finalize.

### Rules & validations
- Maker-checker: the preparer cannot approve their own record.
- Finalize is blocked if any of these hold: inspection required but incomplete/not waived; financials never computed; open invoices remain; deposit refund computes negative; tenant balance outstanding; approval required but not granted; workflow not at Approved (or Financials cleared when approval is not required).
- A negative refund signals data problems; fix damages or allocations rather than restructuring debt.
- After Finalized: read-only, no reopening; correct with an adjustment against the lease.
- A cancelled offboarding does not terminate the tenancy.

### States
Draft, Initiated, Inspection pending, Inspection done, Financial review, Financials cleared, Approval pending, Approved, Finalized (terminal). Exits: Rejected (checker returns) or Cancelled. Approval is conditional ("if required"). Which transitions are automatic vs manual: partly stated ("Inspection pending: automatic").

### Permissions
Maker-checker rule only; role names and authority: not specified in docs.

### Dependencies
Managing Leases, Security Deposits, Invoices and Payments, Approvals framework.

### Open questions (not in docs)
What makes approval "required", document types and generation triggers, approval routing, notifications, timeouts, whether finalize closes the lease and frees the unit automatically, how the refund payout is executed.

---

## 6. Owners and Landlords

### Purpose
Manage the relationship with property owners: units under management, income, costs and payouts. The legacy Landlords page was retired in August 2026; owners now live in the unified party register.

### Entities & fields
Navigation: Overview `/owner-overview`, Owners `/owners`, Contracts `/owner-contracts`, Statements `/owner-statements`, Disbursements `/owner-disbursements`, Schedules `/owner-statement-schedules`.
Owner record tabs: Overview, Contracts, Units in scope, Statements (PDF), Disbursements, Ledger, Allocations (receipt attribution), Bank accounts, Contacts, Documents, Activity.
Create fields (Owners, Add): name, contact details, tax identifier, address (required per docs; types not specified).
Bank account: one marked default.

### Flow
1. Owners, Add: create the owner record.
2. Add payout bank account and mark one as default.
3. Attach units.
4. Create the management contract (commission terms, cadence, thresholds).

Money flow: tenant pays rent, allocated to invoices on the owner's units, owner statement (gross income - commission - attributed expenses) gives net payable, disbursement to the owner's bank account.

### Rules & validations
- No default payout account means disbursements cannot be created.
- Units must be on the right owner or income never reaches the statement.
- Expenses must be attributed to the right unit or block or costs are never recovered.
- Verify payout bank detail changes out-of-band (phone).
- Statements are generated on a configured cadence by schedules; disbursements use the default account unless overridden.
- Owner Overview is the page to open before a payout run.
- Reports: owner statement, expense report; legacy landlord report/statement.
- Troubleshooting: no income means units not attached or income on a different unit; wrong commission means check contract terms and effective dates; zero balance means check period and whether statements were generated.

### States
None specified for owners.

### Permissions, approvals, notifications
Not specified in docs.

### Dependencies
Residents ("Make owner"), units, contracts, statements, disbursements, expenses, bank accounts.

### Open questions (not in docs)
Field types, tax identifier format (KRA PIN presumably, not stated), owner portal/login, permissions, how receipts are allocated to owners (Allocations tab detail).

---

## 7. Owner Contracts (Beta)

### Purpose
A management agreement: what is managed, the fee, and the settlement cadence.

### Entities & fields
| Field | Type | Required | Notes |
|---|---|---|---|
| Owner | selection | yes | linked to owner record |
| Agreement name | text | yes | distinguishes multiple agreements |
| Status | Draft / Active | yes | Draft is non-operational |
| Start date | date | yes | effective date, not creation date |
| End date | date | no | empty means open-ended |
| Fee structure | percentage or amount | yes | |
| Fee basis | select | yes | "rent we collect" (on receipt) or "rent we invoice" (on billing) |
| Payout cadence | Monthly / Weekly / On request | yes | |
| Payout day | numeric | no | monthly only, max 28 |
Other contract elements: unit scope, service types in scope (rent only, or plus utilities/service charge), per-service-type commission where rates differ, settlement lag (days), minimum disbursement, negative balance handling, accounting treatment, AR control account, version history. Their input formats are not specified in docs.

### Flow
1. Owners, owner, Contracts, New agreement, or Owners, Contracts, New agreement (then pick owner).
2. Fill fields above and save.
3. Verify the first statement line by line.

### Rules & validations
- Commission terms are versioned, not overwritten. Each version has valid-from/valid-to. Statements use the terms active in their period; edits create a new version from an effective date and never rewrite old statements.
- Detail page shows rule source (default / service-type-specific / manual override) and override status per line.
- Creation and editing are admin-only; no approval step; changes are immediate.
- Typical settings: monthly cadence, settlement lag 5-10 days, small minimum disbursement (below it the amount carries forward), negative balance carried forward.
- Lifecycle: renegotiated terms add a version; unit changes update scope from the effective date; termination sets valid-to (statements stop after the final period, carried balances settle); on property sale end the contract and create a new one for the new owner (do not re-point).
- Legacy agreements may show "Not linked to an owner".

### States
Draft, Active; ended by valid-to date.

### Permissions
Admin only.

### Dependencies
Owner record, units, owner statements, disbursements.

### Open questions (not in docs)
Date validation, fee minimums, defaults, notifications, audit logging, options for negative balance handling and accounting treatment, fee calculation base (VAT on commission).

---

## 8. Owner Statements

### Purpose
Periodic account of income, cost, management commission and net payable per owner.

### Entities & fields
Formula: B/F + income - commission - expenses = net payable; then C/F. Last period's C/F is this period's B/F.
Components: summary (period, owner, headline), account activity by unit at invoice level, service-type rows, line detail (drill to invoices/payments/expenses), commission with rule source, closing balance, net payable (subject to minimum disbursement), linked documents (PDF, attachments), timeline (generation, regeneration, delivery).
Sources: income is invoices on leases of units in contract scope, only for in-scope service types; commission uses terms as at the period; expenses are those attributed to owner's units or blocks.

### Flow
Owners, Statements.
1. Close period activity (invoices issued, payments allocated, expenses recorded).
2. Generate (bulk or per owner).
3. Review: commission, expense attribution, B/F equals prior C/F.
4. Download or send the PDF.
Schedules (Owners, Schedules): create schedules, "run now" for off-cycle; they follow contract cadence and settlement lag but do not remove the review step.

### Rules & validations
- Generating over incomplete data requires regeneration.
- Regenerate only when underlying data was wrong (missing expense, misallocated receipt), never for term changes. Regenerations show on the timeline.
- B/F not equal to prior C/F: out-of-order generation, or an earlier period reopened after the current statement.
- Known platform defect: expense totals were understated until 28 August 2026 (many expense documents resolved to 0.00); regenerate earlier statements before payout.
- Low income: units missing from scope or wrong-unit invoices. Missing commission: service type not in scope.

### States
Not specified in docs beyond generated/regenerated/delivered events on the timeline.

### Permissions, approvals
Not specified in docs.

### Dependencies
Owner contracts, invoices, payments, expenses, schedules, disbursements.

### Open questions (not in docs)
Roles, approval before sending, email delivery mechanics, PDF triggers, retention, disputes, whether income recognition follows "collected" or "invoiced" per statement (contract fee basis hints at both), statement locking.

---

## 9. Owner Disbursements (Beta)

### Purpose
Record funds paid to owners to settle the net payable on statements.

### Entities & fields
| Field | Notes |
|---|---|
| Owner | recipient |
| Amount | payout value |
| Method | bank transfer, mobile money |
| Account | owner's payout account; defaults to the default account |
| Reference | outbound transaction ID for reconciliation |
| Paid at | timestamp of the transfer |
| Status | lifecycle position (values not specified in docs) |
| Notes | free text |
| Linked statement | statement settled |
| Timeline | audit trail |

### Flow
Prerequisites: statements generated and reviewed; check owner overview; verify minimum disbursement thresholds; confirm payout account.
1. Record the disbursement (amount, method, account, reference, date).
2. Execute the payment through bank or mobile money outside the system.
3. Keep the payment reference.
Reconcile: filter by date and bank account, match to bank debits by reference, investigate both directions, verify owner ledger equals prior statement C/F minus later payments.

### Rules & validations
- Recording does not move funds; payment is manual.
- No default payout account means it cannot be created.
- Settlement lag in the contract protects against paying uncleared receipts.
- Mismatch with statement: check carry-forwards, thresholds, partial payments. Reconcile before creating new records to avoid duplicates.

### States
Status exists but values are not specified in docs.

### Permissions, approvals
Not specified in docs.

### Dependencies
Owner statements, contracts (threshold, lag), bank accounts guide (not fetched).

### Open questions (not in docs)
Status values, partial payment handling, approvals, M-Pesa B2C integration (docs imply manual), ledger postings, reversal flow.

---

## Cross-cutting notes for RentRewards
- Model Resident-to-unit as an association table (role, status, start, end), not columns on the person.
- Separate Approved and Activated for applications; make activation idempotent and resumable.
- Never let lease save imply billing; billing derives from recurring charges with end dates.
- Keep deposits as a liability with deduction and refund child rows.
- Version contract terms with valid_from and valid_to; statements snapshot the terms in force.
- Statements carry B/F and C/F and must be generated in order.
