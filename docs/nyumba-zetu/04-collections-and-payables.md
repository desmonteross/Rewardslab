# Nyumba Zetu - Collections and Payables (reference for RentRewards)

## Summary (10 lines)
1. Collections is an orchestrator over the accounting ledger, not a second ledger; cases, debt-aging and tenant statements must always agree.
2. Lifecycle: debt detected -> case opened -> scored (0-100, bands A-E) -> assigned -> contacted -> promise recorded -> payment monitored -> escalated or closed.
3. Entry thresholds (min balance, min age days, debt scope) are snapshotted onto each case with the resolved strategy; later config changes never rewrite in-flight cases.
4. Net balance = gross due - wallet (unallocated cash); gross and wallet are always shown separately. Delinquency bucket is derived on read, never stored.
5. Shadow mode (default, per branch): engine stages actions, a human confirms every send, disconnect and fee.
6. Actions (engine-created ladder steps) vs Interactions (person-logged contacts); interaction outcomes drive score, contact state, and next step.
7. Promise to Pay pauses the ladder, is auto-evaluated against payments, and feeds scoring; renegotiate instead of editing.
8. Late fees: policy rules + idempotent nightly assessments; trial mode when no income category; waive requires a reason.
9. Demand letters: frozen balance, pinned template version, stored PDF, acknowledgement link; no unsend, only void. Optional two-person approval.
10. Legal register is display-only for money. Vendors are payee records (no bank details). NOT COVERED (fetch rate-limited, HTTP 429): strategies, expenses, expense-wallets.

## Sources (base https://www.nyumbazetu.com/docs/)
Fetched OK:
- guides/collections/overview
- guides/collections/worklist-and-cases
- guides/collections/demand-letters
- guides/collections/promise-to-pay
- guides/collections/penalties
- guides/collections/legal-register
- guides/collections/debt-aging
- guides/vendors

FAILED (proxy HTTP 429 rate limit; not retried per instruction, no other means used):
- guides/collections/strategies
- guides/expenses
- guides/expense-wallets

Sections for these three are placeholders: everything is "not specified in docs / not fetched". Only fragments mentioned on other pages are noted.

---

## 1. Collections Overview

### Purpose
Turn arrears reporting into active case work. Path: Finance -> Collections -> `/collections/overview` (Beta).

### Entities & fields
| Entity / field | Detail |
|---|---|
| Per-lease balance read | gross due, wallet/unallocated cash, net balance, bucket amounts, oldest due date, last payment date, per-service-type breakdown |
| Entry thresholds (all required) | minimum balance amount; minimum age in days; debt scope (all debt / rent only / utilities only); exit hysteresis |
| Feature flag | boolean, enable Collections per branch |
| Strategy (dunning ladder) | resolved via scope chain lease -> unit -> block -> branch -> organisation -> default |
| Message templates | required for reminder and demand-letter steps |
| Assignment rule | manual, round-robin, by-branch, by-balance-band |
| Enforcement mode | shadow (default) or autonomous, per branch |
| Score | 0-100; band A-E |
| Priority | approx. net balance x (100 - score) |

Console panels: Arrears Exposure (in-arrears vs not-yet-due, oldest overdue date), Ageing (current, 1-30, 31-60, 61-90, 90+), Arrears Book (by service type), Billed vs Collected, Collection Rate (collected / billed to date), Case Flow (opened vs closed), Risk Distribution (A-E), Officer Activity, Penalties, Legal Register.

### Flow
1. Admin enables flag, sets thresholds, strategy, templates, assignment rule, enforcement mode.
2. Engine sweeps arrears on a schedule; also re-evaluates a single lease immediately when a payment or allocation lands.
3. Balance read from ledger.
4. Entry test: lease crosses min balance, min age, within debt scope.
5. Case opened; strategy and thresholds snapshotted onto it.
6. Collectability score computed, band assigned.
7. Next dunning step staged (not auto-sent in shadow mode).

### Rules & validations
- Net balance (not gross) is used for triggers and exit tests.
- Disputed amounts (where enabled) excluded from collectible balance and ladder triggers.
- Bucket and recovery state derived from ledger on read, never persisted.
- Autonomy earned per branch, never globally.

### States
See section 2 (case lifecycle).

### Permissions
Not specified in docs.

### Dependencies
Ledger/invoices/payments/allocations, templates, strategies, penalties, legal register, debt aging.

### Open questions
- Scoring formula inputs/weights (only: promise-kept ratio and recency of broken promises mentioned elsewhere).
- Schedule frequency of sweep; exit hysteresis values; confirmation-window length.
- Notifications, approvals at overview level: not specified.

