import { useEffect, useState } from 'react'
import { pct, resetPeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import { currentPeriod, fetchAnalytics, monthShort, noticings, periodLabel, prevLabel, shiftMonth, verdictOf } from '../lib/analytics'
import { cachedPortfolio, fetchPortfolio } from '../lib/getquin'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { fetchProfile } from '../lib/profile'
import { navigate } from '../lib/useRoute'

// Analytics answers five questions, top to bottom: where you stand (net worth with investments), how this
// period is going against your usual (verdict), what's worth noticing, then Explore: where it goes, what you
// keep and better or worse, each opening its details page. Always this month: other months and years are
// on the details pages (net worth in the past can only be estimated for investments).
export default function Analytics() {
  const [period] = useState(() => currentPeriod('month'))
  const [data, setData] = useState(null)
  const [categories, setCategories] = useState(null)
  const [invest, setInvest] = useState(null) // { portfolio, since } from getquin, or {} when not linked
  const [error, setError] = useState(null)

  useEffect(() => {
    resetPeriod()
    let cancelled = false
    Promise.all([fetchAnalytics(period), fetchLookups()])
      .then(([a, lookups]) => {
        if (cancelled) return
        setData(a)
        setCategories(lookups.categories)
      })
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [period])

  // The getquin portfolio, for net worth: the last answer kept on the phone, else a fresh one
  useEffect(() => {
    fetchProfile()
      .then((p) => {
        const link = p?.answers?.getquinUrl
        const since = p?.answers?.getquinSince ?? null
        if (!link) return setInvest({})
        const cached = cachedPortfolio(link)
        setInvest({ portfolio: cached, since })
        // Fresh numbers (and the value history) in the background
        fetchPortfolio(link)
          .then((portfolio) => setInvest({ portfolio, since }))
          .catch(() => {})
      })
      .catch(() => setInvest({}))
  }, [])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load analytics: {error}</p>

  const ready = data && data.period === period && categories && invest
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="px-4 pt-1 pb-6">
      {ready && (
        <>
          <Standing a={data} invest={invest} />
          <Verdict a={data} />
          <Noticing items={noticings(data, category, whole)} />
          <h2 className="mt-6 mb-2.5 px-1 font-display text-[19px] font-bold">Explore</h2>
          <WhereItGoes a={data} category={category} />
          <div className="mt-2.5 grid grid-cols-2 gap-2.5">
            <KeepTile a={data} />
            <TrendTile a={data} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------- 1 · Where you stand ----------

// Net worth = accounts + the getquin portfolio. Back in time the portfolio is its real value at the end of each
// month (getquin's value history). If getquin can't give the history: today's value minus what was put in after
// that month (getquin's trades before getquinSince, your Invest transactions after).
function standingOf(a, invest) {
  const value = invest.portfolio?.value_cents ?? 0
  const put = new Map()
  const add = (k, cents) => put.set(k, (put.get(k) ?? 0) + cents)
  const p = invest.portfolio
  if (p && invest.since) {
    if (p.days) for (const d of p.days) d.date < invest.since && add(d.date.slice(0, 7), d.cents)
    else if (p.months) for (const m of p.months) m.key < invest.since.slice(0, 7) && add(m.key, m.cents)
  }
  for (const [k, m] of a.byMonth) if (m.investNet) add(k, m.investNet)
  const history = p?.history?.length ? p.history : null
  const thisMonth = a.worth.line.at(-1)?.key
  const investedAt = (k) => {
    if (!value) return 0
    if (history) {
      if (k >= thisMonth) return value
      // The value at the end of month k (the last one known up to then; before the first one, nothing)
      let found = 0
      for (const h of history) if (h.date.slice(0, 7) <= k) found = h.cents
      return found
    }
    let after = 0
    for (const [key, cents] of put) if (key > k) after += cents
    return Math.max(0, value - after)
  }
  const endKey = a.period.kind === 'year' ? `${a.period.key}-12` : a.period.key
  const prevKey = a.period.kind === 'year' ? `${Number(a.period.key) - 1}-12` : shiftMonth(a.period.key, -1)
  const end = a.worth.end + investedAt(endKey)
  const before = a.worth.end - a.worth.change + investedAt(prevKey)
  return {
    end,
    change: end - before,
    line: a.worth.line.map((pt) => ({ key: pt.key, cents: pt.cents + investedAt(pt.key) })),
    parts: [
      { label: 'Accounts', cents: a.worth.bank, color: '#fff' },
      { label: 'Savings', cents: a.worth.savings, color: '#9cc3ff' },
      { label: 'Investments', cents: value, color: '#7fe3ee' },
    ].filter((x) => x.cents > 0),
    hasInvestments: value > 0,
  }
}

function Standing({ a, invest }) {
  const s = standingOf(a, invest)
  const [euros, decimals] = formatCents(s.end).split(',')
  const values = s.line.map((pt) => pt.cents)
  const W = 300
  const H = 52
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W, H - ((v - min) / (max - min || 1)) * (H - 6) - 3])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const labelAt = [0, 3, 6, 9, values.length - 1].filter((i, n, all) => i < values.length && all.indexOf(i) === n)
  const total = s.parts.reduce((sum, x) => sum + x.cents, 0) || 1

  return (
    <section className="relative mt-1 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#2b8ef7] via-cobalt to-cobalt-deep px-[18px] pt-[18px] pb-4 text-white shadow-[0_18px_30px_-20px_rgba(31,79,224,0.9)]">
      <span className="pointer-events-none absolute -top-16 -right-14 size-48 rounded-full bg-white/[.08]" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-white/85">
          <Icon name="chart" size={15} strokeWidth={2.3} />
          Where you stand
        </p>
        {s.change !== 0 && (
          <span className="tabular rounded-full bg-white/[.18] px-2.5 py-1 text-xs font-bold">
            {s.change > 0 ? '▲' : '▼'} {whole(Math.abs(s.change))} vs {prevLabel(a.period)}
          </span>
        )}
      </div>
      <p className="tabular relative mt-0.5 truncate font-display leading-tight font-bold tracking-tight">
        <span className="text-[36px]">{euros}</span>
        <span className="text-lg text-white/55">,{decimals}</span>
      </p>
      <p className="relative text-[12.5px] text-white/80">
        Net worth · {s.hasInvestments ? 'accounts, savings and investments' : 'accounts and savings'}
      </p>
      {values.length > 1 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="relative mt-2.5 block h-auto w-full overflow-visible" aria-hidden="true">
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="#fff" fillOpacity=".13" />
            <path d={line} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="4" fill="#fff" />
          </svg>
          <div className="relative mt-1 flex justify-between text-[10.5px] text-white/60">
            {labelAt.map((i) => (
              <span key={i}>{monthShort(s.line[i].key)}</span>
            ))}
          </div>
        </>
      )}
      {s.parts.length > 0 && (
        <>
          <div className="relative mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
            {s.parts.map((x) => (
              <span key={x.label} style={{ flex: x.cents / total, background: x.color }} />
            ))}
          </div>
          <div className="relative mt-2 flex justify-between gap-2 text-xs text-white/90">
            {s.parts.map((x) => (
              <span key={x.label} className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: x.color }} />
                  {x.label}
                </span>
                <b className="tabular block truncate text-sm">{whole(x.cents)}</b>
              </span>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

// ---------- 2 · October so far ----------

const GOOD = { bg: 'bg-gain/12', text: 'text-gain' }
const BAD = { bg: 'bg-warn-bg', text: 'text-orange-text' }
const SAME = { bg: 'bg-line/70', text: 'text-muted' }

// "▼ 8%" (good when down for spending), "▲ 8 pts", "= same"
function chipFor(change, { goodWhenDown = false, points = false } = {}) {
  if (change === null) return null
  const size = Math.round(change * 100)
  if (Math.abs(change) < (points ? 0.02 : 0.03) || size === 0) return { text: '= same', tone: SAME }
  const up = change > 0
  const good = goodWhenDown ? !up : up
  return { text: `${up ? '▲' : '▼'} ${Math.abs(size)}${points ? ' pts' : '%'}`, tone: good ? GOOD : BAD }
}

function Verdict({ a }) {
  const v = verdictOf(a)
  const year = a.period.kind === 'year'
  const label = a.current
    ? `${year ? a.period.key : periodLabel(a.period).split(' ')[0]} so far · day ${a.days.passed} of ${a.days.total}`
    : periodLabel(a.period)
  // Spending is compared up to the same day; income with a whole usual month (it usually arrives at once)
  const usual = (cents, byNow) =>
    cents === null ? 'Not enough history yet' : year ? `${prevLabel(a.period)} by now ${whole(cents)}` : `usual ${whole(cents)}${byNow && a.current ? ' by now' : ''}`
  const spend = chipFor(v.spending.change, { goodWhenDown: true })
  const dot = spend?.tone === GOOD ? '#0f8a5f' : spend?.tone === BAD ? '#f08c00' : '#1f4fe0'

  return (
    <section className="mt-3 rounded-[24px] bg-card px-4 pt-4 pb-1.5">
      <p className="flex items-center gap-2 text-xs font-bold tracking-[0.08em] text-muted uppercase">
        <span className="size-2 rounded-full" style={{ background: dot, boxShadow: `0 0 0 4px ${dot}22` }} />
        {label}
      </p>
      <p className="mt-2 mb-3 font-display text-[21px] leading-tight font-bold">{v.sentence}</p>
      <VerdictRow icon="card" color="#f08c00" label="Spending" value={whole(v.spending.now)} sub={usual(v.spending.usual, true)} chip={spend} />
      <VerdictRow
        icon="savings"
        color="#0c8599"
        label="Kept"
        value={v.kept.rate !== null ? pct(Math.max(0, v.kept.rate)) : '—'}
        sub={v.kept.usual !== null ? `usual ${pct(v.kept.usual)}` : 'Not enough history yet'}
        chip={chipFor(v.kept.change, { points: true })}
      />
      <VerdictRow icon="plus" color="#0f8a5f" label="Income" value={whole(v.income.now)} sub={usual(v.income.usual)} chip={chipFor(v.income.change)} />
    </section>
  )
}

function VerdictRow({ icon, color, label, value, sub, chip }) {
  return (
    <div className="flex items-center gap-3 border-t border-line py-2.5">
      <span className="grid size-[34px] shrink-0 place-items-center rounded-[11px]" style={{ background: `${color}1f`, color }}>
        <Icon name={icon} size={17} strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block text-[14.5px]">{label}</b>
        <span className="tabular block truncate text-xs text-muted">{sub}</span>
      </span>
      <b className="tabular font-display text-base">{value}</b>
      <span className={`tabular min-w-[62px] rounded-full px-2 py-[3px] text-center text-xs font-bold ${chip ? `${chip.tone.bg} ${chip.tone.text}` : 'invisible'}`}>
        {chip?.text ?? '—'}
      </span>
    </div>
  )
}

// ---------- 3 · Worth noticing ----------

const TONES = { up: '#e8590c', down: '#0f8a5f', new: '#7c4dff', week: '#1f4fe0', invest: '#0c8599', big: '#495057' }
const CARD_STEP = 246 // card width + gap, for the dots

function Noticing({ items }) {
  const [shown, setShown] = useState(0)
  if (!items.length) return null
  return (
    <section>
      <div className="mt-6 mb-2.5 flex items-center justify-between px-1">
        <h2 className="font-display text-[18px] font-bold">Worth noticing</h2>
        {items.length > 1 && (
          <span className="flex gap-1" aria-hidden="true">
            {items.map((x, i) => (
              <span key={x.key} className={`h-1.5 rounded-full transition-all ${i === shown ? 'w-4 bg-ink' : 'w-1.5 bg-line'}`} />
            ))}
          </span>
        )}
      </div>
      <div
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => setShown(Math.min(items.length - 1, Math.round(e.currentTarget.scrollLeft / CARD_STEP)))}
      >
        {items.map((x) => {
          const color = TONES[x.tone] ?? TONES.big
          return (
            <button
              key={x.key}
              onClick={() => x.to && navigate(x.to)}
              className={`relative w-[236px] shrink-0 snap-start overflow-hidden rounded-[22px] bg-card p-3.5 text-left ${x.to ? 'active:scale-[0.98]' : 'cursor-default'} transition`}
            >
              <span className="pointer-events-none absolute -top-6 -right-6 size-[84px] rounded-full" style={{ background: `${color}14` }} />
              <span className="relative grid size-[34px] place-items-center rounded-[11px] text-white" style={{ background: color }}>
                <Icon name={x.icon} size={17} strokeWidth={2.3} />
              </span>
              <b className="relative mt-2.5 block text-[15px] leading-snug">{x.title}</b>
              <span className="tabular relative mt-0.5 block text-[12.5px] text-muted">{x.sub}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ---------- 4 · Explore ----------

function Halo() {
  return <span className="pointer-events-none absolute -top-12 -right-10 size-36 rounded-full bg-white/[.12]" />
}
function TileHead({ icon, title, inline = false }) {
  return (
    <div className={`relative flex items-center ${inline ? 'gap-2.5' : 'justify-between'}`}>
      <span className="grid size-[34px] place-items-center rounded-[11px] bg-white/20">
        <Icon name={icon} size={17} strokeWidth={2.3} />
      </span>
      {inline && <span className="flex-1 text-[13.5px] font-bold text-white/90">{title}</span>}
      <span className="grid size-[26px] place-items-center rounded-full bg-white/[.18]">
        <Icon name="chevronRight" size={14} strokeWidth={2.6} />
      </span>
    </div>
  )
}

// Where it goes (orange): spent, fixed vs everyday, the top categories. Tap → Spending; a category → its page.
function WhereItGoes({ a, category }) {
  const spent = a.totals.spent
  const fixed = Math.min(a.spending.fixed, spent)
  const top = a.categories.slice(0, 3)
  const rest = Math.max(0, spent - top.reduce((s, c) => s + c.cents, 0))
  const shades = ['#fff', 'rgba(255,255,255,.72)', 'rgba(255,255,255,.48)']
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate('/analytics/spending')}
      onKeyDown={(e) => e.key === 'Enter' && navigate('/analytics/spending')}
      className="relative cursor-pointer overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ff9f43] to-[#e8590c] p-4 text-white shadow-[0_16px_28px_-20px_rgba(232,89,12,0.9)] active:scale-[0.99]"
    >
      <Halo />
      <TileHead icon="card" title="Where it goes" inline />
      <div className="relative mt-2.5 flex flex-wrap items-baseline gap-x-2">
        <b className="tabular font-display text-[27px]">{whole(spent)}</b>
        <span className="text-[12.5px] text-white/90">
          {spent ? (
            <>
              spent · <b>{whole(fixed)} fixed</b> · <b>{whole(spent - fixed)} everyday</b>
            </>
          ) : (
            'Nothing spent yet'
          )}
        </span>
      </div>
      {spent > 0 && (
        <>
          <div className="relative mt-3 flex h-[9px] gap-0.5 overflow-hidden rounded-full bg-white/20">
            {top.map((c, i) => (
              <span key={c.id ?? 'none'} style={{ flex: c.cents, background: shades[i] }} />
            ))}
            {rest > 0 && <span style={{ flex: rest, background: 'rgba(255,255,255,.26)' }} />}
          </div>
          <div className="relative mt-2.5 grid grid-cols-3 gap-2 text-[12.5px]">
            {top.map((c) => {
              const cat = category(c.id)
              return (
                <button
                  key={c.id ?? 'none'}
                  onClick={(e) => {
                    e.stopPropagation()
                    navigate(`/analytics/categories/${c.id ?? 'none'}`)
                  }}
                  className="min-w-0 text-left"
                >
                  <b className="block truncate">
                    {cat?.icon ?? '❔'} {cat?.name ?? 'No category'}
                  </b>
                  <span className="tabular text-white/85">{whole(c.cents)}</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// What you keep (teal): saved + invested, as a share of income. Tap → Saving.
function KeepTile({ a }) {
  const { totals, saving } = a
  const income = totals.income
  const saved = income > 0 ? Math.max(0, Math.min(1, totals.saved / income)) : 0
  const invested = income > 0 ? Math.max(0, Math.min(1 - saved, totals.invested / income)) : 0
  return (
    <button
      onClick={() => navigate('/analytics/saving')}
      className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#17b3c6] to-[#0a6f80] p-[15px] text-left text-white shadow-[0_16px_28px_-20px_rgba(12,133,153,0.9)] active:scale-[0.98]"
    >
      <Halo />
      <TileHead icon="savings" />
      <span className="relative mt-3 block text-[13px] font-bold text-white/90">What you keep</span>
      <b className="tabular relative block font-display text-2xl">{whole(saving.kept)}</b>
      <span className="relative mt-2.5 flex h-2 overflow-hidden rounded-full bg-white/20">
        <span style={{ width: `${saved * 100}%`, background: '#fff' }} />
        <span style={{ width: `${invested * 100}%`, background: '#a5f0f7' }} />
      </span>
      <span className="relative mt-1.5 block text-[11.5px] text-white/85">
        {income > 0 && saving.rate !== null ? `${pct(Math.max(0, saving.rate))} of income` : 'No income yet'}
      </span>
    </button>
  )
}

// Better or worse (navy): spending against your usual, with the 12 months as bars, your usual month dashed and
// this month solid so far + faded up to where it's heading. Tap → Trends.
function TrendTile({ a }) {
  const v = verdictOf(a)
  const chip = chipFor(v.spending.change, { goodWhenDown: true })
  const W = 140
  const H = 34
  const usual = a.avgOut ?? 0
  const onTrack = a.period.kind === 'month' ? (a.spending.onTrack ?? 0) : 0
  const max = Math.max(1, usual, onTrack, ...a.trend.map((t) => t.spent))
  const step = W / a.trend.length
  const bw = step * 0.56
  const y = (c) => H - (Math.min(c, max) / max) * H
  const better = chip?.tone === GOOD
  return (
    <button
      onClick={() => navigate('/analytics/trends')}
      className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#3a4a7a] to-[#1b2550] p-[15px] text-left text-white shadow-[0_16px_28px_-20px_rgba(27,37,80,0.9)] active:scale-[0.98]"
    >
      <Halo />
      <TileHead icon="bars" />
      <span className="relative mt-3 block text-[13px] font-bold text-white/90">Better or worse</span>
      <b className="tabular relative block font-display text-2xl">{chip?.text ?? '—'}</b>
      <svg viewBox={`0 0 ${W} ${H}`} className="relative mt-2 block h-auto w-full overflow-visible" aria-hidden="true">
        {a.trend.map((t, i) => {
          const x = i * step + (step - bw) / 2
          if (t.future || (!t.partial && !t.spent)) return null
          if (t.partial) {
            return (
              <g key={t.key}>
                {onTrack > t.spent && <rect x={x} y={y(onTrack)} width={bw} height={H - y(onTrack)} rx={bw / 3} fill={better ? 'rgba(126,240,180,.3)' : 'rgba(255,184,77,.3)'} />}
                <rect x={x} y={y(t.spent)} width={bw} height={Math.max(2, H - y(t.spent))} rx={bw / 3} fill={better ? '#7ef0b4' : '#ffb84d'} />
              </g>
            )
          }
          return <rect key={t.key} x={x} y={y(t.spent)} width={bw} height={Math.max(2, H - y(t.spent))} rx={bw / 3} fill="rgba(255,255,255,.28)" />
        })}
        {usual > 0 && <line x1="0" x2={W} y1={y(usual)} y2={y(usual)} stroke="rgba(255,255,255,.75)" strokeWidth="1.3" strokeDasharray="3 4" />}
      </svg>
      <span className="relative mt-1.5 block text-[11.5px] text-white/85">
        spending vs {a.period.kind === 'year' ? prevLabel(a.period) : 'usual'}
      </span>
    </button>
  )
}
