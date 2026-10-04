# Running RentRewards with Docker

Everything the system needs is in this folder. You do **not** need Node,
PostgreSQL, or any configuration — only Docker Desktop (or Docker Engine with
the Compose plugin).

## One command

```bash
docker compose up
```

Then open <http://localhost:3000>.

The first run takes a few minutes: it builds the image, starts PostgreSQL,
applies the database schema, and generates realistic demo data by running the
system's own billing, payment, settlement and compliance engines. You will see
it print a summary when the data is ready. Later runs start in seconds and keep
the data that is already there.

To stop it, press Control-C. To stop and remove the containers:

```bash
docker compose down
```

## Signing in

Every demo account uses the password `Password123`.

| Email | What it shows |
|---|---|
| `admin@prime.co.ke` | Company admin — the whole portfolio, five properties |
| `manager@prime.co.ke` | Property manager — tenancy and billing, no settlements |
| `accounts@prime.co.ke` | Accountant — reconciliation, settlements, KRA eRITS, audit |
| `landlord@wanjikuholdings.co.ke` | Landlord portal — one landlord's own properties only |
| `tenant@example.co.ke` | Tenant portal — a tenant who is up to date |
| `tenant.arrears@example.co.ke` | Tenant portal — a tenant carrying arrears |
| `auditor@prime.co.ke` | Read-only auditor, plus the audit trail |
| `admin@skyline.co.ke` | A second organization — demonstrates tenant isolation |
| `superadmin@pms.co.ke` | Platform administration |

Signing in as `admin@prime.co.ke` and then `admin@skyline.co.ke` is the quickest
way to see that the two organizations cannot see each other's data.

## Nothing is sent anywhere

M-Pesa and KRA eRITS both run against mock providers. No payment is taken, no
message is sent, and nothing reaches Safaricom or KRA. Every simulated tax
filing is stamped **SIMULATED eRITS SUBMISSION** in the interface and in the
database.

## If something is already using a port

The database publishes 5432 and the app publishes 3000. If either is taken:

```bash
APP_PORT=3001 DB_PORT=5433 docker compose up
```

## Options

| Variable | Effect |
|---|---|
| `RESEED=1` | Rebuild the demo data on the next start |
| `SKIP_SEED=1` | Start with an empty system, no demo data |
| `AUTH_SECRET` | Session signing key. Generate one with `openssl rand -hex 32` |
| `APP_PORT`, `DB_PORT` | Change the published ports |

Set them in the `app` service's `environment:` block in `docker-compose.yml`,
or inline: `RESEED=1 docker compose up`.

## Starting completely fresh

```bash
docker compose down -v    # -v also deletes the database volume
docker compose up --build
```

## Inspecting the database

```bash
docker compose exec db psql -U pms -d pms
```

## A note on what this is

This is a demonstration build. The `AUTH_SECRET` in `docker-compose.yml` is a
published placeholder, the database password is `pms`, and both are fine for
trying the system on a laptop and wrong for anything else. Anything beyond a
demo needs real secrets, a managed database, and the integrations pointed at
real providers.
