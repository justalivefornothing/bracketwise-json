import { describe, expect, it } from 'vitest'
import { ParseError, analyze, parse, parseTolerant } from './parser'
import { formatDiagnostic } from './format'

describe('parse — values', () => {
  it('evaluates nested objects and arrays', () => {
    expect(parse('{"a":[1,2.5e3,true,null]}').value).toEqual({ a: [1, 2500, true, null] })
  })

  it('decodes \\u surrogate pairs into one astral character', () => {
    expect(parse('"\\ud83d\\ude00"').value).toBe('😀')
  })

  it('decodes every simple escape', () => {
    expect(parse('"\\" \\\\ \\/ \\b \\f \\n \\r \\t \\u00e9"').value).toBe('" \\ / \b \f \n \r \t é')
  })

  it('handles the full number grammar', () => {
    const cases: Array<[string, number]> = [
      ['0', 0],
      ['-0', -0],
      ['42', 42],
      ['-17', -17],
      ['3.25', 3.25],
      ['1e3', 1000],
      ['1E-2', 0.01],
      ['-2.5e+2', -250],
    ]
    for (const [src, n] of cases) expect(parse(src).value).toBe(n)
    expect(parse('2.5e3').raw).toBe('2.5e3')
  })

  it('parses literals and empty containers', () => {
    expect(parse('true').value).toBe(true)
    expect(parse('false').value).toBe(false)
    expect(parse('null').value).toBe(null)
    expect(parse('{}').value).toEqual({})
    expect(parse('[]').value).toEqual([])
    expect(parse(' \n\t [ ]\r\n').value).toEqual([])
  })

  it('treats a "__proto__" key as an ordinary own property', () => {
    const v = parse('{"__proto__": {"polluted": 1}}').value as Record<string, unknown>
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype)
    expect(Object.hasOwn(v, '__proto__')).toBe(true)
  })
})

describe('parse — positions', () => {
  it('records offsets and line/col for nested nodes', () => {
    //                   col: 1234567890123456 7
    const root = parse('{"x":{"y":[0,1]}}')
    const inner = root.children![0]
    const arr = inner.children![0]
    const one = arr.children![1]
    expect(inner.key).toMatchObject({ name: 'x', start: 1, end: 4 })
    expect(arr.loc).toEqual({ start: { line: 1, col: 11 }, end: { line: 1, col: 16 } })
    // The spec sketch quoted 1:12–1:17 for this path; counting the source above,
    // the second array element `1` is the 14th character and is one column wide.
    expect(one.loc).toEqual({ start: { line: 1, col: 14 }, end: { line: 1, col: 15 } })
    expect([one.start, one.end]).toEqual([13, 14])
    expect(root.loc.end).toEqual({ line: 1, col: 18 })
  })

  it('tracks lines across \\n and \\r\\n', () => {
    const root = parse('{\r\n  "a": [\n    1,\n    "two"\n  ]\n}')
    const arr = root.children![0]
    expect(arr.loc.start).toEqual({ line: 2, col: 8 })
    expect(arr.children![1].loc).toEqual({ start: { line: 4, col: 5 }, end: { line: 4, col: 10 } })
    expect(root.loc.end).toEqual({ line: 6, col: 2 })
  })
})

