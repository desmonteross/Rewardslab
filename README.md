# RentRewards — Phase 1

A multi-tenant SaaS property management system for the Kenyan market: portfolio
management, automated rent billing, M-Pesa collection and reconciliation,
double-entry accounting, landlord settlements, maintenance, and KRA eRITS
compliance.

Phase 1 is the **web application**. The tenant mobile app is not built, but the
API it will consume exists and is documented in [`openapi.yaml`](./openapi.yaml)
— it reads the same tables the web app writes, so there is no second data model
to keep in sync.

---

## Running it

### With Docker (one command)

```bash
docker compose up
```

That starts PostgreSQL, installs dependencies, pushes the schema, seeds three
organizations with realistic Kenyan demo data, and serves the app on
<http://localhost:3000>.

### Without Docker

```bash
cp .env.example .env          # then point DATABASE_URL at your PostgreSQL
npm install
npm run setup                 # push schema + seed demo data
npm run dev
```

Requires Node 20+ and PostgreSQL 14+.

### Sign in

Every demo account uses the password `Password123`.

| Email | Role | What it shows |
|---|---|---|
| `admin@prime.co.ke` | Company Admin | Everything in Prime Property Management |
| `manager@prime.co.ke` | Property Manager | Portfolio and tenancy, no settlements |
| `accounts@prime.co.ke` | Accountant | Reconciliation, settlements, eRITS, audit |
| `landlord@wanjikuholdings.co.ke` | Landlord portal | One landlord's own portfolio only |
| `tenant@example.co.ke` | Tenant portal | One tenancy, paid up to date |
| `tenant.arrears@example.co.ke` | Tenant portal | One tenancy, carrying arrears |
| `tenant@skyline.co.ke` | Tenant portal, other org | Proves portal isolation |
| `caretaker@prime.co.ke` | Caretaker | Units and maintenance |
| `auditor@prime.co.ke` | Read-only auditor | Read access plus the audit trail |
| `admin@skyline.co.ke` | A different organization | Proves tenant isolation |
| `superadmin@pms.co.ke` | Platform super admin | SaaS administration only |

### Useful commands

```bash
npm run dev          # development server
npm test             # unit + database-backed integration tests
npm run typecheck    # tsc --noEmit
npm run build        # production build
npm run db:push      # sync the schema without a migration file
npm run db:generate  # write a SQL migration into ./drizzle
npm run db:seed      # re-seed demo data
npm run db:reset     # drop everything and start over
```

---

## How it is put together

```
ORGANIZATION → LANDLORD → PROPERTY → UNIT → TENANT → LEASE
  → RENT INVOICE → PAYMENT → RECEIPT → COMMISSION → SETTLEMENT
  → LEDGER → KRA eRITS
```

Every module reads and writes that one chain. There are no disconnected demo
screens: the dashboard, the reports and the eRITS return are all derived from
the same rows.

```
src/
  db/              schema.ts (the whole data model), seed.ts, migrate, reset
  lib/             money, dates, auth, session, rbac, tenancy, audit, api helpers
  server/
    adapters/      PaymentProvider, PayoutProvider, TaxProvider, NotificationProvider
    services/      billing, payments, allocation, matching, commission, ledger,
                   settlements, expenses, maintenance, leases, compliance, treasury
    queries/       dashboard aggregates
    reports/       the report registry (one definition per report)
  app/
    (app)/         the authenticated application
    api/v1/        the REST surface the Phase 2 mobile app consumes
  components/      UI primitives, charts, shell
tests/             unit tests + end-to-end tests against a real database
```

### The rules the code holds to

**Tenancy.** Every tenant-scoped table carries `organization_id`. Queries are
built through `scoped()` / `landlordScoped()` in `src/lib/tenancy.ts`, which take
a `Scope` rather than an id, so the filter cannot be forgotten. Anything fetched
by id goes through `assertInScope()`. A landlord portal user is narrowed further
to their own portfolio by the same helpers. Document numbers are unique *per
organization*, so two tenants both have an `INV-2026-000001`.

**Money.** Every monetary column is `numeric(16,2)` and arrives in JavaScript as
a string. Arithmetic happens in integer cents (`src/lib/money.ts`); only the
rounded result is written back. Nothing in this codebase adds two money values
with `+`. Rates are parsed separately from money, because `numeric(6,3)` carries
three decimal places and quantising a 1.125% commission to 1.13% is a real bug.

**Accounting.** A payment does not set a "paid" flag. It posts a balanced group
of double-entry lines that are never updated or deleted; a correction is a
reversing group. The Accounting screen shows the trial balance, and it balances.

