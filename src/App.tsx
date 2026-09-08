import { useCallback, useMemo, useState } from 'react'
import { analyze } from './core/parser'
import { lineStarts, offsetToPosition } from './core/lines'
import { ancestors, indexTree, nodeAt, type NodeInfo, type TreeIndex } from './core/pointer'
import { Editor, type EditorMark } from './components/Editor'
import { Tree, isContainer } from './components/Tree'
import { Diagnostics } from './components/Diagnostics'
import { Inspector } from './components/Inspector'
import { OutputControls, OutputPanel, type Indent } from './components/OutputPanel'
import { SAMPLES } from './samples'

const AUTO_EXPAND_LIMIT = 200

function defaultOpen(info: NodeInfo, index: TreeIndex): boolean {
  return index.infos.length <= AUTO_EXPAND_LIMIT || info.depth < 2
}

/** Keep the user's expand/collapse choices for pointers that survived the edit. */
function reconcileExpanded(prev: Set<string>, prevIndex: TreeIndex | null, next: TreeIndex | null): Set<string> {
  const out = new Set<string>()
  if (!next) return out
  for (const info of next.infos) {
    if (!isContainer(info)) continue
    const open = prevIndex?.byPointer.has(info.pointer) ? prev.has(info.pointer) : defaultOpen(info, next)
    if (open) out.add(info.pointer)
  }
  return out
}

/** The row that is actually on screen for `info`: itself, or its first collapsed ancestor. */
function visibleTarget(info: NodeInfo, expanded: Set<string>): NodeInfo {
  for (const a of ancestors(info)) if (!expanded.has(a.pointer)) return a
  return info
}

