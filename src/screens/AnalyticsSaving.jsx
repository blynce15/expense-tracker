import { useEffect, useState } from 'react'
import { BigAmount, NavyPeriodBar, NavyPill, NavyTop, Overlap, pct, Section, usePeriod, whole } from '../components/AnalyticsKit'
import PutInChart from '../components/PutInChart'
import { cachedAnalytics, fetchAnalytics, monthShort, periodLabel } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { navigate } from '../lib/useRoute'

// Signed whole euros, e.g. "+€200" / "−€50"
const signed = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)
const TEAL = '#0c8599'
const BLUE = '#1f4fe0'
// The Saving & investing card's teal (Analytics → Explore), as the top of this page
const TEAL_TOP = 'radial-gradient(120% 90% at 85% 0%, #5fd4e4 0%, #0c8599 45%, #06505c 100%)'
const card = 'rounded-[24px] bg-card p-4 shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)]'

// Analytics → Savings & Investments (owner chose "B · Months on top + tiles", .harness/analytics-v11-saving.html):
// money kept = saved (net into savings accounts) + invested (Invest − Take out). The teal top: how much you kept,
// your rate against your usual, and the 12 months of saved + invested; saved / invested / usual rate on its edge;
// then where it went (tiles), at a glance, the year so far, and what you put into investments.
export default function AnalyticsSaving() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(() => {
    const a = cachedAnalytics(period)
    return a && { ...a, goalList: lookupCache.lookups?.goals ?? [] }
  })
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your savings: {error}</p>
  const a = data && data.period === period ? data : null

  return (
    <div className="pb-6">
      <NavyTop background={TEAL_TOP}>
        <NavyPeriodBar period={period} onChange={setPeriod} />
        {a ? <Top a={a} /> : <div className="h-[180px]" />}
      </NavyTop>
      {a && (
        <>
          <Overlap>
            <Numbers a={a} />
          </Overlap>
          <Section n={1} title="Where it went">
            <WhereItWent a={a} />
          </Section>
          <Section n={2} title="At a glance">
            <Glance a={a} />
          </Section>
          <Section n={3} title="The year so far">
            <YearSoFar a={a} />
          </Section>
          <PutInChart
            wrap={(chart) => (
              <Section n={4} title="Put into investments" right="portfolio + pension">
                {chart}
              </Section>
            )}
          />
        </>
      )}
    </div>
  )
}

// The 12 months up to the period's end: income, saved, invested, kept and the rate (kept ÷ income)
function monthRows(a) {
  const thisMonth = todayISO().slice(0, 7)
  return a.last12.map((k) => {
    const m = a.byMonth.get(k) ?? { income: 0, saved: 0, invested: 0, spent: 0 }
    const kept = m.saved + m.invested
    return { key: k, ...m, kept, rate: m.income > 0 ? kept / m.income : null, partial: k === thisMonth, future: k > thisMonth }
  })
}

// Months in a row with money kept, counting back from the latest month (this one if it already has some)
function streakOf(rows) {
  const done = rows.filter((r) => !r.future)
  let i = done.length - 1
  if (done[i]?.partial && done[i].kept <= 0) i -= 1
  let streak = 0
  while (i >= 0 && done[i].kept > 0) {
    streak += 1
    i -= 1
  }
  return streak
}

