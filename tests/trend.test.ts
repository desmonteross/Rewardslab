// ===========================================================================
//  Movement badges
//
//  The arrow beside a headline figure is a claim, and the awkward cases are
//  where claims go wrong: growth from zero, a figure that vanished, noise at
//  the cent level, and the fact that "up" is good news for collection and bad
//  news for arrears.
// ===========================================================================

import { describe, expect, it } from 'vitest'
import { formatMovement, movement, movementTone } from '@/lib/trend'

describe('movement', () => {
  it('reports a plain increase', () => {
    const result = movement(12_400, 11_800)
    expect(result.change).toBe(600)
    expect(result.percent).toBeCloseTo(5.1, 1)
    expect(result.direction).toBe('up')
    expect(result.isNew).toBe(false)
  })

  it('reports a decrease as a positive percentage with a down direction', () => {
    const result = movement(900, 1_000)
    expect(result.percent).toBe(-10)
    expect(result.direction).toBe('down')
    expect(formatMovement(result)).toBe('10.0%')
  })

  it('refuses to quote a percentage of nothing', () => {
    const result = movement(500, 0)
    expect(result.percent).toBeNull()
    expect(result.isNew).toBe(true)
    expect(formatMovement(result)).toBe('new')
  })

  it('does not call zero-to-zero new', () => {
    const result = movement(0, 0)
    expect(result.direction).toBe('flat')
    expect(result.isNew).toBe(false)
    expect(formatMovement(result)).toBe('—')
  })

  it('treats a figure falling to zero as a complete loss, not as new', () => {
    const result = movement(0, 400)
    expect(result.percent).toBe(-100)
    expect(result.isNew).toBe(false)
  })

  it('treats a change inside epsilon as flat', () => {
    const result = movement(1_000_050, 1_000_000, { epsilon: 100 })
    expect(result.direction).toBe('flat')
    // The percentage is still reported honestly — only the arrow is muted.
    expect(result.percent).toBeCloseTo(0, 1)
  })

  it('measures against the magnitude of the earlier figure, so a negative base does not flip the sign', () => {
    const result = movement(-50, -100)
    expect(result.change).toBe(50)
    expect(result.direction).toBe('up')
    expect(result.percent).toBe(50)
  })

  it('treats a missing figure as zero rather than throwing', () => {
    expect(movement(null, 100).percent).toBe(-100)
    expect(movement(100, undefined).percent).toBeNull()
  })
})

describe('movementTone', () => {
  it('reads a rise as good where rising is good', () => {
    expect(movementTone('up', 'up')).toBe('positive')
    expect(movementTone('down', 'up')).toBe('negative')
  })

  it('reads a rise as bad where falling is good — arrears, outstanding rent', () => {
    expect(movementTone('up', 'down')).toBe('negative')
    expect(movementTone('down', 'down')).toBe('positive')
  })

  it('never colours a flat movement', () => {
    expect(movementTone('flat', 'up')).toBe('neutral')
    expect(movementTone('flat', 'down')).toBe('neutral')
  })
})

describe('extreme movements', () => {
  it('stops quoting a precise percentage once the base was too small to mean anything', () => {
    // Arrears of KES 30 becoming KES 470,000 is arithmetically +1,566,566%.
    const result = movement(47_000_000, 3_000)
    expect(result.direction).toBe('up')
    expect(formatMovement(result)).toBe('>999%')
  })

  it('still formats a large but readable movement precisely', () => {
    expect(formatMovement(movement(1_990, 1_000))).toBe('99.0%')
    expect(formatMovement(movement(10_990, 1_000))).toBe('999.0%')
    expect(formatMovement(movement(11_000, 1_000))).toBe('>999%')
  })
})
