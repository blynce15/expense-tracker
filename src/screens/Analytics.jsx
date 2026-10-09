import { useEffect, useMemo, useState } from 'react'
import LynxWatermark from '../components/LynxWatermark'
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
    <div className="space-y-4 px-4 pt-1 pb-6">
      <div className="flex items-center rounded-2xl bg-card p-1">
        <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="grid size-11 place-items-center rounded-xl text-ink" aria-label="Previous month">
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

function Card({ title, note, children }) {
  return (
    <section className="rounded-[22px] bg-card p-4">
      {title && (
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-bold">{title}</h2>
          {note && <span className="text-xs text-muted">{note}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

// "€1.190" big and ",45" small and faded
function BigAmount({ cents }) {
  const [whole, decimals] = formatCents(cents).split(',')
  return (
    <p className="tabular relative font-display leading-tight font-bold">
      <span className="text-[38px]">{whole}</span>
      <span className="text-xl text-white/55">,{decimals}</span>
    </p>
  )
}

function Headline({ stats, month }) {
  const diff = stats.spent - stats.prevSpent
  const pct = stats.prevSpent > 0 ? Math.round((Math.abs(diff) / stats.prevSpent) * 100) : null
  const prevShort = monthLabel(shiftMonth(month, -1), { month: 'short' }).replace('Sept', 'Sep')
  const left = stats.income - stats.spent

  return (
    <section className="relative overflow-hidden rounded-[24px] bg-cobalt p-5 text-white shadow-[0_18px_34px_-18px_#1f4fe0]">
      <LynxWatermark />
      <div className="relative flex items-start justify-between gap-2">
        <p className="text-sm text-white/75">Spent in {monthLabel(month, { month: 'long' })}</p>
        {pct !== null && diff !== 0 && (
          <span className={`shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold ${diff > 0 ? 'text-[#ffd2c7]' : 'text-[#b8f5d6]'}`}>
            {diff > 0 ? '▲' : '▼'} {pct}% vs {prevShort}
          </span>
        )}
      </div>
      <BigAmount cents={stats.spent} />
      {stats.prevSpent === 0 && <p className="relative text-xs text-white/65">Nothing recorded in {prevShort} to compare with.</p>}
      <div className="relative mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-white/[.12] px-3 py-2">
          <p className="text-xs text-white/70">Income</p>
          <p className="tabular font-display font-bold">{formatCents(stats.income)}</p>
        </div>
        <div className="rounded-2xl bg-white/[.12] px-3 py-2">
          <p className="text-xs text-white/70">Left over</p>
          <p className={`tabular font-display font-bold ${left < 0 ? 'text-[#ffd2c7]' : ''}`}>{formatCents(left)}</p>
        </div>
      </div>
    </section>
  )
}

function ByCategory({ stats, categories }) {
  const items = [...stats.byCategory.entries()]
    .map(([id, cents]) => ({ cents, category: categories.find((c) => c.id === id) }))
    .sort((a, b) => b.cents - a.cents)
  const max = items[0]?.cents ?? 1
  const color = (c) => c?.color ?? '#868e96'

  return (
    <Card title="By category" note={items.length ? `${items.length} ${items.length === 1 ? 'category' : 'categories'}` : null}>
      {items.length === 0 ? (
        <p className="text-muted">No spending recorded this month.</p>
      ) : (
        <>
          {/* How the month splits, one piece per category */}
          <div className="mb-4 flex h-2.5 gap-[3px] overflow-hidden rounded-full">
            {items.map(({ cents, category }) => (
              <span key={category?.id ?? 'none'} className="rounded-full" style={{ flex: cents, backgroundColor: color(category) }} />
            ))}
          </div>
          <ul className="space-y-3">
            {items.map(({ cents, category }) => (
              <li key={category?.id ?? 'none'} className="flex items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl text-base" style={{ backgroundColor: `${color(category)}1f` }}>
                  {category?.icon ?? '❔'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="flex-1 truncate text-sm font-semibold">{category?.name ?? 'No category'}</span>
                    <span className="tabular text-sm font-semibold">{formatCents(cents)}</span>
                  </span>
                  <span className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                      <span className="block h-full rounded-full" style={{ width: `${Math.max(3, (cents / max) * 100)}%`, backgroundColor: color(category) }} />
                    </span>
                    <span className="tabular w-9 text-right text-xs text-muted">{Math.round((cents / stats.spent) * 100)}%</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function MonthByMonth({ stats, month, onPick }) {
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftMonth(month, i - (MONTHS_SHOWN - 1)))
  const values = months.map((m) => stats.byMonth.get(m) ?? 0)
  const max = Math.max(...values, 1)

  return (
    <Card title="Month by month" note="Tap a month">
      <div className="flex h-40 items-end gap-2">
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
                className={`w-full max-w-9 rounded-xl transition ${selected ? 'bg-cobalt shadow-[0_8px_16px_-8px_rgba(31,79,224,0.9)]' : 'bg-cobalt/15'}`}
                style={{ height: `${(values[i] / max) * 75}%`, minHeight: values[i] > 0 ? 3 : 0 }}
              />
              <span className={`text-xs ${selected ? 'font-semibold text-ink' : 'text-muted'}`}>{monthLabel(m, { month: 'short' })}</span>
            </button>
          )
        })}
      </div>
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
      <p className="-mt-2 mb-3 h-5 text-sm text-muted">
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
            className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-muted/30"
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
                  className={`w-full rounded-t-[4px] ${picked === day ? 'bg-ink' : 'bg-cobalt'}`}
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