// Kept so far in the period's year, and where the year ends at this pace (only while it's running)
function yearOf(a) {
  const year = a.period.kind === 'year' ? a.period.key : a.period.key.slice(0, 4)
  const thisMonth = todayISO().slice(0, 7)
  const keys = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`).filter((k) => k <= thisMonth)
  const total = keys.reduce((s, k) => {
    const m = a.byMonth.get(k)
    return s + (m ? m.saved + m.invested : 0)
  }, 0)
  const running = year === thisMonth.slice(0, 4)
  const daysInMonth = new Date(Number(year), Number(thisMonth.slice(5)), 0).getDate()
  const passed = running ? keys.length - 1 + Number(todayISO().slice(8)) / daysInMonth : 12
  return { year, total, running, pace: running && passed > 0 ? Math.round((total / passed) * 12) : null }
}

// ---------- The teal top: kept, rate vs usual, the 12 months of saved + invested ----------
function Top({ a }) {
  const { totals, saving } = a
  const year = a.period.kind === 'year'
  const label = year ? a.period.key : periodLabel(a.period).split(' ')[0]
  const diff = saving.rate !== null && saving.avgRate !== null ? Math.round((saving.rate - saving.avgRate) * 100) : null
  const rows = monthRows(a).filter((r) => !r.future)
  const full = rows.filter((r) => !r.partial && (r.income || r.kept))
  const usual = full.length ? full.reduce((s, r) => s + r.kept, 0) / full.length : 0
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 70
  const step = W / 12
  const bw = step * 0.56
  const max = Math.max(1, usual, ...rows.map((r) => Math.max(0, r.saved) + Math.max(0, r.invested))) * 1.08
  const h = (c) => (Math.max(0, c) / max) * H
  const p = picked === null ? null : rows[picked]
  return (
    <>
      <BigAmount cents={saving.kept} label={a.current ? 'You kept' : `Kept in ${label}`} />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {saving.rate !== null ? <NavyPill>{pct(Math.max(0, saving.rate))} of income</NavyPill> : <NavyPill>No income yet</NavyPill>}
        {diff !== null && diff !== 0 && (
          <NavyPill>
            {diff > 0 ? '▲' : '▼'} {Math.abs(diff)} pts vs usual
          </NavyPill>
        )}
        {totals.income > 0 && saving.kept >= 0 && year && <NavyPill>of {whole(totals.income)} income</NavyPill>}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="mt-4 block h-auto w-full overflow-visible" role="img" aria-label="Saved and invested each month">
        {rows.map((r, i) => {
          const x = i * step + (step - bw) / 2
          const hs = h(r.saved)
          const hi = h(r.invested)
          const dim = picked !== null && picked !== i ? 0.35 : r.partial ? 0.7 : 1
          return (
            <g key={r.key} onClick={() => setPicked(i === picked ? null : i)} className="cursor-pointer">
              <rect x={i * step} y="0" width={step} height={H + 16} fill="transparent" />
              {hi > 0 && <rect x={x} y={H - hs - hi} width={bw} height={hi} rx="3" fill="#a5f0f7" opacity={dim} />}
              {hs > 0 && <rect x={x} y={H - hs} width={bw} height={hs} rx="3" fill="#fff" opacity={dim} />}
              <text
                x={x + bw / 2}
                y={H + 13}
                textAnchor="middle"
                fontSize="9.5"
                fill={r.partial || picked === i ? '#fff' : 'rgba(255,255,255,.7)'}
                fontWeight={r.partial || picked === i ? 700 : 400}
              >
                {monthShort(r.key)[0]}
              </text>
            </g>
          )
        })}
        {usual > 0 && <line x1="0" x2={W} y1={H - h(usual)} y2={H - h(usual)} stroke="#fff" strokeOpacity=".55" strokeDasharray="4 4" />}
      </svg>
      <p className="tabular mt-1.5 min-h-4 text-center text-[11.5px] text-white/75">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' so far'}: saved {signed(p.saved)} · invested {signed(p.invested)}
          </>
        ) : (
          <>
            <span className="inline-block size-2 rounded-[2px] bg-white" /> Saved <span className="ml-2 inline-block size-2 rounded-[2px] bg-[#a5f0f7]" />{' '}
            Invested
            {usual > 0 && ' · dashed = usual'}
          </>
        )}
      </p>
    </>
  )
}

// ---------- Saved, invested, usual rate (the card on the teal edge) ----------
function Numbers({ a }) {
  const { totals, saving } = a
  const boxes = [
    ['Saved', signed(totals.saved), totals.saved < 0 ? 'text-loss' : 'text-cobalt'],
    ['Invested', signed(totals.invested), totals.invested < 0 ? 'text-loss' : 'text-teal'],
    ['Usual rate', saving.avgRate !== null ? pct(saving.avgRate) : '—', 'text-ink'],
  ]
  return (
    <div className={`${card} grid grid-cols-3 px-1 py-3.5 text-center`}>
      {boxes.map(([l, v, c], i) => (
        <div key={l} className={`min-w-0 px-2 ${i ? 'border-l border-line' : ''}`}>
          <span className="block text-xs text-muted">{l}</span>
          <b className={`tabular block truncate font-display text-lg ${c}`}>{v}</b>
        </div>
      ))}
    </div>
  )
}

// ---------- 1 · Where it went: a tile for investments and each goal (General savings too) ----------
function WhereItWent({ a }) {
  const goalOf = (id) => a.goalList.find((g) => g.id === id)
  const parts = []
  if (a.totals.invested)
    parts.push({ key: 'invest', name: 'Investments', sub: 'put in − taken out', cents: a.totals.invested, color: TEAL, to: '/investments', getquin: true })
  for (const [id, cents] of a.flowByGoal) {
    if (!cents) continue
    const g = id === 'general' ? null : goalOf(id)
    parts.push({
      key: id,
      name: g ? g.name : 'General savings',
      sub: g ? 'savings goal' : 'not in a goal',
      cents,
      color: g ? BLUE : '#6c8cff',
      emoji: g ? g.icon || '🎯' : '🏦',
      to: '/savings',
    })
  }
  parts.sort((x, y) => y.cents - x.cents)
  const totalIn = parts.filter((p) => p.cents > 0).reduce((s, p) => s + p.cents, 0) || 1
  if (!parts.length) return <p className={`${card} text-center text-sm text-muted`}>Nothing went into savings or investments in {periodLabel(a.period)}.</p>
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {parts.map((p) => (
        <button key={p.key} onClick={() => navigate(p.to)} className={`${card} relative overflow-hidden p-3.5 text-left`}>
          <span className="pointer-events-none absolute -top-6 -right-6 size-[70px] rounded-full" style={{ background: `${p.color}1f` }} />
          {p.getquin ? (
            <img src="/getquin.png" alt="" className="relative size-10 rounded-[13px] ring-1 ring-line" />
          ) : (
            <span className="relative grid size-10 place-items-center rounded-[13px] text-lg" style={{ background: `${p.color}26` }}>
              {p.emoji}
            </span>
          )}
          <b className="relative mt-2.5 block truncate text-[14.5px]">{p.name}</b>
          <b className="tabular relative block font-display text-[19px]" style={{ color: p.cents < 0 ? 'var(--color-loss)' : p.color }}>
            {signed(p.cents)}
          </b>
          <span className="relative block truncate text-[11.5px] text-muted">
            {p.cents > 0 ? `${pct(p.cents / totalIn)} · ` : ''}
            {p.sub}
          </span>
        </button>
      ))}
    </div>
  )
}

// ---------- 2 · At a glance: kept this year, months in a row, best month, usual rate ----------
function Glance({ a }) {
  const rows = monthRows(a)
  const y = yearOf(a)
  const streak = streakOf(rows)
  const withIncome = rows.filter((r) => r.rate !== null && !r.partial && !r.future)
  const best = withIncome.length ? withIncome.reduce((b, r) => (r.rate > b.rate ? r : b)) : null
  const tiles = [
    [`Kept in ${y.year}`, y.total < 0 ? signed(y.total) : whole(y.total), y.pace !== null ? `on pace for ${whole(y.pace)}` : 'the whole year', TEAL],
    ['In a row', streak ? `${streak} ${streak === 1 ? 'month' : 'months'}` : '—', streak ? 'kept money every month' : 'keep something to start one', '#2b8a3e'],
    ['Best month', best ? `${monthShort(best.key)} · ${pct(best.rate)}` : '—', 'of income kept', BLUE],
    ['Usual rate', a.saving.avgRate !== null ? pct(a.saving.avgRate) : '—', 'average of full months', '#c26b00'],
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map(([l, v, s, c]) => (
        <div key={l} className={`${card} relative overflow-hidden p-3.5`}>
          <span className="pointer-events-none absolute -top-5 -right-5 size-16 rounded-full" style={{ background: `${c}1f` }} />
          <span className="relative block text-xs text-muted">{l}</span>
          <b className="tabular relative block truncate font-display text-[21px] leading-tight" style={{ color: c }}>
            {v}
          </b>
          <span className="relative block truncate text-[11.5px] text-muted">{s}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- 3 · The year so far: kept against where the year is heading ----------
function YearSoFar({ a }) {
  const y = yearOf(a)
  const target = Math.max(y.total, y.pace ?? 0, 1)
  const done = Math.max(0, y.total) / target
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2">
        <span>
          <span className="text-[12.5px] text-muted">
            Kept in {y.year}
            {y.running ? ' so far' : ''}
          </span>
          <b className="tabular block font-display text-2xl leading-tight">{y.total < 0 ? signed(y.total) : whole(y.total)}</b>
        </span>
        {y.pace !== null && (
          <span className="tabular shrink-0 rounded-full bg-teal/12 px-2.5 py-1 text-xs font-bold text-teal">on pace for {whole(y.pace)}</span>
        )}
      </div>
      <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#5fd4e4] to-[#0c8599]" style={{ width: `${done * 100}%` }} />
        {y.pace !== null && done < 1 && (
          <span
            className="absolute inset-y-0 right-0"
            style={{ left: `${done * 100}%`, background: 'repeating-linear-gradient(45deg, rgba(12,133,153,.35) 0 4px, transparent 4px 8px)' }}
          />
        )}
      </div>
      <div className="mt-1.5 flex justify-between text-[11.5px] text-muted">
        <span>Jan</span>
        <span>Dec</span>
      </div>
    </div>
  )
}
