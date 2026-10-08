# Nyumba Zetu docs 05: Accounting, Tax, Reports

## Summary (10 lines)
1. Nyumba Zetu posts double-entry journals automatically from domain events (outbox -> accounting consumer -> handler -> posting service).
2. Every journal balances; posting only into open periods; posted journals are immutable (fix by reversal/credit note/adjustment).
3. Posting is idempotent via deterministic posting keys (algorithm not specified).
4. Payments use a two-step pattern: receive into Unapplied Receipts, then allocate against Accounts Receivable.
5. Expenses accrue to Accounts Payable on approval/posting; payment can split withholding tax and retention.
6. Tax is always exclusive (no inclusive tax); tax class comes from the service type (default class D, Non-VAT).
7. KRA eTIMS goes through the DigiTax provider; statuses queued -> submitted -> accepted/failed; correction = void with credit note, then re-file.
8. Budgets are per period + account + branch, compared to actuals in /reports/budget-report.
9. 24 named reports (docs say 17 in its prose, but it lists more; see Reports) with grid export CSV/Excel; Dashboard has 4 consoles with Excel/CSV/PDF export.
10. FAILED (HTTP 429 rate limit, not retried per proxy instruction): accounting-periods, financial-statements, bank-accounts, assets, quickbooks. Those sections below are marked NOT FETCHED.

## Source URLs (base https://www.nyumbazetu.com/docs/)
Fetched OK: guides/accounting-and-posting, guides/budgets, guides/tax-and-etims, guides/reports, guides/dashboard
Failed (429): guides/accounting-periods, guides/financial-statements, guides/bank-accounts, guides/assets, guides/quickbooks

Note: WebFetch returns a model-summarised page, so detail may be lossy.

---

## 1. Accounting and Posting

### Purpose
Convert property-management activity into double-entry accounting through automated journal posting driven by domain events, plus manual journals for corrections.

### Entities and fields
| Entity | Fields / notes |
|---|---|
| Journal | balanced debits=credits; references source document (invoice, payment); posting key (deterministic); may be multi-part per invoice |
| Chart of Accounts (COA) | accounts resolved by code per organization; administrators maintain in settings; header/grouping accounts are not postable |
| Service type | line items map to service types, which route revenue and tax to accounts |
| Manual journal | Date (required, in open period); Entry Type (required: Manual or Adjustment only); Reason/Description (required) |
| Manual journal line | Account (postable only, shown "code + name" e.g. "4310 - Rent Income"); Amount (debit or credit); Service Type (optional); Description (optional); Lease (optional). Minimum 2 lines |

### Step-by-step flow (automatic posting)
1. Business action occurs in app.
2. Domain event + payload written to outbox.
3. Accounting consumer (background process) picks up event.
4. Handler selects the posting action and builds journal lines from payload.
5. Posting service writes the balanced journal.

### Step-by-step flow (manual journal)
1. Accounting -> Journal Entries -> Create.
2. Set Date (open period), Entry Type (Manual/Adjustment), Reason.
3. Add at least two lines (account grouped by type; only ledger-capable accounts offered).
4. Debits must equal credits; post.
5. Posted journal cannot be edited; reverse and repost.

### Rules, validations and posting rules
| Event | Debit | Credit |
|---|---|---|
| invoice.posted | Accounts Receivable | Revenue (by service type) and VAT Output (taxable lines) |
| payment.received | Cash (bank / M-Pesa, by payment method mapping) | Unapplied Receipts (liability) |
| payment.allocated | Unapplied Receipts | Accounts Receivable (per allocation amount) |
| expense.posted | Expense accounts and VAT Input | Accounts Payable |
| expense.payment_recorded | Accounts Payable | Cash (optional withholding and retention lines) |
| tenant_recharge.created | Tenant Receivable | Due to Landlord/Owner Payable |
| wht.remitted | Withholding Tax Payable | Cash |
| retention.released | Retention Payable | Cash |
| credit_note.posted | Revenue and VAT Output (reversal) | Accounts Receivable |
| refund.issued | Unapplied Receipts | Cash |
| coa.updated | no journal; refreshes account lookup cache | |

- Accrual basis: revenue on invoice posting, expense on approval/posting.
- Void invoice: reverses the invoice-originating journals only (not payment/allocation journals).
- Write-off: usually records bad debt; invoice history preserved; differs from void.
- Invoice edit after posting: reverse and repost invoice journals; payments/allocations stay driven by payment flows; finance reconciles invoice balance against allocations.
- Some setups post more than one journal per invoice; reports must look up by source + posting keys, not one ID.
- Historical note (Aug 2026): before this release expense categories had no account mapping and vendors no ledger identity, so expenses were never journaled and earlier profit was overstated.
- Owner statements/payouts combine ledger balances with per-owner allocation rules (see owners-landlords guide).

