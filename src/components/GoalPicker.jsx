import { GENERAL } from '../lib/goals'

// Which savings goal money goes into or comes out of. null = General savings.
// Shown wherever a transaction moves money into or out of a savings account.
export default function GoalPicker({ goals, value, onChange, direction }) {
  const options = [GENERAL, ...goals]
  return (
    <div>
      <h3 className="px-1 pb-2 font-display text-base font-bold">{direction < 0 ? 'Comes out of goal' : 'Goes into goal'}</h3>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {options.map((g) => (
          <button
            key={g.id ?? 'general'}
            type="button"
            onClick={() => onChange(g.id)}
            aria-pressed={value === g.id}
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-3.5 text-sm font-semibold whitespace-nowrap ${
              value === g.id ? 'border-cobalt bg-cobalt/10' : 'border-transparent bg-card'
            }`}
          >
            <span className="text-base leading-none">{g.icon || '🐷'}</span>
            {g.name}
          </button>
        ))}
      </div>
    </div>
  )
}
