// ===========================================================================
//  Unit upload format
//
//  One definition of the spreadsheet a property manager uploads: the guide on
//  the Units tab, the downloadable template and the parser all read the
//  column list below, so they cannot disagree about what a valid file is.
// ===========================================================================

import { unitTypeEnum } from '@/db/schema'
import { cents } from '@/lib/money'
import type { UnitRow } from './services/onboarding'

export const MAX_UPLOAD_ROWS = 500

type UnitType = (typeof unitTypeEnum.enumValues)[number]

export interface UnitColumn {
  key: 'unit_number' | 'type' | 'floor' | 'bedrooms' | 'bathrooms' | 'monthly_rent' | 'deposit' | 'service_charge'
  required: boolean
  description: string
  example: string
  /** Other headings people commonly use for the same thing. */
  aliases: string[]
}

export const UNIT_COLUMNS: UnitColumn[] = [
  {
    key: 'unit_number',
    required: true,
    description: 'The door number tenants will pay against. Must be unique within the property.',
    example: 'A1',
    aliases: ['unit', 'unit no', 'unit number', 'house number', 'house no', 'door'],
  },
  {
    key: 'monthly_rent',
    required: true,
    description: 'Rent in KES, whole shillings. Commas and "KES" are ignored.',
    example: '25000',
    aliases: ['rent', 'monthly rent', 'rent kes', 'monthly rent kes'],
  },
  {
    key: 'type',
    required: false,
    description: 'One of the unit types listed below. Blank means One Bedroom.',
    example: 'ONE_BEDROOM',
    aliases: ['unit type'],
  },
  {
    key: 'floor',
    required: false,
    description: 'Whole number. Ground floor is 0. Blank means 0.',
    example: '0',
    aliases: ['level'],
  },
  {
    key: 'bedrooms',
    required: false,
    description: 'Whole number. Blank means 1.',
    example: '1',
    aliases: ['beds', 'bedroom'],
  },
  {
    key: 'bathrooms',
    required: false,
    description: 'Whole number. Blank means 1.',
    example: '1',
    aliases: ['baths', 'bathroom'],
  },
  {
    key: 'deposit',
    required: false,
    description: 'Deposit in KES. Blank means 0.',
    example: '25000',
    aliases: ['deposit kes'],
  },
  {
    key: 'service_charge',
    required: false,
    description: 'Monthly service charge in KES. Blank means 0.',
    example: '2000',
    aliases: ['service charge', 'service charge kes', 'service', 'charges'],
  },
]

export const UNIT_TYPES = unitTypeEnum.enumValues

/** The CSV a manager downloads, fill in and upload back. */
export function unitTemplateCsv(): string {
  const header = UNIT_COLUMNS.map((column) => column.key).join(',')
  const examples = [
    ['A1', '25000', 'ONE_BEDROOM', '0', '1', '1', '25000', '2000'],
    ['A2', '25000', 'ONE_BEDROOM', '0', '1', '1', '25000', '2000'],
    ['B1', '38000', 'TWO_BEDROOM', '1', '2', '2', '38000', '2500'],
    ['S1', '12000', 'BEDSITTER', '0', '0', '1', '', ''],
  ]
  return [header, ...examples.map((row) => row.join(','))].join('\r\n') + '\r\n'
}

// ---------------------------------------------------------------------------

/**
 * A small CSV reader: quoted fields, doubled quotes, CRLF, a byte-order mark,
 * and comma, semicolon or tab separators (Excel in some locales saves with
 * semicolons).
 */
export function parseCsv(text: string): string[][] {
  const body = text.replace(/^﻿/, '')
  const firstLine = body.split(/\r?\n/, 1)[0] ?? ''
  const separator = [',', ';', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0]

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let index = 0; index < body.length; index++) {
    const char = body[index]
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"'
        index++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === separator) {
      row.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body[index + 1] === '\n') index++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ''))
}

const normalise = (value: string) => value.trim().toLowerCase().replace(/[\s_\-()]+/g, ' ').trim()

function typeFrom(value: string): UnitType | null {
  const wanted = normalise(value).replace(/ /g, '')
  if (!wanted) return 'ONE_BEDROOM'
  return UNIT_TYPES.find((type) => type.toLowerCase().replace(/_/g, '') === wanted) ?? null
}

