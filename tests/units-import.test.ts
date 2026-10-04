import { describe, expect, it } from 'vitest'
import { parseCsv, parseUnitSheet, unitTemplateCsv, UNIT_COLUMNS } from '@/server/units-import'

describe('the unit upload template', () => {
  it('parses cleanly, so the file we hand out is a valid upload', () => {
    const { rows, errors } = parseUnitSheet(unitTemplateCsv())
    expect(errors).toEqual([])
    expect(rows.map((row) => row.unitNumber)).toEqual(['A1', 'A2', 'B1', 'S1'])
    expect(rows[3]).toMatchObject({ type: 'BEDSITTER', bedrooms: 0, depositCents: 0, serviceChargeCents: 0 })
  })

  it('names every column the guide documents', () => {
    const header = unitTemplateCsv().split('\r\n')[0].split(',')
    expect(header).toEqual(UNIT_COLUMNS.map((column) => column.key))
  })
})

describe('reading a CSV', () => {
  it('handles quotes, a BOM, CRLF and semicolon separators', () => {
    expect(parseCsv('﻿a,"b, c","d ""e"""\r\n1,2,3\r\n')).toEqual([
      ['a', 'b, c', 'd "e"'],
      ['1', '2', '3'],
    ])
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })
})

describe('checking an uploaded sheet', () => {
  it('accepts friendly headings, names, any column order and formatted amounts', () => {
    const csv = 'Rent,Unit No,Type,Deposit\n"25,000",A1,One Bedroom,KES 25000\n18000,A2,bedsitter,\n'
    const { rows, errors } = parseUnitSheet(csv)
    expect(errors).toEqual([])
    expect(rows[0]).toMatchObject({ unitNumber: 'A1', type: 'ONE_BEDROOM', monthlyRentCents: 2_500_000, depositCents: 2_500_000 })
    expect(rows[1]).toMatchObject({ unitNumber: 'A2', type: 'BEDSITTER', floor: 0, bedrooms: 1 })
  })

  it('reports every bad row by its spreadsheet row number', () => {
    const csv = [
      'unit_number,monthly_rent,type,floor',
      'A1,25000,ONE_BEDROOM,0',
      ',25000,,',
      'A3,abc,PALACE,first',
      'A1,25000,,',
    ].join('\n')
    const { errors } = parseUnitSheet(csv)
    expect(errors.map((error) => error.line)).toEqual([3, 4, 5])
    expect(errors[0].message).toMatch(/unit_number is blank/)
    expect(errors[1].message).toMatch(/monthly_rent "abc".*type "PALACE".*floor "first"/)
    expect(errors[2].message).toMatch(/also on row 2/)
  })

  it('refuses a file without the required headings', () => {
    const { errors } = parseUnitSheet('name,price\nA1,100\n')
    expect(errors[0]).toMatchObject({ line: 1 })
    expect(errors[0].message).toMatch(/unit_number, monthly_rent/)
  })
})
