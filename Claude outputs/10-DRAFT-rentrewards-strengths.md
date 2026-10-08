# 10. DRAFT v2: RentRewards strengths, aligned to the code in your folder

Status: draft for your review. Nothing has been written to `RentRewards_V3 8 copy`. This replaces my first draft, which wrongly assumed plain HTML and SQLite.

**What I found in the folder:** RentRewards v3.1 is a Next.js 15 + TypeScript + PostgreSQL (Drizzle) app with 187 source files, 17 test files and 9 roles. Points, a rental record, maintenance, and in-app M-Pesa payment already exist, mostly against a mock provider. So this is a gap list against real code, not a greenfield spec.

**Decisions you gave me (applied below):**
1. Start with M-Pesa only.
2. Points are not redeemable for now, and the tenant's points system stays exactly as it is.
3. Rental passport = a score plus an explanation of how it was earned.
4. Maintenance: leave cost handling alone for now.
5. **Landlords see the tenant's Rental Passport, including a tree showing how the rent was paid** (this replaces my earlier "landlord sees only points").

---

## 1. Pay in the app (M-Pesa), linked to payer accounts for reconciliation

**What exists**
- `services/checkout.ts`: tenant taps Pay → `initiateStkPush` writes an `stk_requests` row first, then asks the provider → screen polls `checkoutStatus` → confirmation runs through `ingestMpesaTransaction`, the same path as the live webhook (matching, allocation, receipt, ledger, points).
- `services/matching.ts`: matches by tenant code → lease code → property code + unit → bare unit → payer phone; ambiguous or no match goes to an UNMATCHED queue with the cash in suspense, never guessed.
- `webhooks/mpesa/route.ts`: dedupes on the provider's transaction id, stores the raw row before matching, token check via `MPESA_WEBHOOK_SECRET` (the earlier audit's "unauthenticated webhook" finding is fixed).
- The STK reference is the tenant code, so app payments match exactly.

