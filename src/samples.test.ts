import { describe, expect, it } from 'vitest'
import { SAMPLES } from './samples'
import { parse, parseTolerant } from './core/parser'

const byId = (id: string) => SAMPLES.find((s) => s.id === id)!.text

describe('built-in samples', () => {
  it('ships six documents, three of them broken', () => {
    expect(SAMPLES).toHaveLength(6)
    expect(SAMPLES.filter((s) => s.broken)).toHaveLength(3)
  })

  it('valid samples parse strictly with no diagnostics', () => {
    for (const s of SAMPLES.filter((s) => !s.broken)) {
      expect(() => parse(s.text)).not.toThrow()
      expect(parseTolerant(s.text).diagnostics).toEqual([])
    }
    expect((parse(byId('escapes')).value as { emoji: string }).emoji).toBe('😀 grinning face')
  })

  const broken: Array<[string, RegExp, string[], unknown]> = [
    ['trailing', /^Unexpected "\]" at 3:42: expected value — trailing commas/, ['3:42', '4:3', '6:1'], { theme: 'paper', fonts: ['JetBrains Mono', 'Fraunces'], indent: 2 }],
    ['commas', /^Unexpected '"' at 3:3: expected "," or "}" after object value/, ['3:3', '4:3', '5:16'], { id: 42, label: 'forty-two', tags: ['a', 'b'] }],
    ['strings', /^Unexpected digit "1" at 2:13: .*leading zeros/, ['2:13', '3:12', '4:9', '5:31'], { price: 19.99 }],
  ]
  for (const [id, first, positions, value] of broken) {
    it(`${id}: strict stops at the first error, tolerant recovers the rest`, () => {
      expect(() => parse(byId(id))).toThrow(first)
      const { root, diagnostics } = parseTolerant(byId(id))
      expect(diagnostics.map((d) => `${d.line}:${d.col}`)).toEqual(positions)
      expect(root!.value).toEqual(value)
    })
  }
})
