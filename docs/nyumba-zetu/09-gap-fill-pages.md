# 09 — Gap-fill: pages that were rate-limited in the first pass

These 17 pages returned HTTP 429 during the first research pass and were re-read afterwards. They fill the "not fetched" sections in files 01, 03, 04, 05, 06 and 07. Source base: https://www.nyumbazetu.com/docs/. WebFetch returns summarised text, so field lists are the docs' own wording, not raw page text.

---

## Admin: Approvals (`guides/approvals`)

**Purpose:** separation of duties. High-impact actions are staged and routed for sign-off instead of executed by one person.

**Actions that need approval:** invoices over a threshold, credit notes, write-offs (receivables); expense payments (payables); demand letters, case handovers, fee waivers, hardship restructures, write-off closures (collections); publishing message templates and broadcasts; schedule activation and material config changes. Low-impact items (e.g. a single case reminder) deliberately skip approval.

**Inbox columns:** title, originating module, entity type, action category, affected party, amount, location (branch/block/unit/lease), requester and time, risk, age/SLA, status (pending/approved/rejected).

**Flow:** open review (with context preview) → verify substance (attachments, tenant details) → approve or reject (rejection needs written reason) → confirm outcome on the underlying record.

**Rules:**
- Allowed actions on a request are computed server-side, not by the browser.
- Approved: the staged action executes immediately (invoice issues, letter sends, expense pays, case closes).
- Rejected: action is marked skipped with the reason, shown on the record timeline.
- Actions are staged, not copied, so there is no duplicate-execution risk.
- Every decision records decider, timestamp, decision and reason.
- Delegation covers approver absence; policy defines routing and thresholds. Missing delegates cause stalled queues. A missing approve button means the user's role lacks authority.

**Not specified:** threshold values, SLA durations, multi-level approval chains.

---

## Admin: Settings (`guides/settings`)

**Scope chain:** `lease → unit → block → branch → organisation → platform default`. The first value found wins, so an organisation-level change can have no visible effect if a narrower scope overrides it.

**Two tables:**
- *Settings Definitions:* the catalogue (key, display name, module, category, type, default value, permitted scopes).
- *Settings Overrides:* actual values at a scope. An override cannot exist without a definition; a definition without an override uses its default.

**UI:** no raw settings list. Settings are reached contextually (Payments → Settings tab, Recurring charges → Settings tab, gear icon next to Create in Collections and Reconciliation).

**Change control:** every change requires a reason and records who, when, before and after values. History is permanent and cannot be edited or deleted.

**Common mistakes:** setting too broad a scope without checking existing overrides; assuming a broken setting when a narrower override applies; confusing feature flags (availability) with settings (behaviour).

---

## Admin: Payment rules (`guides/payment-rules`)

Two jobs: (1) **matching**, converting bank or mobile-money references into the right lease; (2) **allocation order**, deciding which invoices a payment settles first.

**Matching rule fields:** rule name, match type, match value, replace value (normalises spacing, prefixes and format before matching), reference, bank account, scope (branch/block/unit/lease), priority, start/end dates, enabled, admin-only.

**Matching guidance:** publish one reference format everywhere; review unmatched receipts weekly in month one; write specific rules before broad ones; date-bound rules that fix legacy formats. A wrong rule attributes money to the wrong tenant, creating arrears against someone who paid.

**Allocation strategies:** oldest first (typical default); rent before utilities; charges before penalties; specific invoice first (payer intent). Scoped by service type, bank account, and hierarchy level.

**Validation workflow:** preview allocation (not live) → hand-check mixed-debt leases → execute and read the allocated/skipped counts and errors → revert if needed ("reversal is a first-class operation").

**Troubleshooting:** unmatched payments (add rules for real formats); wrong lease (narrow scope); penalties settling before rent (reorder); engine allocates nothing (no matching invoices in scope, check skip reasons).

**Routes:** `/payment-rules`, `/payment-allocation-rules`.

---

## Receivables: Reconciliation (`guides/payments/reconciliation`)

**Question answered:** does recorded payment data match bank statement evidence?

**Prerequisites (both required):** the `payments_reconciliation` feature flag on the branch, and per-account enrolment ("Reconcile this account's statements"). Otherwise the module shows a banner instead of silently doing nothing.

**Five steps (tabs):** Statements → Matching → Statement Lines → Unmatched Payments → Periods, plus two standing queues (Duplicates, Receipts sent to us).

