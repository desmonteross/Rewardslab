# Nyumba Zetu - Billing and Payments (reference for RentRewards)

## Summary (10 lines)
1. Invoices attach to a lease (billing subject); unit derives from lease. Lines = service type + qty + unit price (4dp) + description.
2. Tax is exclusive only (KES 10,000 at 16% bills 11,600). Service type drives income account and tax class.
3. An invoice has FIVE independent status tracks: invoice, payment, posting (GL), approval, communication.
4. Only issued invoices age. Drafts are editable and do not post or age. Due date (not invoice date) drives aging/dunning/penalties.
5. Recurring charges are rules on a lease (service type, amount, frequency, start/end); a scheduled job generates normal invoices. Editing never changes past invoices.
6. Escalation schedules (7 shapes) change recurring charge amounts from an effective date; projections preview effect.
7. Receiving a payment records cash on the lease but does NOT settle invoices. Allocation does. Unallocated cash creates simultaneous arrears + credit.
8. Allocation: manual dialog or engine (preview -> execute -> revert), ordered by org payment rules; reversals are first-class and linked; never delete rows.
9. Confirmation # (M-Pesa code / bank ref / cheque no.) is mandatory and is the reconciliation key; a separate M-Pesa Code field handles bank-relayed M-Pesa.
10. Chart of accounts + service types map billing to the ledger; unmapped service types yield non-postable invoices.

## Source URLs (base https://www.nyumbazetu.com/docs/)
Fetched OK:
- guides/invoices-and-payments
- guides/recurring-charges
- guides/charge-escalation
- guides/payments-receive-pay
- guides/allocations
- guides/chart-of-accounts

FAILED (WebFetch proxy HTTP 429 rate limit; not retried per instructions):
- guides/payments/reconciliation
- guides/adjustments
- guides/refunds

Coverage notes: reconciliation and refund-from-payment basics appear only as summarized inside payments-receive-pay. Credit/debit note and write-off details are only what invoices-and-payments states. Everything marked "not specified in docs" was not in the fetched text. The fetch tool summarizes pages via a small model, so treat details as secondary-source.

---

## 1. Invoices

### Purpose
Core billing document on a lease; anchor for receivables, aging, collections, tax filing and GL entries. Path: Finance -> Receivables -> Invoices (`/invoices`).

### Entities & fields
| Field | Req | Type / notes |
|---|---|---|
| Billing subject (lease) | Yes | Unit auto-derives; invoices never float |
| Line: Service Type | Yes | Determines income account + tax treatment (rent, water, service charge, deposit...) |
| Line: Quantity | Yes | number |
| Line: Unit Price | Yes | currency, stored to 4 decimals (e.g. 0.3750) |
| Line: Description | Not stated | free text per line |
| Invoice Date | Yes | date |
| Due Date | Yes | date; drives aging, dunning, penalties |
| Tax | Auto | exclusive of line amount; inclusive not supported |
| Category (list view) | - | service type, curated for grouping |

Status dimensions:
| Dimension | Values |
|---|---|
| Invoice status | draft, issued, voided, cancelled |
| Payment status | unpaid, partially_paid, paid, overpaid, written_off |
| Posting status | not_posted, posting, posted, reversal_pending, reversed, failed |
| Approval status | not_required, not_started, pending, approved, rejected |
| Communication status | pending, queued, sent, delivered, read, undelivered, failed |

Related tabs: Invoices, Invoice Items (`/invoice-page/invoice-items`), Credit Notes (`/invoice-page/adjustments`), Debit Notes (`/invoice-page/debit-notes`). Detail page tabs: Payments, Adjustments, Approvals, eTIMS Integration, Mappings (provider sync with retry), Documents, Communications, Rent Schedule.

### Flow
1. Invoices -> Add; pick lease.
2. Add lines (service type, qty, unit price, description).
3. Set invoice date and due date.
4. Tax computed automatically (exclusive).
5. Save as Draft (editable) or Issue (billable, posts to ledger, payable, enters aging).
6. If org requires approval, Issue routes to approvals inbox instead of issuing directly.
7. Send (email and/or SMS) using a message template; track via communication status and Delivery Tracker.
8. Optional: Send to eTIMS (KRA certification via DigiTax); certified receipt with QR code, control unit details, invoice number shown once accepted.

