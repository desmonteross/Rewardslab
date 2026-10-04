#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Creates the `pms` role and `pms` database in a PostgreSQL server you already
# run locally, and grants that role rights on the database's public schema
# (PostgreSQL 15+ no longer grants CREATE on `public` to everyone).
#
# It never prompts for a password. It probes the connections that normally work
# without one — the Unix socket as your own account or as `postgres`, then TCP —
# and stops with an explanation if none of them do.
#
#   bash scripts/create-local-db.sh
#   SUPERUSER=postgres bash scripts/create-local-db.sh      # force the account
#   PGPORT=5433 bash scripts/create-local-db.sh             # non-default port
# ---------------------------------------------------------------------------
set -uo pipefail

PORT="${PGPORT:-5432}"
ME="$(id -un)"

# Every psql call is -w: never prompt, fail instead.
try_conn() {          # try_conn <host-or-empty> <user> [<database>]
  local host="$1" user="$2" database="${3:-postgres}"
  if [ -n "$host" ]; then
    PGCONNECT_TIMEOUT=4 psql -w -h "$host" -p "$PORT" -U "$user" -d "$database" \
      -v ON_ERROR_STOP=1 -tAc 'select 1' >/dev/null 2>&1
  else
    PGCONNECT_TIMEOUT=4 psql -w -p "$PORT" -U "$user" -d "$database" \
      -v ON_ERROR_STOP=1 -tAc 'select 1' >/dev/null 2>&1
  fi
}

run_sql() {           # run_sql <database> <args...>
  local database="$1"; shift
  if [ -n "$SU_HOST" ]; then
    PGCONNECT_TIMEOUT=10 psql -w -h "$SU_HOST" -p "$PORT" -U "$SU_USER" -d "$database" \
      -v ON_ERROR_STOP=1 -q "$@"
  else
    PGCONNECT_TIMEOUT=10 psql -w -p "$PORT" -U "$SU_USER" -d "$database" \
      -v ON_ERROR_STOP=1 -q "$@"
  fi
}

command -v psql >/dev/null || {
  echo "psql not found. Install PostgreSQL, e.g.  brew install postgresql@16" >&2
  exit 1
}

# --- Find an account that can create roles, without asking for a password ----
# Sockets first: Homebrew and Postgres.app allow passwordless local connections.
SOCKET_DIRS=("" /tmp /var/run/postgresql /opt/homebrew/var/run /usr/local/var/run)
TCP_HOSTS=(localhost 127.0.0.1)

if [ -n "${SUPERUSER:-}" ]; then
  USERS=("$SUPERUSER")
else
  USERS=("$ME" postgres)
fi

SU_HOST=""
SU_USER=""
found=0
for u in "${USERS[@]}"; do
  for h in "${SOCKET_DIRS[@]}"; do
    if try_conn "$h" "$u"; then SU_HOST="$h"; SU_USER="$u"; found=1; break 2; fi
  done
done
if [ "$found" -eq 0 ]; then
  for u in "${USERS[@]}"; do
    for h in "${TCP_HOSTS[@]}"; do
      if try_conn "$h" "$u"; then SU_HOST="$h"; SU_USER="$u"; found=1; break 2; fi
    done
  done
fi

if [ "$found" -eq 0 ]; then
  cat >&2 <<MSG
Could not reach PostgreSQL on port $PORT with an account that does not need a
password. Tried: ${USERS[*]} over the Unix socket and over TCP.

This usually means one of:
  * PostgreSQL is not running          ->  brew services start postgresql@16
  * the server on port $PORT belongs to something else (another project's
    Docker container, for instance) and its credentials are not yours
  * your server requires a password even locally

If you know a superuser and its password, run this instead — psql will ask you
for the password directly, and it goes only to your own database:

    psql -h localhost -p $PORT -U postgres -d postgres

...then, once connected:

    CREATE ROLE pms LOGIN PASSWORD 'pms' CREATEDB;
    CREATE DATABASE pms OWNER pms;
    \\c pms
    ALTER SCHEMA public OWNER TO pms;

Otherwise run the app's database in Docker instead — start.command will offer
that automatically if Docker Desktop is running.
MSG
  exit 1
fi

WHERE="${SU_HOST:-unix socket}"
echo "Connected as '$SU_USER' via $WHERE on port $PORT."

# --- Role --------------------------------------------------------------------
run_sql postgres -c "DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'pms') THEN
    CREATE ROLE pms LOGIN PASSWORD 'pms' CREATEDB;
  ELSE
    ALTER ROLE pms LOGIN PASSWORD 'pms';
  END IF;
END \$\$;" || { echo "Could not create the 'pms' role — '$SU_USER' may not be allowed to." >&2; exit 1; }
echo "Role 'pms' is ready."

# --- Database ----------------------------------------------------------------
if [ -n "$SU_HOST" ]; then
  EXISTS=$(PGCONNECT_TIMEOUT=10 psql -w -h "$SU_HOST" -p "$PORT" -U "$SU_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='pms'" 2>/dev/null)
else
  EXISTS=$(PGCONNECT_TIMEOUT=10 psql -w -p "$PORT" -U "$SU_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='pms'" 2>/dev/null)
fi

if [ "${EXISTS:-}" != "1" ]; then
  run_sql postgres -c "CREATE DATABASE pms OWNER pms;" || { echo "Could not create database 'pms'." >&2; exit 1; }
  echo "Created database 'pms'."
else
  run_sql postgres -c "ALTER DATABASE pms OWNER TO pms;" >/dev/null 2>&1
  echo "Database 'pms' already existed."
fi

# --- Schema rights -----------------------------------------------------------
run_sql pms -c "ALTER SCHEMA public OWNER TO pms;" >/dev/null 2>&1
run_sql pms -c "GRANT ALL ON SCHEMA public TO pms;" >/dev/null 2>&1
echo "Schema 'public' granted to 'pms'."

echo
echo "Done. DATABASE_URL should be:"
echo "  postgresql://pms:pms@localhost:$PORT/pms"
