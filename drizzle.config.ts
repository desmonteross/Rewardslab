import type { Config } from 'drizzle-kit'
import { config as loadEnv } from './src/lib/env-file'

loadEnv()

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://pms:pms@localhost:5432/pms',
  },
  verbose: true,
  strict: false,
} satisfies Config
