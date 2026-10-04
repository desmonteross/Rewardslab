// ===========================================================================
//  Movement between two periods
//
//  The small arrow beside a headline figure is a claim about change, and a
//  claim needs a rule for the awkward cases. Growth from nothing is not
//  "infinite percent" and it is not "zero"; it is simply not a percentage, and
//  the tile has to say something else. Keeping that judgement in one pure
//  function means every tile makes the same claim the same way.
// ===========================================================================

export type Direction = 'up' | 'down' | 'flat'

export interface Movement {
  /** Absolute change, in the same unit as the inputs. */
  change: number
  /**
   * Percentage change against the earlier figure, or null when there is no
   * honest percentage to quote — the earlier figure was zero, or either
   * figure is missing.
   */
  percent: number | null
  direction: Direction
  /** True when the earlier period had no figure to compare against. */
  isNew: boolean
}

/**
 * Compare a current figure with the one before it.
 *
 * `epsilon` is the band inside which a change is reported as flat, expressed
 * in the unit of the inputs. Cent-level noise on a multi-million portfolio is
 * not a movement anyone should be shown an arrow about.
 */
export function movement(
  current: number | null | undefined,
  previous: number | null | undefined,
  { epsilon = 0, decimals = 1 }: { epsilon?: number; decimals?: number } = {},
): Movement {
  const now = Number.isFinite(current) ? Number(current) : 0
  const before = Number.isFinite(previous) ? Number(previous) : 0
  const change = now - before

  const direction: Direction =
    Math.abs(change) <= epsilon ? 'flat' : change > 0 ? 'up' : 'down'

  if (before === 0) {
    return { change, percent: null, direction, isNew: now !== 0 }
  }

  const factor = 10 ** decimals
  const percent = Math.round((change / Math.abs(before)) * 100 * factor) / factor
  return { change, percent, direction, isNew: false }
}

/**
 * How a movement should read to someone glancing at it.
 *
 * Direction is not the same as goodness: outstanding rent going up is bad,
 * collection going up is good. The caller says which way is favourable and
 * this returns the tone, so no screen has to remember the rule twice.
 */
export function movementTone(
  direction: Direction,
  favourable: 'up' | 'down' = 'up',
): 'positive' | 'negative' | 'neutral' {
  if (direction === 'flat') return 'neutral'
  return direction === favourable ? 'positive' : 'negative'
}

/**
 * "8.2%" · "—" when there is no honest percentage · ">999%" past the point
 * where a percentage stops being informative.
 *
 * Arrears going from almost nothing to something real produces figures like
 * 1462%, which is arithmetically true and tells the reader nothing except that
 * the base was tiny. Past a thousand percent the magnitude is the message.
 */
export function formatMovement(value: Movement, decimals = 1): string {
  if (value.percent === null) return value.isNew ? 'new' : '—'
  const size = Math.abs(value.percent)
  if (size >= 1000) return '>999%'
  return `${size.toFixed(decimals)}%`
}
