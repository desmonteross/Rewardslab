# Nyumba Zetu: Webhooks, FAQ, Changelog, Product Positioning

## Summary (10 lines)
1. Webhooks are an API-only (no UI) forward-looking change feed, HTTPS push, signed JSON POST, org-scoped (optional branch scope).
2. Seven subscribable events: cash.payment.received, cash.allocation.reversed, billing.invoice.issued, billing.invoice.voided, billing.penalty.assessed, tenancy.tps_allocation.received, tenancy.tps_contract.activated.
3. Payloads are references not records: IDs plus a few declared fields; consumers read full detail back via the partner API.
4. Signature: HMAC-SHA256 over "<ts>.<rawBody>", header `v1=<hex>`, plus timestamp header, +/-300s tolerance, constant-time compare.
5. Delivery is at-least-once; dedupe on `executionId`; 12 attempts, exponential backoff capped at 1h, then dead-letter with NO self-service replay.
6. Secret rotation has no overlap window; eventTypes cannot be PATCHed (re-register instead).
7. FAQ shows recurring real-world pain: wrong branch context, unallocated payments, drafts vs issued, unposted invoices, import order, duplicate residents.
8. Changelog (Aug 2026) shows priorities: payment detail + M-Pesa code capture, ledger posting of expenses, collections/dunning, eTIMS, reconciliation, owner statements.
9. Pricing: per-unit monthly in KES (Standard 180, Premier 250, Enterprise 350, down to 60 at scale, 20% annual discount).
10. Positioning: "Less chasing. More peace of mind." Kenya-only, M-Pesa + eTIMS + service charge/HOA workflows; claims 500+ properties, 50,000+ tenants.

## Sources (all fetched OK)
- https://www.nyumbazetu.com/docs/webhooks/overview
- https://www.nyumbazetu.com/docs/webhooks/quickstart
- https://www.nyumbazetu.com/docs/webhooks/verifying-signatures
- https://www.nyumbazetu.com/docs/webhooks/events
- https://www.nyumbazetu.com/docs/webhooks/retries-and-failures
- https://www.nyumbazetu.com/docs/webhooks/managing-endpoints
- https://www.nyumbazetu.com/docs/guides/faq
- https://www.nyumbazetu.com/docs/guides/whats-new
- https://www.nyumbazetu.com/docs/changelog
- https://www.nyumbazetu.com/
- https://www.nyumbazetu.com/about

Note: WebFetch returns model-summarised content; field lists below are as reported by the fetch, not raw page text. Items marked "not specified in docs" were not stated.

---

## 1. Webhooks

### 1.1 Concept
- A webhook is an HTTPS endpoint hosted by the customer. On subscribed events the platform sends a signed JSON POST.
- "A subscription is a forward-looking feed of state changes, and it is not a data export." No history replay, nothing about pre-registration events, no replay-from-timestamp.
- Use webhooks when: react promptly, only need the fact of change, can host a fast idempotent endpoint.
- Use polling of the Partner API when: need history, complete records, guaranteed-complete reconciliation sets, or cannot host public HTTPS.
- Delivery flow: (1) register via `POST /v3/webhooks` (secret returned once); (2) state change recorded and published (only publicly subscribable events); (3) platform signs body, sends headers `x-nz-webhook-timestamp` and `x-nz-webhook-signature`; (4) endpoint verifies, works asynchronously, returns 2xx quickly.
- Every delivery is signed; fail-closed if the secret cannot be resolved.
- HTTPS only, public addresses only, no credentials in URL.
- Ordering: no guarantee; use payload timestamps and IDs. (Retries page: ordering "not specified in docs"; overview says none guaranteed.)
- Scope: webhook belongs to one organisation (taken from the access token, never the body); optional narrowing to one branch via `branchId`.
- No UI: registration, testing, rotation are all API calls. Base: `https://api.nyumbazetu.com/v3`, bearer token.
- Not specified in docs: per-org endpoint cap, rate limits, event size limits, dead-letter retention duration.

### 1.2 Event catalogue
List available events: `GET /v3/webhooks/events` (perm 4801) returns `{success, data:[{eventType, version, means, entityType}]}`. Registering an unlisted name is refused at registration.

