import { config } from '../lib/env-file'
config()

import { sql } from 'drizzle-orm'
import { db, getPool } from './index'

/**
 * Drops and recreates the public schema. Destructive — development only.
 */
async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DB_RESET !== 'true') {
    throw new Error('Refusing to reset the database in production. Set ALLOW_DB_RESET=true to override.')
  }
  console.log('Dropping schema "public" …')
  await db.execute(sql`DROP SCHEMA public CASCADE`)
  await db.execute(sql`CREATE SCHEMA public`)
  console.log('Schema reset. Run `npm run db:push` to recreate the tables.')
  await getPool().end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
