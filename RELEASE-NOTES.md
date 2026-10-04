# RentRewards — Version 3.1

Multi-tenant property management for the Kenyan market, with a reward engine
that pays tenants for paying rent on time.

**249 tests pass across 17 files.** Clean `tsc --noEmit`, clean `next build`.

---

## Theme — green

The brand colour is green, in both themes, everywhere: buttons, links, active
navigation, focus rings and the first chart series. Status colours are
deliberately untouched, so "paid", "overdue" and "pending" still read as
themselves rather than as shades of the brand.

The categorical chart order is green → purple → orange → blue, and it was run
through the palette validator rather than chosen by eye. Green and orange are
never adjacent, because that is the pair protanopia collapses — at the obvious
order (green, orange, …) the two differ by ΔE 5 under protanopia, well under
the ΔE 8 floor. The order above clears every check in light and dark: lightness
band, chroma floor, CVD separation, normal-vision separation and contrast
against both surfaces. The brand green itself is #0f7a53 on light (5.2:1, so it
is safe as link text and not only as a fill) and #4cc38a on dark (7.9:1).

The navigation rail and the two dark panels are now a fixed dark surface in
both themes, with their own ink and line tokens. They are not the logo colours:
a mark does not change hue with the interface around it.

### The header photograph

The dashboard band paints `/brand/hero.jpg` behind the greeting, with a scrim
that is darkest under the text and clears to the right. The file is optional —
without it the band falls back to the panel colour and its gradient, which is
what ships. `public/brand/README.md` says what to put there.

---

## What is new in 3.1 — the dashboard

The dashboard was rebuilt around the order of the questions a manager arrives
with: who am I and what day is it, what can I do right now, what is the money
position, how is it moving, which properties are the problem, and what needs
attention today.

- **A greeting band** naming the organization and the date the figures are for.
- **Quick actions** — collect rent, add a property, add a tenant, report an
  issue — each shown only to a role that can complete it.
- **Five headline tiles** with month-on-month movement badges. Direction and
  goodness are kept separate: rising arrears is an increase and bad news, so
  the colour follows whether the change is favourable, not its sign.
- **Portfolio value**, backed by a new `property_valuations` table. A valuation
  is dated and append-only rather than a column that gets overwritten, so the
  figure for last month is what was known last month — otherwise every
  dashboard would report growth that was really just newer paperwork.
- **A rent collection trend** over three, six or twelve months. The range lives
  in the URL, so the view is shareable and survives a refresh.
- **Portfolio performance** through three lenses — top performing, needs
  attention, vacancy — computed once on the server and switched in the browser.
  A property with nothing billed is left out of the collection lenses, because
  its 0% is arithmetic rather than a performance.
- **A landlord payable panel** carrying payable, commission and pending
  settlements.

### Fixed along the way

- **Upcoming lease expiries listed leases that had already ended**, which the
  screen rendered as "0 days" beside a date months in the past. The query was
  bounded at one end only.
- **The reward idempotency index could be bypassed.** SQL treats two NULLs as
  distinct, so two awards made under no recorded rule version would not
  collide, and the same allocation could be paid twice. The index now coalesces
  the rule version. (The same flaw was found and fixed in RentRewards Lite.)
- **A correlated subquery silently matched the wrong rows.** Drizzle renders an
  interpolated column as a bare `"id"`, which binds inside the subquery's own
  scope. Caught by a test that expected a figure and got zero.
- Headline figures no longer truncate — a tile reading "KES 2…" has lost the
  only thing it was there to say.
- Movements past a thousand percent read as ">999%", because at that point the
  base was too small for the precision to mean anything.

---

## Running it

**With Docker** — nothing else to install:

```bash
docker compose up
```

Then open <http://localhost:3000>. See `DOCKER.md` for options, ports and
demo accounts.

**On a Mac, natively** — double-click `start.command`. It checks dependencies,
creates the database if needed, applies the schema, seeds demo data on first
run, and opens the app.

Every demo account uses the password `Password123`:

