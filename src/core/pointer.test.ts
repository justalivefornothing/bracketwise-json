import { describe, expect, it } from 'vitest'
import { parse } from './parser'
import { ancestors, escapeToken, indexTree, nodeAt, toPointer } from './pointer'

describe('JSON Pointer', () => {
  it('escapes ~ and / per RFC 6901', () => {
    expect(escapeToken('a/b~c')).toBe('a~1b~0c')
    expect(toPointer([])).toBe('')
    expect(toPointer(['m~n', 0, 'a/b', ''])).toBe('/m~0n/0/a~1b/')
  })

  it('assigns a pointer to every node', () => {
    const idx = indexTree(parse('{"a": {"b/c": [10, 20]}, "": null}'))
    expect(idx.infos.map((i) => i.pointer)).toEqual(['', '/a', '/a/b~1c', '/a/b~1c/0', '/a/b~1c/1', '/'])
    expect(idx.byPointer.get('/a/b~1c/1')!.node.value).toBe(20)
    expect(idx.byPointer.get('/a/b~1c/1')!.depth).toBe(3)
    expect(ancestors(idx.byPointer.get('/a/b~1c/1')!).map((i) => i.pointer)).toEqual(['', '/a', '/a/b~1c'])
  })
})

describe('interval lookup', () => {
  //            0         1         2
  //            012345678901234567890123456
  const src = '{ "x": {"y": [0, 12]}, "z": 5 }'
  const idx = indexTree(parse(src))

  it('builds disjoint, sorted segments covering the root range', () => {
    const segs = idx.segments
    for (let i = 1; i < segs.length; i++) {
      expect(segs[i].start).toBeGreaterThanOrEqual(segs[i - 1].end)
    }
    expect(segs[0].start).toBe(0)
    expect(segs[segs.length - 1].end).toBe(src.length)
  })

  it('maps offsets to the deepest node, keys included', () => {
    const at = (o: number) => nodeAt(idx.segments, o)?.pointer
    expect(at(0)).toBe('')
    expect(at(1)).toBe('') // whitespace inside the object
    expect(at(2)).toBe('/x') // the "x" key belongs to its value
    expect(at(7)).toBe('/x') // the inner "{"
    expect(at(13)).toBe('/x/y') // "["
    expect(at(14)).toBe('/x/y/0')
    expect(at(17)).toBe('/x/y/1')
    expect(at(18)).toBe('/x/y/1')
    expect(at(19)).toBe('/x/y') // "]"
    expect(at(21)).toBe('') // the comma between members
    expect(at(28)).toBe('/z')
    expect(at(30)).toBe('')
    expect(at(31)).toBeUndefined()
    expect(nodeAt(idx.segments, -1)).toBeNull()
  })
})
