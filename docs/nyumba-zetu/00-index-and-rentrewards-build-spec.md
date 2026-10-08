# Nyumba Zetu → RentRewards: Index and Build Spec

Source: Nyumba Zetu's public documentation (https://www.nyumbazetu.com/docs), about 100 pages read. No app screens were seen, so field types, validation messages and permission matrices are often "not specified in docs". Nothing here was invented; the RentRewards recommendations in sections 3–6 are my suggestions and are labelled as such.

Stack: the existing RentRewards v3.1 codebase (Next.js 15, TypeScript, PostgreSQL via Drizzle). Earlier sketches here assumed plain HTML and SQLite; see section 4 for the real mapping.

## 1. File index

| File | Covers |
|---|---|
| 01 | Organisation/branch/block/unit setup, **add property flow**, add unit, bulk upload, guided setup wizard, roles, feature flags, portfolios, branding |
| 02 | Residents, lease applications, leases, security deposits, offboarding, owners, owner contracts, owner statements, disbursements |
| 03 | Invoices, recurring charges, escalation, receiving payments, allocations, chart of accounts and service types |
| 04 | Collections (cases, strategies, promises, penalties, demand letters, legal register, aging), vendors |
| 05 | Accounting and posting, tax and eTIMS, budgets, reports, dashboard |
| 06 | Service requests, amenities, visitors, scheduled tasks, forms, reservations, work, sales pipeline, communications, tenant portal |
| 07 | Utilities, IoT smart meters, TPS (tenant purchase scheme), activity log, platform health, data retention |
| 08 | Webhooks, FAQ edge cases, changelog, pricing and positioning |
| 09 | 17 pages that were rate-limited first time: approvals, settings, payment rules, reconciliation, adjustments, refunds, strategies, expenses, wallets, periods, statements, bank accounts, assets, QuickBooks, documents, IoT vendors and billing runs |

## 2. How Nyumba Zetu is built (the mental model)

1. **Scope hierarchy.** Organisation → Branch → Block → Unit, with Portfolios cutting across. Branch is a hard data boundary, not a filter. Settings and feature flags resolve `lease → unit → block → branch → organisation → platform default`.
2. **Unit is the billable thing; the lease is the billing subject.** Unit occupancy is derived from lease status and unit financials are computed from the ledger. Neither is typed in.
3. **Nothing is deleted once money touched it.** Voids, credit notes, reversals and status changes replace edits and deletes. Reversals are linked rows.
4. **Money is a chain of separate steps, each with its own record:** invoice (draft → issued → posted) → payment recorded → allocation → owner statement → disbursement record. A saved payment does not settle an invoice, and a disbursement record does not move money.
5. **Ledger is event-driven and idempotent.** Domain events post double-entry journals using posting keys; periods lock the past.
6. **Automations start in shadow mode** (recommend-only) and need a human to confirm sends, fees and disconnects. Money-touching jobs need a master switch plus a per-job switch.
7. **Approvals are staged actions** computed server-side. Approve executes the staged action; reject skips it with a reason.
8. **Audit everything:** who, when, before/after, reason. History is append-only.

## 3. The Add Property flow (what to copy)

Nyumba Zetu has two entry points to the same data:

**A. Guided wizard (11 steps, autosaves, non-linear, admin-only, raises "findings")**
Welcome → Company → Setup method → Properties → Units → People → Billing rules → Opening balances → Payment channels → Review → Go live.
- Properties: one row each, name + optional short code + location; at least one required.
- Units: range entry ("A101-A120") with preview; overlapping ranges never duplicate.
- People is optional.

**B. Manual** Admin → Blocks → Add (name, address, branch) then Admin → Units → Add.

**Unit fields:** house number/name, block, main-unit (parent), type, category, occupancy type, size, beds, water meter number, is-managed, owner, notes. Derived read-only: status, active leases, residents, invoiced/paid/due/prepaid/wallet.

**Spec for RentRewards (suggestion):**
1. Screen "Add property": name, short code, address/county/town, landlord (owner), management type (self-managed vs agent-managed), optional agent and commission rule, payment channels (paybill/till) to attach later.
2. Step 2 "Add units" on the same flow: range generator (prefix + from–to), per-unit type, rent, deposit, beds, water meter; preview table before save; idempotent by (property_id, unit_code).
3. Unit codes normalised on save (trim, collapse spaces, uppercase) to avoid the "A101 / A 101 / Apt A101" duplicate problem Nyumba Zetu warns about.
4. Owner attached at unit level (as they do) but defaulted from the property so one choice covers the whole building; allow override per unit.
5. Never store occupancy or balances; compute from leases and ledger.
6. Retire units with a status change; block delete when any invoice exists.
7. Resolve the contradictions in their docs deliberately: make owner required for managed units; make size optional.

