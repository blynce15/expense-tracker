import { useEffect, useRef } from 'react'
import { goalColor } from '../lib/goalColors'
import { GENERAL } from '../lib/goals'

// Which savings goal money goes into or comes out of. null = General savings.
// Shown wherever a transaction moves money into or out of a savings account.
// Chips in each goal's own colour; the picked one is ringed and scrolled into view.
export default function GoalPicker({ goals, value, onChange, direction, base = 'var(--color-card)' }) {
  const options = [GENERAL, ...goals]
  const picked = useRef(null)

  useEffect(() => {
    const el = picked.current
    if (el) el.parentElement.scrollLeft = el.offsetLeft - 60
  }, [])

  return (
    <div>
      <h3 className="px-1 pb-2 text-xs font-bold tracking-[0.07em] text-muted uppercase">
        {direction < 0 ? 'Comes out of goal' : 'Goes into goal'}
      </h3>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {options.map((g) => {
          const on = value === g.id
          const color = goalColor(g.icon)
          return (
            <button
              key={g.id ?? 'general'}
              ref={on ? picked : null}
              type="button"
              onClick={() => onChange(g.id)}
              aria-pressed={on}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm font-semibold whitespace-nowrap transition-colors"
              style={{
                background: on ? `color-mix(in srgb, ${color} 13%, ${base})` : base,
                boxShadow: on ? `inset 0 0 0 2px ${color}` : undefined,
              }}
            >
              <span
                className="grid size-8 place-items-center rounded-full text-base leading-none"
                style={{ background: on ? color : `color-mix(in srgb, ${color} 16%, transparent)` }}
              >
                {g.icon || '🐷'}
              </span>
              {g.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
