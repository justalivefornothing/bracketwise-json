import type { JsonNode } from './parser'

export interface PrintOptions {
  /** Number of spaces per level, or 'tab'. Ignored when minifying. */
  indent?: number | 'tab'
  minify?: boolean
}

const STRICT_NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/

/** Quote a string per RFC 8259 §7. Non-ASCII stays as-is; only what must be escaped is. */
export function quote(s: string): string {
  let out = '"'
  let chunk = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    let esc: string | undefined
    if (c === 0x22) esc = '\\"'
    else if (c === 0x5c) esc = '\\\\'
    else if (c < 0x20) {
      if (c === 0x08) esc = '\\b'
      else if (c === 0x0c) esc = '\\f'
      else if (c === 0x0a) esc = '\\n'
      else if (c === 0x0d) esc = '\\r'
      else if (c === 0x09) esc = '\\t'
      else esc = '\\u' + c.toString(16).padStart(4, '0')
    }
    if (esc !== undefined) {
      out += s.slice(chunk, i) + esc
      chunk = i + 1
    }
  }
  return out + s.slice(chunk) + '"'
}

/**
 * Serialise an AST back to JSON text. Numbers keep their source spelling
 * (`2.5e3` stays `2.5e3`) when that spelling is valid JSON.
 */
export function printJson(root: JsonNode, opts: PrintOptions = {}): string {
  const minify = opts.minify ?? false
  const unit = opts.indent === 'tab' ? '\t' : ' '.repeat(opts.indent ?? 2)
  const colon = minify ? ':' : ': '

  const emit = (node: JsonNode, depth: number): string => {
    switch (node.type) {
      case 'string':
        return quote(node.value as string)
      case 'number':
        return node.raw !== undefined && STRICT_NUMBER.test(node.raw) ? node.raw : String(node.value)
      case 'boolean':
        return node.value ? 'true' : 'false'
      case 'null':
        return 'null'
      case 'array':
      case 'object': {
        const children = node.children ?? []
        const open = node.type === 'array' ? '[' : '{'
        const close = node.type === 'array' ? ']' : '}'
        if (children.length === 0) return open + close
        const items = children.map((child) => {
          const body = emit(child, depth + 1)
          return node.type === 'object' ? quote(child.key?.name ?? '') + colon + body : body
        })
        if (minify) return open + items.join(',') + close
        const inner = unit.repeat(depth + 1)
        return open + '\n' + items.map((s) => inner + s).join(',\n') + '\n' + unit.repeat(depth) + close
      }
    }
  }

  return emit(root, 0)
}