---

## 2. Worklist and Cases

### Purpose
Ranked queue (`/collections/worklist`) and per-case workspace (`/collections/cases/{uuid}`). Finance -> Collections -> Worklist (Beta).

### Entities & fields
Worklist columns:
| Column | Notes |
|---|---|
| Lease | link, opens case |
| Property, Unit | read-only |
| Band | A (most collectable) to E |
| Score | 0-100 |
| Net Balance | gross - wallet; trigger figure |
| Gross Due | contractual debt |
| Wallet | unallocated cash |
| Days Past Due | age of oldest overdue item |
| Status | open / on hold / closed |
| Treatment | active / promise / dispute / hardship / legal |
| Contact | not contacted / contacted / unreachable / right party |
| Assigned To | officer |
| Pending Action | staged ladder step awaiting human |
| Next Follow-up | date, Nairobi calendar |
| Priority | ranking value |
| Opened | timestamp |

Filters: chips Follow-ups due (date <= today Nairobi), Pending actions, On hold; also My cases, new, broken promises, not yet contacted, unreachable, high value, pending approval, recently paid (clearing). Filters combinable and URL-persistent. Recommended sort: Priority.

Case workspace: header (identity, unit, property, status, band clickable for score drivers, phone with call/WhatsApp links, unreachable indicator); tiles (net balance, wallet credit, oldest due, next follow-up); escalation band ("a step is only ticked where there is evidence"); header buttons Record promise, Log interaction, More (assign, request demand letter, hold/resume, override score, close case). Tabs: Overview (staged step + excerpt, Preview & send / Skip, promise, timeline, debt summary, facts), Debt (per service type: original, outstanding, oldest due, days past due; read-only ledger projection), Activity (All, Full story, Interactions, Actions; only Full story shows payments and late fees, read by lease), Documents (demand letters, handover packs; per-row issue/delivery/ack; Record ack, Void), Legal (linked matters).

Action (engine-made): types SMS reminder, email reminder, demand letter, penalty, IoT disconnect, handover flag, field-visit task. Delivery status: staged, awaiting approval, sent, skipped, failed.

Interaction (person-made) fields:
| Field | Required | Type |
|---|---|---|
| Channel | yes | call, SMS, WhatsApp, email, letter, visit, meeting, note |
| Direction | yes | inbound / outbound |
| Contact person | yes | person |
| Number/address actually used | yes | text |
| Right party | yes | boolean |
| Outcome | yes | dropdown (below) |
| Follow-up date | required if outcome = follow up | date |
| Notes | no | text |
| Attachments | no | file |

Outcome values: promises (deep-links to Promise recording, pauses ladder), disputes (treatment flips to dispute, amount removed from triggers), follow up (adds to follow-ups-due queue on date), wrong number (updates unreachable indicator), contacted (updates contact state), unable to pay, no answer, delivered, read, requests statement, requests restructure, paid, third party (behaviour for these: not specified in docs). Engine-sent messages also auto-log an interaction.

### Flow (recommended case work)
1. Read debt breakdown (rent vs utilities vs penalty).
2. Check wallet; unallocated cash means allocate, not collect.
3. Check Related leases (one conversation per tenant).
4. Contact, then log interaction immediately (outcome schedules next step).
5. Record commitment as a Promise (notes are invisible to engine).
6. Confirm or skip staged action; stale staged actions stall cases.

Preview & send: shows recipient, subject, template version, placeholder warnings, full body exactly as sent, "Send it". Sending is final. Approval-needed steps go to approvals inbox; case shows "Awaiting approval"; decision lands on timeline with decider and reason.

### Rules & validations
- Reasons mandatory: skip, hold, score override. Close requires reason selection.
- Close reasons: resolved, written off (needs approval), handed over, cancelled.
- Approval required for: demand letter issue, handover, fee waiver, hardship restructure, write-off closure.
- Assign keeps history. Score override audited; next engine refresh proposes but never silently reverts. Every console mutation audited.
- Active promise pauses ladder steps flagged "pause on promise"; broken promise resumes ladder, raises severity, stages follow-up task.
- Reopening creates a new linked case, not resurrection.

### States
`open -> active <-> on hold -> clearing -> closed (resolved | written off | handed over | cancelled)`. Clearing: net balance below exit threshold; closes after confirmation window; hysteresis avoids flapping. Reopen from closed = new linked case. Treatment flag (active/promise/dispute/hardship/legal) is separate from status.

### Permissions
Not specified here (links to getting-started/roles-and-permissions, not fetched).

### Dependencies
Strategies, demand letters, promises, penalties, legal register, allocations, approvals inbox.