**Reconciliation.** An M-Pesa receipt is matched to a tenant by tenant code,
lease code, property code + unit number, bare unit number, or payer phone — in
that order, stopping at the first unambiguous hit. If nothing matches, the money
is **not** guessed onto an account: the payment is parked as `UNMATCHED`, the
cash lands in a suspense account so the ledger still balances, and a compliance
exception is raised for an accountant.

**Tax.** Rates, bands and effective dates live in the `tax_rules` table, not in
code, because Kenyan legislation changes. The seeded rules are a sample
configuration — confirm the current rate and filing channel with KRA before
relying on them.

---

## The tenant portal

Tenants get their own role (`TENANT`) and their own area at `/portal`, separate
from the staff application: a mobile-first layout with four places to go, and no
access to anything else in the system. Signing in as a tenant lands there rather
than on the dashboard.

What a tenant can do:

- **See what is due.** The balance, which invoices make it up, when each fell
  due, and the M-Pesa account number that will match their payment to their
  tenancy automatically.
- **See their rental record.** An explainable summary of how they have paid —
  see below.
- **Follow repairs.** Every issue they have reported, where it has got to in the
  workflow, and the notes staff have added.
- **Report an issue.** This creates a real maintenance ticket on the staff
  Kanban board, with the same numbering and the same audit trail as one raised
  internally. The property and unit come from the tenant's own lease, never from
  the form.
- **Download documents.** Any receipt as a PDF, their full statement as a PDF or
  CSV, and their rental record as a PDF they can hand to a future landlord.

### The rental record

Not a credit score, and the code says so in several places on purpose. It is
computed on read from the tenant's own invoices and payments — never stored, so
it cannot drift out of step with the ledger — from five weighted factors that
sum to 100:

| Factor | Weight | What it measures |
|---|---|---|
| Paid on time | 45 | Share of assessed months cleared by the due date |
| How late, when late | 20 | Average days past due |
| Nothing outstanding | 20 | Current arrears, in months of rent |
| Unbroken run | 10 | Longest streak without a late payment |
| Length of tenancy | 5 | Months on record |

Deliberate choices, all covered by tests in `tests/rental-record.test.ts`:

- **No demographic, employment or identity input.** Payment behaviour only. One
  test asserts the input type carries nothing else, so widening it is a
  conversation rather than an accident.
- **Every point is attributable.** The factors, their weights and the
  measurement behind each are shown wherever the band is shown — in the portal,
  in the staff-side tenant record, and in the PDF. A test asserts the factors
  sum to the score.
- **Thin files are labelled thin.** A tenant with two months of history is
  "Building", not "Poor" — except where there are two months of arrears, which
  is reported however short the history is, because hiding it would be worse.
- **Payment within five days of the due date is half credit, not a miss**, and
  does not break the streak.
- **An unpaid overdue invoice counts against the record**, so a tenant cannot
  hold a perfect on-time rate by simply never paying.

The same record is visible to the property manager and the landlord on the
tenant's **Portal** tab, because it restates payment history they can already
read. It is not used to make any decision in the system.

### Getting a tenant into the portal

Two ways, both landing in the same place:

1. **Invitation.** A manager with `tenants.invite` opens the tenant's Portal tab
   and sends an invitation. A one-time token is generated; only its SHA-256 hash
   is stored, it expires in 72 hours, issuing a new one revokes the old, and
   accepting it burns it.
2. **Self-registration** at `/tenant/register`, using the tenant reference and
   the phone number already on file. Weaker, so it is a per-organization setting
   (`organizations.portal_self_signup`), the reply is identical whether the code
   or the phone number was wrong, and every attempt is audited.

A tenant record can hold at most one portal login, and nothing in either path
can create a staff account.

### For the Phase 2 mobile app

The portal and the mobile app read the same endpoints, so they cannot disagree:
`GET /api/v1/me/summary`, `/api/v1/me/record`, `/api/v1/me/issues` and
`POST /api/v1/me/issues`. A tenant session carries its own tenant id and it
always wins — passing someone else's `tenantId` returns 403, not their data.

## Integrations

Nothing in the core talks to a vendor directly. Each capability sits behind an
interface in `src/server/adapters/types.ts`:

| Interface | Phase 1 | Production |
|---|---|---|
| `PaymentProvider` | `MpesaMockProvider` — realistic Safaricom-shaped payloads, nothing leaves the process | Implement `MpesaProvider` against your organization's authorised Daraja endpoints and set `PAYMENTS_PROVIDER=mpesa` |
| `PayoutProvider` | Mock disbursement, with a deterministic failure when a landlord has no payout destination | Same adapter, live B2C |
| `TaxProvider` | `EritsMockProvider` — **never contacts KRA**, stamps every result `SIMULATED` | Implement `EritsProvider` using officially available or authorised KRA mechanisms only |
| `NotificationProvider` | Console — messages are logged, notification rows are real | SMS / email adapter |
| `BankingProvider` | Stub | Phase 2 statement ingestion, normalising into the same inbound shape M-Pesa uses |

