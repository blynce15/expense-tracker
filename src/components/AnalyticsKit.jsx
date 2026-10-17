import { useState } from 'react'
import Icon from './Icon'
import { currentPeriod, isCurrentPeriod, periodLabel, shiftPeriod } from '../lib/analytics'
import { formatCents } from '../lib/money'

// Pieces shared by the Analytics page and its details pages

// The chosen Month/Year period, kept while the app is open so a details page and the main
// page show the same one
let rememberedPeriod = null
export function usePeriod() {
  const [period, setPeriod] = useState(() => rememberedPeriod ?? currentPeriod('month'))
  const set = (next) => {
    rememberedPeriod = next
    setPeriod(next)
  }
  return [period, set]
}
// Back to this month (the overview always shows now; its details pages then start there)
export function resetPeriod() {
  rememberedPeriod = null
}

// "€2.400" (no cents), for compact numbers
export const whole = (cents) => formatCents(Math.round(cents)).replace(/,\d\d$/, '')
export const pct = (ratio) => `${Math.round(ratio * 100)}%`

export function PeriodBar({ period, onChange }) {
  const atNow = isCurrentPeriod(period)
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center rounded-2xl bg-card p-1">
        <button onClick={() => onChange(shiftPeriod(period, -1))} className="grid h-10 w-9 place-items-center rounded-xl text-ink" aria-label="Previous">
          <Icon name="chevronLeft" />
        </button>
        <p className="flex-1 truncate text-center font-display text-base font-bold">{periodLabel(period)}</p>
        <button onClick={() => onChange(shiftPeriod(period, 1))} disabled={atNow} className="grid h-10 w-9 place-items-center rounded-xl disabled:text-line" aria-label="Next">
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="flex shrink-0 rounded-2xl bg-line/60 p-1" role="tablist">
        {['month', 'year'].map((kind) => (
          <button
            key={kind}
            role="tab"
            aria-selected={period.kind === kind}
            onClick={() => period.kind !== kind && onChange(currentPeriod(kind))}
            className={`rounded-xl px-2.5 py-2 text-[13px] font-semibold ${period.kind === kind ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
          >
            {kind === 'month' ? 'Month' : 'Year'}
          </button>
        ))}
      </div>
    </div>
  )
}
