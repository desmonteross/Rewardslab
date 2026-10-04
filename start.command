#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# RentRewards — one-step start.
#
# Double-click this file in Finder, or run:   bash start.command
#
# Nothing here ever asks you for a password. It uses the connections that work
# without one, and falls back to running the database in Docker if it cannot
# get into the PostgreSQL already on this machine.
#
# Re-running it is safe: it re-seeds only if the database is empty.
# It also notices when the project itself has changed: new dependencies are
# installed, and the demo data is rebuilt when the schema or the seed moves on.
#
#   RESEED=1 bash start.command         rebuild the demo data from scratch
#   KEEP_DATA=1 bash start.command      never rebuild it, even when out of date
#   FORCE_DOCKER=1 bash start.command   skip the local server entirely
#   PROD=1 bash start.command           production build instead of dev mode
#
# `run.command` is this same script with PROD=1 — the one to use if you just
# want to look at the app rather than change it.
# ---------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
info() { printf '    %s\n' "$1"; }
die()  { printf '\n  \033[31m✗ %s\033[0m\n\n' "$1"; printf 'Press Return to close this window.\n'; read -r _; exit 1; }

echo
bold "RentRewards"
echo  "$(pwd)"
echo

# --- Node ------------------------------------------------------------------
command -v node >/dev/null || die "Node.js is not installed. Install Node 20 or newer from https://nodejs.org and run this again."
NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
[ "$NODE_MAJOR" -ge 20 ] || die "Node $(node -v) is too old. This project needs Node 20 or newer."
ok "Node $(node -v)"

# --- psql, wherever Homebrew or Postgres.app hid it -------------------------
for dir in \
  /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin \
  /opt/homebrew/opt/postgresql@15/bin /opt/homebrew/opt/postgresql@14/bin \
  /usr/local/opt/postgresql@17/bin /usr/local/opt/postgresql@16/bin \
  /usr/local/opt/postgresql@15/bin /usr/local/opt/postgresql@14/bin \
  /opt/homebrew/bin /usr/local/bin \
  /Applications/Postgres.app/Contents/Versions/latest/bin
do
  [ -x "$dir/psql" ] && case ":$PATH:" in *":$dir:"*) ;; *) PATH="$dir:$PATH";; esac
done
export PATH

port_busy() { nc -z localhost "$1" >/dev/null 2>&1; }
pms_ok()    { PGPASSWORD=pms PGCONNECT_TIMEOUT=4 psql -w -h localhost -p "$1" -U pms -d pms -tAc 'select 1' >/dev/null 2>&1; }
docker_ok() { command -v docker >/dev/null && docker info >/dev/null 2>&1; }

DB_PORT=5432
DB_SOURCE=""

# --- 1. A local PostgreSQL we can already use -------------------------------
if [ "${FORCE_DOCKER:-0}" != "1" ] && command -v psql >/dev/null; then
  if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1 && command -v brew >/dev/null; then
    SERVICE=$(brew services list 2>/dev/null | awk '/^postgresql/ {print $1; exit}')
    if [ -n "${SERVICE:-}" ]; then
      warn "PostgreSQL is not running — starting $SERVICE"
      brew services start "$SERVICE" >/dev/null 2>&1 && sleep 4
    fi
  fi

  if pms_ok 5432; then
    DB_SOURCE="local"; ok "Using the PostgreSQL on localhost:5432 (role 'pms')"
  elif pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
    bold "Creating the 'pms' role and database"
    if bash scripts/create-local-db.sh 2>&1 | sed 's/^/    /'; then :; fi
    if pms_ok 5432; then
      DB_SOURCE="local"; ok "Database 'pms' is ready on localhost:5432"
    else
      warn "Could not set up a database in the PostgreSQL on port 5432."
    fi
  fi
fi

