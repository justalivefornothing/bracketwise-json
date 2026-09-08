import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { NodeInfo, TreeIndex } from '../core/pointer'
import { TypeBadge, preview } from './Badge'

interface TreeProps {
  index: TreeIndex
  expanded: Set<string>
  selected: string | null
  /** Row to light up because the source under the mouse belongs to it. */
  hovered: string | null
  /** Bumps whenever the selection came from the editor and the row should scroll into view. */
  revealNonce: number
  onToggle: (pointer: string, open: boolean) => void
  onSelect: (pointer: string) => void
  onHover: (pointer: string | null) => void
}

export function isContainer(info: NodeInfo): boolean {
  return info.node.type === 'object' || info.node.type === 'array'
}

function labelOf(info: NodeInfo): string {
  if (!info.parent) return 'document'
  if (info.node.key) return info.node.key.name
  return info.pointer.slice(info.pointer.lastIndexOf('/') + 1)
}

/** Pre-order list of rows whose ancestors are all expanded. */
export function visibleRows(index: TreeIndex, expanded: Set<string>): NodeInfo[] {
  const out: NodeInfo[] = []
  const walk = (info: NodeInfo) => {
    out.push(info)
    if (!expanded.has(info.pointer)) return
    for (const child of info.node.children ?? []) walk(index.byNode.get(child)!)
  }
  walk(index.root)
  return out
}

/** Grid-row trick: 0fr -> 1fr animates height without measuring. */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(open)
  useEffect(() => {
    if (open) {
      setMounted(true)
      const id = requestAnimationFrame(() => setShown(true))
      return () => cancelAnimationFrame(id)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 130)
    return () => clearTimeout(t)
  }, [open])
  return <div className={'collapsible' + (shown ? ' is-open' : '')}>{mounted && <div>{children}</div>}</div>
}

export function Tree(props: TreeProps) {
  const { index, expanded, selected, hovered, revealNonce, onToggle, onSelect, onHover } = props
  const rowRefs = useRef(new Map<string, HTMLDivElement>())
  const [focused, setFocused] = useState<string>(selected ?? '')
  const focusPointer = index.byPointer.has(focused) ? focused : (selected ?? '')

  // Scroll the selected row into view once any expand animation has settled.
  useEffect(() => {
    if (selected === null) return
    const t = setTimeout(() => rowRefs.current.get(selected)?.scrollIntoView({ block: 'nearest' }), 140)
    return () => clearTimeout(t)
  }, [selected, revealNonce])

  const moveFocus = (pointer: string) => {
    setFocused(pointer)
    requestAnimationFrame(() => rowRefs.current.get(pointer)?.focus())
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = visibleRows(index, expanded)
    const i = rows.findIndex((r) => r.pointer === focusPointer)
    if (i < 0) return
    const info = rows[i]
    const open = expanded.has(info.pointer)
    switch (e.key) {
      case 'ArrowDown':
        if (i + 1 < rows.length) moveFocus(rows[i + 1].pointer)
        break
      case 'ArrowUp':
        if (i > 0) moveFocus(rows[i - 1].pointer)
        break
      case 'Home':
        moveFocus(rows[0].pointer)
        break
      case 'End':
        moveFocus(rows[rows.length - 1].pointer)
        break
      case 'ArrowRight':
        if (isContainer(info) && !open) onToggle(info.pointer, true)
        else if (isContainer(info) && info.node.children?.length) moveFocus(index.byNode.get(info.node.children[0])!.pointer)
        break
      case 'ArrowLeft':
        if (isContainer(info) && open) onToggle(info.pointer, false)
        else if (info.parent) moveFocus(info.parent.pointer)
        break
      case 'Enter':
        onSelect(info.pointer)
        break
      case ' ':
        if (isContainer(info)) onToggle(info.pointer, !open)
        else onSelect(info.pointer)
        break
      default:
        return
    }
    e.preventDefault()
  }

  const renderRow = (info: NodeInfo): ReactNode => {
    const node = info.node
    const container = isContainer(info)
    const open = expanded.has(info.pointer)
    const isSelected = selected === info.pointer
    const isHovered = hovered === info.pointer
    const label = labelOf(info)
    return (
      <div key={info.pointer} role="none">
        <div
          ref={(el) => {
            if (el) rowRefs.current.set(info.pointer, el)
            else rowRefs.current.delete(info.pointer)
          }}
          role="treeitem"
          aria-level={info.depth + 1}
          aria-selected={isSelected}
          aria-expanded={container ? open : undefined}
          tabIndex={focusPointer === info.pointer ? 0 : -1}
          className={
            'tree-row flex min-h-7 cursor-pointer items-center gap-2 rounded-sm py-0.5 pr-2 pl-1 font-mono text-[12.5px]' +
            (isSelected ? ' is-selected' : '') +
            (isHovered ? ' is-hovered' : '')
          }
          onClick={() => {
            onSelect(info.pointer)
            setFocused(info.pointer)
          }}
          onDoubleClick={() => container && onToggle(info.pointer, !open)}
          onMouseEnter={() => onHover(info.pointer)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => setFocused(info.pointer)}
        >
          {container ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label={open ? 'Collapse' : 'Expand'}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-paper-deep hover:text-ink"
              onClick={(e) => {
                e.stopPropagation()
                onToggle(info.pointer, !open)
              }}
            >
              <svg className={'chevron' + (open ? ' is-open' : '')} width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M3 1.5 7 5 3 8.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <span className="inline-block w-5 shrink-0" />
          )}
          <span className={'truncate ' + (node.key ? 'font-medium text-ink' : 'text-ink-faint')} title={label}>
            {label}
          </span>
          <TypeBadge type={node.type} />
          <span className={'truncate ' + (node.type === 'string' ? 'text-sage-deep' : container ? 'text-ink-faint' : 'text-slate-deep')}>
            {preview(node)}
          </span>
        </div>
        {container && node.children && node.children.length > 0 && (
          <Collapsible open={open}>
            <div role="group" className="ml-[10px] border-l border-rule pl-2">
              {node.children.map((child) => renderRow(index.byNode.get(child)!))}
            </div>
          </Collapsible>
        )}
      </div>
    )
  }

  return (
    <div role="tree" aria-label="JSON syntax tree" className="p-2" onKeyDown={onKeyDown}>
      {renderRow(index.root)}
    </div>
  )
}
