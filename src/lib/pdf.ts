// ===========================================================================
//  PDF documents
//
//  A thin layout layer over pdf-lib: enough to lay out a receipt, a statement
//  and a rental record without pulling in a headless browser. pdf-lib embeds
//  the standard PostScript fonts, so there are no font files to ship and no
//  filesystem access at request time.
//
//  Everything here is measurement-first: text is measured before it is drawn,
//  so columns line up and long values wrap instead of running off the page.
// ===========================================================================

import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb, type RGB } from 'pdf-lib'
import { brandMarkBytes } from './brand-mark'

const A4: [number, number] = [595.28, 841.89]
const MARGIN = 48
const LINE = 14

/** Print-appropriate greys: the screen tokens are for the screen. */
const INK = rgb(0.07, 0.07, 0.07)
const MUTED = rgb(0.36, 0.36, 0.35)
const FAINT = rgb(0.55, 0.55, 0.53)
const RULE = rgb(0.85, 0.85, 0.82)
const BRAND = rgb(0.16, 0.47, 0.84)

export interface DocMeta {
  title: string
  subtitle?: string
  organizationName: string
  /** Printed small at the foot of every page. */
  footNote?: string
}

export interface Cell {
  text: string
  align?: 'left' | 'right'
  bold?: boolean
  tone?: 'ink' | 'muted' | 'positive' | 'negative'
}

export interface TableColumn {
  header: string
  width: number
  align?: 'left' | 'right'
}

export class PdfBuilder {
  private doc!: PDFDocument
  private page!: PDFPage
  private regular!: PDFFont
  private bold!: PDFFont
  private y = 0
  private pageNumber = 0
  private mark: PDFImage | null = null

  private constructor(private meta: DocMeta) {}

  static async create(meta: DocMeta): Promise<PdfBuilder> {
    const builder = new PdfBuilder(meta)
    builder.doc = await PDFDocument.create()
    builder.doc.setTitle(meta.title)
    builder.doc.setProducer('RentRewards')
    builder.regular = await builder.doc.embedFont(StandardFonts.Helvetica)
    builder.bold = await builder.doc.embedFont(StandardFonts.HelveticaBold)
    // Embedded before the first page is drawn, because the header uses it.
    // A logo that fails to load must never fail a receipt, so this is
    // best-effort: the document renders without it.
    try {
      builder.mark = await builder.doc.embedPng(brandMarkBytes())
    } catch {
      builder.mark = null
    }
    builder.newPage()
    return builder
  }

  private get width() {
    return A4[0] - MARGIN * 2
  }

  private newPage() {
    this.page = this.doc.addPage(A4)
    this.pageNumber += 1
    this.y = A4[1] - MARGIN

    if (this.pageNumber === 1) {
      // The RentRewards mark sits opposite the title: the document is issued
      // by the managing agent, on the platform, so the agent's name leads and
      // the platform mark is the quieter of the two.
      if (this.mark) {
        const size = 26
        this.page.drawImage(this.mark, {
          x: A4[0] - MARGIN - size,
          y: this.y - size + 10,
          width: size,
          height: size,
        })
        const label = 'RentRewards'
        const labelWidth = this.regular.widthOfTextAtSize(label, 7)
        this.page.drawText(label, {
          x: A4[0] - MARGIN - size / 2 - labelWidth / 2,
          y: this.y - size + 1,
          size: 7,
          font: this.regular,
          color: FAINT,
        })
      }
      this.drawText(this.meta.organizationName, { font: this.bold, size: 10, color: BRAND })
      this.y -= 6
      this.drawText(this.meta.title, { font: this.bold, size: 20 })
      if (this.meta.subtitle) {
        this.y -= 2
        this.drawText(this.meta.subtitle, { size: 10, color: MUTED })
      }
      this.y -= 10
      this.rule()
      this.y -= 12
    } else {
      this.drawText(`${this.meta.title} (continued)`, { font: this.bold, size: 10, color: MUTED })
      this.y -= 8
      this.rule()
      this.y -= 12
    }

    this.footer()
  }

