import { useEffect, useState } from 'react'
import { Card, Chip, Mini, ORANGE, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import { fetchAnalytics, monthShort, periodLabel } from '../lib/analytics'
import { formatDayMonth, todayISO } from '../lib/dates'
import { formatCents } from '../lib/money'

const pad = (n) => String(n).padStart(2, '0')
const signed = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

// Analytics → Trends: the long view over the 12 months up to the chosen period
export default function AnalyticsTrends() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchAnalytics(period)
      .then((a) => !cancelled && setData(a))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [period])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your trends: {error}</p>
  const a = data && data.period === period ? data : null

  return (
    <div className="space-y-3 px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && (
        <>
          <InAndOut a={a} />
          <NetEachMonth a={a} />
          <HighLow a={a} />
          <FixedBills a={a} />
          <Weekdays a={a} />
          {a.period.kind === 'month' ? <MonthCalendar a={a} /> : <YearSquares a={a} />}
        </>
      )}
    </div>
  )
}

// The 12 months that have started (future months of a year are left out)
const pastMonths = (a) => a.trend.filter((t) => !t.future)

function InAndOut({ a }) {
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 110
  const colW = W / 12
  const max = Math.max(1, ...a.trend.map((t) => Math.max(t.income, t.spent)))
  const h = (c) => (c / max) * H
  const p = picked === null ? null : a.trend[picked]
  // From the rounded averages, so the three chips add up
  const avgNet = a.avgIn !== null && a.avgOut !== null ? (Math.round(a.avgIn / 100) - Math.round(a.avgOut / 100)) * 100 : null
  return (
    <Card icon="bars" color="#7048e8" title="In and out">
      <div className="-mt-1 mb-1 flex justify-end gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-gain" /> In
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ background: ORANGE }} /> Out
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Money in and out each month">
        {a.trend.map((t, i) => {
          const x = i * colW + 2
          return (
            <g key={t.key} onClick={() => !t.future && setPicked(i)} className="cursor-pointer" opacity={t.future ? 0.25 : picked === null || picked === i ? (t.partial ? 0.55 : 1) : 0.4}>
              <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
              {t.income > 0 && <rect x={x} y={H - h(t.income)} width="10" height={h(t.income)} rx="3" fill="var(--color-gain)" />}
              {t.spent > 0 && <rect x={x + 11} y={H - h(t.spent)} width="10" height={h(t.spent)} rx="3" fill={ORANGE} />}
              <text x={x + 10.5} y={H + 13} textAnchor="middle" fontSize="9.5" className={picked === i ? 'fill-ink font-bold' : 'fill-muted'}>
                {monthShort(t.key)[0]}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-2 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' (so far)'}: in <b className="tabular text-ink">{whole(p.income)}</b> · out <b className="tabular text-ink">{whole(p.spent)}</b> · net{' '}
            <b className={`tabular ${p.income - p.spent < 0 ? 'text-loss' : 'text-gain'}`}>{signed(p.income - p.spent)}</b>
          </>
        ) : (
          'Tap a month for details'
        )}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {a.avgIn !== null && <Chip tone="good">Avg in {whole(a.avgIn)}</Chip>}
        {a.avgOut !== null && <Chip tone="bad">Avg out {whole(a.avgOut)}</Chip>}
        {avgNet !== null && <Chip tone="blue">Avg net {signed(avgNet)}</Chip>}
      </div>
      <p className="mt-2 text-xs text-muted">Averages use full months. Transfers between your accounts aren't counted.</p>
    </Card>
  )
}

