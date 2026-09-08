# Bracketwise — plan

A hand-written JSON parser that reports exact `line:column` errors with a caret,
and renders the result as a collapsible AST with hover-to-highlight source ranges.

## Goal

Show, end to end, what a real parser does with a document: a from-scratch
recursive-descent parser (RFC 8259) whose every node carries source offsets and
line/column positions, and a small React UI that makes those positions tangible —
hover a tree node and its exact byte range lights up in the source; break the
document and a red caret appears under the offending character.

## Features (all required)

1. Recursive-descent parser: objects, arrays, strings with all escapes including
   `\uXXXX` surrogate pairs, numbers via an RFC grammar state machine, `true`/`false`/`null`.
2. Every node has `start`/`end` offsets plus `loc: {start:{line,col}, end:{line,col}}`;
   errors carry position, a one-line excerpt and a caret.
3. Collapsible tree with type badges, key counts and string/number previews;
   click a node to select its source range.
4. Bidirectional hover: source -> tree, tree -> source.
5. JSON Pointer (RFC 6901) for the selected node, with a copy button.
6. Tolerant mode: recover from trailing commas and comments, collect all errors
   as warnings instead of throwing at the first one.
7. Pretty-print / minify panel driven by the AST (not `JSON.stringify`), with
   configurable indent.
8. Six built-in samples, including broken documents for the common error classes.

## Architecture

```
src/
  core/
    lines.ts      line-start table; offset <-> {line,col}
    parser.ts     Cursor, ParseError, Diagnostic, parse(), parseTolerant()
    pointer.ts    JSON Pointer escaping, node index, flat interval list + binary search
    print.ts      AST-driven pretty printer / minifier
    format.ts     one-line excerpt + caret for a diagnostic
  components/
    Editor.tsx    textarea over a highlight mirror; grid math maps mouse -> offset
    Tree.tsx      collapsible rows (grid-template-rows 0fr -> 1fr, 120 ms)
    Diagnostics.tsx, Inspector.tsx, OutputPanel.tsx, Toolbar.tsx
  samples.ts
  App.tsx
```

Parser: single pass over the UTF-16 string. A cursor tracks `offset`, `line`,
`col`. Each production (`parseValue`, `parseObject`, `parseArray`, `parseString`,
`parseNumber`, `parseLiteral`) returns a node `{type, start, end, loc, value, children?, key?}`.
Errors are `ParseError {offset, line, col, expected[], found}`. In tolerant mode the
throw becomes a recorded diagnostic plus a resync (skip to the next `,`, `]` or `}`).

Hover lookup: the tree is flattened into disjoint intervals, each owned by the
deepest node covering it; a binary search on the interval starts gives O(log n)
offset -> node.

## Milestones

- [ ] chore: plan, license, gitignore
- [ ] chore: scaffold vite-react + tailwind + vitest
- [ ] feat: parser core + tests
- [ ] feat: pointer index, interval lookup, printer
- [ ] feat: editor with hover mapping + tree view
- [ ] feat: tolerant mode, diagnostics, output panel, samples
- [ ] fix: polish after smoke run
- [ ] docs: readme