export default function App() {
  const [sampleId, setSampleId] = useState(SAMPLES[0].id)
  const [source, setSource] = useState(SAMPLES[0].text)
  const [tolerant, setTolerant] = useState(false)
  const [indent, setIndent] = useState<Indent>(2)
  const [minify, setMinify] = useState(false)
  const [tab, setTab] = useState<'tree' | 'output'>('tree')
  const [selected, setSelected] = useState<string | null>(null)
  const [hoverTree, setHoverTree] = useState<string | null>(null)
  const [hoverSource, setHoverSource] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [reveal, setReveal] = useState<{ offset: number; nonce: number } | null>(null)
  const [treeReveal, setTreeReveal] = useState(0)
  const [caret, setCaret] = useState(0)

  const analysis = useMemo(() => {
    const t0 = performance.now()
    const result = analyze(source, tolerant)
    const ms = performance.now() - t0
    const index = result.root ? indexTree(result.root) : null
    return { ...result, index, ms }
  }, [source, tolerant])
  const starts = useMemo(() => lineStarts(source), [source])
  const index = analysis.index

  // Derived-state reset: when the tree changes, reconcile expansion and selection.
  const [prevIndex, setPrevIndex] = useState<TreeIndex | null>(null)
  if (index !== prevIndex) {
    setPrevIndex(index)
    setExpanded(reconcileExpanded(expanded, prevIndex, index))
    if (selected !== null && !index?.byPointer.has(selected)) setSelected(null)
    setHoverTree(null)
    setHoverSource(null)
  }

  const selectedInfo = selected !== null ? (index?.byPointer.get(selected) ?? null) : null
  const hoverTreeInfo = hoverTree !== null ? (index?.byPointer.get(hoverTree) ?? null) : null

  const marks = useMemo(() => {
    const out: EditorMark[] = []
    const range = (info: NodeInfo, kind: EditorMark['kind']) =>
      out.push({ start: info.node.key ? info.node.key.start : info.node.start, end: info.node.end, kind })
    if (selectedInfo) range(selectedInfo, 'selected')
    if (hoverTreeInfo) range(hoverTreeInfo, 'hover')
    for (const d of analysis.diagnostics) out.push({ start: d.offset, end: d.offset + 1, kind: 'error' })
    return out
  }, [selectedInfo, hoverTreeInfo, analysis.diagnostics])

  const expandTo = useCallback((info: NodeInfo) => {
    setExpanded((prev) => {
      const chain = ancestors(info)
      if (chain.every((a) => prev.has(a.pointer))) return prev
      const next = new Set(prev)
      for (const a of chain) next.add(a.pointer)
      return next
    })
  }, [])

  const selectFromEditor = useCallback(
    (offset: number) => {
      setCaret(offset)
      if (!index) return
      const info = nodeAt(index.segments, offset)
      if (!info) return
      expandTo(info)
      setSelected(info.pointer)
      setTreeReveal((n) => n + 1)
      setTab('tree')
    },
    [index, expandTo],
  )

  const onHoverOffset = useCallback(
    (offset: number | null) => {
      if (offset === null || !index) {
        setHoverSource(null)
        return
      }
      const info = nodeAt(index.segments, offset)
      setHoverSource(info ? visibleTarget(info, expanded).pointer : null)
    },
    [index, expanded],
  )

  const selectFromTree = (pointer: string) => {
    setSelected(pointer)
    const info = index?.byPointer.get(pointer)
    if (info) setReveal({ offset: info.node.key ? info.node.key.start : info.node.start, nonce: (reveal?.nonce ?? 0) + 1 })
  }

  const jumpTo = (offset: number) => {
    setReveal({ offset, nonce: (reveal?.nonce ?? 0) + 1 })
    selectFromEditor(offset)
  }

  const loadSample = (id: string) => {
    const sample = SAMPLES.find((s) => s.id === id)
    if (!sample) return
    setSampleId(id)
    setSource(sample.text)
    setSelected(null)
    setCaret(0)
  }

  const caretPos = offsetToPosition(starts, Math.min(caret, source.length))
  const stats = index ? { nodes: index.infos.length, ms: analysis.ms } : null

  return (
    <div className="flex min-h-full flex-col md:h-full">
      <header className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-rule px-4 py-3 md:px-6">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] leading-tight font-semibold tracking-tight">
            Bracket<span className="text-terracotta">wise</span>
          </h1>
          <p className="mt-0.5 text-xs text-ink-soft">
            A hand-written JSON parser with exact <span className="font-mono">line:col</span> errors and a live, hover-linked syntax tree.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:ml-auto">
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            Sample
            <select className="field max-w-[220px]" value={sampleId} onChange={(e) => loadSample(e.target.value)} aria-label="Load a sample document">
              <optgroup label="Valid">
                {SAMPLES.filter((s) => !s.broken).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Broken">
                {SAMPLES.filter((s) => s.broken).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-ink-soft">
            <button
              type="button"
              role="switch"
              aria-checked={tolerant}
              aria-label="Tolerant mode"
              className="switch"
              onClick={() => setTolerant((t) => !t)}
            />
            Tolerant mode
            <span className="hidden text-ink-faint lg:inline">— recover and list every problem</span>
          </label>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 md:min-h-0 md:grid-cols-2">
        <section aria-label="Source" className="flex min-h-0 flex-col border-rule md:border-r">
          <div className="flex items-center gap-3 border-b border-rule px-3 py-1.5 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
            Source
            <span className="ml-auto font-mono font-normal tracking-normal normal-case text-ink-faint">
              Ln {caretPos.line}, Col {caretPos.col}
            </span>
          </div>
          <div className="h-[46vh] min-h-0 md:h-auto md:flex-1">
            <Editor
              value={source}
              onChange={setSource}
              lineStarts={starts}
              marks={marks}
              onHoverOffset={onHoverOffset}
              onCaretOffset={selectFromEditor}
              reveal={reveal}
            />
          </div>
          <Diagnostics source={source} diagnostics={analysis.diagnostics} tolerant={tolerant} stats={stats} onJump={jumpTo} />
        </section>

        <section aria-label="Syntax tree and output" className="flex min-h-0 flex-col border-t border-rule md:border-t-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-rule px-2 pr-3">
            <div role="tablist" aria-label="Right pane" className="flex">
              <button type="button" role="tab" className="tab" aria-selected={tab === 'tree'} aria-controls="pane-tree" onClick={() => setTab('tree')}>
                Syntax tree
              </button>
              <button type="button" role="tab" className="tab" aria-selected={tab === 'output'} aria-controls="pane-output" onClick={() => setTab('output')}>
                Output
              </button>
            </div>
            <div className="ml-auto py-1">
              {tab === 'output' ? (
                <OutputControls indent={indent} minify={minify} onIndent={setIndent} onMinify={setMinify} />
              ) : index ? (
                <div className="flex gap-1">
                  <button type="button" className="btn" onClick={() => setExpanded(new Set(index.infos.filter(isContainer).map((i) => i.pointer)))}>
                    Expand all
                  </button>
                  <button type="button" className="btn" onClick={() => setExpanded(new Set([index.root.pointer]))}>
                    Collapse all
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          <div
            id={tab === 'tree' ? 'pane-tree' : 'pane-output'}
            role="tabpanel"
            className="scroll-warm max-h-[60vh] min-h-[200px] flex-1 overflow-auto md:max-h-none"
          >
            {tab === 'tree' ? (
              index ? (
                <Tree
                  index={index}
                  expanded={expanded}
                  selected={selected}
                  hovered={hoverSource}
                  revealNonce={treeReveal}
                  onToggle={(pointer, open) =>
                    setExpanded((prev) => {
                      const next = new Set(prev)
                      if (open) next.add(pointer)
                      else next.delete(pointer)
                      return next
                    })
                  }
                  onSelect={selectFromTree}
                  onHover={setHoverTree}
                />
              ) : (
                <EmptyTree hasSource={source.trim().length > 0} tolerant={tolerant} />
              )
            ) : (
              <OutputPanel root={analysis.root} indent={indent} minify={minify} />
            )}
          </div>
          <Inspector info={selectedInfo} />
        </section>
      </main>
    </div>
  )
}

function EmptyTree({ hasSource, tolerant }: { hasSource: boolean; tolerant: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true">
        <path d="M11 6q-4 0-4 4v3q0 3-3 3 3 0 3 3v3q0 4 4 4" fill="none" stroke="#c2543a" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M21 6q4 0 4 4v3q0 3 3 3-3 0-3 3v3q0 4-4 4" fill="none" stroke="#d99a1e" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      {hasSource ? (
        <>
          <p className="font-display text-lg">No tree to show</p>
          <p className="max-w-xs text-sm text-ink-soft">
            The document did not parse. Fix the error under the source{tolerant ? '' : ', or turn on tolerant mode to see what could be recovered'}.
          </p>
        </>
      ) : (
        <>
          <p className="font-display text-lg">Paste some JSON</p>
          <p className="max-w-xs text-sm text-ink-soft">The syntax tree appears here. Hover a row to light up its source range; hover the source to find its row.</p>
        </>
      )}
    </div>
  )
}