1. **Import:** via Bulk Upload → Bank Statements. Fields: bank account, format (M-Pesa paybill, NCBA CSV, generic signed-amount CSV), column mapping (auto-detected). The "Receipt / Reference No." column is the most valuable one. Unparseable rows are reported by number and reason.
2. **Matching:** runs on filing or via "Reconcile now". Tier 0 = exact receipt number equals payment confirmation number (auto-reconcile). Scored matching uses amount, reference, payer phone and recency, with confidence bands of 95%, 80% and 60%; these are suggestions only, because auto-approve is off by default. No candidate raises an exception.
3. **Statement lines:** actions are Approve, Reject, Match manually, Post payment (creates the missing payment), Park this line (non-rent items, needs a reason), Close this exception. Exception types: payment not recorded, possible duplicate, amount differs, already matched elsewhere, unresolved too long.
4. **Unmatched payments:** recorded internally but absent from statements past the evidence window. Actions: Close (no financial effect) or Reverse payment (only when there are no live allocations; reverse allocations first).
5. **Period sign-off:** one calendar month per bank account, created automatically when a statement is filed (month of the earliest transaction; multi-month statements file wholly to that month). Sign-off is blocked while unresolved lines or open exceptions exist, and the button names the blockers.

**Duplicates queue:** the same transaction arriving twice (e.g. M-Pesa direct plus bank statement). Dispositions: "One payment, keep held" or "Two payments, release".
**Receipts sent to us:** M-Pesa confirmations forwarded by tenants. Closing records a verdict only (applied correctly, already applied, duplicate, never received, wrong landlord); there is no automatic allocation, reversal or reply.

**Safety:** line-level hash of identity fields plus file-level recognition block re-imports. Filing a statement never creates, changes or allocates a payment; "Post payment" is the only writer and is idempotent.

---

## Receivables: Adjustments (`guides/adjustments`)

Adjustments change what a resident owes without money moving.

| Type | Use | Accounting effect |
|---|---|---|
| Void | Invoice should never have been issued | Cancels invoice, reverses posting and revenue |
| Credit note | Discount, goodwill, billing error, partial cancel | Reduces balance, reverses revenue from the correct accounts |
| Debit note | Missed utility, agreed penalty, correction in landlord's favour | Increases balance |
| Write-off | Correct invoice that is uncollectable | Revenue stands, bad-debt expense recognised, status `written_off`, payment history kept |
| Refund | Overpayment returned | See refunds (money moves) |

**Credit/debit note flow:** open the invoice → "Create Credit Note" (or Invoices → Credit Notes → Add) → enter specific service-type lines (not lump sums) → give a reason → issue.
**Bulk:** Admin → Bulk Upload "Credit Notes" type for reversing a mis-billed run.
**Tax:** tax is exclusive, so a KES 10,000 credit on a 16% line credits KES 11,600. There is no credit-note-to-KRA filing path; crediting an eTIMS-certified invoice fixes internal books only.
**Visible in:** invoice adjustments section, resident statement, debt aging (aged at corrected amount), financial statements, audit log.
**Rules:** one adjustment per correction; adjust in the discovery period if the original is closed; never delete invoices to hide debt. Write-offs are normally routed for approval.

---

## Receivables: Refunds (`guides/refunds`)

Refunds are separate ledger entries, never edits to the original payment. Types: **Payment** and **Deposit** (security deposit return after deductions).