### Open questions
Hold auto-resume ("time-based condition" mentioned vaguely); behaviour of several outcomes; notification content; who may approve; confirmation-window length.

---

## 3. Collection Strategies (dunning ladders)

### Purpose
Define ladder steps per scope. PAGE NOT FETCHED (HTTP 429).

### Known only from other pages
- Resolved via scope chain lease -> unit -> block -> branch -> organisation -> default.
- Steps types seen: SMS/email reminder, demand letter (step may designate a template), apply_penalty, IoT disconnect, handover flag, field-visit task.
- Steps may be flagged "pause on promise"; steps may require approval.
- Resolved strategy snapshotted onto case.

### Entities, flow, rules, states, permissions, dependencies
Not specified in docs / not fetched. Open question: step timing offsets, conditions, template binding fields, approval flags, enforcement-mode interaction per step.

---

## 4. Demand Letters

### Purpose
Formal arrears notice: wording pinned, balance frozen at issue, PDF stored, acknowledgement tracked.

### Entities & fields
| Field | Detail |
|---|---|
| Why now? | required note, stored on letter and case timeline |
| Customer, unit, case | identity references |
| Template name + version | pinned |
| Issuer, approval status | recorded |
| Issue timestamp, delivery status, ack status + method | tracked |
| Financial snapshot | arrears by charge type, total frozen (immutable) |
| Issued PDF | stored |
| Void reason | required on void |
Settings: Settings -> Collections -> Documents -> "Demand letters need approval" (default off); "Acknowledge-link lifetime" (default 30 days); "Demand-letter template" default (org/branch).

### Flow
Path A (case): Case -> More -> Request demand letter -> preview dialog -> enter Why now -> send.
Path B (shortlist): Demand letters register -> New demand letter -> (1) select by unit/block/case number, ordered by debt size, multi-select, warning if letter already active; (2) one reason for batch; (3) step through rendered letters; (4) send sequentially, partial-failure report ("Sent 6 of 8") with missed recipients for retry.
Path C (worklist): tick rows -> Send demand letters (same dialog, no search step).
After issue (approval off): PDF stored, email queued with secure acknowledgement link.

### Rules & validations
- Template resolution: strategy step template -> org/branch default -> built-in "Rent Arrears Demand Notice". Only published templates work; draft fails issuance.
- No edit at send (no wording box, template picker, recipient override). Preview shows template version and unfilled-placeholder warning.
- Approval on: request to approvals inbox, case "Awaiting approval", nothing issues until approved; requester cannot approve own letter (second administrator needed).
- Cannot letter closed cases.
- No unsend; void only: disables ack link, keeps letter and PDF as evidence.
- Ack link lifetime 30 days default.

### States
Draft -> Issued -> Delivered (email tracking) -> Acknowledged (customer link or officer-recorded); Voided (withdrawn, from issued states). Transition draft->issued via send/approval.

### Permissions
Collections edit permission required. Second administrator for approval.

### Dependencies
Templates library (guides/documents-and-templates), approvals inbox, case, strategies, legal register.

### Open questions
PDF generation details; email delivery tracking mechanism; SMS delivery; whether voided can be reissued; void by whom.

---

## 5. Promise to Pay

### Purpose
Record resident commitment (amount, date, optional instalments); auto-evaluate vs payments. Finance -> Collections -> Promise to Pay `/payment-promises` (Beta).

### Entities & fields
| Field | Required | Notes |
|---|---|---|
| Total amount | yes | |
| Due date | yes | |
| Instalments | optional | each evaluated independently |
| Lease, invoices | link to debt | specific invoices or lease |
| Linked case | via case outcome "promises" | |
| Payment receipts | added by Record payment | enter arriving amount, not running total; system-matched shows source transaction |
Other types, formats, limits: not specified in docs.

Pages: Overview (KPI console), Promises (list with status/amount/date/received/lease/resident/case, filters e.g. Due today, Missed; Record promise, Edit drawer), Call list, Contact log. Detail: journey Recorded -> Reminded -> Due -> Outcome; promised vs received progress bar; tabs Follow-up, Payments, History, Comments, Documents; actions Log call, Mark fulfilled, Send reminder, Mark partial payment, Renegotiate, Edit, Cancel.

### Flow
1. From case (outcome promises) or Promise to Pay -> Create.
2. Enter total and due date; optional instalments.
3. Link lease and invoices.
4. Save: active, ladder pauses, reminders auto-schedule.
5. Payments recorded or matched; status auto-updates.
6. If unable to pay: Renegotiate.

