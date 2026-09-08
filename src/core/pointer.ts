import type { JsonNode } from './parser'

/** RFC 6901 reference-token escaping: `~` -> `~0`, `/` -> `~1`. */
export function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1')
}

export function toPointer(path: Array<string | number>): string {
  return path.map((seg) => '/' + escapeToken(String(seg))).join('')
}

export interface NodeInfo {
  node: JsonNode
  /** JSON Pointer to this node; the empty string is the whole document. */
  pointer: string
  depth: number
  parent: NodeInfo | null
  /** Pre-order position; doubles as a stable id. */
  order: number
}

/** A half-open source interval owned by the deepest node covering it. */
export interface Segment {
  start: number
  end: number
  info: NodeInfo
}

export interface TreeIndex {
  root: NodeInfo
  /** All nodes in pre-order. */
  infos: NodeInfo[]
  byNode: Map<JsonNode, NodeInfo>
  byPointer: Map<string, NodeInfo>
  /** Disjoint intervals sorted by start, for O(log n) offset -> node lookup. */
  segments: Segment[]
}

export function indexTree(root: JsonNode): TreeIndex {
  const infos: NodeInfo[] = []
  const byNode = new Map<JsonNode, NodeInfo>()
  const byPointer = new Map<string, NodeInfo>()
  const segments: Segment[] = []

  const visit = (node: JsonNode, parent: NodeInfo | null, path: Array<string | number>): NodeInfo => {
    const info: NodeInfo = { node, pointer: toPointer(path), depth: path.length, parent, order: infos.length }
    infos.push(info)
    byNode.set(node, info)
    byPointer.set(info.pointer, info)

    // The member key (and the colon after it) belongs to the value it names.
    let cursor = node.key ? node.key.start : node.start
    const children = node.children ?? []
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const childStart = child.key ? child.key.start : child.start
      if (childStart > cursor) segments.push({ start: cursor, end: childStart, info })
      visit(child, info, node.type === 'object' ? [...path, child.key?.name ?? ''] : [...path, i])
      cursor = child.end
    }
    if (node.end > cursor) segments.push({ start: cursor, end: node.end, info })
    return info
  }

  const rootInfo = visit(root, null, [])
  return { root: rootInfo, infos, byNode, byPointer, segments }
}

/** Deepest node whose source range contains `offset`, or null in the gaps. */
export function nodeAt(segments: Segment[], offset: number): NodeInfo | null {
  let lo = 0
  let hi = segments.length - 1
  let found = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (segments[mid].start <= offset) {
      found = mid
      lo = mid + 1
    } else hi = mid - 1
  }
  if (found < 0) return null
  const seg = segments[found]
  return offset < seg.end ? seg.info : null
}

/** Ancestors from the root down to (excluding) `info`. */
export function ancestors(info: NodeInfo): NodeInfo[] {
  const chain: NodeInfo[] = []
  for (let p = info.parent; p; p = p.parent) chain.unshift(p)
  return chain
}