### States
Not specified in docs (journals are posted/immutable; reversal is the only correction).

### Permissions
Not specified in docs.

### Dependencies
COA, service types, accounting periods, invoices, payments, allocations, expenses, refunds, adjustments (credit/debit notes, voids, write-offs), owner flows.

### Open questions (not in docs)
Posting config UI paths; roles for posting; manual-journal approvals; notifications; default account fallbacks; posting-key algorithm; subledger reconciliation; batch posting; outbox retry/failure handling; tax class/service type setup; QuickBooks posting; which events are reserved/future.

---

## 2. Accounting Periods: NOT FETCHED (HTTP 429)
Only known from other pages: posting allowed only into open periods; closed periods locked; accounting-and-posting says the guide covers opening, closing, reopening and a period close checklist; tax page lists "close period" as the last step of the monthly tax routine. All else: not specified in docs (page not read).

## 3. Financial Statements: NOT FETCHED (HTTP 429)
Known from reports page: Trial Balance (/reports/trial-balance, as at a date), Profit & Loss (/reports/profit-loss, over a period), Balance Sheet (/reports/balance-sheet, snapshot). Posting page says guide covers drill-down to journals. All else: not read.

## 4. Bank Accounts: NOT FETCHED (HTTP 429)
Posting page only says it covers "money movement mapping to ledger"; payment.received debits a Cash account mapped from payment method (bank/M-Pesa). All else: not read.

## 5. Assets: NOT FETCHED (HTTP 429)
Posting page only says it covers fixed assets and depreciation. Budgets page mentions "asset registers" as a data source for rental income. Depreciation posting rules: not read.

---

## 6. Budgets

### Purpose
Set income and cost budgets by period and account and compare against actuals.

### Entities and fields
| Field | Notes |
|---|---|
| Period | accounting period |
| Branch | budgets are branch-scoped |
| Account | COA account (same accounts as ledger posting) |
| Income lines / cost lines | amounts per account; field types, required/optional, defaults: not specified in docs |

### Flow
1. Choose period and branch.
2. Enter income lines: base rental income on lease book and escalation projections; adjust for expected vacancy; do not use "last year plus a percentage".
3. Enter cost lines using accounts that actually receive expense postings.
4. Save. UI shows a "Not Saved" indicator for pending edits; must save before leaving the page.
5. View /reports/budget-report (budget vs actual by account with variance).

### Rules
- A budget line with no matching expense account can never be compared.
- Budget at branch+account level; per-unit budgeting is "unmaintainable".
- Reforecast rather than rewrite (keep original for accountability); review monthly.
- Variance reading: income under + occupancy on plan = under-billing/missing escalations; income under + occupancy below plan = letting problem; single cost account over = overrun or miscoding; everything under early in period = posting timing.

### States / Permissions
Not specified in docs.

### Dependencies
Chart of Accounts, Charge Escalation, Financial Statements, Expenses.

### Open questions
Required/optional fields, defaults, roles, approvals, notifications, edit/delete, budget history/versioning.

---

## 7. Tax and eTIMS

### Purpose
Tax handling and KRA eTIMS invoice submission via DigiTax provider; certification, receipt tracking, corrections.

### Entities and fields
| Entity | Fields / notes |
|---|---|
| Tax connection (Finance -> Accounting -> Tax, per business/branch) | provider connection; API key and secret references (per business, not platform-wide); external IDs: tenant ID, branch ID, device ID; auth type; mode (production/sandbox) |
| Service type | carries tax class; default class D (Non-VAT); VAT-rated items mapped explicitly |
| eTIMS submission | status, provider, document type, correlation key, idempotency key, attempt count, failure reason, attempt history, payload/timeline |
| Certified receipt | "KRA eTIMS Certified" label, QR code, receipt details, fiscal identifiers |

### Flow
1. Configure tax connection per business; sync item catalogue (every billed service type must exist provider-side).
2. Issue the invoice (only issued invoices submit).
3. Send to eTIMS via invoice action or eTIMS Integration tab (confirmation dialog shows details).
4. Monitor status on eTIMS tab (live updates, audit trail). Cross-invoice view at /provider-mappings (filter provider/status, retry failed, drill timeline/payload).
5. Correction: "Void with credit note" (files KRA credit note; invoice returns to unfiled), then "Re-file to KRA" if a corrected receipt is needed.

Monthly routine: clear failed queue (mostly tax-class/item-mapping issues); confirm every issued invoice submitted; reconcile provider sales summary vs revenue; review credit notes vs certified invoices; close period.

