import { useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import { monthRange, todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'

const MONTHS_SHOWN = 6

// "2026-10" style month keys
const monthKey = (iso) => iso.slice(0, 7)
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const monthLabel = (key, opts = { month: 'long', year: 'numeric' }) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', opts)

// Short amounts for chart labels: €1,2k / €85
function compactCents(cents) {
  const euros = cents / 100
  if (euros >= 1000) return `€${(euros / 1000).toFixed(1).replace('.', ',')}k`
  return `€${Math.round(euros)}`
}

export default function Analytics() {
  const thisMonth = monthKey(todayISO())
  const [month, setMonth] = useState(thisMonth)
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [error, setError] = useState(null)

  // Load the selected month plus the months before it (for the month-by-month chart)
  useEffect(() => {
    let cancelled = false
    const from = `${shiftMonth(month, -(MONTHS_SHOWN - 1))}-01`
    const [, to] = monthRange(`${month}-01`)
    Promise.all([
      fetchLookups(),
      supabase.from('transactions').select('type, amount_cents, date, category_id').neq('type', 'transfer').gte('date', from).lte('date', to),
    ])
      .then(([data, tx]) => {
        if (tx.error) throw tx.error
        if (cancelled) return
        setLookups(data)
        setRows(tx.data)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [month])

  const stats = useMemo(() => (rows ? buildStats(rows, month) : null), [rows, month])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load analytics: {error}</p>

  return (
    <div className="space-y-5 px-4 pt-1 pb-6">
      <div className="flex items-center rounded-2xl bg-card p-1">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="grid size-11 place-items-center rounded-xl" aria-label="Previous month">
          <Icon name="chevronLeft" />
        </button>
        <p className="flex-1 text-center font-display text-lg font-bold">{monthLabel(month)}</p>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= thisMonth}
          className="grid size-11 place-items-center rounded-xl disabled:text-line"
          aria-label="Next month"
        >
          <Icon name="chevronRight" />
        </button>
      </div>

      {stats && lookups && (
        <>
          <Headline stats={stats} month={month} />
          <ByCategory stats={stats} categories={lookups.categories} />
          <MonthByMonth stats={stats} month={month} onPick={setMonth} />
          <Daily stats={stats} month={month} isCurrent={month === thisMonth} />
        </>
      )}
    </div>
  )
}

function buildStats(rows, month) {
  const prev = shiftMonth(month, -1)
  const byMonth = new Map()
  const byCategory = new Map()
  const byDay = new Map()
  let spent = 0
  let income = 0
  let prevSpent = 0

  for (const t of rows) {
    const key = monthKey(t.date)
    if (t.type === 'expense') {
      byMonth.set(key, (byMonth.get(key) ?? 0) + t.amount_cents)
      if (key === month) {
        spent += t.amount_cents
        byCategory.set(t.category_id, (byCategory.get(t.category_id) ?? 0) + t.amount_cents)
        const day = Number(t.date.slice(8))
        byDay.set(day, (byDay.get(day) ?? 0) + t.amount_cents)
      }
      if (key === prev) prevSpent += t.amount_cents
    } else if (key === month) {
      income += t.amount_cents
    }
  }
  return { spent, income, prevSpent, byMonth, byCategory, byDay }
}

function Card({ title, children }) {
  return (
    <section className="rounded-3xl bg-card p-5">
      {title && <h2 className="mb-4 font-display text-lg font-bold">{title}</h2>}
      {children}
    </section>
  )
}

function Headline({ stats, month }) {
  const diff = stats.spent - stats.prevSpent
  const pct = stats.prevSpent > 0 ? Math.round((Math.abs(diff) / stats.prevSpent) * 100) : null
  const prevName = monthLabel(shiftMonth(month, -1), { month: 'long' })

  return (
    <Card>
      <p className="text-base font-medium text-muted">Spent</p>
      <p className="tabular mt-1 font-display text-[44px] leading-none font-bold tracking-tight">{formatCents(stats.spent)}</p>
      <p className="mt-3 text-sm text-muted">
        {stats.prevSpent === 0 ? (
          `Nothing recorded in ${prevName} to compare with.`
        ) : diff === 0 ? (
          `Same as ${prevName}.`
        ) : (
          <>
            <span className={`font-semibold ${diff > 0 ? 'text-loss' : 'text-gain'}`}>
              {diff > 0 ? '↑' : '↓'} {pct}% ({formatCents(Math.abs(diff))})
            </span>{' '}
            {diff > 0 ? 'more' : 'less'} than {prevName}
          </>
        )}
      </p>
      <div className="mt-4 flex gap-6 border-t border-line pt-3 text-sm">
        <span className="text-muted">
          Income <span className="tabular font-semibold text-ink">{formatCents(stats.income)}</span>
        </span>
        <span className="text-muted">
          Left over{' '}
          <span className={`tabular font-semibold ${stats.income - stats.spent < 0 ? 'text-loss' : 'text-ink'}`}>
            {formatCents(stats.income - stats.spent)}
          </span>
        </span>
      </div>
    </Card>
  )
}

function ByCategory({ stats, categories }) {
  const items = [...stats.byCategory.entries()]
    .map(([id, cents]) => ({ cents, category: categories.find((c) => c.id === id) }))
    .sort((a, b) => b.cents - a.cents)
  const max = items[0]?.cents ?? 1

  return (
    <Card title="By category">
      {items.length === 0 ? (
        <p className="text-muted">No spending recorded this month.</p>
      ) : (
        <ul className="space-y-3.5">
          {items.map(({ cents, category }) => (
            <li key={category?.id ?? 'none'}>
              <div className="flex items-baseline gap-2">
                <span className="text-lg leading-none">{category?.icon ?? '❔'}</span>
                <span className="flex-1 truncate text-base font-medium">{category?.name ?? 'No category'}</span>
                <span className="tabular text-base font-semibold">{formatCents(cents)}</span>
                <span className="tabular w-10 text-right text-sm text-muted">{Math.round((cents / stats.spent) * 100)}%</span>
              </div>
              <div className="mt-1.5 h-2 rounded-full bg-paper">
                <div className="h-full rounded-full bg-cobalt" style={{ width: `${Math.max(2, (cents / max) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function MonthByMonth({ stats, month, onPick }) {
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftMonth(month, i - (MONTHS_SHOWN - 1)))
  const values = months.map((m) => stats.byMonth.get(m) ?? 0)
  const max = Math.max(...values, 1)

  return (
    <Card title="Month by month">
      <div className="flex h-44 items-end gap-2">
        {months.map((m, i) => {
          const selected = m === month
          return (
            <button
              key={m}
              onClick={() => onPick(m)}
              className="flex h-full flex-1 flex-col items-center justify-end gap-1.5"
              aria-label={`${monthLabel(m)}: ${formatCents(values[i])}`}
              aria-pressed={selected}
            >
              <span className={`tabular text-[11px] ${selected ? 'font-semibold text-ink' : 'text-muted'}`}>
                {values[i] > 0 ? compactCents(values[i]) : ''}
              </span>
              <span
                className={`w-full max-w-10 rounded-t-[4px] ${selected ? 'bg-cobalt' : 'bg-cobalt/25'}`}
                style={{ height: `${(values[i] / max) * 75}%`, minHeight: values[i] > 0 ? 3 : 0 }}
              />
              <span className={`text-xs ${selected ? 'font-semibold text-ink' : 'text-muted'}`}>{monthLabel(m, { month: 'short' })}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-muted">Tap a month to see its details.</p>
    </Card>
  )
}

function Daily({ stats, month, isCurrent }) {
  const [picked, setPicked] = useState(null)
  const daysInMonth = Number(monthRange(`${month}-01`)[1].slice(8))
  // For the current month, average over the days so far
  const daysCounted = isCurrent ? Number(todayISO().slice(8)) : daysInMonth
  const average = Math.round(stats.spent / daysCounted)
  const values = Array.from({ length: daysInMonth }, (_, i) => stats.byDay.get(i + 1) ?? 0)
  const max = Math.max(...values, average, 1)
  const pickedValue = picked ? values[picked - 1] : null

  return (
    <Card title="Daily spending">
      <p className="-mt-2 mb-4 h-5 text-sm text-muted">
        {picked ? (
          <>
            {picked} {monthLabel(month, { month: 'short' })}:{' '}
            <span className="tabular font-semibold text-ink">{formatCents(pickedValue)}</span>
          </>
        ) : (
          <>
            Average <span className="tabular font-semibold text-ink">{formatCents(average)}</span> per day
          </>
        )}
      </p>
      <div className="relative h-32">
        {/* Average line */}
        {average > 0 && (
          <div
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted/40"
            style={{ bottom: `${(average / max) * 100}%` }}
          />
        )}
        <div className="flex h-full items-end gap-[2px]">
          {values.map((v, i) => {
            const day = i + 1
            const future = isCurrent && day > daysCounted
            return (
              <button
                key={day}
                onClick={() => setPicked(picked === day ? null : day)}
                className="flex h-full flex-1 items-end"
                aria-label={`${day}: ${formatCents(v)}`}
                disabled={future}
              >
                <span
                  className={`w-full rounded-t-[3px] ${picked === day ? 'bg-ink' : 'bg-cobalt'}`}
                  style={{ height: `${(v / max) * 100}%`, minHeight: v > 0 ? 3 : 0 }}
                />
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-1.5 flex justify-between text-xs text-muted">
        <span>1</span>
        <span>{Math.ceil(daysInMonth / 2)}</span>
        <span>{daysInMonth}</span>
      </div>
    </Card>
  )
}
