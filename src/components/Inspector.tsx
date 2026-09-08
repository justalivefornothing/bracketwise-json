import { useEffect, useState } from 'react'
import type { NodeInfo } from '../core/pointer'
import { TypeBadge, preview } from './Badge'

interface Props {
  info: NodeInfo | null
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1200)
    return () => clearTimeout(t)
  }, [copied])
  return (
    <button
      type="button"
      className={'btn shrink-0' + (copied ? ' is-active' : '')}
      aria-label={label}
      onClick={() => navigator.clipboard?.writeText(text).then(() => setCopied(true))}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function Inspector({ info }: Props) {
  if (!info) {
    return (
      <section aria-label="Selected node" className="border-t border-rule bg-paper-deep/50 px-3 py-2.5 text-xs text-ink-faint">
        Click a tree row, or place the caret in the source, to inspect a node and its JSON Pointer.
      </section>
    )
  }
  const { node, pointer } = info
  const { start, end } = node.loc
  return (
    <section aria-label="Selected node" className="border-t border-rule bg-paper-deep/50 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <TypeBadge type={node.type} />
        <span className="font-mono text-ink-soft">
          {start.line}:{start.col}–{end.line}:{end.col}
        </span>
        <span className="font-mono text-ink-faint">
          offset {node.start}–{node.end}
        </span>
        <span className="truncate font-mono text-ink-soft">{preview(node, 60)}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">Pointer</span>
        <code className="min-w-0 flex-1 truncate rounded-md border border-rule bg-paper px-2 py-1 font-mono text-xs" title={pointer || '(whole document)'}>
          {pointer === '' ? <span className="text-ink-faint">"" (whole document)</span> : pointer}
        </code>
        <CopyButton text={pointer} label="Copy JSON Pointer" />
      </div>
    </section>
  )
}
