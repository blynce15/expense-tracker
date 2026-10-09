import { useState } from 'react'
import { shortDate } from '../lib/filters'
import { todayISO } from '../lib/dates'
import Icon from './Icon'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const pad = (n) => String(n).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`

// Month calendar for picking a date range: tap the first day, then the last day.
// `from`/`to` and onChange({ from, to }) use "YYYY-MM-DD"; the range is always valid (to >= from).
export default function RangeCalendar({ from, to, onChange }) {
  const today = todayISO()
  const [next, setNext] = useState('from') // which end the next tap sets
  const [year, month] = from.split('-').map(Number)
  const [view, setView] = useState({ year, month: month - 1 })

  const first = new Date(view.year, view.month, 1)
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
  const leadingBlanks = (first.getDay() + 6) % 7 // Monday = 0
  const monthLabel = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

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
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {['from', 'to'].map((k) => (
          <button
            key={k}
            onClick={() => setNext(k)}
            aria-pressed={next === k}
            className={`rounded-2xl border-[1.5px] bg-card px-4 py-2.5 text-left ${next === k ? 'border-cobalt' : 'border-line'}`}
          >
            <span className="block text-xs text-muted">{k === 'from' ? 'From' : 'To'}</span>
            <span className="block text-base font-semibold">{shortDate(k === 'from' ? from : to)}</span>
          </button>
        ))}
      </div>

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
            const isStart = iso === from
            const isEnd = iso === to
            const inside = iso > from && iso < to
            const col = (leadingBlanks + i) % 7
            // The light band joins the days of the range; it stops at the row edges
            const band =
              from !== to && (inside || isStart || isEnd)
                ? `${isStart || col === 0 || i === 0 ? 'rounded-l-full' : ''} ${isEnd || col === 6 || i === daysInMonth - 1 ? 'rounded-r-full' : ''} ${isStart ? 'ml-[calc(50%-20px)]' : ''} ${isEnd ? 'mr-[calc(50%-20px)]' : ''} bg-cobalt/10`
                : ''
            return (
              <div key={iso} className="my-0.5">
                <div className={band}>
                  <button
                    onClick={() => pick(iso)}
                    aria-pressed={isStart || isEnd || inside}
                    aria-label={iso}
                    className={`tabular mx-auto grid size-10 place-items-center rounded-full text-base font-medium ${
                      isStart || isEnd
                        ? 'bg-cobalt text-white'
                        : inside
                          ? 'text-cobalt'
                          : iso === today
                            ? 'text-cobalt ring-2 ring-cobalt/40'
                            : ''
                    }`}
                  >
                    {i + 1}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="px-1 text-sm text-muted">
        {next === 'to' ? 'Now tap the last day.' : 'Tap the first day, then the last day.'}
      </p>
    </div>
  )
}
