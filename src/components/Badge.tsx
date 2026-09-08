import type { JsonNode, NodeType } from '../core/parser'

const STYLES: Record<NodeType, string> = {
  object: 'bg-terracotta-soft text-terracotta-deep',
  array: 'bg-amber-soft text-amber-deep',
  string: 'bg-sage-soft text-sage-deep',
  number: 'bg-slate-soft text-slate-deep',
  boolean: 'bg-plum-soft text-plum-deep',
  null: 'bg-stone-soft text-stone-deep',
}

export function TypeBadge({ type }: { type: NodeType }) {
  return <span className={`badge ${STYLES[type]}`}>{type}</span>
}

/** Short, single-line description of a node's contents. */
export function preview(node: JsonNode, max = 48): string {
  switch (node.type) {
    case 'object': {
      const n = node.children?.length ?? 0
      return n === 1 ? '1 key' : `${n} keys`
    }
    case 'array': {
      const n = node.children?.length ?? 0
      return n === 1 ? '1 item' : `${n} items`
    }
    case 'string': {
      const s = node.value as string
      const shown = s.length > max ? s.slice(0, max - 1) + '…' : s
      return JSON.stringify(shown)
    }
    default:
      return node.raw ?? String(node.value)
  }
}
