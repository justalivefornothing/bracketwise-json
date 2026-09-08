import { describe, expect, it } from 'vitest'
import { parse, parseTolerant } from './parser'
import { printJson, quote } from './print'

describe('quote', () => {
  it('escapes only what RFC 8259 requires', () => {
    expect(quote('plain')).toBe('"plain"')
    expect(quote('say "hi"\\')).toBe('"say \\"hi\\"\\\\"')
    expect(quote('\b\f\n\r\t')).toBe('"\\b\\f\\n\\r\\t\\u0001"')
    expect(quote('é 😀 /')).toBe('"é 😀 /"')
  })
})

describe('printJson', () => {
  const src = '{"name":"Bracketwise","tags":["json",  "parser"],"n":2.5e3,"ok":true,"none":null,"empty":{},"list":[]}'

  it('pretty-prints with two-space indent by default', () => {
    expect(printJson(parse(src))).toBe(
      [
        '{',
        '  "name": "Bracketwise",',
        '  "tags": [',
        '    "json",',
        '    "parser"',
        '  ],',
        '  "n": 2.5e3,',
        '  "ok": true,',
        '  "none": null,',
        '  "empty": {},',
        '  "list": []',
        '}',
      ].join('\n'),
    )
  })

  it('supports other indents and tabs', () => {
    expect(printJson(parse('[1,[2]]'), { indent: 4 })).toBe('[\n    1,\n    [\n        2\n    ]\n]')
    expect(printJson(parse('{"a":1}'), { indent: 'tab' })).toBe('{\n\t"a": 1\n}')
  })

  it('minifies', () => {
    expect(printJson(parse(src), { minify: true })).toBe(
      '{"name":"Bracketwise","tags":["json","parser"],"n":2.5e3,"ok":true,"none":null,"empty":{},"list":[]}',
    )
  })

  it('round-trips through the parser', () => {
    const out = printJson(parse(src))
    expect(parse(out).value).toEqual(parse(src).value)
  })

  it('normalises numbers whose source spelling is not valid JSON', () => {
    const { root } = parseTolerant('[007, 1.50]')
    expect(printJson(root!, { minify: true })).toBe('[7,1.50]')
  })
})