| Event | Trigger | Entity type | Version |
|---|---|---|---|
| cash.payment.received | Money arrived and payment record created | payment | 1 |
| cash.allocation.reversed | A previously applied allocation reversed | allocation | 1 |
| billing.invoice.issued | Invoice issued to payer and now collectable | invoice | 1 |
| billing.invoice.voided | Issued invoice voided (accounting act, NOT deletion; still readable via API) | invoice | 1 |
| billing.penalty.assessed | Late-payment penalty charged | penalty | 1 |
| tenancy.tps_allocation.received | Housing partner allocated a unit (TPS = tenant-purchase scheme) | tps_allocation | 1 |
| tenancy.tps_contract.activated | Tenant-purchase financing contract went live (fires once per contract) | tps_contract | 1 |

Envelope (every delivery):
- `event` (event name)
- `timestamp` (ISO 8601; changes between retries)
- `executionId` (stable across retries; dedupe key)
- `data` (object, below)
- `webhook` {uuid, name, id}

Inside `data`:
- `event_id` (= executionId), `event_type`, `org_id`, `branch_id` (or null), `entity_type`, `entity_id` (numeric; reference to read back via partner API), `attempt` (delivery attempt number; >1 means prior failures; one page says ">=1" so treat as ambiguous), `data` (per-event declared payload).

Money-bearing events share: `orgId`, `branchId` (or null), `amount` (decimal as STRING; parse with a decimal type, not float), `currency` (ISO 4217, e.g. KES).

Per-event payload fields:
- cash.payment.received: `paymentId` (number), `payMethod` (e.g. "mpesa", "bank_transfer"), `reference` (string or null). Example: KES 45,000 via M-Pesa, ref "SJ41K9PQ2M".
- cash.allocation.reversed: `allocationId`, `obligationId` (numbers). Example: KES 12,500 reversed.
- billing.invoice.issued: `invoiceId`, `invoiceNumber` (e.g. "INV-2026-09-00412"), `dueDate` (date, e.g. "2026-10-05"). Example KES 45,000.
- billing.invoice.voided: `invoiceId`.
- billing.penalty.assessed: `leaseId` (example: KES 2,250 on lease 66120). Note: no penalty id listed.
- tenancy.tps_allocation.received: `leaseId` (pending tenancy), `unitId`, `unitNumber` (door no., e.g. "AH005"), `accountNumber` (partner account ref or null). No purchaser identity.
- tenancy.tps_contract.activated: `contractId`, `contractNumber`, `leaseId` (same as allocation event, for end-to-end tracking), `caseId`.

Test events: carry `test: true` and no entity reference.

Versioning: all `version: 1`. Breaking changes arrive as new versions. Handler guidance: ignore unknown extra fields, key on `event` not payload shape.

Subscription constraints: 1 to 50 event types per endpoint; duplicates collapse; all names must be subscribable.

Not subscribable (internal): `ledger.*`, `sync.*`, `platform.*`, audit events. Docs call it a "one-way door": once subscribable, shape becomes an external contract.

### 1.3 Signature verification
- Headers: `x-nz-webhook-timestamp` (unix seconds when signed), `x-nz-webhook-signature` (`v1=<hex>`). Other headers (not signed): `content-type`, `X-Webhook-Event`, `X-Webhook-Execution-Id`.
- Signed payload: `"<timestamp>" + "." + <raw request body>`.
- Expected: `"v1=" + lowercase_hex(HMAC_SHA256(secret, signed_payload))`.
- Steps: (1) read raw bytes before JSON parsing; (2) validate timestamp numeric and within +/-300s of now (both directions); (3) recompute MAC; (4) constant-time compare (`crypto.timingSafeEqual`, `hmac.compare_digest`, `hash_equals`).
- Use the 64-char lowercase hex secret string as-is; do NOT hex-decode to bytes.
- Never re-serialise JSON; Express: use `express.raw({type:"application/json"})`, not `express.json()`; Flask `request.get_data()`; Laravel `$request->getContent()`.
- Verification returns false on any failure (no throw); reject with HTTP 400. Respond 200 first, parse and process asynchronously.
- Docs provide Node, Python, PHP samples (code not captured here).
- Rotation tolerance: compute both old and new expected signatures and accept either.
- Test via `POST /v3/webhooks/{uuid}/test` (real signing path).