# --- 2. Otherwise, Docker ----------------------------------------------------
if [ -z "$DB_SOURCE" ]; then
  if ! docker_ok; then
    die "No usable database.

   Either give this project a PostgreSQL it can reach:
       brew install postgresql@16 && brew services start postgresql@16
       bash scripts/create-local-db.sh

   ...or start Docker Desktop and run this again — the database will run in a
   container and nothing on your machine is touched."
  fi

  DB_PORT=5432
  if port_busy 5432; then
    for p in 5433 5434 5435 5436; do
      if ! port_busy "$p"; then DB_PORT="$p"; break; fi
    done
    [ "$DB_PORT" = "5432" ] && die "Port 5432 is in use and no nearby port is free."
    warn "Port 5432 is taken by something else — running the database on $DB_PORT instead."
  fi

  bold "Starting PostgreSQL in Docker on port $DB_PORT"
  DB_PORT="$DB_PORT" docker compose up -d db || die "Could not start the database container."
  for _ in $(seq 1 45); do
    docker compose exec -T db pg_isready -U pms -d pms >/dev/null 2>&1 && break
    sleep 1
  done
  docker compose exec -T db pg_isready -U pms -d pms >/dev/null 2>&1 \
    || die "The database container did not become ready. Check:  docker compose logs db"
  DB_SOURCE="docker"
  ok "Database container ready on localhost:$DB_PORT"
fi

