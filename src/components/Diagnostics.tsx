import type { Diagnostic } from '../core/parser'
import { excerptFor } from '../core/format'

interface Props {
  source: string
  diagnostics: Diagnostic[]
  tolerant: boolean
  stats: { nodes: number; ms: number } | null
  onJump: (offset: number) => void
}

export function Diagnostics({ source, diagnostics, tolerant, stats, onJump }: Props) {
  const count = diagnostics.length
  const title = count === 0 ? 'No problems' : tolerant ? `${count} warning${count === 1 ? '' : 's'} (recovered)` : '1 error'

  return (
    <section aria-label="Diagnostics" aria-live="polite" className="border-t border-rule bg-paper-deep/50">
      <header className="flex items-center gap-2 px-3 py-1.5 text-[11px] font-medium tracking-wide text-ink-soft uppercase">
        <span className={'inline-block h-2 w-2 rounded-full ' + (count === 0 ? 'bg-sage-deep' : tolerant ? 'bg-amber' : 'bg-error')} />
        {title}
        {stats && (
          <span className="ml-auto font-mono text-[11px] font-normal tracking-normal normal-case text-ink-faint">
            {stats.nodes} nodes · {stats.ms < 0.05 ? '<0.1' : stats.ms.toFixed(1)} ms
          </span>
        )}
      </header>
      {count > 0 && (
        <ul className="scroll-warm max-h-52 overflow-auto px-2 pb-2">
          {diagnostics.map((d, i) => {
            const ex = excerptFor(source, d)
            return (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => onJump(d.offset)}
                  className="group w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-paper focus-visible:bg-paper focus-visible:outline-2 focus-visible:outline-amber"
                  title="Jump to this position"
                >
                  <div className="font-mono text-[12px] leading-5 text-ink">
                    <span className={d.severity === 'error' ? 'text-error' : 'text-amber-deep'}>{d.severity === 'error' ? 'error' : 'warning'}</span>
                    <span className="text-ink-faint"> · </span>
                    {ex.message}
                  </div>
                  <pre className="mt-1 overflow-x-auto font-mono text-[12px] leading-5">
                    <span className="text-ink-faint">{String(ex.line).padStart(3)} │ </span>
                    <span>{ex.excerpt}</span>
                    {'\n'}
                    <span className="text-ink-faint">{'    │ '}</span>
                    <span className="font-bold text-error">{ex.caret}</span>
                  </pre>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