**Flow:** open the original payment → Refunds section → enter amount, date, source bank account, reason, reference → save.
**Server guards:** over-refund protection (cumulative refunds cannot exceed the payment's available amount); bank account required; reason required.
**Rules:** if the payment was allocated, reverse allocations first; unallocated refunds reduce the lease wallet balance; never "refund" by deleting a payment (the receipt vanishes from ledger and reconciliation while the money still left the bank).
**Ledger fields:** title, type, refund amount, date, reason, reference no., payment amount, payment confirmation no., invoice details, paid-from account.
**Permissions:** view, create, edit, delete, allocate, reverse.
**Reconcile:** filter by bank account and period, match to statements, check the refund is not also entered as an expense.

---

## Collections: Strategies (`guides/collections/strategies`)

A strategy ("dunning ladder") is an organisation-scoped, versioned set of ordered steps.

**Step fields:** order; trigger (delay from case open or previous step); action type; template; band range; approval gate; promise pause (suspend while a Promise to Pay is active; default yes).
**Action types:** SMS/email reminder, demand letter (approval required), IoT disconnect link, apply penalty, handover flag (approval), agent task (call), field visit task.
**Guards:** max contacts per week, permitted channels, exit conditions.
**Collectability score (0–100)** from six dimensions: arrears age, debt-to-rent ratio, payment recency, promise history, contact responsiveness, trend. Bands: A 80–100 light touch; B 60–79 standard reminders; C 40–59 active follow-up (default); D 20–39 escalation; E 0–19 full ladder through handover.
**Resolution:** same scope chain as settings. When a case opens, the resolved strategy and thresholds are **copied onto the case**, so later policy edits don't rewrite in-flight cases; re-baselining is an explicit audited action.
**Default ladder if none authored:** SMS at case open → email +7 days → agent call task +7 days; 2 contacts per week; no letters, penalties or enforcement.
**Assignment rules** (separate): manual, round-robin, geographic, band-based.
**Rollout advice:** draw the ladder on paper, build, attach published templates, assign by scope, run in shadow mode for at least one cycle.

---

## Payables: Expenses (`guides/expenses`)

Tracks owed (expense invoices) vs paid (expense payments). Routes: `/expenses` (invoices), `/expenses/payments`.

**Record flow (7 steps):** Expenses → Add → pick vendor → service type and category (drives posting) → attribute to branch/block/unit (required for owner recharging) → amounts, tax, invoice date, due date → attach documents → save as payable.
**Pay:** standard expense payment (bank account, date, amount, reference) or from an expense wallet.
**Approval:** routed through the approvals inbox where configured (one records, another approves).
**Extras:** CSV bulk import; bulk re-filing between categories with preview, tracking and reversal; recurring expenses.
**Ledger:** expense account (P&L) → accounts payable → bank/cash on payment. Expenses attributed to owner units reduce disbursements and appear on owner statements.
**Reports:** by period and category, by vendor, P&L, budget comparison.
**Failure modes:** missing P&L entries mean missing service type or unmapped account; owner statement gaps mean missing attribution.

---

## Payables: Expense wallets (`guides/expense-wallets`)

Petty-cash funds with full ledger tracking.

**Structure:** each wallet binds to one bank account (several wallets may share one). Balance = top-ups minus spends. Spendable = balance plus permitted overdraft (limit defaults to 0).
**Create:** name, backing bank account, currency, overdraft policy.
**Top-ups** record fund availability only; they do not move real money.
**Spending:** Quick Spend (paid-to, amount, category, reference, receipt, notes) or Pay an Expense (settle an existing expense). Both create normal expense and payment ledger entries.
**Guard:** overspending is blocked server-side and atomically, which prevents races between simultaneous users.
**Permissions:** admin controls creation, funding and overdraft; spending is broader.
**Distinct from:** expenses (vendor costs) and tenant wallet amounts (resident overpayments awaiting allocation).

---

## Accounting: Periods and close (`guides/accounting-periods`)

Periods (typically monthly) are open or closed; posting is only allowed into open periods. Actions: Close, Reopen (exceptional, audited), Select.

**Guided close (5 stages):** confirm branch (most common error is the wrong branch) → select period → advance to readiness → automated readiness checks (with "Refresh checks") → submit close. Close is idempotent.

**Month-end order:** finalise billing → capture receipts → allocate payments → record and attribute expenses → adjustments (credit/debit notes, approved write-offs) → reconcile bank accounts → clear eTIMS queue → review trial balance → generate owner statements → close.

**After close:** postings dated into the period are rejected; corrections go in the current period with documentation. Statutory restatements: reopen → post → close, with reasons.
**Journals:** never edited in place. Corrections use credit notes, refunds, or reversal-and-repost. Every posting carries a posting key so duplicate events return the existing entry.

---

## Accounting: Financial statements (`guides/financial-statements`)

Finance → Accounting → Statements:
- **Trial balance** (`/reports/trial-balance`): all accounts with debit or credit balance as at a date, "include zero-balance" toggle. Wrong-side balances usually mean mapping errors.
- **Profit & loss** (`/reports/profit-loss`): income less expenses over a range, grouped by account class, including non-operating items and tax.
- **Balance sheet** (`/reports/balance-sheet`): assets, liabilities, equity as of a date.

**Drill-down:** statement line → journal entries → source invoice/payment/expense, showing journal IDs, posting keys and reversal references.
**Supporting ledger reports:** general ledger, journal lines (filter by block/unit/lease/owner), AR aging ledger, customer statement ledger, transactions report.
**Run correctly:** confirm branch; right basis (point-in-time vs range); close the period first; reconcile receivables to aging, deposits to the deposits module, bank to statements, payables to unpaid expenses.
**Common issues:** revenue lower than billing means invoices issued but not posted; receivables exceeding aging means unposted credit notes or allocations.

---

## Accounting: Bank accounts (`guides/bank-accounts`)

Every receipt, expense payment, refund, disbursement and wallet top-up names a bank account.

**Fields:** account name, account number (unique; webhook match key), bank/display name, account type, ledger account (required for posting), paybill, payment reference separator, automated flag, admin-only (hidden from tenant checkout), status.
**Setup:** create → map to ledger cash account → set paybill and separator → mark automated if receipts arrive by integration → activate.
**M-Pesa STK push (Daraja):** consumer key and secret, passkey, business short code. The "Test" button only checks key and secret against Safaricom OAuth; wrong passkey or short code won't surface until a push fails.
**Sharing:** several properties may collect through one account; the Sharing tab shows each property's collection total.
**Linked accounts:** settlement, sweep, replacement, funding, group; a setting decides whether the receiving account records the payment, to avoid double counting.
**Availability:** all units (default), include-only, or exclude, by block/unit, and independently per charge type (rent, water, service charge). An account visible to nobody removes the tenants' ability to pay.
**Field locking:** once there is activity (payments, working STK credentials, or reconciliation enabled), account number, paybill and bank name lock; super admin can override with a recorded reason. Otherwise deactivate and create a replacement.
**Inactive accounts** vanish from new forms but keep history; never delete accounts with movements.
**Reconciliation:** opt-in per account; distinct from the "Bank feed connected" indicator. Match by reference, not amount; check receipts, expense payments, refunds and disbursements.
**Permissions:** banks permissions for sharing/availability/settings; admin for M-Pesa credentials; super admin for lock override.

---

## Accounting: Assets (`guides/assets`)

Fixed-asset register for depreciation and maintenance (generators, lifts, pumps, vehicles, boreholes, plant, furniture).

**Fields:** name, code, description, status; type, category, parent asset (component hierarchy); cost, currency, acquisition date, manufacturer, model; depreciation method, start date, periods, book value, ledger accounts, auto-post; location, branch, responsible party; lease attachment, technical attributes, notes.
**Registration:** create → acquisition details → location/assignment → depreciation settings → attach documents. Define categories before bulk registration.
**Maintenance:** schedules with cadence and next-due date, checklists, work orders, meter readings, cost history.
**Issues:** no depreciation posting means start date, periods or auto-post is unset; duplicates come from re-registering at stocktake (retire, don't delete).

---

## Accounting: QuickBooks (`guides/quickbooks`)

**One-way sync** to QuickBooks Online; Nyumba Zetu stays the system of record. Syncs invoices (lines, tax codes), payments (applied to matching invoices) and customers (created from leases as needed).
**Tabs:** Invoices and Payments grids with a Synced True/False column. Sync payments after their invoices.
**Process:** filter Synced = False → select rows → "Sync with QuickBooks" → refresh. Re-syncing is safe (updates, not duplicates). The grid can be exported for manual QuickBooks import.
**Failures:** all fail = connection expired, re-authorise; one invoice fails = missing customer, item mapping or tax code; payment fails = its invoice isn't synced; row reverts to False = QB record was deleted.

---

## Operations: Documents and templates (`guides/documents-and-templates`)

**Surfaces:** `/documents` (generated and uploaded files), `/templates` (library and generation wizard), `/letter` (letter composer with letterhead and signatures), `/adhoc-documents` (quick branded invoices, quotations, receipts).
**Template flow:** Templates → pick template (lease agreement, notice) → wizard fills placeholders (names, dates, amounts) → PDF saved under Documents → download, print or email.
**Letter composer:** recipients get single-use links, `/letter-sign/:token` for signing and `/letter-ack/:token` for acknowledgement. Acknowledgement turns "we sent it" into "they received it", which matters for demand letters.
**Document templates (PDF) differ from message templates** (SMS, email, WhatsApp, push).
**Attachments:** documents attach to invoices, payments, leases, residents, service requests, assets and legal matters with identical upload controls.

---

## Utilities: IoT vendors (`guides/iot-vendors-process`)

Thin checklist page. Stores vendor account and integration settings at branch level and keeps polling, webhooks and control commands stable. Six steps: open Meter Vendors → review credentials and branch assignments → validate endpoint and callback configuration → confirm meters map to the right vendors → record support contacts → revalidate after any credential change. Known problems: expiring credentials break sync; wrong branch-to-vendor mapping; callback URL failures stop events. No fields or states are documented.

## Utilities: IoT billing runs (`guides/iot-billing-runs-process`)

Thin checklist page. Creates billing batches from approved consumption and applies active tariffs. Prerequisites: validated and approved consumption, confirmed tariffs for the period, correct branch and billing window. Steps: open Billing Runs → create a run for the period → verify configuration → start and monitor → review totals and outcomes → send failed items to the Billing Run Items process. Done when the run is complete or reconciled, totals match expectations and failures are triaged. Partial failures can be reprocessed for a subset of items. No field list or state machine is documented.