describe('parse — errors', () => {
  it('rejects a trailing comma with the exact position', () => {
    expect(() => parse('{"a":1,}')).toThrow(/Unexpected "}" at 1:8/)
  })

  it('exposes structured error fields', () => {
    let err: ParseError | undefined
    try {
      parse('{"a": 1 "b": 2}')
    } catch (e) {
      err = e as ParseError
    }
    expect(err).toBeInstanceOf(ParseError)
    expect(err).toMatchObject({ offset: 8, line: 1, col: 9, expected: ['","', '"}"'], found: `'"'` })
    expect(err!.message).toMatch(/expected "," or "}" after object value/)
  })

  const bad: Array<[string, RegExp]> = [
    ['', /Unexpected end of input at 1:1: expected value/],
    ['[1,,2]', /Unexpected "," at 1:4: expected value/],
    ['{"a" 1}', /Unexpected "1" at 1:6: expected ":" after object key/],
    ['{a: 1}', /Unexpected "a" at 1:2: expected string key — object keys must be quoted strings/],
    ["{'a': 1}", /Unexpected "'" at 1:2/],
    ['[01]', /Unexpected digit "1" at 1:3: .*leading zeros/],
    ['[1.]', /Unexpected "\]" at 1:4: expected digit after the decimal point/],
    ['[1e]', /Unexpected "\]" at 1:4: expected digit in the exponent/],
    ['[-]', /Unexpected "\]" at 1:3: expected digit after "-"/],
    ['[tru]', /Unexpected "tru" at 1:2: expected value/],
    ['[True]', /JSON literals are lowercase: true/],
    ['[NaN]', /NaN is not a JSON value/],
    ['"abc', /Unexpected end of input at 1:5: expected closing "\\"" for the string opened at 1:1/],
    ['"a\nb"', /Unexpected line break at 1:3: .*raw line breaks/],
    ['"\\x"', /Unexpected "x" at 1:3: expected escape character/],
    ['"\\u12G4"', /Unexpected "G4" at 1:6: expected hex digit/],
    ['"\t"', /control character U\+0009/],
    ['[1] 2', /Unexpected "2" at 1:5: expected end of input after the top-level value/],
    ['{"a":1} // hi', /comments are not allowed in JSON/],
    ['{\n  "a": 1,\n  "b": 2 "c"', /Unexpected '"' at 3:10: expected "," or "}"/],
  ]
  for (const [src, re] of bad) {
    it(`reports ${JSON.stringify(src)}`, () => {
      expect(() => parse(src)).toThrow(re)
    })
  }

  it('formats an excerpt with a caret under the offending character', () => {
    const src = '{\n  "a": 1,\n  "b": 2 "c": 3\n}'
    const { diagnostics } = analyze(src, false)
    expect(formatDiagnostic(src, diagnostics[0])).toBe(
      [
        `Unexpected '"' at 3:10: expected "," or "}" after object value — looks like a missing ","`,
        ' 3 |   "b": 2 "c": 3',
        '   |          ^',
      ].join('\n'),
    )
  })
})

describe('parseTolerant', () => {
  it('records a trailing comma as a single warning', () => {
    expect(parseTolerant('[1,2,]').diagnostics).toHaveLength(1)
  })

  it('keeps the value when recovering from trailing commas and comments', () => {
    const src = '// config\n{\n  "a": [1, 2,], /* two */\n  "b": true,\n}'
    const { root, diagnostics } = parseTolerant(src)
    expect(root!.value).toEqual({ a: [1, 2], b: true })
    expect(diagnostics.map((d) => d.severity)).toEqual(['warning', 'warning', 'warning', 'warning'])
    expect(diagnostics.map((d) => `${d.line}:${d.col}`)).toEqual(['1:1', '3:14', '3:17', '5:1'])
  })

  it('collects several independent errors instead of stopping at the first', () => {
    const src = '{"a": tru, "b": [1 2], "c": 007, "d": "ok"}'
    const { root, diagnostics } = parseTolerant(src)
    expect(diagnostics).toHaveLength(3)
    expect(diagnostics.map((d) => d.col)).toEqual([7, 20, 30])
    expect(root!.value).toEqual({ b: [1, 2], c: 7, d: 'ok' })
  })

  it('resyncs past garbage that contains nested brackets and strings', () => {
    const { root, diagnostics } = parseTolerant('[1, ?{"x": [1,2]}, 3]')
    expect(root!.value).toEqual([1, 3])
    expect(diagnostics).toHaveLength(1)
  })

  it('reports an unterminated container once', () => {
    const { root, diagnostics } = parseTolerant('{"a": [1, 2')
    expect(root!.value).toEqual({ a: [1, 2] })
    expect(diagnostics.map((d) => d.message)).toEqual([
      'Unexpected end of input at 1:12: expected "," or "]" after array element — the array opened at 1:7 is never closed',
      'Unexpected end of input at 1:12: expected "," or "}" after object value — the object opened at 1:1 is never closed',
    ])
  })

  it('returns a null root for an empty document', () => {
    const { root, diagnostics } = parseTolerant('  ')
    expect(root).toBeNull()
    expect(diagnostics).toHaveLength(1)
  })
})