Bulk sources: recurring invoices, IoT billing runs, bulk upload (spreadsheet), penalty assessments (late fees posted as invoices).

### Rules & validations
- Correction matrix: draft -> edit; issued but shouldn't exist -> Void (ledger posting reversed); too high -> credit note; too low -> debit note; uncollectable -> Write Off (kept for history). Void = should never have existed; write-off = existed, won't be paid.
- Re-filing an accepted invoice to eTIMS reports it to KRA twice; no credit-note-to-KRA path yet.
- Grid filter has date-range basis selector (invoice date or due date).
- Diagnostics: not in aging -> still draft; paid but unpaid invoice -> unallocated; missing from trial balance -> posting not_posted/failed; eTIMS rejection reason on eTIMS tab (tax-class/item-mapping typical).

### States
Five independent machines (above). Transitions between values: not specified in docs, except draft -> issued, issued -> voided, write-off sets payment status written_off.

### Permissions
"Invoice / Send" is separately grantable from create; sending is not admin-only. Approval available actions are computed server-side per user. Other roles: not specified in docs.

### Dependencies
Leases, service types/chart of accounts, accounting posting, allocations, adjustments, eTIMS, message templates, approvals inbox, collections.

### Open questions (not in docs)
Numbering format; which edits allowed post-issue; exact transition rules for each status; overpaid handling; M-Pesa capture on invoice (not specified); approval thresholds; rounding rules for totals.

---

## 2. Recurring charges (recurring invoices)

### Purpose
Rule on a lease: bill this service type, at this amount, on this schedule; scheduled job turns rules into invoices.

### Entities & fields
| Field | Req | Notes |
|---|---|---|
| Lease/Unit | Yes | charges attach to leases only |
| Service Type | Yes | sets income account and tax |
| Quantity | Yes | numeric |
| Unit Price | Yes | autofills from service type default |
| Description | Optional | appears on invoice line |
| Frequency | Yes | monthly, quarterly, annually, "other supported cycles" |
| Start Date | Yes | first billing cycle |
| End Date | Optional | blank = ongoing |
| Status | Yes | Active/Inactive; also shown live/paused/expired |

Surfaces: Finance -> Receivables -> `/charges` (branch-wide); Admin -> `/lease/charges` (per lease with phase preview).

### Flow
1. Open lease. 2. Add one charge per service type (rent, service charge, garbage separate). 3. Review phase preview. 4. Save.
5. Scheduled job examines active charges due this cycle and generates invoices (identical to manual ones: editable, sendable, allocable, adjustable, postable).
Pre-run checklist: new leases have charges; ended leases have end dates; escalations due reviewed; service types mapped to GL accounts. Post-run: spot-check ~5 leases, bulk send, watch Delivery Tracker, reconcile total vs expected revenue.
Bulk import: Admin -> Bulk Upload -> "Recurring Invoices".

### Rules & validations
- Edits apply going forward only; retroactive fixes use adjustments.
- Stop by end date or deactivate.
- Double-billing guard: refuses create/edit that would bill the same lease twice for identical charge over overlapping periods; compares actual lease reach (catches property-wide vs per-lease collisions). Applies to new/edited rules only.
- Scheduler switchable per environment; defaults OFF outside production.

### States
Active/Inactive; derived live / paused / expired. Generated-invoice idempotency per cycle: not specified in docs.

### Permissions
Not specified in docs.

### Dependencies
Leases, service types, escalation, invoices, bulk upload.

### Open questions
Proration for partial first/last period; due-date offset and generation lead time; list of "other cycles"; how already-generated cycles are tracked; behaviour on lease termination.

---

## 3. Charge escalation

### Purpose
Schedule rent/charge increases in advance and preview effect.