// Income minus spending per month: green above zero, red below
function NetEachMonth({ a }) {
  const rows = a.trend.map((t) => ({ ...t, net: t.income - t.spent }))
  const past = rows.filter((r) => !r.future)
  const total = past.reduce((s, r) => s + r.net, 0)
  const W = 300
  const H = 90
  const colW = W / 12
  const top = Math.max(1, ...rows.map((r) => r.net))
  const bottom = Math.min(0, ...rows.map((r) => r.net))
  const y = (v) => ((top - v) / (top - bottom)) * H
  const zero = y(0)
  return (
    <Card icon="chart" color="var(--color-gain)" title="Net each month">
      <p className="-mt-1 mb-2 text-sm text-muted">
        Over these months: <b className={`tabular ${total < 0 ? 'text-loss' : 'text-gain'}`}>{signed(total)}</b>
      </p>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Income minus spending each month">
        <line x1="0" x2={W} y1={zero} y2={zero} stroke="var(--color-ink)" strokeOpacity=".2" />
        {rows.map((r, i) => {
          const hh = Math.max(r.net ? 2 : 0, Math.abs(y(r.net) - zero))
          return (
            <g key={r.key} opacity={r.future ? 0.25 : r.partial ? 0.55 : 1}>
              {hh > 0 && <rect x={i * colW + 4} y={r.net >= 0 ? zero - hh : zero} width={colW - 8} height={hh} rx="4" fill={r.net >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'} />}
              <text x={i * colW + colW / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className="fill-muted">
                {monthShort(r.key)[0]}
              </text>
            </g>
          )
        })}
      </svg>
    </Card>
  )
}

function HighLow({ a }) {
  const full = pastMonths(a).filter((t) => !t.partial && t.spent > 0)
  if (full.length < 2) return null
  const high = full.reduce((m, t) => (t.spent > m.spent ? t : m))
  const low = full.reduce((m, t) => (t.spent < m.spent ? t : m))
  return (
    <div className="grid grid-cols-2 gap-2">
      <Mini onPage label={`Most spent · ${monthShort(high.key)}`} value={whole(high.spent)} />
      <Mini onPage label={`Least spent · ${monthShort(low.key)}`} value={whole(low.spent)} />
    </div>
  )
}

// Spending on recurring payments each month, and what the active ones cost today
function FixedBills({ a }) {
  const rows = a.trend.map((t) => ({ key: t.key, cents: a.fixedBy.get(t.key) ?? 0, future: t.future, partial: t.partial }))
  const past = rows.filter((r) => !r.future)
  if (!a.recurringMonthly && past.every((r) => !r.cents)) return null
  const W = 300
  const H = 70
  const colW = W / 12
  const max = Math.max(1, ...rows.map((r) => r.cents), a.recurringMonthly)
  const h = (c) => (c / max) * H
  const firstFull = past.find((r) => !r.partial && r.cents)
  const lastFull = [...past].reverse().find((r) => !r.partial && r.cents)
  const change = firstFull && lastFull && firstFull !== lastFull ? lastFull.cents - firstFull.cents : 0
  return (
    <Card icon="repeat" color="var(--color-cobalt)" title="Fixed bills over time">
      {change !== 0 && (
        <div className="-mt-1 mb-2">
          <Chip tone={change > 0 ? 'bad' : 'good'}>
            {change > 0 ? '▲' : '▼'} {whole(Math.abs(change))} since {monthShort(firstFull.key)}
          </Chip>
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Spending on recurring payments each month">
        {a.recurringMonthly > 0 && <line x1="0" x2={W} y1={H - h(a.recurringMonthly)} y2={H - h(a.recurringMonthly)} stroke="var(--color-ink)" strokeOpacity=".4" strokeDasharray="4 3" />}
        {rows.map((r, i) => (
          <g key={r.key} opacity={r.future ? 0.25 : r.partial ? 0.55 : 1}>
            {r.cents > 0 && <rect x={i * colW + 5} y={H - h(r.cents)} width={colW - 10} height={h(r.cents)} rx="4" fill="var(--color-cobalt)" />}
            <text x={i * colW + colW / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className="fill-muted">
              {monthShort(r.key)[0]}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-2 text-sm text-muted">
        Your recurring payments cost <b className="tabular text-ink">{formatCents(a.recurringMonthly)}</b> a month ·{' '}
        <b className="tabular text-ink">{formatCents(a.recurringMonthly * 12)}</b> a year (dashed line).
      </p>
    </Card>
  )
}

function Weekdays({ a }) {
  const values = a.weekdayAvg
  const max = Math.max(...values)
  if (!max) return null
  const top = values.indexOf(max)
  const W = 300
  const H = 76
  const colW = W / 7
  return (
    <Card icon="calendar" color={ORANGE} title="By weekday">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Average spending per weekday">
        {values.map((v, i) => {
          const hh = Math.max(v ? 3 : 0, (v / max) * (H - 14))
          return (
            <g key={i}>
              {hh > 0 && <rect x={i * colW + 8} y={H - hh} width={colW - 16} height={hh} rx="6" fill="var(--color-cobalt)" opacity={i === top ? 1 : 0.45} />}
              <text x={i * colW + colW / 2} y={H - hh - 4} textAnchor="middle" fontSize="9.5" className={i === top ? 'fill-ink font-bold' : 'fill-muted'}>
                {Math.round(v / 100)}
              </text>
              <text x={i * colW + colW / 2} y={H + 13} textAnchor="middle" fontSize="10" className={i === top ? 'fill-ink font-bold' : 'fill-muted'}>
                {WEEKDAYS[i]}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-2 text-sm text-muted">
        {WEEKDAYS_LONG[top]} cost you most: <b className="tabular text-ink">{whole(max)}</b> on average.
      </p>
    </Card>
  )
}

// Each day of the month shaded by how much was spent (darker = more). Tap a day.
function MonthCalendar({ a }) {
  const [picked, setPicked] = useState(null)
  const key = a.period.key
  const [y, m] = key.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const cells = Array.from({ length: days }, (_, i) => {
    const date = `${key}-${pad(i + 1)}`
    return { date, day: i + 1, cents: a.spentByDay.get(date) ?? 0, future: i >= a.days.passed }
  })
  const max = Math.max(1, ...cells.map((c) => c.cents))
  const p = picked === null ? null : cells[picked]
  return (
    <Card icon="calendar" color="var(--color-cobalt)" title={`${periodLabel(a.period).split(' ')[0]} calendar`}>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="pb-0.5 text-center text-[11px] text-muted">
            {d[0]}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`e${i}`} />
        ))}
        {cells.map((c, i) => {
          const level = c.cents ? 0.15 + (c.cents / max) * 0.85 : 0
          return (
            <button
              key={c.date}
              onClick={() => !c.future && setPicked(i)}
              disabled={c.future}
              className={`tabular grid aspect-square place-items-center rounded-lg text-[12px] ${picked === i ? 'ring-2 ring-ink' : ''} ${c.future ? 'text-muted/40' : level > 0.55 ? 'text-white' : 'text-ink'}`}
              style={{ background: c.future ? 'transparent' : c.cents ? `color-mix(in srgb, var(--color-cobalt) ${Math.round(level * 100)}%, transparent)` : 'var(--color-paper)' }}
            >
              {c.day}
            </button>
          )
        })}
      </div>
      <p className="mt-2 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {formatDayMonth(p.date)}: <b className="tabular text-ink">{p.cents ? formatCents(p.cents) : 'nothing spent'}</b>
          </>
        ) : (
          'Stronger blue = more spent · tap a day'
        )}
      </p>
    </Card>
  )
}

// Year view: one square per month, shaded by spending
function YearSquares({ a }) {
  const year = a.period.key
  const nowKey = todayISO().slice(0, 7)
  const cells = Array.from({ length: 12 }, (_, i) => {
    const k = `${year}-${pad(i + 1)}`
    return { key: k, cents: a.byMonth.get(k)?.spent ?? 0, future: k > nowKey }
  })
  // Shaded from the cheapest to the most expensive month, so the difference shows
  const spent = cells.filter((c) => !c.future && c.cents).map((c) => c.cents)
  const max = Math.max(1, ...spent)
  const min = spent.length > 1 ? Math.min(...spent) : 0
  return (
    <Card icon="calendar" color="var(--color-cobalt)" title={`${year} at a glance`}>
      <div className="grid grid-cols-4 gap-1.5">
        {cells.map((c) => {
          const level = c.cents ? 0.2 + ((c.cents - min) / Math.max(1, max - min)) * 0.8 : 0
          return (
            <div
              key={c.key}
              className={`rounded-xl px-2.5 py-2 ${c.future ? 'text-muted/40' : level > 0.55 ? 'text-white' : 'text-ink'}`}
              style={{ background: c.future ? 'var(--color-paper)' : c.cents ? `color-mix(in srgb, var(--color-cobalt) ${Math.round(level * 100)}%, transparent)` : 'var(--color-paper)' }}
            >
              <p className="text-[11px] opacity-80">{monthShort(c.key)}</p>
              <p className="tabular truncate font-display text-sm font-bold">{c.future ? '—' : whole(c.cents)}</p>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-center text-[13px] text-muted">Stronger blue = more spent</p>
    </Card>
  )
}
