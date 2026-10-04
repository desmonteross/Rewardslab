import { describe, expect, it } from 'vitest'
import { normalisePhone, normaliseReference, parseReference } from '@/server/services/matching'

describe('account reference normalisation', () => {
  it('strips punctuation and case', () => {
    expect(normaliseReference('gv-a12')).toBe('GV A12')
    expect(normaliseReference('  GV / A12  ')).toBe('GV A12')
    expect(normaliseReference('GV_A12')).toBe('GV A12')
  })

  it('survives an empty or missing reference', () => {
    expect(normaliseReference('')).toBe('')
    expect(normaliseReference(null)).toBe('')
    expect(normaliseReference(undefined)).toBe('')
  })

  it('splits a property code from a unit number', () => {
    expect(parseReference('GV-A12')).toMatchObject({ propertyToken: 'GV', unitToken: 'A12' })
    expect(parseReference('GV A 12')).toMatchObject({ propertyToken: 'GV', unitToken: 'A12' })
  })

  it('treats a lone token as a unit number', () => {
    expect(parseReference('A12')).toMatchObject({ propertyToken: null, unitToken: 'A12' })
  })

  it('handles a reference with no usable content', () => {
    expect(parseReference('  ')).toMatchObject({ propertyToken: null, unitToken: null, tokens: [] })
  })
})

describe('phone normalisation', () => {
  it('reduces every Kenyan format to the same nine digits', () => {
    const expected = '722123456'
    expect(normalisePhone('0722123456')).toBe(expected)
    expect(normalisePhone('254722123456')).toBe(expected)
    expect(normalisePhone('+254 722 123 456')).toBe(expected)
    expect(normalisePhone('722123456')).toBe(expected)
  })

  it('returns a short string rather than a wrong match for junk input', () => {
    expect(normalisePhone('12345')).toBe('12345')
    expect(normalisePhone('')).toBe('')
    expect(normalisePhone(null)).toBe('')
  })
})