### Rules & validations
- Settled/missed/cancelled/renegotiated promises accept no further receipts.
- Editing amounts/dates destroys scoring data; renegotiate instead (old promise terminal and linked to new; only pending instalments cancelled).
- Case effects: created -> treatment promise, configured steps suspend; kept -> case clears; partial -> ladder resumes on shortfall, lower severity; missed -> ladder resumes, severity up, follow-up staged; renegotiated -> new schedule governs, timeline records both.
- Feeds score (kept ratio, recency of broken promises). Late-fee rules skip invoices under live promise by default.
- Practices: record during call; split amounts over one month rent into instalments; use tenant-chosen dates; check Missed queue daily.

### States
Pending -> Reminded -> {Fulfilled | Partially paid (live) | Missed}; Cancelled (before evaluation); Renegotiated (superseded). Groups: Live = Pending, Reminded, Partially paid; Missed; Concluded = Fulfilled; Closed = Cancelled, Renegotiated. Partial -> Fulfilled/Missed by later evaluation (implied).

### Permissions / notifications
Not specified (reminders exist: pre-due reminder sets Reminded; recipients/channels not specified).

### Dependencies
Cases, ladder, penalties, scoring, payments/allocation matching.

### Open questions
Reminder timing; tolerance for "sufficient payment"; max instalments; who can cancel; how instalment status rolls up.

---

## 6. Penalties (Late Fees)

### Purpose
Policy rules plus assessments of late fees. Finance -> Collections -> Late fees. Nightly automated sweep over overdue invoices.

### Entities & fields
Rule:
| Field | Type | Required | Notes |
|---|---|---|---|
| Scope | dropdown | yes | all properties / property / block / unit / tenant |
| Fee type | fixed or percentage | yes | percentage: balance basis (invoice only vs tenant total) + optional per-charge ceiling |
| Grace days | number | yes | after due date |
| Frequency | dropdown | yes | once / daily / weekly / monthly |
| Skip promises to pay | toggle | no | default ON |
| Include overdue invoices | checkbox | no | reaches debt older than rule start; preview shows impact |
| Bill late fees as | income category | conditional | empty = trial mode |
| Priority | number | no | lower wins; more specific scope breaks ties |
| Active | toggle | yes | deactivate, never delete |
| Penalty service type | dropdown | no | maps to income account |
Assessment: case/lease id, triggering invoice, basis amount, computed fee, rule, cycle key, billed/not billed (plus waived state).
Preview panel: example fee, first charge date, cumulative after months, invoice count on first run.

### Flow (activation)
1. Ensure late-fee income category exists (e.g. Fines and Penalties).
2. Create rule, leave Bill as empty (trial).
3. After days, review Fees charged tab vs manual calc.
4. Decide on including pre-existing overdue debt (use preview).
5. Set income category; from next nightly run fees billed. Trial assessments are not retro-billed.
Waive: Fees charged tab -> Waive -> mandatory reason.

### Rules & validations
- No master switch; billing controlled solely by Bill-as field.
- Idempotent per policy-invoice-cycle (cycle key). Percentage-on-total charged once per tenant per cycle.
- Only invoices due on/after rule start unless Include overdue.
- Promise coverage ends when promise date passes, or promise missed/cancelled; fee resumes next run.
- Billed fee = real penalty invoice: on statement, posts to GL, collectable/allocatable/adjustable/refundable; default non-VAT (KRA class D) unless service type says otherwise; due on posting date.
- Waive: billed -> invoice cancelled; trial -> marked waived; never deleted; sweep will not re-charge.
- Ladder step apply_penalty runs engine scoped to the case lease with same policies; collections does not compute or post money; discretionary mode (officer proposes, manager approves) possible.
- Legacy: branch settings penalty fields and penalty_after_days/penalty_percentage on charges do not drive engine.
- Troubleshooting: no assessments (job/scheduler/grace), no invoice (missing service type or account mapping), wrong amount (basis), charged despite promise (toggle off or promise missed), etc.

### States
Assessment: assessed (trial/unbilled) -> billed; waived (from either). Policy: active/inactive.

### Permissions / notifications / validations
Not specified in docs.

### Dependencies
Invoices, chart of accounts/service types, promises, collections ladder, approvals (waiver).

### Open questions
Exact fee formula edge cases; compounding; whether waiver approval is mandatory (case page lists fee waiver as approval-needing).

---

## 7. Legal Register

### Purpose
Track matters after internal collections escalates. Finance -> Collections -> Legal Register `/legal` (Beta). Display-only for money: claim/costs do not post to ledger.

