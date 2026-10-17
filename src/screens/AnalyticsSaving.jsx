import { useEffect, useState } from 'react'
import { pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import { cachedAnalytics, fetchAnalytics, monthShort, periodLabel, shiftMonth } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchGoalsState, savingsEffect } from '../lib/goals'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { navigate } from '../lib/useRoute'

// Signed whole euros, e.g. "+€200" / "−€50"
const signed = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)
const TEAL = '#0c8599'
const BLUE = '#1f4fe0'

// Analytics → What you keep: money kept = saved (net into savings accounts) + invested (Invest − Take out).
// One section per question: how much you kept, where it went, getting better, how consistent,
// what it adds up to, what it's for (savings goals).
export default function AnalyticsSaving() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(() => {
    const a = cachedAnalytics(period)
    return a && { ...a, goalList: lookupCache.lookups?.goals ?? [] }
  })
  const [goals, setGoals] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchAnalytics(period), fetchLookups()])
      .then(([a, lookups]) => !cancelled && setData({ ...a, goalList: lookups.goals ?? [] }))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [period])

  // Goals with their money today and their pace (not tied to the chosen period)
  useEffect(() => {
    fetchGoalsState()
      .then(setGoals)
      .catch(() => setGoals(null))
  }, [])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load what you keep: {error}</p>
  const a = data && data.period === period ? data : null

  return (
    <div className="px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && (
        <>
          <Section n={1} title="How much you kept">
            <Hero a={a} />
          </Section>
          <Section n={2} title="Where it went">
            <WhereItWent a={a} />
          </Section>
          <Section n={3} title="Getting better?">
            <Better a={a} />
          </Section>
          <Section n={4} title="How consistent">
            <Consistent a={a} />
          </Section>
          <Section n={5} title="What it adds up to">
            <AddsUp a={a} />
          </Section>
          {goals?.goals?.length > 0 && (
            <Section n={6} title="What it's for">
              <Goals state={goals} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ n, title, children }) {
  return (
    <section>
      <h2 className="mt-5 mb-2.5 flex items-center gap-2 px-1 text-[11.5px] font-bold tracking-[0.08em] text-muted uppercase">
        <span className="grid size-5 place-items-center rounded-full bg-teal text-[11px] tracking-normal text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

const card = 'rounded-[24px] bg-card p-4'

// The 12 months up to the period's end: income, saved, invested, kept and the rate (kept ÷ income)
function monthRows(a) {
  const thisMonth = todayISO().slice(0, 7)
  return a.last12.map((k) => {
    const m = a.byMonth.get(k) ?? { income: 0, saved: 0, invested: 0, spent: 0 }
    const kept = m.saved + m.invested
    return { key: k, ...m, kept, rate: m.income > 0 ? kept / m.income : null, partial: k === thisMonth, future: k > thisMonth }
  })
}

// ---------- 1 · How much you kept ----------
function Hero({ a }) {
  const { totals, saving } = a
  const income = totals.income
  const size = 118
  const r = 48
  const c = 2 * Math.PI * r
  const saved = income > 0 ? Math.max(0, Math.min(1, totals.saved / income)) : 0
  const invested = income > 0 ? Math.max(0, Math.min(1 - saved, totals.invested / income)) : 0
  const usual = saving.avgRate
  const ang = (usual ?? 0) * 2 * Math.PI - Math.PI / 2
  const tick = (d) => [size / 2 + Math.cos(ang) * (r + d), size / 2 + Math.sin(ang) * (r + d)]
  const diff = saving.rate !== null && usual !== null ? Math.round((saving.rate - usual) * 100) : null
  const [euros, decimals] = formatCents(saving.kept).split(',')

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#17b3c6] to-[#0a6f80] p-4 text-white shadow-[0_18px_30px_-20px_rgba(12,133,153,0.9)]">
      <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-4">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} aria-hidden="true">
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.2)" strokeWidth="12" />
              {saved > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#fff" strokeWidth="12" strokeDasharray={`${saved * c} ${c}`} />}
              {invested > 0 && (
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#a5f0f7" strokeWidth="12" strokeDasharray={`${invested * c} ${c}`} strokeDashoffset={-saved * c} />
              )}
            </g>
            {usual !== null && usual > 0 && <line x1={tick(12)[0]} y1={tick(12)[1]} x2={tick(-12)[0]} y2={tick(-12)[1]} stroke="#ffd43b" strokeWidth="3" strokeLinecap="round" />}
          </svg>
          <span className="absolute inset-0 grid place-items-center text-center">
            <span>
              <b className="tabular block font-display text-[26px] leading-none">{saving.rate !== null ? pct(Math.max(0, saving.rate)) : '—'}</b>
              <span className="text-[11px] text-white/85">of income</span>
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-white/90">You kept</p>
          <p className="tabular truncate font-display leading-tight font-bold">
            <span className="text-[32px]">{euros}</span>
            <span className="text-lg text-white/60">,{decimals}</span>
          </p>
          <p className="text-[12.5px] text-white/90">{income > 0 ? `of ${whole(income)} income` : 'No income recorded'}</p>
          {diff !== null && (
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-white/90">
              <span className={`rounded-full bg-white px-2 py-0.5 font-bold ${diff >= 0 ? 'text-[#0f8a5f]' : 'text-[#c26b00]'}`}>
                {diff === 0 ? '= same' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)} pts`}
              </span>
              vs usual {pct(usual)}
            </p>
          )}
        </div>
      </div>
      <div className="relative mt-3 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-white/95">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-white" /> Saved {whole(totals.saved)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[#a5f0f7]" /> Invested {whole(totals.invested)}
        </span>
        {usual !== null && usual > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-[3px] rounded-[1px] bg-[#ffd43b]" /> Your usual
          </span>
        )}
      </div>
      {saving.kept < 0 && <p className="relative mt-2 text-xs text-white/90">More came out of savings and investments than went in.</p>}
    </div>
  )
}

// ---------- 2 · Where it went ----------
function WhereItWent({ a }) {
  const goalOf = (id) => a.goalList.find((g) => g.id === id)
  const parts = []
  if (a.totals.invested) {
    parts.push({ key: 'invest', name: 'Investments', sub: 'Put in minus taken out', cents: a.totals.invested, color: TEAL, to: '/investments', getquin: true })
  }
  for (const [id, cents] of a.flowByGoal) {
    if (!cents) continue
    const g = id === 'general' ? null : goalOf(id)
    parts.push({
      key: id,
      name: g ? g.name : 'General savings',
      sub: g ? 'Savings goal' : 'Savings without a goal',
      cents,
      color: g ? BLUE : '#6c8cff',
      emoji: g ? g.icon || '🎯' : '🏦',
      to: '/savings',
    })
  }
  parts.sort((x, y) => y.cents - x.cents)
  const positive = parts.filter((p) => p.cents > 0)
  const totalIn = positive.reduce((s, p) => s + p.cents, 0) || 1

  if (!parts.length) {
    return <p className={`${card} text-center text-sm text-muted`}>Nothing went into savings or investments in {periodLabel(a.period)}.</p>
  }
  return (
    <div className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="tabular font-display text-[17px]">{a.saving.kept < 0 ? signed(a.saving.kept) : whole(a.saving.kept)} kept</b>
        <span className="text-[12.5px] text-muted">{periodLabel(a.period)}</span>
      </div>
      {positive.length > 0 && (
        <div className="mt-2.5 flex h-3.5 gap-[3px] overflow-hidden rounded-full">
          {positive.map((p) => (
            <span key={p.key} style={{ flex: p.cents, background: p.color }} />
          ))}
        </div>
      )}
      <ul className="mt-2.5">
        {parts.map((p) => (
          <li key={p.key} className="border-t border-line">
            <button onClick={() => navigate(p.to)} className="flex w-full items-center gap-3 py-2.5 text-left">
              {p.getquin ? (
                <img src="/getquin.png" alt="" className="size-[34px] shrink-0 rounded-[10px] ring-1 ring-line" />
              ) : (
                <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-[17px]" style={{ background: `${p.color}1f` }}>
                  {p.emoji}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px]">{p.name}</b>
                <span className="block truncate text-xs text-muted">{p.sub}</span>
              </span>
              <span className="text-right">
                <b className={`tabular block font-display text-[15px] ${p.cents < 0 ? 'text-loss' : ''}`}>{p.cents < 0 ? signed(p.cents) : whole(p.cents)}</b>
                {p.cents > 0 && <span className="tabular text-[11.5px] text-muted">{pct(p.cents / totalIn)}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---------- 3 · Getting better ----------
// The keep rate each month as a line with a soft fill, your usual dashed; the headline compares the last
// 3 full months with the 3 before them.
function Better({ a }) {
  const rows = monthRows(a).filter((r) => !r.future)
  const [picked, setPicked] = useState(null)
  const full = rows.filter((r) => !r.partial && r.rate !== null)
  const avg = (list) => (list.length ? list.reduce((s, r) => s + r.rate, 0) / list.length : null)
  const recent = avg(full.slice(-3))
  const before = full.length >= 6 ? avg(full.slice(-6, -3)) : null
  const change = recent !== null && before !== null ? Math.round((recent - before) * 100) : null
  const headline = change === null ? 'Your keep rate' : change >= 3 ? 'Keep rate is rising' : change <= -3 ? 'Keep rate is falling' : 'Keep rate is steady'

  const W = 300
  const H = 110
  const usual = a.saving.avgRate
  const known = rows.map((r) => r.rate).filter((v) => v !== null)
  const top = Math.max(0.1, usual ?? 0, ...known) * 1.15
  const bottom = Math.min(0, ...known)
  const step = W / Math.max(1, rows.length - 1)
  const x = (i) => (rows.length > 1 ? i * step : W / 2)
  const y = (v) => H - ((v - bottom) / (top - bottom)) * H
  const pts = rows.map((r, i) => (r.rate === null ? null : [x(i), y(r.rate)]))
  // Months without income break the line
  const segs = []
  let cur = []
  for (const q of pts) {
    if (q) cur.push(q)
    else if (cur.length) {
      segs.push(cur)
      cur = []
    }
  }
  if (cur.length) segs.push(cur)
  const p = picked === null ? null : rows[picked]
  const lastI = rows.length - 1

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <b className="font-display text-[17px]">{headline}</b>
        {change !== null && change !== 0 && (
          <span className={`tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${change > 0 ? 'bg-gain/12 text-gain' : 'bg-warn-bg text-orange-text'}`}>
            {change > 0 ? '▲' : '▼'} {Math.abs(change)} pts
          </span>
        )}
      </div>
      <svg viewBox={`-6 -12 ${W + 12} ${H + 32}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Share of income kept each month">
        <defs>
          <linearGradient id="keep-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={TEAL} stopOpacity=".28" />
            <stop offset="1" stopColor={TEAL} stopOpacity="0" />
          </linearGradient>
        </defs>
        {bottom < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line)" strokeWidth="1.2" />}
        {usual !== null && <line x1="0" x2={W} y1={y(usual)} y2={y(usual)} stroke="#f08c00" strokeWidth="1.4" strokeDasharray="4 4" />}
        {usual !== null && (
          <text x="0" y={y(usual) - 5} fontSize="10" fontWeight="600" fill="#f08c00">
            usual {pct(usual)}
          </text>
        )}
        {segs.map((s, i) => {
          const d = `M${s.map((q) => `${q[0].toFixed(1)},${q[1].toFixed(1)}`).join(' L')}`
          return (
            <g key={i}>
              {s.length > 1 && <path d={`${d} L${s.at(-1)[0]},${H} L${s[0][0]},${H} Z`} fill="url(#keep-fill)" />}
              <path d={d} fill="none" stroke={TEAL} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })}
        {pts.map((q, i) =>
          q ? (
            <circle
              key={i}
              cx={q[0]}
              cy={q[1]}
              r={i === lastI || picked === i ? 5 : 3}
              fill={i === lastI || picked === i ? TEAL : 'var(--color-card)'}
              stroke={TEAL}
              strokeWidth="2"
            />
          ) : null,
        )}
        {rows.map((r, i) => (
          <g key={r.key} onClick={() => setPicked(i)} className="cursor-pointer">
            <rect x={x(i) - step / 2} y="-12" width={step} height={H + 32} fill="transparent" />
            <text x={x(i)} y={H + 16} textAnchor="middle" fontSize="10" className={picked === i || i === lastI ? 'fill-ink font-bold' : 'fill-muted'}>
              {monthShort(r.key)[0]}
            </text>
          </g>
        ))}
      </svg>
      <p className="mt-1 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' so far'}: kept <b className="tabular text-ink">{whole(p.kept)}</b>
            {p.rate !== null && (
              <>
                {' '}
                · <b className="tabular text-ink">{pct(Math.max(0, p.rate))}</b> of income
              </>
            )}
          </>
        ) : change !== null ? (
          'Last 3 months vs the 3 before · tap a month'
        ) : (
          'Share of income kept · tap a month'
        )}
      </p>
    </div>
  )
}

// ---------- 4 · How consistent ----------
function Consistent({ a }) {
  const rows = monthRows(a).filter((r) => !r.future)
  // Months in a row with money kept, counting back from the latest month (this one if it already has some)
  let i = rows.length - 1
  if (rows[i]?.partial && rows[i].kept <= 0) i -= 1
  let streak = 0
  while (i >= 0 && rows[i].kept > 0) {
    streak += 1
    i -= 1
  }
  const withIncome = rows.filter((r) => r.rate !== null && !r.partial)
  const best = withIncome.length ? withIncome.reduce((b, r) => (r.rate > b.rate ? r : b)) : null
  const low = withIncome.length > 1 ? withIncome.reduce((b, r) => (r.rate < b.rate ? r : b)) : null
  const why = (r, isBest) => {
    if (isBest) return r.invested >= r.saved ? `${whole(r.invested)} invested` : `${whole(r.saved)} saved`
    if (r.saved < 0) return `took ${whole(-r.saved)} out of savings`
    if (r.invested < 0) return `took ${whole(-r.invested)} out of investments`
    return `${whole(r.spent)} spent`
  }
  const shade = (r) => (r.rate === null ? 'var(--color-line)' : r.rate <= 0 ? 'rgba(194,59,34,.18)' : `rgba(12,133,153,${Math.min(1, 0.18 + r.rate * 1.6)})`)

  return (
    <div className={card}>
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-gradient-to-br from-[#ffb84d] to-[#f08c00] text-white">
          <Icon name="repeat" size={21} strokeWidth={2.3} />
        </span>
        <span className="min-w-0">
          <b className="block font-display text-xl leading-tight">
            {streak === 0 ? 'No streak right now' : `${streak} ${streak === 1 ? 'month' : 'months'} in a row`}
          </b>
          <span className="text-[12.5px] text-muted">
            {streak === 0 ? 'Keep something this month to start one' : streak >= 12 ? 'you kept money every month this past year' : 'with money kept'}
          </span>
        </span>
      </div>
      <div className="mt-3.5 flex gap-[3px]">
        {rows.map((r) => (
          <div key={r.key} className="min-w-0 flex-1 text-center">
            <div
              className={`tabular grid h-[34px] place-items-center rounded-[9px] text-[10px] font-bold ${r.rate !== null && r.rate > 0.3 ? 'text-white' : 'text-ink'} ${r.partial ? 'ring-2 ring-ink ring-inset' : ''}`}
              style={{ background: shade(r) }}
            >
              {r.rate === null ? '' : Math.round(r.rate * 100)}
            </div>
            <span className={`text-[9.5px] ${r.partial ? 'font-bold text-ink' : 'text-muted'}`}>{monthShort(r.key)[0]}</span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[11px] text-muted">% of income kept · stronger teal = more</p>
      {best && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-teal/12 px-3 py-2.5">
            <span className="text-[11.5px] font-bold text-teal uppercase">Best · {monthShort(best.key)}</span>
            <b className="tabular block font-display text-[17px]">
              {whole(best.kept)} · {pct(best.rate)}
            </b>
            <span className="text-[11.5px] text-muted">{why(best, true)}</span>
          </div>
          {low && low.key !== best.key && (
            <div className="rounded-2xl bg-warn-bg px-3 py-2.5">
              <span className="text-[11.5px] font-bold text-orange-text uppercase">Lowest · {monthShort(low.key)}</span>
              <b className="tabular block font-display text-[17px]">
                {low.kept < 0 ? signed(low.kept) : whole(low.kept)} · {pct(low.rate)}
              </b>
              <span className="text-[11.5px] text-muted">{why(low, false)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ---------- 5 · What it adds up to ----------
// Kept so far in the year, month by month (running total), and where the year ends at this pace
function AddsUp({ a }) {
  const year = a.period.kind === 'year' ? a.period.key : a.period.key.slice(0, 4)
  const thisMonth = todayISO().slice(0, 7)
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
  const done = keys.filter((k) => k <= thisMonth)
  let run = 0
  const cum = done.map((k) => {
    const m = a.byMonth.get(k)
    run += m ? m.saved + m.invested : 0
    return run
  })
  const total = cum.at(-1) ?? 0
  const running = year === thisMonth.slice(0, 4)
  const daysInMonth = new Date(Number(year), Number(thisMonth.slice(5)), 0).getDate()
  const passed = running ? done.length - 1 + Number(todayISO().slice(8)) / daysInMonth : 12
  const pace = running && passed > 0 ? Math.round((total / passed) * 12) : null

  const W = 300
  const H = 90
  const top = Math.max(1, total, pace ?? 0, ...cum) * 1.08
  const low = Math.min(0, ...cum)
  const x = (i) => (i / 11) * W
  const y = (v) => H - ((v - low) / (top - low)) * H
  const line = cum.length ? `M${cum.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}` : ''
  const last = cum.length - 1

  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2">
        <span>
          <span className="text-[12.5px] text-muted">
            Kept in {year}
            {running ? ' so far' : ''}
          </span>
          <b className="tabular block font-display text-[26px] leading-tight">{total < 0 ? signed(total) : whole(total)}</b>
        </span>
        {pace !== null && (
          <span className="text-right">
            <span className="text-[12.5px] text-muted">On pace for</span>
            <b className="tabular block font-display text-lg text-teal">{whole(pace)}</b>
          </span>
        )}
      </div>
      {cum.length > 0 && (
        <svg viewBox={`-6 -8 ${W + 12} ${H + 26}`} className="mt-2.5 block h-auto w-full overflow-visible" role="img" aria-label={`Money kept through ${year}`}>
          <defs>
            <linearGradient id="adds-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={TEAL} stopOpacity=".25" />
              <stop offset="1" stopColor={TEAL} stopOpacity="0" />
            </linearGradient>
          </defs>
          {cum.length > 1 && <path d={`${line} L${x(last)},${H} L0,${H} Z`} fill="url(#adds-fill)" />}
          <path d={line} fill="none" stroke={TEAL} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {pace !== null && last < 11 && (
            <>
              <line x1={x(last)} y1={y(total)} x2={x(11)} y2={y(pace)} stroke={TEAL} strokeWidth="2.5" strokeDasharray="4 5" strokeLinecap="round" />
              <circle cx={x(11)} cy={y(pace)} r="4" fill="var(--color-card)" stroke={TEAL} strokeWidth="2" />
            </>
          )}
          <circle cx={x(last)} cy={y(total)} r="5" fill={TEAL} stroke="var(--color-card)" strokeWidth="2" />
          {keys.map((k, i) => (
            <text key={k} x={x(i)} y={H + 15} textAnchor="middle" fontSize="10" className={k === thisMonth ? 'fill-ink font-bold' : 'fill-muted'}>
              {monthShort(k)[0]}
            </text>
          ))}
        </svg>
      )}
    </div>
  )
}

// ---------- 6 · What it's for ----------
// Each savings goal: money today, progress, and when it's reached at the pace of the last 6 months
function Goals({ state }) {
  const since = `${shiftMonth(todayISO().slice(0, 7), -6)}-01`
  const flow = new Map()
  const add = (id, cents) => flow.set(id, (flow.get(id) ?? 0) + cents)
  for (const t of state.transactions) {
    if (t.date < since || !t.goal_id) continue
    const cents = savingsEffect(state.accounts, t)
    if (cents) add(t.goal_id, cents)
  }
  for (const m of state.moves) {
    if (m.date < since) continue
    if (m.to_goal_id) add(m.to_goal_id, m.amount_cents)
    if (m.from_goal_id) add(m.from_goal_id, -m.amount_cents)
  }
  const eta = (g) => {
    if (g.saved_cents >= g.target_cents) return 'Reached 🎉'
    const perMonth = (flow.get(g.id) ?? 0) / 6
    if (perMonth <= 0) return 'No money added lately'
    const months = Math.ceil((g.target_cents - g.saved_cents) / perMonth)
    if (months > 120) return 'More than 10 years at this pace'
    const d = new Date()
    d.setMonth(d.getMonth() + months)
    return `Reached around ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`
  }
  const colors = [BLUE, '#0f8a5f', '#e8590c', '#7c4dff', TEAL, '#e0457b']

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <b className="font-display text-[17px]">Your goals</b>
        <button onClick={() => navigate('/savings')} className="flex items-center text-[13.5px] font-bold text-cobalt">
          Savings
          <Icon name="chevronRight" size={15} strokeWidth={2.6} />
        </button>
      </div>
      <ul className="mt-1.5">
        {state.goals.map((g, i) => {
          const share = Math.max(0, Math.min(1, g.saved_cents / g.target_cents))
          const color = colors[i % colors.length]
          return (
            <li key={g.id} className="border-t border-line py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] text-[17px]" style={{ background: `${color}1f` }}>
                  {g.icon || '🎯'}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]">{g.name}</b>
                  <span className="block truncate text-xs text-muted">{eta(g)}</span>
                </span>
                <span className="tabular shrink-0 text-right text-[13px]">
                  <b className="block">{whole(g.saved_cents)}</b>
                  <span className="text-[11.5px] text-muted">of {whole(g.target_cents)}</span>
                </span>
              </div>
              <div className="mt-2 h-[7px] overflow-hidden rounded-full bg-paper">
                <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: color }} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