### 1.4 Retries and failures
- At-least-once. 12 total attempts including the first, then dead-letter. About 5 hours to dead-letter (per docs).
- Backoff: `min(30s * 2^(n-1), 1h)` plus up to 10% random jitter after the nth failure. Listed delays: 30s, 1m, 2m, 4m, 8m, 16m, 32m, then 1h cap.
- Timeout: 30s per delivery, not configurable. Timeout = failed attempt.
- Status handling: 200-299 success; 408/425/429 retried; other 4xx (400,401,403,404,410) permanent, not retried; any 5xx retried; no response (timeout, DNS, TLS, reset) retried.
- Permanent failure also when: URL no longer resolves to a public address (lost HTTPS, private/loopback), missing/invalid signing secret, webhook deleted.
- Per-endpoint retry queue and dead-letter state.
- No self-service replay of dead-lettered deliveries; recovery = read state through the partner API.
- Auto-disable rules: not specified in docs (a "disabled" state exists). Alerts: not specified in docs.
- Delivery log: `GET /v3/webhooks/{uuid}/executions?limit=` (1-200, default 50, newest first). Contains event type, URL/method, response status, delivery status, duration ms, error. Sensitive headers (signature, authorization) stored redacted.
- Endpoint counters on `GET /v3/webhooks/{uuid}`: totalAttempts, totalSuccesses, totalFailures, lastTriggeredAt, lastSuccessAt, lastFailureAt.
- Quickstart says logs call uses limit=10 as example; retries page example uses 50.

### 1.5 Managing endpoints
Permissions: 4801 WebhooksView, 4802 WebhooksCreate, 4803 WebhooksEdit (also test), 4804 WebhooksDelete, 4805 WebhooksRotateSecret (deliberately separate from Edit).

| Operation | Route | Perm |
|---|---|---|
| Register | POST /v3/webhooks | 4802 |
| List | GET /v3/webhooks | 4801 |
| Read | GET /v3/webhooks/{uuid} | 4801 |
| Delivery log | GET /v3/webhooks/{uuid}/executions | 4801 |
| Update | PATCH /v3/webhooks/{uuid} | 4803 |
| Test | POST /v3/webhooks/{uuid}/test | 4803 |
| Rotate secret | POST /v3/webhooks/{uuid}/rotate-secret | 4805 |
| Delete | DELETE /v3/webhooks/{uuid} | 4804 |
| List events | GET /v3/webhooks/events | 4801 |

- Register body: `name` (1-200), `url` (HTTPS, max 500), `eventTypes` (1-50), optional `description` (max 500), optional `branchId`. Response 201 with uuid, echo fields, `enabled` (default true), `branchId`, timestamps, counters, `createdAt`, `signingSecret` (64 hex), `subscriptions` count.
- Register errors: 400 invalid URL/unavailable event; 403 session does not name a single organisation; 503 encryption key unavailable.
- URL validation at registration, on URL change, and on EVERY delivery attempt: HTTPS only, no embedded credentials, public addresses only; private/loopback/link-local/reserved (incl. 169.254.169.254) refused (SSRF defence).
- Secret: returned exactly twice (registration, rotate-secret); never from a read route, never in logs; encrypted at rest.
- PATCH: name, description, url (re-validated), enabled. `eventTypes` NOT patchable: register new endpoint and delete old.
- Disabled endpoints: deliveries recorded as skipped, NOT replayed on re-enable.
- Test: optional `eventType` (default cash.payment.received). Response `{delivered, statusCode, durationMs, error}`. delivered false with statusCode = non-2xx; statusCode null = no response (error has reason). Single attempt, not queued or retried. Proves transport and signature, not payload handling.
- Rotation: no overlap; new secret live immediately, old stops verifying when call returns. Recommended: (1) deploy dual-secret acceptance; (2) rotate and store the returned secret; (3) promote new as primary, old as secondary; (4) drop old after 300s+ replay window and a clean log. Errors: 404 not found in org; 503 encryption key unavailable (old secret unchanged).
- Delete: queued deliveries fail permanently; re-registering creates a new uuid and secret.
- Cross-org access returns 404 not 403 (cannot distinguish "not yours" from "not there").

