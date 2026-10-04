#!/bin/sh
# =============================================================================
#  Container start-up.
#
#  Waits for PostgreSQL, applies the schema, and seeds the demo data the first
#  time only. Re-running the container does not rebuild the data, so anything
#  the recipient does while trying the system survives a restart.
#
#    RESEED=1     rebuild the demo data on this start
#    SKIP_SEED=1  start with an empty system
#
#  The database checks run through Node and the `pg` driver the application
#  already depends on, rather than psql — one less package in the image, and
#  it reads DATABASE_URL exactly as the application does.
# =============================================================================
set -e

log() { printf '\033[1m[rentrewards]\033[0m %s\n' "$1"; }

: "${DATABASE_URL:?DATABASE_URL is not set}"
: "${AUTH_SECRET:?AUTH_SECRET is not set}"

# --- Wait for the database ---------------------------------------------------
log "Waiting for PostgreSQL"
node -e "
  const { Pool } = require('pg');
  const deadline = Date.now() + 120000;
  (async () => {
    for (;;) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 3000 });
      try {
        await pool.query('select 1');
        await pool.end();
        process.exit(0);
      } catch (error) {
        await pool.end().catch(() => {});
        if (Date.now() > deadline) {
          console.error('PostgreSQL did not accept a connection within two minutes:', error.message);
          process.exit(1);
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();
"
log "PostgreSQL is ready"

# --- Schema ------------------------------------------------------------------
# Applied on every start. Pushing an up-to-date schema is a no-op, and a
# container one migration behind fails later with an error that points at the
# wrong thing entirely.
log "Applying the database schema"
npx drizzle-kit push --force

# --- Demo data ---------------------------------------------------------------
SEEDED=$(node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('select count(*)::int as n from users')
    .then((r) => console.log(r.rows[0].n))
    .catch(() => console.log(0))
    .finally(() => pool.end());
")

if [ "${SKIP_SEED:-0}" = "1" ]; then
  log "SKIP_SEED=1 — starting with no demo data"
elif [ "${RESEED:-0}" = "1" ] || [ "${SEEDED:-0}" = "0" ]; then
  log "Loading the demo data (about 15 seconds)"
  npx tsx src/db/seed.ts
else
  log "Demo data already present ($SEEDED users) — set RESEED=1 to rebuild it"
fi

log "Starting RentRewards"
exec "$@"
