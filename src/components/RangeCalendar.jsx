import { useState } from 'react'
import { todayISO } from '../lib/dates'
import { describeDate } from '../lib/filters'
import Icon from './Icon'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const pad = (n) => String(n).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`
const BAND = 'color-mix(in srgb, var(--color-cobalt) 13%, transparent)'

// Month calendar for picking a date range: tap the first day, then the last day.
// `from`/`to` and onChange({ from, to }) use "YYYY-MM-DD"; the range is always valid (to >= from).
// The range shows as one light band with round ends; days after today are faded.
export default function RangeCalendar({ from, to, onChange }) {
  const today = todayISO()
  const [next, setNext] = useState('from') // which end the next tap sets
  const [year, month] = from.split('-').map(Number)
  const [view, setView] = useState({ year, month: month - 1 })

  const first = new Date(view.year, view.month, 1)
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const leadingBlanks = (first.getDay() + 6) % 7 // Monday = 0
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1

  function moveMonth(delta) {
    const d = new Date(view.year, view.month + delta, 1)
    setView({ year: d.getFullYear(), month: d.getMonth() })
  }

  function pick(iso) {
    if (next === 'from' || iso < from) {
      onChange({ from: iso, to: iso })
      setNext('to')
    } else {
      onChange({ from, to: iso })
      setNext('from')
    }
  }

  return (
    <div className="mt-2.5 rounded-[18px] bg-paper px-2 pt-2.5 pb-2">
      <div className="mb-1.5 flex items-center px-0.5">
        <button onClick={() => moveMonth(-1)} className="grid size-9 place-items-center rounded-full bg-card text-muted" aria-label="Previous month">
          <Icon name="chevronLeft" size={18} />
        </button>
        <p className="flex-1 text-center font-display text-base font-bold">{monthLabel}</p>
        <button onClick={() => moveMonth(1)} className="grid size-9 place-items-center rounded-full bg-card text-muted" aria-label="Next month">
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-[3px] text-center">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-[11px] font-bold text-muted">
            {w}
          </span>
        ))}
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const iso = toISO(view.year, view.month, i + 1)
          const isStart = iso === from
          const isEnd = iso === to
          const inside = iso > from && iso < to
          const col = (leadingBlanks + i) % 7
          const rowStart = col === 0 || i === 0
          const rowEnd = col === 6 || i === daysInMonth - 1
          // The band joins the days of the range: full under days inside (rounded at the row edges),
          // half under the first and last day so it meets their circles
          let band
          if (from !== to && inside) band = { background: BAND, borderRadius: `${rowStart ? 19 : 0}px ${rowEnd ? 19 : 0}px ${rowEnd ? 19 : 0}px ${rowStart ? 19 : 0}px` }
          else if (from !== to && isStart && !rowEnd) band = { background: `linear-gradient(90deg, transparent 50%, ${BAND} 50%)` }
          else if (from !== to && isEnd && !rowStart) band = { background: `linear-gradient(90deg, ${BAND} 50%, transparent 50%)` }
          const end = isStart || isEnd
          return (
            <div key={iso} className="grid h-[38px] place-items-center" style={band}>
              <button
                onClick={() => pick(iso)}
                aria-pressed={end || inside}
                aria-label={iso}
                className={`tabular grid size-9 place-items-center rounded-full text-[14.5px] font-semibold ${
                  end
                    ? 'bg-cobalt text-white shadow-[0_6px_12px_-6px_var(--color-cobalt)]'
                    : inside
                      ? 'text-cobalt'
                      : iso === today
                        ? 'text-cobalt shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--color-cobalt)_45%,transparent)]'
                        : ''
                } ${iso > today && !end && !inside ? 'opacity-35' : ''}`}
              >
                {i + 1}
              </button>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between px-1.5 pt-2 text-[13px]">
        <span className="tabular font-semibold">{describeDate({ preset: 'custom', from, to })}</span>
        <span className="tabular text-muted">
          {days} {days === 1 ? 'day' : 'days'}
        </span>
      </div>
    </div>
  )
}