### 1.6 Takeaways for RentRewards webhooks (derived from docs, labelled as my reading)
- Needed schema: endpoints (uuid, org_id, branch_id, url, enabled, encrypted secret, counters), subscriptions (endpoint, event), executions (execution_id, attempt, status, duration, redacted headers, error, next_retry_at).
- Reuse the pattern: stable executionId, per-attempt timestamp, sign `ts.body`, SSRF re-check per attempt, 12-attempt capped backoff, 4xx permanent except 408/425/429.
- Consider improving on their gaps: add replay of dead-lettered deliveries, secret overlap window, patchable subscriptions, alerts/auto-disable.

---

## 2. FAQ and troubleshooting (all items)

Getting started
- Sign in at app.nyumbazetu.com or the org's white-label address; accounts are admin-created only, no self-registration.
- New users: read "Navigating the app", then Quickstart (about 20 minutes: property, tenancy, billing, receipting, accounting).
- Help menu in top bar: docs, system status, contact.
- Menu differences between colleagues: three independent factors: role/permissions, branch assignment, module feature flag per branch.

"It's not there"
- Lease/invoice/payment vanished: almost always branch context; data outside active branch is not returned at all. Check branch at top of sidebar.
- Whole module missing: missing permission or feature flag off for branch (admin-controlled).
- Module visible but permanently empty: background job disabled or no qualifying data yet (see Scheduled tasks).
- Report empty: filters too narrow, wrong branch, no data in period; widen date range.

Billing
- Lease bills nothing: no recurring charges configured; creating a lease does not create billing.
- Invoice missing from aging report: still draft; only issued invoices are receivable.
- Invoice missing from trial balance: check posting status; `not_posted` or `failed` never reached the ledger. Invoices have five independent statuses.
- Still billing vacated unit: recurring charges have no end date and/or lease never moved out of Active.
- Tax wrong: tax is EXCLUSIVE platform-wide (KES 10,000 at 16% = KES 11,600); check service type tax class.

Payments and balances
- Paid but invoice unpaid: payment recorded but not allocated; allocation settles an invoice.
- Tenant shows arrears and credit: same cause, unallocated cash sits as wallet balance.
- Wallet vs prepaid: wallet = received and not applied to any invoice (only figure that can be netted against a balance); prepaid = already-settled portion of an invoice, already inside its due amount.
- Tenant says paid, no record: search by confirmation number not tenant name; likely captured against wrong unit/lease.
- Negative wallet balance: illegitimate; indicates historical over-allocation; report, do not hand-adjust.

Collections
- Case opened on a tenant who paid: payment unallocated; once allocated, case moves to clearing.
- Nothing sent from a strategy: module defaults to shadow mode; actions staged for human confirmation.
- Penalties not charged: check in order: penalties job enabled, master scheduler on, policies exist and in scope, each policy has a penalty service type.
- Promise to pay not pausing dunning: promise was in notes, not recorded as a Promise to Pay; only recorded promises are visible to the engine.

Accounting
- Cannot post, date rejected: period closed; post in current period or reopen with authorisation.
- Revenue lower than invoices: issued but not posted to ledger; filter by posting status.
- Void vs write off: void if invoice should never have existed (revenue reversed); write off if correct but unpayable (revenue stands, bad debt recognised).
- Two reports disagree: check basis (accrual vs cash; as-at date vs date range).

Communications
- Tenant did not get invoice: check Delivery Tracker for delivered, not sent; provider can still fail at network; provider response names cause.
- Messages "skipped": recipient has no valid address for that channel; fix resident record.
- Four messages in a day: multiple sources; collection strategies have contact-frequency cap, broadcasts ignore case state.

Owners
- Statement shows no income: units not attached to owner's contract, or income invoiced against a different unit.
- Costs missing: expense recorded without unit/block attribution.
- Brought-forward does not match prior carried-forward: statements generated out of order or a prior period regenerated afterwards.

Imports and data
- Mass "not found": import order must be units, residents, leases, invoices, payments.
- Rows silently skipped: skipped is not failed (duplicates or skip-rules); see per-row reason in History.
- Undo import: not one click, and not after allocation/posting; test with ten rows first; bulk expense re-filing is reversible as a unit.
- Resident import created nobody though wizard said ready: fixed Aug 2026 (duplicates used to end whole run; now skip own row).
- Export downloads nothing: fixed Aug 2026 (all CSV exports silently failing); empty views now say nothing to export.

