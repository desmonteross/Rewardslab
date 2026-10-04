# Running RentRewards

One command, and it handles the rest: dependencies, the database, the schema,
the demo data, the build, and the server.

## The short version

Unzip, open Terminal in the folder, and run:

```bash
bash run.command
```

It opens <http://localhost:3000> when it is ready. Sign in with
`admin@prime.co.ke` and the password `Password123`.

Press Control-C in that Terminal window to stop it.

### If you prefer to double-click

`run.command` is double-clickable in Finder, but macOS will refuse it the
first time with *"Apple could not verify start.command is free of malware"*.
That is Gatekeeper objecting to an unsigned script that arrived inside a
downloaded zip, not a problem with the file. **Click Done, not Move to Trash.**

Clear the download flag once, and it never asks again:

```bash
xattr -d com.apple.quarantine run.command start.command
```

Running it with `bash run.command` avoids the whole thing, which is why that
is the instruction above.

## What it needs

**Node 20 or newer.** Check with `node -v`. If it is missing or older, install
it from <https://nodejs.org>.

**Somewhere to put the data**, and it will find one of these by itself:

- a PostgreSQL already running on this machine that it can use without a
  password — Homebrew's `postgresql@16`, Postgres.app, and similar;
- otherwise Docker, in which case it starts a PostgreSQL container for you.

You do not need both, and you are never asked for a password.

To skip the local server and go straight to Docker:

```bash
FORCE_DOCKER=1 bash run.command
```

## The first run, and the ones after

The first run installs dependencies and builds the app, so give it two or
three minutes. After that it checks what has changed and skips the rest — a
second run starts in a few seconds.

It re-does a step only when the thing that step depends on has moved:
dependencies when `package.json` changes, the schema on every run (applying an
up-to-date schema does nothing), the demo data when the schema or the seed
changes, and the build when anything under `src/` or `public/` changes.

Two switches, when you want to overrule it:

```bash
RESEED=1 bash run.command       # rebuild the demo data from scratch
KEEP_DATA=1 bash run.command    # keep the current data even if it is stale
```

## Signing in

Every demo account uses the password `Password123`.

| Email | What you see |
|---|---|
| `admin@prime.co.ke` | Company admin — the whole portfolio |
| `manager@prime.co.ke` | Property manager — tenancy and billing |
| `accounts@prime.co.ke` | Accountant — money and reconciliation |
| `landlord@wanjikuholdings.co.ke` | Landlord — only their own properties |
| `tenant@example.co.ke` | Tenant portal — up to date |
| `tenant.arrears@example.co.ke` | Tenant portal — in arrears, so the payment flow has something to do |
| `auditor@prime.co.ke` | Read-only auditor |
| `admin@skyline.co.ke` | A second organisation, to check nothing leaks between them |
| `superadmin@pms.co.ke` | Platform administrator |

## Worth trying

Sign in as `tenant.arrears@example.co.ke`, open **Rent & payments**, and pay.
The M-Pesa prompt is simulated — it confirms itself after a few seconds — but
everything behind it is the real path: the payment is matched to the tenancy,
allocated oldest invoice first, a receipt is issued, commission is calculated,
the double-entry ledger is written, and reward points are awarded. Then look
at **Accounting** as `accounts@prime.co.ke` and the same money is there.

Nothing reaches Safaricom or KRA. Both run against mock providers, and every
simulated tax submission is labelled as such on screen.

## Development

`bash start.command` is the same script in dev mode: no build step, and edits
reload as you make them. Slower to open each page, faster to work in.

```bash
npm test              # 249 tests
npx tsc --noEmit      # typecheck
npm run db:reset      # drop the demo data and rebuild it
```

## If it will not start

The script says what went wrong and what to do about it rather than failing
silently. The two that come up most:

**"The schema did not apply"** — the PostgreSQL role `pms` is not allowed to
create tables in that database. It prints the exact `psql` command to fix it.
Or use `FORCE_DOCKER=1`, which sidesteps the question entirely.

**"the 'pms' role can only use N of them"** — the tables are there but belong
to a different PostgreSQL user, usually because the database was created by
hand earlier. Again, it prints the grants to run.

**Port 3000 is busy** — something else is using it. Stop that, or run
`PORT=3001 bash run.command`.