| Email | Role |
|---|---|
| `admin@prime.co.ke` | Company admin — the whole portfolio |
| `manager@prime.co.ke` | Property manager — tenancy and billing |
| `accounts@prime.co.ke` | Accountant — reconciliation, settlements, eRITS |
| `landlord@wanjikuholdings.co.ke` | Landlord — own properties only |
| `tenant@example.co.ke` | Tenant portal — up to date |
| `tenant.arrears@example.co.ke` | Tenant portal — carrying arrears |
| `auditor@prime.co.ke` | Read-only auditor |
| `admin@skyline.co.ke` | A second organization — proves isolation |
| `superadmin@pms.co.ke` | Platform administration |

---

## What is in this version

### The core system

Nine roles and roughly 75 permissions, with per-organization overrides.
Properties, units, landlords, tenants, leases, move-ins and move-outs.
Billing, invoices, M-Pesa collection, automatic tenant matching, allocation,
receipts and a double-entry ledger. Commission and landlord settlements.
Maintenance tickets. KRA eRITS filing, simulated and clearly stamped.
Reports, exports and an audit trail.

### The tenant portal

A tenant signs in and sees their own tenancy: what is due, their payment
history, their rental record, and a way to report repairs. Receipts and
statements download as PDFs. Accounts are created by invitation (one-time
hashed tokens) or by self-registration where the organization allows it.

### The rental record

A five-factor score over a tenant's real payment history — punctuality,
how late when late, arrears, longest unbroken run, and tenure — with the
reasons shown rather than just a number. This is the asset a tenant carries
between landlords.

### Reward points

Points are a currency, so they live in an append-only, balanced ledger, not
a counter on a row.

- **Earning:** 1 point per KES 100 of rent, at full rate only when paid on
  time. Lateness reduces it; more than fifteen days late earns nothing. A
  streak of consecutive on-time months adds up to 30%.
- **Maturation:** points are pending for 30 days before they can be spent,
  which is what makes a reversal survivable.
- **Reversal:** a reversed payment posts a compensating group. Nothing is
  ever deleted.
- **Redemption:** deposit fund is wired; airtime, vouchers and rent credit
  are designed but not built.
- **Idempotency:** enforced by a database constraint, so a retried M-Pesa
  callback cannot double-credit.

### Tenant-initiated payment

A manager raises rent plus shared charges across a property or a single unit,
with each charge total divided exactly between the tenants billed. The tenant
sees what is owed, taps Pay, and gets an M-Pesa prompt. On confirmation the
invoice settles, a receipt is written, the ledger posts, and the points appear
on screen with the reason spelled out.

---

## What is simulated

M-Pesa and KRA eRITS both run against mock providers. **No request reaches
Safaricom and no filing reaches KRA.** Every simulated payment is flagged in
the database and labelled on screen; every simulated filing is stamped
`SIMULATED eRITS SUBMISSION`.

The mock is not a shortcut around the real path. A simulated payment is built
as the payload Safaricom would post, parsed by the same parser the live
webhook uses, and handed to the same ingest function — so matching,
allocation, receipting, the ledger and the reward award all run production
code. Going live is a credentials-and-approval exercise, not a rebuild.

---

## Not built yet

Live Safaricom Daraja and KRA credentials. Airtime, voucher and rent-credit
redemption. Scheduling for the points maturation job — the function exists,
nothing calls it. The tenant mobile application (Phase 2 by design). Linking
one person's tenancies across organizations, which is an identity and
data-protection decision before it is a feature.

## Needs a decision before production

The peg of KES 1 per point. The tax treatment of a points-funded rent credit,
which needs a Kenyan tax accountant. The 24-month expiry policy, which needs
consumer-protection review. The JWT issuer still reads `kenya-pms` and should
be corrected. And the rental record has had no external review — the reward
engine now shares its definition of on-time payment, so a flaw in one is a
flaw in both.

---

## A note on what this is

A demonstration build. The `AUTH_SECRET` in `docker-compose.yml` is a
published placeholder and the database password is `pms`; both are fine for
trying the system on a laptop and wrong for anything else. Anything beyond a
demo needs real secrets, a managed database, and the integrations pointed at
authorised providers.