# --- .env --------------------------------------------------------------------
[ -f .env ] || cp .env.example .env
node -e "
  const fs=require('fs'), crypto=require('crypto');
  let s=fs.readFileSync('.env','utf8');
  s=s.replace(/^DATABASE_URL=.*\$/m, 'DATABASE_URL=\"postgresql://pms:pms@localhost:${DB_PORT}/pms\"');
  if (/AUTH_SECRET=\"(|change-me[^\"]*)\"/.test(s))
    s=s.replace(/^AUTH_SECRET=.*\$/m, 'AUTH_SECRET=\"'+crypto.randomBytes(32).toString('hex')+'\"');
  fs.writeFileSync('.env', s);
"
ok ".env points at localhost:$DB_PORT"

# --- Change detection --------------------------------------------------------
# Fingerprints of the files that decide whether dependencies and demo data are
# still valid. Kept next to the project and compared on every start, so pulling
# new code and re-running this script is all it takes — no remembering which
# step a given change needs.
STATE_DIR=".rentrewards-state"
mkdir -p "$STATE_DIR"

if command -v sha256sum >/dev/null; then
  SHA() { sha256sum "$@" 2>/dev/null | awk '{print $1}' | sha256sum | awk '{print $1}'; }
elif command -v shasum >/dev/null; then
  SHA() { shasum -a 256 "$@" 2>/dev/null | awk '{print $1}' | shasum -a 256 | awk '{print $1}'; }
else
  # No hashing available: fall back to always doing the work rather than
  # silently skipping it.
  SHA() { date +%s%N; }
fi

changed() {                      # changed <name> <files...>
  local name="$1"; shift
  local now stamp="$STATE_DIR/$name"
  now=$(SHA "$@")
  [ -f "$stamp" ] && [ "$(cat "$stamp")" = "$now" ] && return 1
  return 0
}
remember() {                     # remember <name> <files...>
  local name="$1"; shift
  SHA "$@" > "$STATE_DIR/$name"
}

DEPS_FILES="package.json package-lock.json"
SEED_FILES="src/db/schema.ts src/db/seed.ts"

# Next.js writes absolute paths into its build cache, so a cache built at the
# project's previous location misreports which file an error came from. Moving
# or renaming the folder therefore invalidates it.
HERE="$(pwd -P)"
if [ -d .next ] && [ -f "$STATE_DIR/path" ] && [ "$(cat "$STATE_DIR/path")" != "$HERE" ]; then
  warn "The project has moved since the last run — clearing the build cache."
  rm -rf .next
fi
printf '%s' "$HERE" > "$STATE_DIR/path"

# --- Dependencies ------------------------------------------------------------
if [ ! -d node_modules ]; then
  bold "Installing dependencies (a minute or two the first time)"
  npm install || die "npm install failed."
  remember deps $DEPS_FILES
elif changed deps $DEPS_FILES; then
  warn "Dependencies have changed since the last run."
  bold "Installing dependencies"
  npm install || die "npm install failed."
  # A build cache from before a dependency change is a well-known source of
  # errors that point at the wrong file entirely.
  rm -rf .next
  remember deps $DEPS_FILES
fi
ok "Dependencies up to date"

# --- Schema ------------------------------------------------------------------
# Always pushed, never skipped. The schema moves whenever the code does, and a
# database one migration behind fails at runtime with an error that points at
# the wrong thing entirely. Pushing an up-to-date schema is a no-op.
bold "Checking the database schema"

# pg_tables, not information_schema. The information_schema views only list
# objects the current role has some privilege on, so a database full of tables
# owned by somebody else reports zero — which would send this script's
# diagnosis in exactly the wrong direction.
table_count() {
  PGPASSWORD=pms PGCONNECT_TIMEOUT=5 psql -w -h localhost -p "$DB_PORT" -U pms -d pms -tAc \
    "select count(*) from pg_catalog.pg_tables where schemaname='public'" \
    2>/dev/null | tr -d '[:space:]'
}

# How many of those this role could actually read. A gap between the two is
# the signature of a database whose tables belong to another role.
readable_count() {
  PGPASSWORD=pms PGCONNECT_TIMEOUT=5 psql -w -h localhost -p "$DB_PORT" -U pms -d pms -tAc \
    "select count(*) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'" \
    2>/dev/null | tr -d '[:space:]'
}

# drizzle-kit exits 0 even when the push fails — a permissions error on the
# public schema, for instance, is printed and then reported as success. So the
# result is checked against the database rather than the exit code: if the
# tables are not there afterwards, the push did not work, whatever it claimed.
PUSH_LOG=$(mktemp)
npx drizzle-kit push --force >"$PUSH_LOG" 2>&1
TABLES_AFTER=$(table_count); [ -n "${TABLES_AFTER:-}" ] || TABLES_AFTER=0

READABLE=$(readable_count); [ -n "${READABLE:-}" ] || READABLE=0

if [ "$TABLES_AFTER" -lt 10 ] || [ "$READABLE" -lt "$TABLES_AFTER" ]; then
  echo
  sed 's/^/    /' "$PUSH_LOG" | grep -iE 'error|denied|permission|does not exist' | head -6
  rm -f "$PUSH_LOG"
  echo
  if [ "$TABLES_AFTER" -gt 0 ] && [ "$READABLE" -lt "$TABLES_AFTER" ]; then
    warn "This database has $TABLES_AFTER tables, but the 'pms' role can only use $READABLE of them."
    info "They were created by a different PostgreSQL user. Grant access to them —"
    info "as a superuser, in a terminal:"
    info ""
    info "    psql -d pms -c 'grant all on schema public to pms'"
    info "    psql -d pms -c 'grant all on all tables in schema public to pms'"
    info "    psql -d pms -c 'grant all on all sequences in schema public to pms'"
  else
    warn "The schema did not apply — this database has $TABLES_AFTER tables."
    info "The usual cause is that the 'pms' role may not create tables here. As a"
    info "superuser, in a terminal:"
    info ""
    info "    psql -d pms -c 'grant all on schema public to pms; alter schema public owner to pms'"
  fi
  info ""
  info "Then run this again. Or skip the local server entirely and use the"
  info "bundled database, which needs no setup at all:"
  info ""
  info "    FORCE_DOCKER=1 bash run.command"
  die "Cannot continue without a usable schema."
fi
rm -f "$PUSH_LOG"
ok "Schema up to date ($TABLES_AFTER tables)"

# --- Demo data ---------------------------------------------------------------
SEEDED=$(PGPASSWORD=pms PGCONNECT_TIMEOUT=5 psql -w -h localhost -p "$DB_PORT" -U pms -d pms \
  -tAc 'select count(*) from users' 2>/dev/null | tr -d '[:space:]')
[ -n "${SEEDED:-}" ] || SEEDED=0

# The demo data is generated by running the real engines over the current
# schema, so it is only meaningful for the code that produced it. When either
# the schema or the seed changes, the rows in the database describe an older
# version of the system and are rebuilt.
REASON=""
if [ "${RESEED:-0}" = "1" ]; then
  REASON="RESEED=1"
elif [ "$SEEDED" = "0" ]; then
  REASON="the database is empty"
elif changed seed $SEED_FILES; then
  REASON="the schema or seed has changed since this data was built"
fi

if [ -n "$REASON" ] && [ "${KEEP_DATA:-0}" = "1" ]; then
  # The fingerprint is deliberately not updated: the data really is stale, so
  # the next run without KEEP_DATA will still offer to rebuild it.
  warn "Demo data is out of date ($REASON) — kept because KEEP_DATA=1."
elif [ -n "$REASON" ]; then
  [ "$SEEDED" != "0" ] && warn "Rebuilding the demo data: $REASON."
  bold "Loading the demo data"
  npm run db:seed || die "The seed failed — the output above says why."
  remember seed $SEED_FILES
else
  ok "Demo data is current ($SEEDED users) — RESEED=1 rebuilds it"
fi

# --- Build, when running for real --------------------------------------------
# Dev mode compiles each page the first time it is opened, which is right while
# you are editing and needlessly slow when you are not. The production build is
# compiled once, up front, and then serves instantly — so that is what this
# does unless you ask for dev mode.
#
# The build is skipped when nothing that goes into it has changed, which makes
# a second run start in seconds rather than a minute.
BUILD_FILES="package.json package-lock.json next.config.mjs tailwind.config.ts tsconfig.json"
if [ "${PROD:-0}" = "1" ]; then
  SRC_STAMP=$(find src public -type f 2>/dev/null | sort | while read -r f; do
    printf '%s %s\n' "$f" "$(date -r "$f" +%s 2>/dev/null || echo 0)"
  done | SHA /dev/stdin 2>/dev/null || date +%s)

  NEEDS_BUILD=0
  [ -d .next ] || NEEDS_BUILD=1
  [ -f .next/BUILD_ID ] || NEEDS_BUILD=1
  changed build $BUILD_FILES && NEEDS_BUILD=1
  [ -f "$STATE_DIR/src" ] && [ "$(cat "$STATE_DIR/src")" = "$SRC_STAMP" ] || NEEDS_BUILD=1

  if [ "$NEEDS_BUILD" = "1" ]; then
    bold "Building (about a minute, and only when something has changed)"
    npm run build || die "The build failed — the output above says why."
    remember build $BUILD_FILES
    printf '%s' "$SRC_STAMP" > "$STATE_DIR/src"
  else
    ok "Build is current — delete the .next folder to force a rebuild"
  fi
fi

# --- Go ----------------------------------------------------------------------
APP_PORT="${PORT:-3000}"
export PORT="$APP_PORT"

echo
bold "Starting the app on http://localhost:$APP_PORT"
info "Staff:  admin@prime.co.ke  /  Password123"
info "Tenant: tenant@example.co.ke  /  Password123"
[ "$DB_SOURCE" = "docker" ] && info "Database: Docker container 'pms-db' on port $DB_PORT (stop it with: docker compose down)"
info "Press Control-C to stop the app."
echo
( sleep 5; command -v open >/dev/null && open "http://localhost:$APP_PORT" >/dev/null 2>&1 ) &
if [ "${PROD:-0}" = "1" ]; then
  npm run start
else
  npm run dev
fi
