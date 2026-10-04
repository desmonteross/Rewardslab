import { config } from '../lib/env-file'
config()

import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { db, getPool } from './index'

async function main() {
  console.log('Applying migrations from ./drizzle …')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations applied.')
  await getPool().end()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