### Entities & fields
Pages: Overview `/charge-escalation/overview`, All Schedules `/charge-escalation/rules`, Projections `/charge-escalation/projections`.
Shapes: Fixed; Fixed for term; Step (anniversary of lease start); Step (calendar date annually); Percent annual; CPI (published index); Market review (flag for manual re-evaluation).
Parameters mentioned: rate, index, effective date, caps/floors; assigned to specific charges (typically rent). Field types, defaults, required/optional: not specified in docs.

### Flow
1. Configure from the lease record. 2. Choose shape matching lease wording. 3. Set parameters. 4. Assign to charge(s). 5. Review projections, save.

### Rules
- Escalation changes recurring charge amount from effective date; next generation cycle uses it.
- Past invoices unchanged; missed prior increases corrected with debit notes.
- Lease renewal: close old schedule, create new.
- Waivers recorded as credit notes to keep schedule accurate.

### States / Permissions / Notifications
Not specified in docs.

### Dependencies
Recurring charges, leases, debit/credit notes.

### Open questions
Rounding; CPI source and update process; how market review flag surfaces; approval; notice-to-tenant.

---

## 4. Receiving payments (Receive Pay and Payments ledger) - M-PESA / RECEIPT FLOW

### Purpose
Capture money against a lease/unit. Two surfaces: Receive Pay (`/receive-pay`, counter capture) and Payments (Finance -> Receivables -> Payments `/payments`, full ledger). Record page `/payments/<uuid>`.

### Entities & fields
Receive Pay form:
| Field | Req | Type |
|---|---|---|
| Unit (search by name; shows outstanding items with Due Amount) | Yes | lookup |
| Paid Amount | Yes | number |
| Paid Date | Yes | date |
| Paid By | Yes | text |
| Bank Account (where money landed) | Yes | dropdown |
| Notes | No | text |

Payments -> Add form:
| Field | Req | Type |
|---|---|---|
| Lease or Unit (payer subject) | Yes | select |
| Amount | Yes | number, exact, never rounded |
| Paid Date | Yes | date |
| Payment Type | Yes | mobile money / bank transfer / cheque / cash |
| Receiving Bank Account | Yes | dropdown |
| Confirmation # | Yes | text: M-Pesa code, bank ref or cheque no.; "do not leave blank" |
| M-Pesa Code | For bank-relayed M-Pesa | text: code payer holds |

List columns of note: Paid By, Paid Amount, Allocated Amount, Available Amount (wallet contribution), # Units Allocated, Confirmation #, M-Pesa Code, Payment Type, Bank/Account, Origin (counter/import/integration), Property/Block/Unit, settled Invoice #/Amount/Date/Status, Archived, Auto-Allocate (Allowed / On hold), Bank Balance (M-Pesa receipts only; bank-feed and STK rows blank, not summable). Bank Statement view splits Money In / Money Out.

Record page sections: The Money (allocated | refunded | unapplied), Journey (Received -> matched -> allocated -> settled), Why It Stopped (reason allocation engine passed), What Happened (chronology), Bills, Refunds, Documents (receipt, deposit slips, screenshots), Related chips (lease, unit, resident, bank account).

### Step-by-step flow
Counter: 1. Search unit. 2. Enter amount, date, payer, bank account, notes. 3. Submit; payment recorded on lease and immediately available for allocation.
Ledger: 1. Payments -> Add. 2. Pick lease/unit. 3. Amount, date, type, bank account. 4. Confirmation # (and M-Pesa Code if relevant). 5. Save, then allocate same day (saving does NOT settle invoices).
Other entry: bulk import (Admin -> Bulk Upload -> Payments; validates first; per-row created/skipped/rejected). Integration/bank-feed/STK origins exist (Origin column; STK push mentioned) but their mechanics are not specified in docs.

