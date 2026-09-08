import { lineStarts, lineText } from './lines'

export interface Excerpt {
  /** `Unexpected "}" at 1:8: expected ...` */
  message: string
  /** 1-based line number shown in the gutter. */
  line: number
  /** The offending line (tabs expanded, windowed around the column). */
  excerpt: string
  /** Spaces followed by a caret, aligned to `excerpt`. */
  caret: string
}

const TAB = '  '
const WINDOW = 80

/** Build the one-line source excerpt plus caret for a diagnostic. */
export function excerptFor(source: string, d: { message: string; line: number; col: number }): Excerpt {
  const starts = lineStarts(source)
  const rawLine = lineText(source, starts, d.line)
  // Expand tabs so the caret column matches the rendered text.
  let text = ''
  let caretCol = 0
  for (let i = 0; i < rawLine.length; i++) {
    if (i === d.col - 1) caretCol = text.length
    text += rawLine[i] === '\t' ? TAB : rawLine[i]
  }
  if (d.col - 1 >= rawLine.length) caretCol = text.length

  let from = 0
  if (text.length > WINDOW) {
    from = Math.max(0, Math.min(caretCol - Math.floor(WINDOW / 2), text.length - WINDOW))
  }
  let excerpt = text.slice(from, from + WINDOW)
  let caretPos = caretCol - from
  if (from > 0) {
    excerpt = '…' + excerpt.slice(1)
  }
  if (from + WINDOW < text.length) excerpt = excerpt.slice(0, -1) + '…'
  caretPos = Math.max(0, Math.min(caretPos, excerpt.length))

  return { message: d.message, line: d.line, excerpt, caret: ' '.repeat(caretPos) + '^' }
}

/** Plain-text rendering, e.g. for the console or tests. */
export function formatDiagnostic(source: string, d: { message: string; line: number; col: number }): string {
  const e = excerptFor(source, d)
  const gutter = String(e.line)
  const pad = ' '.repeat(gutter.length)
  return `${e.message}\n ${gutter} | ${e.excerpt}\n ${pad} | ${e.caret}`
}
