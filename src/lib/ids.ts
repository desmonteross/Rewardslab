import { randomBytes, randomUUID } from 'node:crypto'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * Collision-resistant, sortable-ish identifier: a base-36 timestamp prefix
 * followed by 12 random base-36 characters. Short enough to read in a URL,
 * random enough that ids are never guessable.
 */
export function newId(prefix?: string): string {
  const time = Date.now().toString(36)
  const bytes = randomBytes(12)
  let random = ''
  for (let i = 0; i < bytes.length; i++) random += ALPHABET[bytes[i] % ALPHABET.length]
  const id = `${time}${random}`
  return prefix ? `${prefix}_${id}` : id
}

export function uuid(): string {
  return randomUUID()
}

/**
 * Human-facing document numbers, e.g. INV-2026-001023, PAY-102938, RCP-2026-0042.
 */
export function documentNumber(prefix: string, sequence: number, opts?: { year?: number; width?: number }) {
  const width = opts?.width ?? 6
  const padded = String(sequence).padStart(width, '0')
  return opts?.year ? `${prefix}-${opts.year}-${padded}` : `${prefix}-${padded}`
}