### Entities & fields
Matter columns: Matter, Type, Case No., Court, Advocate, Unit, Branch, Status, Claim, Costs, Filed, Next Hearing, Outcome.
- Types: court case, eviction, execution, demand follow-up, agency referral, other.
- Parties/contacts: role (advocate, law firm, court official, auctioneer, opposing party, other) + contact details.
- Hearings: type (hearing, mention, ruling), date, outcome, next date.
- Costs: category (filing fee, court fee, advocate fee, auctioneer fee, disbursement, other), date, amount, description; total flows to register and collections overview.
- Notes: free text.

### Flow
1. Case -> Open legal matter (prefilled from case; case treatment = legal; case stays open and linked).
2. Add parties, hearings, costs, notes.
3. Handover generates pack (statement, communications log, interaction log, promise history).
4. Close: record outcome; removed from active views, history kept.

### Rules
Open matters when instructed (not on filing); record next hearing with each outcome; log costs as incurred; reconcile costs to expenses monthly. Vendors (advocates/auctioneers) used as parties.

### States
`draft -> filed -> hearing -> judgment -> execution -> settled | closed`; stages may be skipped, settlement at any point.

### Permissions / notifications / approvals / validations
Not specified in docs (handover approval stated on case page).

### Dependencies
Cases, vendors, expenses (reconciliation).

### Open questions
Required fields on matter; hearing reminders; cost-to-expense linkage mechanics.

---

## 8. Debt Aging Report

### Purpose
Canonical arrears report ("who owes what, for how long"); same semantics used by collections and IoT enforcement. Finance -> Collections -> Debt Aging `/reports/debt-aging-report`.

### Entities & fields
Views: By Lease, By Service Type. Toggle: Include zero-balance (off by default).
Columns: Company/Branch/Block/Unit, Current, 1-30, 31-60, 61-90, 90+, Total Due (gross, excludes wallet), Wallet Amount (unapplied cash).

### Flow (recommended)
1. By Service Type scan (rent vs utilities).
2. By Lease sorted by 90+.
3. Check wallet; wallet plus arrears = allocate.
4. Route rest to Collections worklist.

### Rules
- Prepaid amounts on invoices stay inside due (settled portion); only wallet cash is unapplied.
- Group by lease; fall back to unit rows for debt on removed leases.
- Monthly per-case aging snapshots written by engine (cure rate, roll rate, promise-kept trends).
- Export CSV/Excel with filters, grouping, columns.
- Static table vs console active queue.

### States / permissions / notifications
Not specified in docs.

### Dependencies
Ledger, allocations, collections.

### Open questions
Bucket boundary definition (days from due date assumed), snapshot schedule.

---

## 9. Expenses
PAGE NOT FETCHED (HTTP 429). Known only from other pages: vendors are payee on all expense invoices and payments; Expense report by vendor exists; legal costs to be reconciled monthly against expenses; vendor deletion breaks historical expenses and owner statements. Everything else: not specified in docs / not fetched (fields, approval flow, statuses, payment, permissions).

## 10. Expense Wallets
PAGE NOT FETCHED (HTTP 429). Nothing known. All sections: not specified in docs / not fetched.

---

## 11. Vendors

### Purpose
Suppliers/contractors you pay; makes spend analysable. Path: Vendors -> Add.

### Entities & fields
| Group | Fields |
|---|---|
| Identity | name, trading name, service category/type |
| Contact | contact person, phone, email, physical address |
| Financial | tax identifier (PIN), payment terms |
| Scope | single property or organisation-wide |
| Status | active / inactive |
| Attachments | contracts, certificates, insurance, compliance docs |
Required/optional flags, types: not specified. No bank account details on the record (verify out-of-band).

### Flow
1. Search existing vendors (avoid duplicates).
2. Enter name, category, contact, tax ID.
3. Select scope.
4. Attach paperwork.

### Rules
- Capture PIN at onboarding (withholding tax and invoice matching).
- Organisation vendors appear grouped under org heading in pickers.
- Deactivate, never delete (deletion corrupts expense reporting and owner statements).
- Not selectable if inactive or in another branch. Duplicate records cause low spend totals.

### States
Active <-> Inactive.

### Used in
Expenses (payee), service requests (assigned contractor), legal register (parties), expense-by-vendor report.

### Permissions / approvals / notifications
Not specified in docs.

### Open questions
Payment terms format; withholding tax rate handling; vendor approval.

---

## RentRewards implementation notes (derived, not from docs)
- Keep collections as a process layer reading ledger balances; derive buckets on read.
- Snapshot strategy and thresholds on case; idempotent penalty assessments keyed by policy+invoice+cycle; reopen = new linked case.