Access and account
- Password/profile via profile menu in top bar.
- Departed colleague: deactivate, never delete (deleting breaks audit attribution).
- Approvals stuck: no user holds approve right for that module, or approver away with no delegate.
- Support: Help menu; org administrator for account/billing questions.

General debugging order: (1) branch context, (2) status (draft/issued, posted/unposted, active/ended), (3) allocation (received is not applied), (4) jobs and flags, (5) audit trail.

Design lessons for RentRewards: separate payment (cash received) from allocation (settlement); invoice draft/issued/posted states; branch-scoped visibility; shadow mode for automated dunning; closed accounting periods; deactivate-not-delete users; search payments by M-Pesa confirmation code; duplicate guard and per-row import outcomes.

---

## 3. What's new and changelog highlights

Changelog (dated entries, all 2026; nothing before 21 Aug is specified in docs)
- 21-25 Aug "August Release": Forms module (beta), Demand letters (tracking, approval), Branding workspace, Dashboard (executive, collections, payments consoles), Guided setup wizard, Communications overview and contact reports, Notice board console, Manual journal entries, Platform directory with deactivation; collections case page rebuild (escalation stepper); residents carry legal type, registered name, KRA PIN; bulk upload date-format spec and better errors; eTIMS void processing.
- 26 Aug: bulk expense re-filing (preview, reversal); admin Clients/Vendor-links consoles; org-level vendors; data retention window; late fees rebuilt (two screens); dashboard to top-level nav; only admins add service types; invoice list shows category; record chips/peeks. Fixes: property managers with permission could not send invoices; invoice line rate rounding (0.3750 to 0.38) gave wrong totals; dashboard export greyed out on all six tabs.
- 27 Aug: reservation rate memory (tax/discount); double-billing guard for recurring rules; M-Pesa handset selection (payers on secondary lines had no path); retired Employees/Team/Useful Contacts pages. Fixes: every CSV export silently failing in production; escalation schedules list; vendor bank details box removed.
- 28 Aug: all-meters view (property with three water rules saw only a third of meters); bulk upload multi-unit tenants; duplicate name no longer kills upload run; Owners workspace replaces Landlords page. Fixes: owner statements overstated net income (regeneration recommended); zero-consumption readings no longer billed.
- 29 Aug: duplicate resident advisory (name-only match reports after save, not refuse); duplicate-detection health rule. Fixes: pricing rules behind property/block-scoped recurring invoices were silently inactive; invoice billing party auto-assigned if missing.
- 30 Aug: expense categories carry an account, vendors carry ledger identity; nightly ledger-vs-receivables reconciliation with health findings; dashboard refresh forces recompute. Fixes: 26 of 44 health rules were never running; Overview returned zero for orgs, tenant counting; M-Pesa duplicate guard (same phone, same amount, same paybill, within a minute) now explained to users.
- 31 Aug: every payment gets its own page (allocations, settlement journey, documents); M-Pesa confirmation code captured, searchable; selective message silencing (e.g. marketing while keeping bills); email reply handling aligned with WhatsApp contact reporting. Fix: adding/editing/removing team members failing platform-wide (permission grant errors).

