import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { config as loadEnvFile } from '../lib/env-file'
import * as schema from './schema'

// Next.js loads .env itself; standalone scripts (seed, migrate, tests) do not.
// Import order is hoisted, so the load has to happen here rather than in the
// script that imports this module.
if (!process.env.DATABASE_URL) loadEnvFile()

declare global {
  // eslint-disable-next-line no-var
  var __pmsPool: Pool | undefined
  // eslint-disable-next-line no-var
  var __pmsDb: NodePgDatabase<typeof schema> | undefined
}

/** pg sets this once end() has resolved; such a pool can never serve again. */
function hasEnded(pool: Pool | undefined): boolean {
  return Boolean(pool && (pool as Pool & { ended?: boolean }).ended)
}

function connectionString() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and point it at your PostgreSQL instance.',
    )
  }
  return url
}

export function getPool(): Pool {
  const existing = global.__pmsPool
  if (existing && !hasEnded(existing)) return existing

  const pool = new Pool({
    connectionString: connectionString(),
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  })
  global.__pmsPool = pool
  global.__pmsDb = drizzle(pool, { schema })
  return pool
}

/**
 * Close the pool. Idempotent, and the next `db` use opens a fresh one — which
 * matters when several suites in one process each tear down after themselves.
 */
export async function closePool(): Promise<void> {
  const pool = global.__pmsPool
  global.__pmsPool = undefined
  global.__pmsDb = undefined
  if (pool && !hasEnded(pool)) await pool.end()
}

function instance(): NodePgDatabase<typeof schema> {
  if (!global.__pmsDb || hasEnded(global.__pmsPool)) getPool()
  return global.__pmsDb as NodePgDatabase<typeof schema>
}

/**
 * The database handle. A proxy rather than a bound instance so that it always
 * speaks to the *current* pool: binding it once at import time meant a closed
 * pool could never be replaced.
 */
export const db: NodePgDatabase<typeof schema> = new Proxy(
  {} as NodePgDatabase<typeof schema>,
  {
    get(_target, property, receiver) {
      const current = instance() as unknown as Record<string | symbol, unknown>
      const value = Reflect.get(current, property, receiver)
      return typeof value === 'function' ? value.bind(current) : value
    },
    has(_target, property) {
      return Reflect.has(instance() as unknown as object, property)
    },
  },
)

export type Database = NodePgDatabase<typeof schema>
/** A database handle inside a transaction, or the pool-backed handle. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0] | Database

export { schema }
export * from './schema'
