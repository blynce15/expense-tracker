import { useCallback, useState } from 'react'
import { fetchGoalsState, goalShortfall } from '../lib/goals'
import { formatCents } from '../lib/money'
import Sheet from './Sheet'

// Before money leaves the savings accounts: if it would use money set aside in goals, ask which
// goal(s) it comes out of. `guard(before, after)` resolves to the picks ([] when no goal is
// touched) or null if the person cancelled; render `picker` somewhere in the screen.
// The caller takes the money out of the goals (takeFromGoals) before saving.
export function useGoalGuard() {
  const [ask, setAsk] = useState(null) // { need, goals, resolve }

  const guard = useCallback(async (before, after) => {
    const state = await fetchGoalsState()
    const need = goalShortfall(state, before, after)
    if (need === 0) return []
    return new Promise((resolve) => setAsk({ need, goals: state.goals.filter((g) => g.saved_cents > 0), resolve }))
  }, [])

  const picker = ask && (
    <GoalPicker
      need={ask.need}
      goals={ask.goals}
      onDone={(picks) => {
        ask.resolve(picks)
        setAsk(null)
      }}
    />
  )
  return { guard, picker }
}

function GoalPicker({ need, goals, onDone }) {
  const [picked, setPicked] = useState(new Map()) // goal id → cents
  const chosen = [...picked.values()].reduce((s, c) => s + c, 0)
  const remaining = need - chosen

  function toggle(g) {
    const next = new Map(picked)
    if (next.has(g.id)) next.delete(g.id)
    else if (remaining > 0) next.set(g.id, Math.min(g.saved_cents, remaining))
    setPicked(next)
  }

  return (
    <Sheet title="Take it from a goal" onClose={() => onDone(null)}>
      <div className="space-y-4">
        <p className="text-muted">
          <span className="tabular font-semibold text-ink">{formatCents(need)}</span> of this money is set aside in your goals. Choose which goal it comes out of.
        </p>
        <ul className="overflow-hidden rounded-2xl bg-card">
          {goals.map((g) => {
            const cents = picked.get(g.id)
            return (
              <li key={g.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => toggle(g)}
                  aria-pressed={cents !== undefined}
                  disabled={cents === undefined && remaining === 0}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left disabled:opacity-50"
                >
                  <span className="text-2xl leading-none">{g.icon || '🐷'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-medium">{g.name}</span>
                    <span className="tabular block text-sm text-muted">{formatCents(g.saved_cents)} in this goal</span>
                  </span>
                  {cents !== undefined ? (
                    <span className="tabular shrink-0 rounded-full bg-loss/10 px-2.5 py-1 text-sm font-bold text-loss">−{formatCents(cents)}</span>
                  ) : (
                    <span className="size-6 shrink-0 rounded-full border-2 border-line" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <p className={`tabular text-center text-sm font-semibold ${remaining > 0 ? 'text-muted' : 'text-gain'}`}>
          {remaining > 0 ? `Still ${formatCents(remaining)} to choose` : 'All set'}
        </p>
        <button
          onClick={() => onDone([...picked].map(([id, c]) => ({ goal: goals.find((g) => g.id === id), cents: c })))}
          disabled={remaining > 0}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </Sheet>
  )
}