### Rules and validations
- Tax is exclusive everywhere (KES 10,000 at 16% VAT bills KES 11,600); inclusive tax not supported.
- Re-file alone creates a second certified receipt and double-counts supply in eTIMS sales; does not void original.
- Multiple filings listed with document names (INV-748472, INV-748472-R1), Void button per accepted row; each receipt can be credited only once.
- Copying a connection submits that entity's invoices under your registration.
- Supported operations: Submit/Verify/Get Status Invoice; Submit/Reverse Credit Note; Reverse Invoice, Get Reversal Status; Upsert/List Items, Link Import Item; Upsert Customer/Supplier; List Branches; Pull Imports/Purchases/Notices; Adjust/Transfer Stock; Sales Summary Report, List Verifications. A manual operation runner (payload builder + response view) exists for diagnostics.
- Troubleshooting: "Unknown item" = service type missing from catalogue (upsert, resubmit); "Tax class" rejection = class mismatch with registration; no attempt = invoice draft or no connection; mass failures = credentials/connection.
- Platform also has tax schedule and withholding tax surfaces.
- Posting rules for tax (beyond VAT Output on invoices, VAT Input on expenses, WHT Payable): not specified in docs.

### States
Submission: queued -> submitted -> accepted | failed. Invoice eTIMS state: unfiled -> certified -> (voided back to unfiled).

### Permissions, notifications, approvals, tax rates
Not specified in docs (roles "configurable").

### Dependencies
Chart of Accounts (service type tax class), Accounting Periods, Adjustments (platform credit notes are separate from KRA filings), Invoice Management.

### Open questions
Rates other than 16%/class D; retry policy; WHT rates; roles; notifications; relation to RentRewards eRITS (not covered here).

---

## 8. QuickBooks: NOT FETCHED (HTTP 429)
Posting page lists "Integration with QuickBooks posting logic" as not specified. All else: not read.

---

## 9. Reports

### Purpose
Catalogue of financial, ledger, receivables, revenue, expense, property and owner reports.

### Report list (path under /reports/)
- Financial statements: trial-balance, profit-loss, balance-sheet
- Ledger/detail: general-ledger (category filtering), journal-lines (filter block/unit/lease/owner), transactions-report (branch-wide), statement-of-accounts-report
- Receivables: debt-aging-report (by lease or service type), ar-aging-ledger, tenant-ledger-report, tenant-statement (resident-facing), customer-statement-ledger
- Revenue: revenue-report (accrual), revenue-report-cash, monthly-report, summary-report
- Expenses: expense-report, expense-report-by-vendors, budget-report
- Property: lease-report, lease-expiry-report, rent-schedule-report (projects current rent flat over remaining term; ignores scheduled escalations), service-request-reports
- Owners: owner-statement (income, costs, commission, net payable), landlord-statement, landlord-report
- Also: Ask Nyumba Zetu (/rag), natural-language query for admins.

### Features and rules
- Filters: block, unit, lease, owner, service type; multi-select (not specified per report).
- Grid: column filter, sort, group with totals, column chooser, CSV/Excel export.
- Basis: "as at" for positions, "over a range" for flows.
- Drill-down to transactions on most reports (which ones: not specified).
- Owner statements can be scheduled; large exports run asynchronously ("requested reports").
- Docs have troubleshooting for scope, posting, allocation, empty results, basis mismatches.

### States / Permissions / Dependencies
States and permissions: not specified. Depends on ledger postings, leases, owners, service types.

### Open questions
Column definitions, export format details, scheduling frequency, default date ranges, rounding, limits, role access. (Summary count of 17 vs. listed items: docs wording unclear.)

---

## 10. Dashboard

### Purpose
One page unifying four consoles with shared scope, period, and comparison controls. Path: Testing -> Dashboard -> /dashboard (Beta).

### Consoles
| Console | Content | Standalone |
|---|---|---|
| Executive | current balances, arrears ladder, lease expiry, debt by block | none |
| Collections | outstanding debt, aging, team performance | /collections/overview |
| Payments | inbound cash, settlement status, unapplied funds | /payments/overview |
| Communications | message delivery, engagement | /communications/overview |

### Controls and rules
- Scope: property selector (hidden if one property). Period: window with exact resolved dates shown. "vs previous period": equal-length window ending the day before current starts.
- Tab counts are backlog (unassigned work): Collections = open cases without assigned officer; Payments = receipts in suspense (unidentified units); Communications = undelivered messages in period; Executive = none.
- Executive disables the period picker (current balances); "All properties" on Executive shows an explanation, not numbers.
- Export (only after figures load): Excel (sheet per section + Summary), CSV (all sections in one file), PDF (branded letterhead, period, page numbers).

### Permissions / formulas
KPI formulas, role-based views: not specified in docs.