### Rules & validations
- Save never allocates. Unallocated payment = arrears AND credit simultaneously, can open false collections cases.
- Payer subject choice is costly to correct later.
- Amounts exact, never rounded for display.
- Receipts are not unique: bank splits / relayed legs can duplicate; lookup by code shows "N payments carry this receipt" and lists all.
- One search/filter box accepts either confirmation # or M-Pesa code.
- Safaricom duplicate guard: second STK push with same amount/phone/paybill within a short window (~1 minute) is refused; checkout names the earlier payment.
- Duplicate (manual + import): reverse allocation first, then archive (never delete).
- Negative wallet = legacy over-allocation; report, do not hand-adjust.
- Auto-allocate allowed by default; "Don't auto-allocate" hold needs a note, skips background matching and Auto-Allocate / Pay From Wallet buttons, shows "On hold" with tooltip, reversible via "Allow Auto-Allocate"; does not archive, block manual allocation, or block edits. Available on Suspense Account and Wallet Credits lists (tick rows) and payment menu.
- Refund from payment (record page -> Refunds): Refund Amount (req), Bank Account paid from (req), Refund Date (req), Reason (req). Guards: amount must be available; bank account must be set. Full refund rules were on the failed refunds page.

### Reconciliation (as summarized here; dedicated page failed)
1. Filter one bank account and one statement period. 2. Match on Confirmation # (amounts repeat, references do not). 3. Investigate: bank money with no payment = capture missed; payment with no bank line = captured twice or wrong account. 4. Wallet check: filter available amount > 0 to confirm nothing sits unallocated.

### States
Payment journey: received -> matched -> allocated -> settled (as display states); Auto-Allocate: allowed / on hold; Archived flag. Formal enum: not specified in docs.

### Permissions / Notifications / Approvals
Not specified in docs (refers to a "Roles and permissions" guide). Receipts "sent" appear in history; mechanism not specified.

### Dependencies
Bank accounts (map to ledger), payment rules (auto-allocation priority), allocations, refunds, suspense account, wallet credits, documents.

### Open questions
M-Pesa C2B/STK callback specifics (paybill/till, validation/confirmation URLs, signature checks); how Origin=integration payments get matched to a lease; idempotency on repeat callbacks; suspense routing rules for unmatched payments; receipt numbering; payment status enum; reversal/bounced cheque handling.

---

## 5. Allocations

### Purpose
Apply received cash to specific invoices. Payment = cash on lease; allocation = application to invoices.

### Entities & fields
Key figures: Wallet amount (unapplied cash on lease, nettable); Prepaid amount (already-settled invoice portion, not nettable); Due amount (remaining payable).
Tabs: Allocations `/allocations/list` (payment, invoice, amount, date, operator); Allocation Runs `/allocations/runs`.
Run log columns: Run Type (preview/execute/revert), Mode, Status, Payments considered, Allocated, Skipped, Errors, Amount, Correlation ID, Preview Correlation, Reverted Run, Property, Triggered/Run By, Started At/Duration, Error.
Hold: mandatory hold reason stored on payment.

### Flow
Manual: 1. Open payment or invoice allocation dialog. 2. Review proposed match (available amount, candidate invoices). 3. Adjust split per invoice. 4. Confirmation panel: Will Allocate / Will Pay / Returns to Wallet. 5. Confirm; allocation written, invoice statuses update. Remainder shown as "To Wallet".
Engine: Preview (no writes) -> Execute (commits previewed run) -> Revert (undoes whole run). Ordering by org payment rules (e.g. oldest-first, rent-before-utilities). Scheduled runs: org-level, rotating per branch with per-branch limits, individually switchable, default off outside production; frequency not specified.

### Rules & validations
- Server-side over-allocation guard (not above invoice amount or payment amount).
- Reversal (single allocation or whole run) returns money to wallet and reopens invoice balance; both directions recorded, linked, auditable. Never delete rows or edit amounts.
- Multi-unit tenant: prepaid attributes to invoice's unit; wallet to payment's unit.
- No candidate invoices: invoice still draft or other lease/branch.
- Zero allocated with high skips = no matching invoices or guards, not a bug.
- Held payments skipped by auto and scheduled runs but still manually allocatable.