What's-new guide, module summary
- Collections: overview console (arrears exposure, ageing, collection rate, officer activity), ranked worklist, dunning ladders with band targeting, approval gating and contact-frequency caps, demand letters, Promise to Pay (instalments, kept/broken), penalties as own module, legal register (matters, hearings, costs), debt aging.
- Finance: allocations (preview, execute, revert, run log), expense wallets (petty cash, insufficient-funds guard), bulk expense import, payments reconciliation (bank/M-Pesa statement import, auto-match, exception queue, period sign-off), statement drill-down to journal lines, recurring invoices (qty, unit price, defaults), charge escalation, bank accounts (active/inactive, linking), M-Pesa STK Push credentials with test, locked identity fields for payment-matching trail, checkout routing by payment rail, tax-exclusive semantics, eTIMS (KRA-certified QR receipts, re-file, provider mappings, retry; void with credit note only), KRA tax class on DigiTax mappings.
- Owners: workspace, payout accounts, management agreements (fee, charge basis, payout cadence and day), statements with invoice-grain detail, running balance, schedules.
- Ownership plans (TPS): home dashboard, contract auto-generation from applications, onboarding lobby with SLA tiers.
- Operations: Forms (versioned questionnaires, photo, signature), Bulk Upload v2 (wizard, sample templates, file retention, run history), IoT dashboard and IoT arrears enforcement, broadcasts, notice board.
- Reporting: debt aging zero-balance toggle, ledger report filters, category field on GL/journal lines, rent schedule report. Lease report and lease expiry report: not specified in docs.
- Platform: dark mode, quick filters, grid/kanban/calendar views, breadcrumbs and UUID routes, approvals system, per-tenant runtime branding, version banner, feature flags UI, platform health (scans, issues queue, rules).
- Docs: full restructure by workflow; about 30 new guides.

Evolution read (my inference): Aug 2026 is a heavy hardening sprint (silent failures fixed, ledger integrity, reconciliation) after a broad module expansion; priorities are money correctness (allocation, posting, reconciliation), collections automation, KRA eTIMS compliance, and owner statements.

---

## 4. Positioning, pricing, claims

Home page
- Tagline: "Less chasing. More peace of mind." Cloud property management purpose-built for Kenya.
- Targets: landlords/agents, property management companies, estate/HOA committees, developers, banks and SACCOs, diaspora owners; apartments, townhouses, gated estates, commercial/mixed-use.
- Features claimed: automated M-Pesa (paybill, till) and bank rent collection with auto-matching; real-time receipts; service charge billing; utility/fee invoicing; collectability score (A-E bands); arrears by age; double-entry GL, journals, ledgers, trial balance, P&L, balance sheet, audit trails; tenant and owner portals; mobile apps; WhatsApp chatbot; AI chatbot; email/SMS/WhatsApp messaging; work orders and service requests; RAG-powered insights; portfolio dashboards; KRA eTIMS auto-transmission.
- Banks listed: NCBA, Co-op, DTB, Equity, KCB, Stanbic, I&M, ABSA, Standard Chartered, Gulf African, Prime, Housing Finance.
- Integrations: M-Pesa, banks, QuickBooks, KRA eTIMS, WhatsApp, eCitizen, Boma Yangu.
- Security claims: encrypted storage, regular backups, GDPR-compliant practices, RBAC (managers, accountants, owners, tenants), audit trails.
- Onboarding: self-service under 20 minutes; assisted onboarding free for larger portfolios; import units, tenants, opening balances.
- Free trial, SLA, storage and API limits: not specified in docs.

Pricing (home page; about page says pricing not specified)
- Per unit per month in KES: Standard 180, Premier 250, Enterprise 350; falls to 60/unit/month at scale; 20% off annual billing; a monthly minimum applies (amount not specified); no setup fee mentioned. Which features differ per tier: not specified in docs.

Customer claims (unverified marketing)
- 500+ properties, 1M+ invoices delivered, KES 1B+ monthly transactions, 50,000+ tenants; 95.3% average collection rate; 8.2% monthly collection improvement (example); 12 hours saved per week per manager; 4.8 Google rating; 86% of new clients by referral; case study 48 to 1,200 units.
- About page instead says only "thousands of transactions monthly" (inconsistent with KES 1B+ claim).
- Awards: KPRA Real Estate Technology Company of the Year 2022-2023, 2024, 2025; many media mentions.
- Named customers: Epic Properties, Realty Plus, MySpace Properties, Bustani Holdings, and 20+ more; estates in Lavington, Syokimau, Mombasa, Kilimani, Kiambu. Partners: NCBA, Boma Yangu, HFCB, AIESEC.
- Testimonials: JMAKPN ("way less stressful"), Grace Nyambura (Gatma Ltd), Olivia Ogola (Kiambu), Shallen Muthoni (Nairobi).
- CTAs: Request a demo; Get your time back; Explore Features; Login (app.nyumbazetu.com).
- About: founded by property professionals and technologists; mission "Transform how property is managed in Kenya"; HQ Ikigai Lavington, James Gichuru Road, Nairobi; team not specified in docs.