function wholeNumber(value: string, fallback: number): number | null {
  const trimmed = value.trim()
  if (!trimmed) return fallback
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null
}

function shillings(value: string, fallback: number): number | null {
  const trimmed = value.replace(/kes|ksh|,|\s/gi, '')
  if (!trimmed) return fallback
  return /^\d+(\.\d{1,2})?$/.test(trimmed) ? cents(trimmed) : null
}

export interface UnitSheetResult {
  rows: UnitRow[]
  /** `line` is the spreadsheet row number, counting the header as row 1. */
  errors: { line: number; message: string }[]
}

export function parseUnitSheet(text: string): UnitSheetResult {
  const table = parseCsv(text)
  if (table.length === 0) return { rows: [], errors: [{ line: 1, message: 'The file is empty.' }] }

  const header = table[0].map(normalise)
  const position = new Map<UnitColumn['key'], number>()
  for (const column of UNIT_COLUMNS) {
    const names = [column.key.replace(/_/g, ' '), ...column.aliases]
    const index = header.findIndex((heading) => names.includes(heading))
    if (index >= 0) position.set(column.key, index)
  }

  const missing = UNIT_COLUMNS.filter((column) => column.required && !position.has(column.key))
  if (missing.length > 0) {
    return {
      rows: [],
      errors: [
        {
          line: 1,
          message: `The first row must name the columns. Missing: ${missing.map((column) => column.key).join(', ')}.`,
        },
      ],
    }
  }

  const body = table.slice(1)
  if (body.length === 0) return { rows: [], errors: [{ line: 2, message: 'There are no units below the heading row.' }] }
  if (body.length > MAX_UPLOAD_ROWS) {
    return { rows: [], errors: [{ line: 1, message: `Upload at most ${MAX_UPLOAD_ROWS} units at a time.` }] }
  }

  const rows: UnitRow[] = []
  const errors: UnitSheetResult['errors'] = []
  const seen = new Map<string, number>()

  body.forEach((cells, offset) => {
    const line = offset + 2
    const cell = (key: UnitColumn['key']) => {
      const index = position.get(key)
      return index === undefined ? '' : (cells[index] ?? '').trim()
    }
    const problems: string[] = []

    const unitNumber = cell('unit_number')
    if (!unitNumber) problems.push('unit_number is blank')
    else if (seen.has(unitNumber.toLowerCase())) problems.push(`unit ${unitNumber} is also on row ${seen.get(unitNumber.toLowerCase())}`)
    else seen.set(unitNumber.toLowerCase(), line)

    const rent = shillings(cell('monthly_rent'), 0)
    if (rent === null) problems.push(`monthly_rent "${cell('monthly_rent')}" is not an amount`)
    else if (rent <= 0) problems.push('monthly_rent is blank or zero')

    const type = typeFrom(cell('type'))
    if (!type) problems.push(`type "${cell('type')}" is not one of the listed types`)

    const floor = wholeNumber(cell('floor'), 0)
    const bedrooms = wholeNumber(cell('bedrooms'), 1)
    const bathrooms = wholeNumber(cell('bathrooms'), 1)
    if (floor === null) problems.push(`floor "${cell('floor')}" is not a whole number`)
    if (bedrooms === null) problems.push(`bedrooms "${cell('bedrooms')}" is not a whole number`)
    if (bathrooms === null) problems.push(`bathrooms "${cell('bathrooms')}" is not a whole number`)

    const deposit = shillings(cell('deposit'), 0)
    const serviceCharge = shillings(cell('service_charge'), 0)
    if (deposit === null) problems.push(`deposit "${cell('deposit')}" is not an amount`)
    if (serviceCharge === null) problems.push(`service_charge "${cell('service_charge')}" is not an amount`)

    if (problems.length > 0) {
      errors.push({ line, message: problems.join('; ') })
      return
    }
    rows.push({
      unitNumber,
      type: type!,
      floor: floor!,
      bedrooms: bedrooms!,
      bathrooms: bathrooms!,
      monthlyRentCents: rent!,
      depositCents: deposit!,
      serviceChargeCents: serviceCharge!,
    })
  })

  return { rows, errors }
}
