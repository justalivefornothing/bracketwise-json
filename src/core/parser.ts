/**
 * Bracketwise — a from-scratch recursive-descent JSON parser (RFC 8259).
 *
 * Single pass over the UTF-16 source with a cursor that tracks offset, line and
 * column. Every node records `start`/`end` offsets and 1-based `loc` positions.
 * Strict mode throws a ParseError at the first problem; tolerant mode records a
 * diagnostic, resyncs to the next `,` / `]` / `}` and keeps going.
 */

export interface Position {
  line: number
  col: number
}

export interface Loc {
  start: Position
  end: Position
}

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

export type NodeType = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null'

/** Source information about the key of an object member. */
export interface KeyInfo {
  name: string
  start: number
  end: number
  loc: Loc
}

export interface JsonNode {
  type: NodeType
  /** Inclusive start offset (UTF-16 code units). */
  start: number
  /** Exclusive end offset. */
  end: number
  /** 1-based line/column; `end` is the position just past the node. */
  loc: Loc
  /** The evaluated JavaScript value. */
  value: JsonValue
  /** Exact source text, for strings and numbers. */
  raw?: string
  /** Members (objects) or elements (arrays), in source order. */
  children?: JsonNode[]
  /** Present when this node is the value of an object member. */
  key?: KeyInfo
}

export interface Diagnostic {
  severity: 'error' | 'warning'
  message: string
  offset: number
  line: number
  col: number
  expected: string[]
  found: string
  hint?: string
}

export class ParseError extends Error {
  readonly offset: number
  readonly line: number
  readonly col: number
  readonly expected: string[]
  readonly found: string
  readonly hint?: string

  constructor(d: Diagnostic) {
    super(d.message)
    this.name = 'ParseError'
    this.offset = d.offset
    this.line = d.line
    this.col = d.col
    this.expected = d.expected
    this.found = d.found
    this.hint = d.hint
  }
}

export interface ParseResult {
  root: JsonNode | null
  diagnostics: Diagnostic[]
}

/** Parse strictly. Returns the root node or throws a ParseError. */
export function parse(source: string): JsonNode {
  const root = new Parser(source, false).parseDocument()
  // Strict mode either throws or produces a root; this satisfies the type.
  return root as JsonNode
}

/** Parse leniently: recover from errors and report every one as a warning. */
export function parseTolerant(source: string): ParseResult {
  const parser = new Parser(source, true)
  const root = parser.parseDocument()
  return { root, diagnostics: parser.diagnostics }
}

/** Convenience for UIs: never throws, in either mode. */
export function analyze(source: string, tolerant: boolean): ParseResult {
  if (tolerant) return parseTolerant(source)
  try {
    return { root: parse(source), diagnostics: [] }
  } catch (e) {
    if (e instanceof ParseError) return { root: null, diagnostics: [toDiagnostic(e)] }
    throw e
  }
}

function toDiagnostic(e: ParseError): Diagnostic {
  return {
    severity: 'error',
    message: e.message,
    offset: e.offset,
    line: e.line,
    col: e.col,
    expected: e.expected,
    found: e.found,
    hint: e.hint,
  }
}

// ---------------------------------------------------------------------------

interface Mark {
  offset: number
  line: number
  col: number
}

interface FailOptions {
  /** Phrase appended to the expectation, e.g. `after object value`. */
  where?: string
  /** Friendly explanation appended after a dash. */
  found?: string
  hint?: string
}

/** Thrown inside the parser in tolerant mode to unwind to the nearest container. */
const RESYNC: unique symbol = Symbol('resync')

const TRAILING_COMMA = 'trailing commas are not allowed in JSON'
const MISSING_COMMA = 'looks like a missing ","'

function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39
}

function isHex(code: number): boolean {
  return isDigit(code) || (code >= 0x41 && code <= 0x46) || (code >= 0x61 && code <= 0x66)
}

function isWordChar(code: number): boolean {
  return (
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    isDigit(code) ||
    code === 0x5f ||
    code === 0x24
  )
}

function joinOr(items: string[]): string {
  if (items.length <= 1) return items[0] ?? 'nothing'
  return items.slice(0, -1).join(', ') + ' or ' + items[items.length - 1]
}

class Parser {
  private pos = 0
  private line = 1
  private col = 1
  readonly diagnostics: Diagnostic[] = []
  private readonly src: string
  private readonly tolerant: boolean

  constructor(src: string, tolerant: boolean) {
    this.src = src
    this.tolerant = tolerant
  }

  // -- cursor -------------------------------------------------------------

  private get code(): number {
    // NaN past the end, which fails every comparison below.
    return this.src.charCodeAt(this.pos)
  }

  private peek(): string | undefined {
    return this.src[this.pos]
  }

  private atEnd(): boolean {
    return this.pos >= this.src.length
  }

