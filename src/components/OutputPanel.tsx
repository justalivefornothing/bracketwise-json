import { useMemo } from 'react'
import type { JsonNode } from '../core/parser'
import { printJson } from '../core/print'
import { CopyButton } from './Inspector'

export type Indent = 2 | 4 | 'tab'

interface Props {
  root: JsonNode | null
  indent: Indent
  minify: boolean
  onIndent: (indent: Indent) => void
  onMinify: (minify: boolean) => void
}

export function OutputControls({ indent, minify, onIndent, onMinify }: Omit<Props, 'root'>) {
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Output mode" className="flex overflow-hidden rounded-md border border-rule-strong text-xs">
        <button type="button" className={'px-2.5 leading-7 transition-colors hover:bg-paper-hover' + (!minify ? ' bg-ink text-paper hover:bg-ink' : '')} aria-pressed={!minify} onClick={() => onMinify(false)}>
          Pretty
        </button>
        <button type="button" className={'border-l border-rule-strong px-2.5 leading-7 transition-colors hover:bg-paper-hover' + (minify ? ' bg-ink text-paper hover:bg-ink' : '')} aria-pressed={minify} onClick={() => onMinify(true)}>
          Minify
        </button>
      </div>
      <label className="flex items-center gap-1.5 text-xs text-ink-soft">
        Indent
        <select
          className="field"
          value={String(indent)}
          disabled={minify}
          aria-label="Indent width"
          onChange={(e) => onIndent(e.target.value === 'tab' ? 'tab' : (Number(e.target.value) as 2 | 4))}
        >
          <option value="2">2 spaces</option>
          <option value="4">4 spaces</option>
          <option value="tab">Tab</option>
        </select>
      </label>
    </div>
  )
}

export function OutputPanel({ root, indent, minify }: Pick<Props, 'root' | 'indent' | 'minify'>) {
  const text = useMemo(() => (root ? printJson(root, { indent, minify }) : ''), [root, indent, minify])
  if (!root) {
    return <p className="p-4 text-sm text-ink-faint">Nothing to print yet — the document has no value.</p>
  }
  return (
    <div className="relative">
      <div className="absolute top-2 right-3">
        <CopyButton text={text} label="Copy output" />
      </div>
      <pre className="editor-text scroll-warm overflow-auto text-ink" style={{ whiteSpace: minify ? 'pre-wrap' : 'pre', wordBreak: 'break-all' }}>
        {text}
      </pre>
    </div>
  )
}