**On KRA:** this project does not invent or document undisclosed KRA endpoints.
The live eRITS adapter is a scaffold that fails fast until real credentials are
configured. Simulated submissions are labelled as such everywhere they appear.

### Trying the M-Pesa pipeline

Payments → **Simulate an M-Pesa receipt**. Enter an account number the way a
tenant would (`GV-A12`, `gv a12`, or just `A12`) and watch the payment match,
allocate, take commission, issue a receipt and create the landlord payable.
Enter something useless like `RENT` and watch it land in the unmatched queue
instead — then reconcile it by hand from the payment screen.

The simulator and the real webhook (`POST /api/v1/webhooks/mpesa`) go through
exactly the same code path.

---

## Testing

```bash
npm test
```

88 tests. The unit tests cover the arithmetic that must not drift — money
parsing and rounding, commission at every rate, payment allocation, invoice
status transitions, proration and penalties, settlement totals, ledger balance,
account-reference normalisation and tax rule precedence.

`tests/pipeline.test.ts` runs against a real PostgreSQL database. It builds two
throwaway organizations, pushes money through the actual billing →
reconciliation → commission → settlement pipeline, and asserts both the
financial outcome and that neither organization can see the other's data:
scoped queries, `assertInScope`, cross-organization account references, separate
document numbering and separate ledgers. Everything it creates is removed
afterwards.

---

## What Phase 1 deliberately does not do

- **No tenant mobile app.** The API it needs is built and documented; the app is
  Phase 2.
- **No live M-Pesa or KRA traffic.** Both adapters are mocks by default, and the
  live paths fail fast rather than guessing at an integration.
- **Settings are read-only in the UI.** Commission rules, tax rules and
  organization details are data and are editable through the API or the
  database; a settings editor is a Phase 2 item.
- **Export is CSV plus browser print-to-PDF.** Both open correctly in Excel and
  produce clean PDFs; a server-side PDF renderer is a later refinement.
- **File upload is modelled but not wired.** The `documents` table and the UI
  surfaces exist; object storage is not configured.

---

## Branding

The RentRewards mark is drawn as vector geometry in
[`src/components/brand.tsx`](./src/components/brand.tsx), not loaded from the
supplied PNG. The original artwork is 438×154 with the navy background baked
into it, which would show as a dark rectangle on a light surface and blur on a
retina screen. The path was measured off that artwork — 45° edges and two
circles, fitted to within a fifth of a pixel — so it is the same mark, sharp at
any size, and free to take its colour from the theme.

The original file is kept at
[`public/brand/rentrewards-logo.png`](./public/brand/rentrewards-logo.png).

| Where | What renders |
|---|---|
| Staff sidebar, tenant portal header | `BrandBadge` — the mark in its navy badge |
| Login page, tenant invitation and registration | `BrandLockup` — badge plus wordmark |
| Browser tab, home-screen icon | `src/app/icon.svg`, `src/app/apple-icon.png` |
| Receipts, statements, rental records | `src/lib/brand-mark.ts`, inlined as base64 |

Two deliberate choices. The wordmark is live text rather than an image, so it
stays sharp, recolours in dark mode and is read by screen readers. And the mark
always sits in its navy badge: lime on a white surface is about 1.4:1 contrast,
so the badge is what makes it legible rather than decorative.

The brand colours are `--brand-navy` and `--brand-lime` in
[`globals.css`](./src/app/globals.css), identical in light and dark because a
mark does not change hue with the interface around it. They are reserved for
identity — the interface accent, links, buttons and charts remain blue, which
is what meets contrast for text. The product name comes from `PLATFORM_NAME`.


## Configuration

See [`.env.example`](./.env.example). The variables that matter:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | Session signing key — at least 32 characters, different per environment |
| `DEFAULT_COMMISSION_RATE` | Platform default, percent (1.0) |
| `PAYMENTS_PROVIDER` | `mpesa-mock` or `mpesa` |
| `TAX_PROVIDER` | `erits-mock` or `erits` |
| `MPESA_*` | Daraja credentials and callback URL |
| `ERITS_*` | KRA integration credentials |

Commission is configurable at four levels and the most specific active rule
wins: **property → landlord → organization → platform default**.
