import fs from 'node:fs'
import path from 'node:path'

/**
 * Minimal .env loader for scripts run outside the Next.js runtime
 * (drizzle-kit, seed, migrate, vitest). Next.js loads .env itself.
 */
export function config(file = '.env') {
  const target = path.resolve(process.cwd(), file)
  if (!fs.existsSync(target)) return
  const content = fs.readFileSync(target, 'utf8')
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    const hash = value.indexOf(' #')
    if (hash !== -1) value = value.slice(0, hash).trim()
    if (process.env[key] === undefined) process.env[key] = value
  }
}