## 4. Data model: Nyumba Zetu concepts mapped to the existing RentRewards schema

The first version of this file proposed a SQLite schema. RentRewards is already a Next.js + PostgreSQL (Drizzle) app, so use the existing tables in `src/db/schema.ts` instead. Mapping:

| Nyumba Zetu concept | Existing RentRewards table | Gap |
|---|---|---|
| Organisation / branch | `organizations` (every table carries `organization_id`) | no branch layer; add only if needed |
| Owner / landlord, bank accounts | `landlords` (payout method M-Pesa or bank) | no versioned contracts; commission rules exist at 4 levels |
| Block / property | `properties` | none for the add flow |
| Unit | `units` | normalise unit numbers on save; retire instead of delete |
| Resident | `tenants` | duplicate check on phone/ID |
| Lease | `leases` | none |
| Invoice | `rent_invoices` | none |
| Payment | `payments` (`external_reference` = M-Pesa receipt) | payer account layer |
| Allocation | `payment_allocations` | preview step, configurable order |
| M-Pesa raw inbound | `mpesa_transactions` | link to payer |
| STK request | `stk_requests` | live callback route |
| Ledger | double-entry ledger service | none |
| Maintenance | `maintenance_tickets`, `maintenance_updates` | photos, tenant notifications |
| Points | `reward_*` tables (append-only ledger) | unchanged by decision |
| Rental record | derived on read (`services/rental-record.ts`) | landlord passport + payment tree |


## 5. Build order (suggestion)

**Phase 1: foundation.** Auth and roles, org/branch scoping on every query, settings scope chain, audit log. Properties and units with the range generator. Owners and bank accounts. Unit/lease/resident CRUD with dedupe.
**Phase 2: billing.** Service types and chart of accounts, leases with recurring charges, invoice draft → issue → post, monthly generation job (shadow first), invoice and statement PDFs.
**Phase 3: money in.** Record payment (confirmation number mandatory), manual allocation, allocation engine with preview/execute/revert and payment rules, M-Pesa matching by reference, then duplicates guard. Add the **points award on confirmed payment**.
**Phase 4: money out.** Owner contracts, expenses with unit/block attribution, owner statements (B/F + income − commission − expenses = net, C/F), disbursement record, then your payment splits.
**Phase 5: controls.** Approvals, period close, bank statement import and reconciliation, adjustments (void, credit/debit note, write-off), refunds.
**Phase 6: growth.** Collections (cases, promise to pay, late fees, demand letters), service requests, notices, tenant portal/app, eRITS and eTIMS-style tax submission, webhooks, bulk upload.

## 6. Edge cases and traps worth copying defences for

- Payment received ≠ invoice settled. Unallocated cash makes arrears and credit at the same time; surface it.
- Confirmation number is the reconciliation key but one receipt can match several rows: do not make it unique. Bank-relayed M-Pesa needs a separate M-Pesa code field.
- Invoices need five independent statuses (invoice, payment, posting, approval, communication). Only issued invoices age; due date drives aging and penalties.
- Void ≠ write-off: void reverses revenue; write-off keeps revenue and books bad debt.
- Never "refund" by deleting a payment; reverse allocations first, then refund against the payment with an over-refund guard.
- Approved ≠ activated for applications; activation must be resumable so a retry can't create two tenancies.
- Statement chain breaks when B/F ≠ prior C/F.
- Costs without unit/block attribution never reach owner statements.
- Bank account identity fields (number, paybill) lock after first activity.
- Import order matters: units → residents → leases → invoices → payments. Skipped rows are silent; show them.
- Webhooks: send IDs not records, sign with HMAC-SHA256 over `timestamp.body`, at-least-once with dedupe key; they lack a secret-overlap window and replay, which you can add.

## 7. Where RentRewards goes beyond Nyumba Zetu

Nyumba Zetu has no documented equivalent of: (1) splitting each payment between landlord, platform fee and agent commission with each party seeing balances, (2) a cross-organisation rewards/points balance, (3) a PSP-level settlement flow. These are your differentiators, so they deserve their own design pass (PSP choice, who funds points, settlement timing).

## 8. Known gaps in the research

- Public docs only: no screens, validation messages, field types or limits.
- Some docs contradict each other (owner and size required vs optional on units; "ten" vs eleven import types; 17 vs 24 reports).
- IoT pages are thin checklists. The documents/templates page lists no merge variables.
- Home-page usage stats (KES 1B+/month) conflict with the About page; treat as marketing.
- A hands-on trial account would fill the biggest gap: exact screens, required fields and error behaviour.