**Gaps (in priority order)**
1. **Live STK push is not implemented.** `MpesaProvider.requestCollection` throws. Needs Daraja OAuth + STK push (`CustomerPayBillOnline`), per-organisation credentials from the `integrations` table, and sandbox testing before production.
2. **No STK callback route.** The mock confirms by polling. Live payments need a signed/tokened `POST /api/v1/webhooks/mpesa/stk` that finds the `stk_requests` row by `checkoutRequestId`, marks it CONFIRMED or FAILED (with Safaricom's result code and message) and then ingests the transaction. Without it live requests expire as "nothing was charged".
3. **Payer linkage.** Today the payer is implicitly the tenant's phone. To link payments to payers' accounts properly:
   - Let the tenant choose or add the phone that pays (family, employer). Store it on the `stk_requests` row, which already has `phone`, and on the payment.
   - Add a small `payers` + `payer_accounts` layer (name, phone, relationship to tenant, verified flag) so a payment shows "Paid by Jane Wanjiku (sister) for tenant X".
   - `mpesa_transactions` already keeps `msisdn` and `payerName`; link them to the payer account so reconciliation and the tenant statement can show who paid.
4. **STK ↔ C2B de-duplication.** One real payment can show up as an STK callback and a paybill C2B confirmation. Dedupe on the M-Pesa receipt number across both, and keep the receipt number as the reconciliation key (from Nyumba Zetu: one receipt can legitimately appear on several rows, so don't make it unique at the payment level; make it unique per source transaction).
5. **Reconciliation screens.** The pipeline handles matching, but Nyumba Zetu's reconciliation adds things worth copying: duplicates queue, "Receipts sent to us" (tenant-forwarded M-Pesa SMS) with a verdict, parking non-rent lines, and a monthly sign-off that is blocked while exceptions remain. Add after live STK works.
6. **Allocation controls.** Nyumba Zetu's allocation has preview → execute → revert and configurable order rules; RentRewards allocates oldest-due-first with reversal. Add preview and an org-level order rule later.
7. **Known bug from your own audit to fix first:** a tenant whose lease ended but who still owes rent is offered Pay and then fails; Home and Pay can show different balances (Home counts drafts).

**Rule to keep:** a payment is only written after confirmation; unmatched money never lands on a guessed tenant.

---

## 2. Points (no redemption for now)

**What exists:** an append-only, balanced points ledger (`reward_entries`, `reward_accounts`, `reward_rules` versioned), earn at 1 point per KES 100, with a punctuality multiplier (on time ×1.00, slightly late ×0.50, late ×0.25, over 15 days late ×0), streak bonus +10/20/30% at 3/6/12 months (cap ×1.30), pending for 30 days then available, reversal on payment reversal, DB-level idempotency, and an explanation line per award (`explainEarn`). Redemption: only `DEPOSIT_FUND` is wired; `portal.rewards.redeem` permission exists.

**Changes for your decisions**
1. **Tenant points stay as they are.** No change to earning rules, the ledger, the pending/available buckets, the explanation lines or the tenant's rewards page.
2. **Redemption off for now.** The only change is to the redeem action: hide or disable it in the tenant portal and withhold `portal.rewards.redeem` from the TENANT role defaults, with "Redemption coming soon" on screen. `redeemPoints` and the ledger code stay intact for later.
3. **Maturation job (a bug, not a change to the system).** `matureDuePoints` exists but nothing calls it, so "Available" stays 0 (your audit, item 26). Scheduling it makes the system behave as designed; say so if you'd rather leave it untouched.
4. **Landlords and points.** Not exposed; they see the passport (section 3), which does not include points.
5. **Platform-wide balance.** You said a balance follows a tenant across organisations. The code keeps a per-tenancy `reward_accounts.tenant_id`, and your release notes list cross-organisation linking as undecided (an identity and data-protection question). Not for now; flagged so it isn't assumed built.

---

## 3. Rental passport (score + explanation)

**What exists, and it already matches your decision:** `services/rental-record.ts` computes, on read, a 0–100 score from five weighted factors (paid on time 45, how late 20, nothing outstanding 20, unbroken run 10, tenure 5), bands (Excellent / Good / Fair / Building / Needs attention), and shows every factor with its measurement and "what would improve it". It has no demographic input, labels thin files "Building", and renders in the portal, the staff tenant page and a downloadable PDF.

**What the landlord sees today:** landlords can already open a tenant on their own properties (`landlordHasTenant`), and the staff tenant "Portal" tab renders `RentalRecordInline` and `RentalRecordHistory`. But the LANDLORD role has no tenant-record permission set for it and the history is a flat month list, with no view of the payments behind each month.

**Proposed: "Rental Passport" for the landlord, with a payment tree**

A read-only page (and PDF) on the tenant for landlords, built from the same `rentalRecordFor` data so it can never disagree with the ledger.

1. **Header:** tenant name, unit, property, lease dates, band and score out of 100, one plain-language line ("11 of 12 months paid on time; nothing outstanding").
2. **Why this score:** the five factors exactly as now (paid on time 45, how late 20, nothing outstanding 20, unbroken run 10, tenure 5), each with its measurement.
3. **How the rent was paid, as a tree.** Each level expands to the next:

```
Tenant: Jane Wanjiku, Unit A12, Greenview Court         Rental Passport: Good (78/100)
└─ Lease LSE-0042 · 1 Jan 2026 → 31 Dec 2026 · KES 25,000/month
   ├─ 2026
   │  ├─ October · invoice INV-2026-000118 · due 5 Oct · KES 25,000 · UNPAID (not yet due)
   │  ├─ September · invoice INV-2026-000104 · due 5 Sep · KES 25,000 · ON TIME
   │  │  └─ Payment PAY-000311 · M-Pesa QJ7XK2L9AB · 4 Sep · KES 25,000 · allocated KES 25,000
   │  ├─ August · invoice INV-2026-000090 · due 5 Aug · KES 25,000 · JUST LATE (3 days)
   │  │  ├─ Payment PAY-000270 · M-Pesa QH2M8N4PQR · 6 Aug · KES 15,000
   │  │  └─ Payment PAY-000274 · M-Pesa QH5T1V7WXY · 8 Aug · KES 10,000 · cleared on 8 Aug
   │  └─ July · … 
   └─ Points earned on these payments are NOT shown here
```

   Levels: **tenant → lease → year → month (invoice, due date, amount, outcome badge) → payment(s) allocated to that invoice (date, method, M-Pesa receipt, amount applied, days after due, automatic or manual allocation)**. Split payments, early payments and one payment covering several months all show naturally, because the tree is built from `payment_allocations` (invoice ↔ payment) rather than from a status flag. An invoice that is overdue shows its balance and days late. Reversed payments show struck through with the reason.
4. **Summary strip above the tree:** months assessed, paid on time %, average days late, longest unbroken run, outstanding now.

**Data source (no new tables needed):** `rent_invoices` → `payment_allocations` → `payments` (`reference`, `externalReference` = M-Pesa receipt, `method`, `paidAt`, `payerName`, `reversedAt`). A new query returns invoices with their allocations in one pass; `computeRentalRecord` already reads the same rows.

**Landlord scope and privacy rules**
- Landlord sees a tenant only through `landlordHasTenant`, and only the invoices and payments on **that landlord's own properties**, never the tenant's history on someone else's (matters when one agent organisation manages several landlords).
- Payer phone numbers are masked (e.g. `0722 *** 456`); the payer name is shown only when the payer is not the tenant ("Paid by Jane's sister"), so third-party paying is visible without exposing numbers.
- No points, no balances of rewards, no income or ID data, as today.
- Every landlord view is written to the audit trail (who viewed which tenant's passport, when).
- Needs a decision on **scope of the score**: computed across the whole tenancy in the organisation (what staff see) or only the invoices on this landlord's properties. I propose the latter for landlords so the score and tree always agree.

**Tenant side (unchanged):** the tenant sees the same passport with the same tree for their own tenancy plus the existing PDF to hand to a future landlord, named "Rental Passport" instead of "rental record".

**Permissions:** new `passport.view` for LANDLORD (and staff roles that already see the record); the staff Portal tab keeps working as today.

**Deferred:** consent-based sharing with landlords outside the organisation and cross-organisation history, the same identity question as points.

---

## 4. Maintenance report and track (cost left alone)

**What exists:** staff Kanban + detail page; ticket numbering; states REPORTED → ACKNOWLEDGED → ASSIGNED → IN_PROGRESS → WAITING → RESOLVED → CLOSED; categories (plumbing, electrical, water, structural, security, appliance, internet, cleaning, other); priorities; an update thread per ticket; audit trail; tenant portal can report an issue (`/portal/maintenance/report`) and follow tickets with staff notes; the unit and property come from the tenant's lease, never from the form.

**Gaps within scope (no cost changes)**
1. **Photos.** The `documents` table exists but upload isn't wired (no object storage). Tenants can't attach photos. Highest-value addition.
2. **Permission gaps from your audit:** caretakers can assign and close tickets because only `maintenance.update` is checked; `maintenance.assign` and `maintenance.close` gate nothing. Enforce them. (Closing currently also raises a landlord expense; per your decision I'm not touching cost behaviour, only noting it.)
3. **Tenant notifications.** Notifications are empty for tenants because nothing writes a `userId`. Write a notification on each ticket status change.
4. **Tenant confirms completion** (RESOLVED → tenant confirms or reopens → CLOSED) and a one-tap rating.
5. **Assignee dropdown** lists every user including tenants and landlords; restrict to staff and vendors.
6. **Reports:** open vs closed, average time to resolve, repeat issues per unit, by property and category.

---

## 5. Add property: how the current flow compares with Nyumba Zetu

**Current RentRewards flow:** add landlord (payout method required) → Add property (landlord, name, type, county, town, area, address, manager, KRA PIN; auto code) → straight to units → add units one by one or bulk upload (CSV template, up to 500 rows, unit number + monthly rent required, type/floor/beds/baths/deposit/service charge optional) → tenants → leases → move-in.

**Worth copying from Nyumba Zetu**
1. **Range entry** for units ("A101-A120" with preview, idempotent on overlap) alongside the bulk upload.
2. **Normalise unit numbers on save** (trim, collapse spaces, uppercase). Your M-Pesa matcher already strips punctuation, so duplicates like "A 101" vs "A101" would silently collide at payment time.
3. **Retire, don't delete,** units with any invoice history.
4. **Dependency order and per-row results** on bulk import (they report created/skipped/failed per row, and warn that skipped rows are silent).
5. **Guided setup wizard** with "findings" for what's missing (no payment channel, unit without rent…), optional later.

---

## 6. Order of work

1. Fix the tenant Pay edge cases (ended lease, balance mismatch).
2. Live Daraja STK push + STK callback route + payer linkage (sandbox first).
3. STK/C2B de-duplication, then reconciliation queues.
4. Landlord Rental Passport with the payment tree (new query, page, PDF, `passport.view`, audit entry, masked payer phones); hide redemption; schedule maturation.
5. Maintenance: photos, permissions, tenant notifications, confirm/reopen.
6. Unit range entry and unit-number normalisation.

## 7. What I would save into your folder (after you approve)

A new folder `docs/nyumba-zetu/` containing the 10 reference files already written (00–09, with the schema section of 00 rewritten against your real Drizzle schema instead of my SQLite sketch) plus this document as `10-rentrewards-strengths.md`. I would not change any source code unless you ask.

## 8. Still open for you

1. Is `RentRewards_V3 8 copy` the project to build on? It's Next.js + PostgreSQL, while earlier notes said plain HTML/CSS/JS over SQLite.
2. Should the landlord's passport score cover only invoices on that landlord's properties (my proposal), or the tenant's whole tenancy in the organisation?
3. In the payment tree, is showing the M-Pesa receipt number and a masked phone number acceptable for landlords, or should they see amounts and dates only?
4. For the passport PDF, any wording or branding you want when tenants hand it to a new landlord?
