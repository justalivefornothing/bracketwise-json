/** Offsets at which each line starts. Line n (1-based) starts at starts[n - 1]. */
export function lineStarts(source: string): number[] {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    const ch = source.charCodeAt(i)
    if (ch === 0x0a) starts.push(i + 1)
    else if (ch === 0x0d) {
      if (source.charCodeAt(i + 1) === 0x0a) i++
      starts.push(i + 1)
    }
  }
  return starts
}

/** 1-based line containing `offset` (binary search over the line table). */
export function lineAt(starts: number[], offset: number): number {
  let lo = 0
  let hi = starts.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (starts[mid] <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1
}

export function offsetToPosition(starts: number[], offset: number): { line: number; col: number } {
  const line = lineAt(starts, offset)
  return { line, col: offset - starts[line - 1] + 1 }
}

/** Text of a 1-based line without its terminator. */
export function lineText(source: string, starts: number[], line: number): string {
  const start = starts[line - 1] ?? source.length
  const end = line < starts.length ? starts[line] : source.length
  return source.slice(start, end).replace(/\r?\n$|\r$/, '')
}