  private footer() {
    const note = this.meta.footNote ?? ''
    this.page.drawText(note, {
      x: MARGIN,
      y: MARGIN - 18,
      size: 7.5,
      font: this.regular,
      color: FAINT,
      maxWidth: this.width - 60,
    })
    const label = `Page ${this.pageNumber}`
    const labelWidth = this.regular.widthOfTextAtSize(label, 7.5)
    this.page.drawText(label, {
      x: A4[0] - MARGIN - labelWidth,
      y: MARGIN - 18,
      size: 7.5,
      font: this.regular,
      color: FAINT,
    })
  }

  /** Start a new page when fewer than `needed` points remain. */
  private ensure(needed: number) {
    if (this.y - needed < MARGIN + 6) this.newPage()
  }

  private drawText(
    text: string,
    options: { font?: PDFFont; size?: number; color?: RGB; x?: number } = {},
  ) {
    const font = options.font ?? this.regular
    const size = options.size ?? 10
    this.y -= size + 2
    this.page.drawText(text, {
      x: options.x ?? MARGIN,
      y: this.y,
      size,
      font,
      color: options.color ?? INK,
    })
  }

  private rule(color: RGB = RULE) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: A4[0] - MARGIN, y: this.y },
      thickness: 0.7,
      color,
    })
  }

  // --- Public building blocks ---------------------------------------------

  heading(text: string) {
    this.ensure(30)
    this.y -= 8
    this.drawText(text, { font: this.bold, size: 12 })
    this.y -= 4
  }

  paragraph(text: string, options: { muted?: boolean; size?: number } = {}) {
    const size = options.size ?? 9.5
    const font = this.regular
    const words = text.split(/\s+/)
    let line = ''
    const flush = () => {
      if (!line) return
      this.ensure(size + 6)
      this.drawText(line, { size, color: options.muted ? MUTED : INK })
      line = ''
    }
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word
      if (font.widthOfTextAtSize(candidate, size) > this.width) {
        flush()
        line = word
      } else {
        line = candidate
      }
    }
    flush()
    this.y -= 3
  }

  /** Two-column label/value block. */
  facts(items: { label: string; value: string }[], columns = 2) {
    const columnWidth = this.width / columns
    for (let index = 0; index < items.length; index += columns) {
      const row = items.slice(index, index + columns)
      this.ensure(30)
      const top = this.y
      let maxDrop = 0
      row.forEach((item, column) => {
        this.y = top
        const x = MARGIN + column * columnWidth
        this.drawText(item.label.toUpperCase(), { size: 7, color: FAINT, x })
        this.drawText(item.value || '—', { size: 10, x })
        maxDrop = Math.max(maxDrop, top - this.y)
      })
      this.y = top - maxDrop - 8
    }
  }

  /** A measured table. Column widths are fractions of the printable width. */
  table(columns: TableColumn[], rows: Cell[][], options: { totalRow?: Cell[] } = {}) {
    const total = columns.reduce((sum, column) => sum + column.width, 0)
    const widths = columns.map((column) => (column.width / total) * this.width)

    const drawRow = (cells: Cell[], size: number, defaultFont: PDFFont, color: RGB) => {
      this.ensure(LINE + 4)
      this.y -= LINE
      let x = MARGIN
      cells.forEach((cell, index) => {
        const width = widths[index] ?? 0
        const font = cell.bold ? this.bold : defaultFont
        const tone =
          cell.tone === 'muted'
            ? MUTED
            : cell.tone === 'positive'
              ? rgb(0.05, 0.5, 0.05)
              : cell.tone === 'negative'
                ? rgb(0.75, 0.15, 0.15)
                : color
        const alignment = cell.align ?? columns[index]?.align
        const available = width - 6

        let text = cell.text
        let cellSize = size

        if (alignment === 'right') {
          // Numbers are never truncated — a figure with its tail cut off is
          // worse than useless on a statement. Shrink to fit instead, and only
          // give up (with an ellipsis) below a legible floor.
          while (cellSize > 6.5 && font.widthOfTextAtSize(text, cellSize) > available) {
            cellSize -= 0.25
          }
          while (text.length > 1 && font.widthOfTextAtSize(text, cellSize) > available) {
            text = text.slice(0, -1)
          }
          if (text !== cell.text && text.length > 1) text = `${text.slice(0, -1)}…`
        } else {
          // Prose may be trimmed: the meaning survives, and the column matters.
          while (text.length > 1 && font.widthOfTextAtSize(text, cellSize) > available) {
            text = text.slice(0, -1)
          }
          if (text !== cell.text && text.length > 1) text = `${text.slice(0, -1)}…`
        }

        const drawX =
          alignment === 'right' ? x + width - font.widthOfTextAtSize(text, cellSize) - 6 : x
        this.page.drawText(text, { x: drawX, y: this.y, size: cellSize, font, color: tone })
        x += width
      })
    }

    const header = () => {
      this.ensure(LINE * 2)
      drawRow(
        columns.map((column) => ({ text: column.header.toUpperCase(), align: column.align })),
        7,
        this.bold,
        FAINT,
      )
      this.y -= 5
      this.rule()
    }

    header()
    let sincePageBreak = this.pageNumber
    for (const row of rows) {
      if (this.y - (LINE + 4) < MARGIN + 6) {
        this.newPage()
        header()
        sincePageBreak = this.pageNumber
      }
      drawRow(row, 9, this.regular, INK)
      this.page.drawLine({
        start: { x: MARGIN, y: this.y - 5 },
        end: { x: A4[0] - MARGIN, y: this.y - 5 },
        thickness: 0.4,
        color: rgb(0.93, 0.93, 0.91),
      })
    }
    void sincePageBreak

    if (options.totalRow) {
      this.y -= 4
      this.rule()
      drawRow(
        options.totalRow.map((cell) => ({ ...cell, bold: true })),
        10,
        this.bold,
        INK,
      )
      this.y -= 4
    }
    this.y -= 10
  }

  /** A single emphasised figure, for the amount on a receipt. */
  hero(label: string, value: string) {
    this.ensure(60)
    this.y -= 6
    this.page.drawRectangle({
      x: MARGIN,
      y: this.y - 46,
      width: this.width,
      height: 52,
      color: rgb(0.96, 0.975, 0.995),
      borderColor: rgb(0.83, 0.89, 0.97),
      borderWidth: 0.8,
    })
    this.y -= 16
    this.page.drawText(label.toUpperCase(), { x: MARGIN + 14, y: this.y, size: 7, font: this.bold, color: FAINT })
    this.y -= 22
    this.page.drawText(value, { x: MARGIN + 14, y: this.y, size: 20, font: this.bold, color: INK })
    this.y -= 24
  }

  /** A labelled bar, used for the rental-record factors. */
  bar(label: string, earned: number, weight: number, detail: string) {
    this.ensure(44)
    this.y -= 14
    this.page.drawText(label, { x: MARGIN, y: this.y, size: 9.5, font: this.bold, color: INK })
    const score = `${earned} / ${weight}`
    const scoreWidth = this.regular.widthOfTextAtSize(score, 9.5)
    this.page.drawText(score, {
      x: A4[0] - MARGIN - scoreWidth,
      y: this.y,
      size: 9.5,
      font: this.regular,
      color: MUTED,
    })
    this.y -= 8
    const pct = weight > 0 ? Math.max(0, Math.min(1, earned / weight)) : 0
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: this.width, height: 4, color: rgb(0.92, 0.92, 0.9) })
    this.page.drawRectangle({ x: MARGIN, y: this.y, width: this.width * pct, height: 4, color: BRAND })
    this.y -= 4
    this.drawText(detail, { size: 8.5, color: MUTED })
    this.y -= 2
  }

  space(points = 10) {
    this.y -= points
  }

  divider() {
    this.ensure(14)
    this.y -= 8
    this.rule()
    this.y -= 4
  }

  async bytes(): Promise<Uint8Array> {
    return this.doc.save()
  }
}

/** Wrap PDF bytes in a download response. */
export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  const body = new Uint8Array(bytes)
  return new Response(body, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(body.byteLength),
      'Cache-Control': 'private, no-store',
    },
  })
}

/** A filename-safe version of any label. */
export function slugForFile(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 60)
}
