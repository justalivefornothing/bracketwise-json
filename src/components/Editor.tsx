import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { lineAt } from '../core/lines'

export interface EditorMark {
  start: number
  end: number
  kind: 'hover' | 'selected' | 'error'
}

interface Props {
  value: string
  onChange: (value: string) => void
  lineStarts: number[]
  marks: EditorMark[]
  onHoverOffset: (offset: number | null) => void
  onCaretOffset: (offset: number) => void
  /** Scroll the given offset into view; `nonce` lets the same offset re-trigger. */
  reveal: { offset: number; nonce: number } | null
}

interface Metrics {
  charWidth: number
  lineHeight: number
  padLeft: number
  padTop: number
}

const TAB = 2
const KIND_CLASS: Record<EditorMark['kind'], string> = { hover: 'm-hover', selected: 'm-selected', error: 'm-error' }

interface Piece {
  text: string
  className: string
}

/**
 * Split the source into runs with identical mark classes. An error that sits on a
 * line break or at the end of input has no glyph to underline, so a one-space
 * marker is inserted there instead (it sits past the line's text, so nothing shifts).
 */
function buildPieces(text: string, marks: EditorMark[]): Piece[] {
  const bounds = new Set<number>([0, text.length])
  const markers = new Set<number>()
  const ranges: EditorMark[] = []
  for (const m of marks) {
    const ch = text[m.start]
    if (m.kind === 'error' && (m.start >= text.length || ch === '\n' || ch === '\r')) {
      markers.add(Math.min(m.start, text.length))
      bounds.add(Math.min(m.start, text.length))
      continue
    }
    ranges.push(m)
    bounds.add(Math.min(m.start, text.length))
    bounds.add(Math.min(m.end, text.length))
  }
  const sorted = [...bounds].sort((a, b) => a - b)
  const pieces: Piece[] = []
  for (let i = 0; i < sorted.length; i++) {
    const a = sorted[i]
    if (markers.has(a)) pieces.push({ text: ' ', className: 'm-error' })
    if (i + 1 >= sorted.length) break
    const b = sorted[i + 1]
    if (a === b) continue
    const classes = ranges.filter((m) => m.start <= a && b <= m.end).map((m) => KIND_CLASS[m.kind])
    pieces.push({ text: text.slice(a, b), className: [...new Set(classes)].join(' ') })
  }
  return pieces
}

export function Editor({ value, onChange, lineStarts, marks, onHoverOffset, onCaretOffset, reveal }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLPreElement>(null)
  const gutterRef = useRef<HTMLPreElement>(null)
  const probeRef = useRef<HTMLSpanElement>(null)
  const [metrics, setMetrics] = useState<Metrics | null>(null)

  const measure = useCallback(() => {
    const ta = taRef.current
    const probe = probeRef.current
    if (!ta || !probe) return
    const cs = getComputedStyle(ta)
    setMetrics({
      charWidth: probe.getBoundingClientRect().width / probe.textContent!.length,
      lineHeight: parseFloat(cs.lineHeight),
      padLeft: parseFloat(cs.paddingLeft),
      padTop: parseFloat(cs.paddingTop),
    })
  }, [])

  useLayoutEffect(() => {
    measure()
    let cancelled = false
    document.fonts?.ready.then(() => {
      if (!cancelled) measure()
    })
    const ro = new ResizeObserver(measure)
    if (taRef.current) ro.observe(taRef.current)
    return () => {
      cancelled = true
      ro.disconnect()
    }
  }, [measure])

  // Mouse position -> source offset, using the monospace grid (tabs expanded).
  const offsetFromPoint = useCallback(
    (clientX: number, clientY: number): number | null => {
      const ta = taRef.current
      if (!ta || !metrics) return null
      const rect = ta.getBoundingClientRect()
      const x = clientX - rect.left + ta.scrollLeft - metrics.padLeft
      const y = clientY - rect.top + ta.scrollTop - metrics.padTop
      if (x < 0 || y < 0) return null
      const line = Math.floor(y / metrics.lineHeight)
      if (line >= lineStarts.length) return null
      const col = Math.floor(x / metrics.charWidth)
      const from = lineStarts[line]
      const to = line + 1 < lineStarts.length ? lineStarts[line + 1] : value.length
      let visual = 0
      for (let i = from; i < to; i++) {
        const ch = value[i]
        if (ch === '\n' || ch === '\r') return null
        const w = ch === '\t' ? TAB - (visual % TAB) : 1
        if (col < visual + w) return i
        visual += w
      }
      return null
    },
    [metrics, lineStarts, value],
  )

  const syncScroll = () => {
    const ta = taRef.current
    if (!ta) return
    if (mirrorRef.current) {
      mirrorRef.current.scrollTop = ta.scrollTop
      mirrorRef.current.scrollLeft = ta.scrollLeft
    }
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`
  }

  useEffect(() => {
    const ta = taRef.current
    if (!reveal || !ta || !metrics) return
    const line = lineAt(lineStarts, reveal.offset) - 1
    const y = line * metrics.lineHeight
    const top = ta.scrollTop
    const bottom = top + ta.clientHeight - metrics.padTop * 2
    if (y < top || y + metrics.lineHeight > bottom) {
      ta.scrollTop = Math.max(0, y - ta.clientHeight / 2 + metrics.lineHeight)
      syncScroll()
    }
  }, [reveal, metrics, lineStarts])

  const pieces = useMemo(() => buildPieces(value, marks), [value, marks])
  const gutterText = useMemo(() => lineStarts.map((_, i) => i + 1).join('\n'), [lineStarts])
  const gutterWidth = Math.max(2, String(lineStarts.length).length)

  return (
    <div className="flex h-full min-h-[240px] bg-paper">
      <div
        className="relative shrink-0 select-none overflow-hidden border-r border-rule bg-paper-deep/60"
        style={{ width: `${gutterWidth + 1.75}ch` }}
        aria-hidden="true"
      >
        <pre ref={gutterRef} className="editor-text text-right text-ink-faint" style={{ paddingLeft: 0, paddingRight: '0.75ch' }}>
          {gutterText}
        </pre>
      </div>
      <div className="relative min-w-0 flex-1">
        <pre ref={mirrorRef} className="editor-text editor-mirror absolute inset-0" aria-hidden="true">
          <span ref={probeRef} className="absolute invisible">
            MMMMMMMMMMMMMMMMMMMM
          </span>
          {pieces.map((p, i) =>
            p.className ? (
              <span key={i} className={p.className}>
                {p.text}
              </span>
            ) : (
              p.text
            ),
          )}
          {' '}
        </pre>
        <textarea
          ref={taRef}
          className="editor-text editor-textarea scroll-warm absolute inset-0 h-full w-full"
          value={value}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          wrap="off"
          aria-label="JSON source"
          placeholder="Paste or type JSON here…"
          onChange={(e) => onChange(e.target.value)}
          onScroll={syncScroll}
          onMouseMove={(e) => onHoverOffset(offsetFromPoint(e.clientX, e.clientY))}
          onMouseLeave={() => onHoverOffset(null)}
          onClick={(e) => onCaretOffset(e.currentTarget.selectionStart)}
          onKeyUp={(e) => onCaretOffset(e.currentTarget.selectionStart)}
        />
      </div>
    </div>
  )
}
