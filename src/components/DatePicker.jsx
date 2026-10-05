import { useState } from 'react'
import { shiftDays, todayISO } from '../lib/dates'
import Icon from './Icon'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const pad = (n) => String(n).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

// Month calendar (weeks start on Monday). `value` and `onChange` use "YYYY-MM-DD".
// `dimFuture` greys out days after today (for past events like transactions).
export default function DatePicker({ value, onChange, dimFuture = true, quickPicks = true }) {
  const today = todayISO()
  const yesterday = shiftDays(today, -1)
  const [year, month] = value.split('-').map(Number)
  const [view, setView] = useState({ year, month: month - 1 })

  const first = new Date(view.year, view.month, 1)
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const leadingBlanks = (first.getDay() + 6) % 7 // Monday = 0
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  function moveMonth(delta) {
    const d = new Date(view.year, view.month + delta, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }

  const quick = [
    { label: 'Today', iso: today },
    { label: 'Yesterday', iso: yesterday },
  ]

  return (
    <div className="space-y-4">
      {quickPicks && (
        <div className="grid grid-cols-2 gap-2">
          {quick.map((q) => (
            <button
              key={q.label}
              onClick={() => onChange(q.iso)}
              aria-pressed={value === q.iso}
              className={`rounded-xl py-3 text-base font-semibold ${value === q.iso ? 'bg-cobalt text-white' : 'bg-card'}`}
            >
              {q.label}
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-card p-3">
        <div className="mb-2 flex items-center">
          <button onClick={() => moveMonth(-1)} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Previous month">
            <Icon name="chevronLeft" />
          </button>
          <p className="flex-1 text-center font-display text-lg font-bold">{monthLabel}</p>
          <button onClick={() => moveMonth(1)} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Next month">
            <Icon name="chevronRight" />
          </button>
        </div>

        <div className="grid grid-cols-7 text-center">
          {WEEKDAYS.map((w) => (
            <span key={w} className="pb-1 text-xs font-medium text-muted">
              {w}
            </span>
          ))}
          {Array.from({ length: leadingBlanks }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const iso = toISO(view.year, view.month, i + 1)
            const selected = iso === value
            const isToday = iso === today
            return (
              <button
                key={iso}
                onClick={() => onChange(iso)}
                aria-pressed={selected}
                aria-label={iso}
                className={`tabular mx-auto my-0.5 grid size-10 place-items-center rounded-full text-base font-medium ${
                  selected ? 'bg-cobalt text-white' : isToday ? 'text-cobalt ring-2 ring-cobalt/40' : dimFuture && iso > today ? 'text-muted/60' : ''
                }`}
              >
                {i + 1}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