  private advance(): void {
    const c = this.code
    if (c === 0x0a) {
      this.pos++
      this.line++
      this.col = 1
    } else if (c === 0x0d) {
      this.pos += this.src.charCodeAt(this.pos + 1) === 0x0a ? 2 : 1
      this.line++
      this.col = 1
    } else {
      this.pos++
      this.col++
    }
  }

  private mark(): Mark {
    return { offset: this.pos, line: this.line, col: this.col }
  }

  private finish(type: NodeType, start: Mark, value: JsonValue, extra?: Partial<JsonNode>): JsonNode {
    return {
      type,
      start: start.offset,
      end: this.pos,
      loc: { start: { line: start.line, col: start.col }, end: { line: this.line, col: this.col } },
      value,
      ...extra,
    }
  }

  private skipWs(): void {
    for (;;) {
      const c = this.code
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) this.advance()
      else if (c === 0x2f && this.tolerant) {
        const next = this.src.charCodeAt(this.pos + 1)
        if (next === 0x2f || next === 0x2a) this.skipComment()
        else break
      } else break
    }
  }

  private skipComment(): void {
    const at = this.mark()
    const block = this.src.charCodeAt(this.pos + 1) === 0x2a
    this.advance()
    this.advance()
    if (block) {
      while (!this.atEnd() && !(this.code === 0x2a && this.src.charCodeAt(this.pos + 1) === 0x2f)) this.advance()
      if (this.atEnd()) {
        this.record(['"*/"'], at, { where: 'to close the comment opened at ' + at.line + ':' + at.col, found: 'end of input' })
        return
      }
      this.advance()
      this.advance()
    } else {
      while (!this.atEnd() && this.code !== 0x0a && this.code !== 0x0d) this.advance()
    }
    this.diagnostics.push({
      severity: 'warning',
      message: `Comment at ${at.line}:${at.col} — comments are not part of JSON; skipped`,
      offset: at.offset,
      line: at.line,
      col: at.col,
      expected: ['value'],
      found: block ? '"/*"' : '"//"',
    })
  }

  // -- diagnostics ----------------------------------------------------------

  /** Describe what the cursor is looking at, for error messages. */
  private describeHere(): string {
    if (this.atEnd()) return 'end of input'
    const c = this.code
    if (c === 0x0a || c === 0x0d) return 'line break'
    if (c < 0x20) return 'control character U+' + c.toString(16).toUpperCase().padStart(4, '0')
    if (c === 0x22) return `'"'`
    if (isWordChar(c)) {
      let end = this.pos
      while (end < this.src.length && isWordChar(this.src.charCodeAt(end))) end++
      return JSON.stringify(this.src.slice(this.pos, end))
    }
    return JSON.stringify(this.peek())
  }

  private record(expected: string[], at: Mark, opts: FailOptions = {}): Diagnostic {
    const found = opts.found ?? this.describeHere()
    let hint = opts.hint
    if (!hint && this.code === 0x2f) {
      const next = this.src.charCodeAt(this.pos + 1)
      if (next === 0x2f || next === 0x2a) hint = 'comments are not allowed in JSON; tolerant mode skips them'
    }
    let message = `Unexpected ${found} at ${at.line}:${at.col}: expected ${joinOr(expected)}`
    if (opts.where) message += ' ' + opts.where
    if (hint) message += ' — ' + hint
    const d: Diagnostic = {
      severity: this.tolerant ? 'warning' : 'error',
      message,
      offset: at.offset,
      line: at.line,
      col: at.col,
      expected,
      found,
      hint,
    }
    if (!this.tolerant) throw new ParseError(d)
    this.diagnostics.push(d)
    return d
  }

  /** Report a problem the parser can step over without resyncing. */
  private report(expected: string[], opts?: FailOptions): void {
    this.record(expected, this.mark(), opts)
  }

  /** Report a problem and unwind to the nearest container (tolerant) or throw (strict). */
  private fail(expected: string[], opts?: FailOptions): never {
    this.record(expected, this.mark(), opts)
    throw RESYNC
  }

  /** Tolerant-mode resync: skip forward to the next `,` or the closing bracket. */
  private recover(close: string): void {
    let depth = 0
    while (!this.atEnd()) {
      const ch = this.peek()
      if (depth === 0 && (ch === ',' || ch === close)) return
      if (ch === '"') {
        this.skipStringBody()
        continue
      }
      if (ch === '{' || ch === '[') depth++
      else if ((ch === '}' || ch === ']') && depth > 0) depth--
      this.advance()
    }
  }

  private skipStringBody(): void {
    this.advance()
    while (!this.atEnd()) {
      const c = this.code
      if (c === 0x0a || c === 0x0d) return
      this.advance()
      if (c === 0x22) return
      if (c === 0x5c && !this.atEnd()) this.advance()
    }
  }

  // -- productions ----------------------------------------------------------

  parseDocument(): JsonNode | null {
    this.skipWs()
    let root: JsonNode | null = null
    try {
      if (this.atEnd()) this.fail(['value'], { hint: 'the document is empty' })
      root = this.parseValue()
    } catch (e) {
      if (e !== RESYNC) throw e
      return null
    }
    this.skipWs()
    if (!this.atEnd()) this.report(['end of input'], { where: 'after the top-level value' })
    return root
  }

  private parseValue(): JsonNode {
    const c = this.code
    if (c === 0x7b) return this.parseObject()
    if (c === 0x5b) return this.parseArray()
    if (c === 0x22) return this.parseString()
    if (c === 0x2d || isDigit(c)) return this.parseNumber()
    if (isWordChar(c)) return this.parseLiteral()
    if (c === 0x27) return this.fail(['value'], { hint: 'strings must use double quotes' })
    if (c === 0x2e) return this.fail(['value'], { hint: 'numbers need a digit before the decimal point' })
    if (c === 0x2b) return this.fail(['value'], { hint: 'a leading "+" is not allowed on numbers' })
    return this.fail(['value'])
  }

  private parseObject(): JsonNode {
    const start = this.mark()
    this.advance()
    const children: JsonNode[] = []
    const value: { [key: string]: JsonValue } = {}
    this.skipWs()
    if (this.peek() === '}') {
      this.advance()
      return this.finish('object', start, value, { children })
    }
    for (;;) {
      try {
        const member = this.parseMember()
        children.push(member)
        // defineProperty so a "__proto__" key becomes an own property, as JSON.parse does.
        Object.defineProperty(value, member.key!.name, {
          value: member.value,
          writable: true,
          enumerable: true,
          configurable: true,
        })
      } catch (e) {
        if (e !== RESYNC) throw e
        this.recover('}')
      }
      this.skipWs()
      const ch = this.peek()
      if (ch === ',') {
        this.advance()
        this.skipWs()
        if (this.peek() === '}') {
          this.report(['string key'], { hint: TRAILING_COMMA })
          this.advance()
          break
        }
        continue
      }
      if (ch === '}') {
        this.advance()
        break
      }
      if (ch === undefined) {
        this.report(['","', '"}"'], { where: 'after object value', hint: `the object opened at ${start.line}:${start.col} is never closed` })
        break
      }
      if (ch === '"') {
        this.report(['","', '"}"'], { where: 'after object value', hint: MISSING_COMMA })
        continue
      }
      this.report(['","', '"}"'], { where: 'after object value' })
      this.advance()
      this.recover('}')
    }
    return this.finish('object', start, value, { children })
  }

  private parseMember(): JsonNode {
    this.skipWs()
    if (this.peek() !== '"') {
      const c = this.code
      const hint =
        c === 0x27
          ? 'object keys must be double-quoted strings'
          : isWordChar(c)
            ? 'object keys must be quoted strings'
            : undefined
      this.fail(['string key'], { hint })
    }
    const keyNode = this.parseString()
    this.skipWs()
    if (this.peek() === ':') this.advance()
    else this.report(['":"'], { where: 'after object key' })
    this.skipWs()
    const node = this.parseValue()
    node.key = { name: keyNode.value as string, start: keyNode.start, end: keyNode.end, loc: keyNode.loc }
    return node
  }

  private parseArray(): JsonNode {
    const start = this.mark()
    this.advance()
    const children: JsonNode[] = []
    this.skipWs()
    if (this.peek() === ']') {
      this.advance()
      return this.finish('array', start, [], { children })
    }
    for (;;) {
      try {
        this.skipWs()
        children.push(this.parseValue())
      } catch (e) {
        if (e !== RESYNC) throw e
        this.recover(']')
      }
      this.skipWs()
      const ch = this.peek()
      if (ch === ',') {
        this.advance()
        this.skipWs()
        if (this.peek() === ']') {
          this.report(['value'], { hint: TRAILING_COMMA })
          this.advance()
          break
        }
        continue
      }
      if (ch === ']') {
        this.advance()
        break
      }
      if (ch === undefined) {
        this.report(['","', '"]"'], { where: 'after array element', hint: `the array opened at ${start.line}:${start.col} is never closed` })
        break
      }
      const c = this.code
      if (c === 0x7b || c === 0x5b || c === 0x22 || c === 0x2d || isDigit(c) || isWordChar(c)) {
        this.report(['","', '"]"'], { where: 'after array element', hint: MISSING_COMMA })
        continue
      }
      this.report(['","', '"]"'], { where: 'after array element' })
      this.advance()
      this.recover(']')
    }
    return this.finish('array', start, children.map((c) => c.value), { children })
  }

  private parseString(): JsonNode {
    const start = this.mark()
    this.advance()
    let out = ''
    let chunk = this.pos
    for (;;) {
      if (this.atEnd()) {
        this.fail(['closing "\\""'], { where: `for the string opened at ${start.line}:${start.col}` })
      }
      const c = this.code
      if (c === 0x22) {
        out += this.src.slice(chunk, this.pos)
        this.advance()
        break
      }
      if (c === 0x5c) {
        out += this.src.slice(chunk, this.pos)
        out += this.parseEscape()
        chunk = this.pos
        continue
      }
      if (c === 0x0a || c === 0x0d) {
        this.fail(['closing "\\""'], {
          where: `for the string opened at ${start.line}:${start.col}`,
          hint: 'strings cannot contain raw line breaks; write \\n instead',
        })
      }
      if (c < 0x20) {
        this.fail(['string character'], { hint: 'control characters must be escaped, e.g. \\t or \\u0009' })
      }
      this.advance()
    }
    return this.finish('string', start, out, { raw: this.src.slice(start.offset, this.pos) })
  }

  /** Cursor is on the backslash. Returns the decoded text. */
  private parseEscape(): string {
    this.advance()
    const e = this.peek()
    switch (e) {
      case '"':
      case '\\':
      case '/':
        this.advance()
        return e
      case 'b':
        this.advance()
        return '\b'
      case 'f':
        this.advance()
        return '\f'
      case 'n':
        this.advance()
        return '\n'
      case 'r':
        this.advance()
        return '\r'
      case 't':
        this.advance()
        return '\t'
      case 'u': {
        this.advance()
        let code = 0
        for (let i = 0; i < 4; i++) {
          if (!isHex(this.code)) this.fail(['hex digit'], { where: 'in \\u escape (needs exactly four)' })
          code = code * 16 + parseInt(this.peek()!, 16)
          this.advance()
        }
        // A surrogate pair arrives as two consecutive \u escapes; appending both
        // code units yields the astral character.
        return String.fromCharCode(code)
      }
      default:
        return this.fail(['escape character'], {
          hint: 'valid escapes are \\" \\\\ \\/ \\b \\f \\n \\r \\t and \\uXXXX',
        })
    }
  }

  /** RFC 8259 number grammar as a state machine: sign, int, frac, exp. */
  private parseNumber(): JsonNode {
    const start = this.mark()
    if (this.code === 0x2d) this.advance()
    // int = "0" / digit1-9 *DIGIT
    if (this.code === 0x30) {
      this.advance()
      if (isDigit(this.code)) {
        this.report(['"."', '"e"', 'end of number'], { hint: 'leading zeros are not allowed in JSON' })
        while (isDigit(this.code)) this.advance()
      }
    } else if (isDigit(this.code)) {
      while (isDigit(this.code)) this.advance()
    } else {
      this.fail(['digit'], { where: 'after "-"' })
    }
    // frac = "." 1*DIGIT
    if (this.code === 0x2e) {
      this.advance()
      if (!isDigit(this.code)) this.fail(['digit'], { where: 'after the decimal point' })
      while (isDigit(this.code)) this.advance()
    }
    // exp = ("e" / "E") ["+" / "-"] 1*DIGIT
    const e = this.code
    if (e === 0x65 || e === 0x45) {
      this.advance()
      const sign = this.code
      if (sign === 0x2b || sign === 0x2d) this.advance()
      if (!isDigit(this.code)) this.fail(['digit'], { where: 'in the exponent' })
      while (isDigit(this.code)) this.advance()
    }
    const raw = this.src.slice(start.offset, this.pos)
    return this.finish('number', start, Number(raw), { raw })
  }

  private parseLiteral(): JsonNode {
    const start = this.mark()
    let end = this.pos
    while (end < this.src.length && isWordChar(this.src.charCodeAt(end))) end++
    const word = this.src.slice(this.pos, end)
    if (word === 'true' || word === 'false' || word === 'null') {
      for (let i = 0; i < word.length; i++) this.advance()
      return word === 'null'
        ? this.finish('null', start, null, { raw: word })
        : this.finish('boolean', start, word === 'true', { raw: word })
    }
    let hint: string | undefined
    const lower = word.toLowerCase()
    if (lower === 'true' || lower === 'false' || lower === 'null') hint = `JSON literals are lowercase: ${lower}`
    else if (word === 'NaN' || word === 'Infinity' || word === 'undefined') hint = `${word} is not a JSON value`
    else {
      let i = end
      while (i < this.src.length && (this.src[i] === ' ' || this.src[i] === '\t')) i++
      if (this.src[i] === ':') hint = 'object keys must be quoted strings'
      else hint = 'bare words are not JSON; strings need double quotes'
    }
    return this.fail(['value'], { found: JSON.stringify(word), hint })
  }
}