### States
Run type preview/execute/revert; run status values not specified in docs. Invoice payment status moves per allocation.

### Permissions / Approvals / Notifications
Not specified in docs.

### Dependencies
Payment rules guide (priority logic), invoices (issued only), wallet, GL (reads allocation ledger).

### Open questions
Exact payment-rule configuration, tie-breaking, partial allocation to a line vs invoice, penalty/interest ordering, overpayment to future invoices, GL entries produced by allocation, run status enum.

---

## 6. Adjustments (credit notes, debit notes, write-offs)
Page FAILED (429). From other pages only: credit notes (`/invoice-page/adjustments`) reduce receivable on an issued invoice; debit notes (`/invoice-page/debit-notes`) increase it; write-off marks uncollectable (payment status written_off, invoice retained); waivers on escalation recorded as credit notes; retroactive recurring-charge corrections use adjustments. Fields, states, approvals, permissions: not specified in docs (page not read). Re-fetch recommended.

## 7. Refunds
Page FAILED (429). Only the refund-from-payment form (see section 4) is known. Ledger, guards, reversals, approvals: not read. Re-fetch recommended.

## 8. Payment reconciliation (dedicated page)
Page FAILED (429). See 4 for the summarized 4-step process. Re-fetch recommended.

---

## 9. Chart of accounts and service types

### Purpose
Determine ledger destination for every billable/payable item. Paths: Finance -> Accounting -> Chart of Accounts / Service Types.

### Entities & fields
Account:
| Field | Notes |
|---|---|
| Account name | statement label |
| Account code | stable identifier, postings resolve by code, non-recyclable |
| Account type | Income, Expense, Asset, Liability, Equity |
| Account class | sub-classification driving statement grouping |
| Balance | amount + debit/credit indicator |
| Status | Active / Inactive |
Normal balances: Income credit (P&L); Expense debit (P&L); Asset debit (BS); Liability credit (BS); Equity credit (BS).

Service type:
| Field | Notes |
|---|---|
| Name | shown on invoice lines and reports |
| Item code / class | integration and mapping IDs |
| Account mapping | postable income/expense account; required to post |
| Tax treatment | default non-VAT; used for eTIMS |
| Default amount | optional; prefills recurring charges |
| Classification flags | rent, deposit, category markers; affect occupancy, deposit and arrears logic |

### Flow (setup)
1. Create service type (tenant-facing name). 2. Map postable account. 3. Set tax class. 4. Optional default amount. 5. Set rent/deposit flags.

### Rules & validations
- Never delete or re-code accounts with postings; deactivate (hidden from pickers, balance retained).
- Only postable accounts (not headings) accepted for mappings; existing non-postable mappings flagged, not broken.
- Security deposit must map to a liability account, never income.
- Penalties engine cannot post without a late-fee service type; IoT needs a utility service type per utility; management commission type drives owner statements.
- Unmapped expense categories post to Suspense (since Aug 2026); owner drawings deliberately unmapped.
- Recommended checks: all types mapped; no two types sharing an account for different purposes; no deposits to income; no inactive account with active service types.
- New properties (Aug 2026+) start with Rent, Service Charge, Security Deposit, Water; legacy keep full catalogue.

### States
Account Active/Inactive; service type active/inactive (implied).

### Permissions
Only administrators create service types; editing/deactivating follows standard permissions.

### Dependencies
Accounting periods (posting windows), financial statements, eTIMS, provider sync (last-synced timestamp, mappings review).

### Open questions
Default chart contents, field limits, bulk import of chart, audit trail, multi-currency, how journal lines are generated for invoice/payment/allocation (see "Accounting and posting" guide, not fetched).

---

## RentRewards implementation hints (derived, not from docs)
- Keep payments, allocations and invoices as three tables; never settle on payment insert; compute invoice balance from an append-only allocation ledger with reversal rows.
- Unique index on (tenant_org, confirmation_ref) is unsafe given docs say receipts can legitimately repeat; use non-unique index plus duplicate warning.
- Store money as integer minor units but keep unit price at 4dp.
