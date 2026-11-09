import { useEffect, useState } from 'react'
import { BigAmount, NavyPill, NavyTop, Overlap, pct, resetPeriod, useWorthExtras, whole, WORTH_PARTS } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, currentPeriod, incomeSources, fetchAnalytics, monthShort, noticings, periodLabel, verdictOf } from '../lib/analytics'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { netWorthOf } from '../lib/networth'
import { monthlyCents } from '../lib/recurring'
import { navigate } from '../lib/useRoute'

// Analytics, always this month, top to bottom: net worth on the navy top (accounts, savings, investments,
// pension), this month against your usual, what's worth noticing, then Explore: Spending, Savings &
// Investments, Over time and Recurring, each opening its page (other months and years live there).
export default function Analytics() {
  const [period] = useState(() => currentPeriod('month'))
  const [data, setData] = useState(() => cachedAnalytics(period))
  const [categories, setCategories] = useState(() => lookupCache.lookups?.categories ?? null)
  const { invest, pension } = useWorthExtras()
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load analytics: {error}</p>

  const ready = data && data.period === period && categories && invest && pension
  const w = ready ? netWorthOf(data, invest, pension) : null
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="pb-6">
      <NavyTop>{ready ? <Standing w={w} /> : <div className="h-[230px]" />}</NavyTop>
      {ready && (
        <>
          <Overlap>
            <MonthCard a={data} />
          </Overlap>
          <Noticing items={noticings(data, category, whole)} />
          <h2 className="mt-6 mb-2.5 px-5 font-display text-[19px] font-bold">Explore</h2>
          <div className="grid grid-cols-2 gap-2.5 px-4">
            <IncomeTile a={data} />
            <SpendTile a={data} />
            <SaveTile a={data} />
            <RecurringTile a={data} />
            <TimeTile w={w} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Net worth (navy top) ----------

function Standing({ w }) {
  const values = w.line.map((pt) => pt.cents)
  const W = 300
  const H = 58
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W, H - ((v - min) / (max - min || 1)) * (H - 8) - 4])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const first = values[0]
  // As a % only when it started from a real amount (a start near €0 gives silly percentages)
  const yearPct = values.length > 1 && first > 0 && Math.abs(values.at(-1) / first - 1) < 2 ? (values.at(-1) - first) / first : null
  const parts = WORTH_PARTS.map((p) => ({
    ...p,
    cents: w.parts[p.key],
  })).filter((p) => p.cents > 0)
  const total = parts.reduce((s, p) => s + p.cents, 0) || 1

  return (
    <>
      <BigAmount cents={w.end} label="Net worth" />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {w.change !== 0 && (
          <NavyPill tone={w.change > 0 ? 'good' : 'bad'}>
            {w.change > 0 ? '▲' : '▼'} {whole(Math.abs(w.change))} this month
          </NavyPill>
        )}
        {yearPct !== null && Math.round(yearPct * 100) !== 0 && (
          <NavyPill>
            {yearPct > 0 ? '▲' : '▼'} {Math.abs(Math.round(yearPct * 100))}% in {values.length - 1} {values.length === 2 ? 'month' : 'months'}
          </NavyPill>
        )}
      </div>
      {values.length > 1 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-auto w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id="worth-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#8fb4ff" stopOpacity=".35" />
                <stop offset="1" stopColor="#8fb4ff" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="url(#worth-fill)" />
            <path d={line} fill="none" stroke="#8fb4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="4" fill="#8fb4ff" stroke="#0b1b45" strokeWidth="2" />
          </svg>
          <div className="mt-1 flex justify-between text-[10.5px] text-white/50">
            <span>{monthShort(w.line[0].key)}</span>
            <span>{monthShort(w.line.at(-1).key)}</span>
          </div>
        </>
      )}
      {parts.length > 1 && (
        <>
          <div className="mt-3 flex h-[7px] gap-[3px]">
            {parts.map((p) => (
              <span key={p.key} className="rounded-full" style={{ flex: p.cents / total, background: p.color }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-white/70">
            {parts.map((p) => (
              <span key={p.key} className="flex items-center gap-1.5">
                <span className="size-2 rounded-[3px]" style={{ background: p.color }} />
                {p.label}
              </span>
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ---------- This month (the card overlapping the navy) ----------

// "▼ 13%" chips: green when it's the good way, orange when not
function Chip({ change, goodWhenDown = false, points = false }) {
  if (change === null) return null
  const size = Math.round(Math.abs(change) * 100)
  if (Math.abs(change) < (points ? 0.02 : 0.03) || size === 0)
    return <span className="rounded-full bg-line/70 px-2 py-0.5 text-xs font-bold text-muted">= same</span>
  const up = change > 0
  const good = goodWhenDown ? !up : up
  return (
    <span className={`tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${good ? 'bg-gain/12 text-gain' : 'bg-warn-bg text-orange-text'}`}>
      {up ? '▲' : '▼'} {size}
      {points ? ' pts' : '%'}
    </span>
  )
}

function MonthCard({ a }) {
  const v = verdictOf(a)
  const spendTone = v.spending.change === null ? null : v.spending.change <= -0.03 ? 'good' : v.spending.change >= 0.03 ? 'bad' : null
  const tile = spendTone === 'good' ? 'bg-gain/12 text-gain' : spendTone === 'bad' ? 'bg-warn-bg text-orange-text' : 'bg-bubble text-cobalt'
  const kept = a.saving.kept
  const keptUsual = v.kept.usual !== null && a.totals.income > 0 ? v.kept.usual * a.totals.income : null
  return (
    <div className="rounded-[24px] bg-card pb-2 shadow-[0_14px_30px_-22px_rgba(11,27,69,0.45)]">
      <div className="flex items-center gap-3 px-[18px] pt-4 pb-1.5">
        <span className={`grid size-[34px] shrink-0 place-items-center rounded-[11px] ${tile}`}>
          <Icon name={spendTone === 'bad' ? 'arrowUp' : spendTone === 'good' ? 'arrowDown' : 'calendar'} size={17} strokeWidth={2.4} />
        </span>
        <span className="min-w-0">
          <b className="block font-display text-[17px] leading-tight">{v.sentence}</b>
          <span className="text-[12.5px] text-muted">
            {periodLabel(a.period).split(' ')[0]} · day {a.days.passed} of {a.days.total}
          </span>
        </span>
      </div>
      <MonthRow
        label="Spending"
        color="#e8590c"
        value={whole(v.spending.now)}
        now={v.spending.now}
        usual={v.spending.usual}
        note={v.spending.usual !== null ? `usual by now ${whole(v.spending.usual)}` : 'Not enough history yet'}
        chip={<Chip change={v.spending.change} goodWhenDown />}
      />
      <MonthRow
        label="Income"
        color="#2b8a3e"
        value={whole(v.income.now)}
        now={v.income.now}
        usual={v.income.usual}
        note={v.income.usual !== null ? `usual ${whole(v.income.usual)}` : 'Not enough history yet'}
        chip={<Chip change={v.income.change} />}
      />
      <MonthRow
        label="Kept"
        color="#0c8599"
        value={kept < 0 ? `−${whole(-kept)}` : whole(kept)}
        now={Math.max(0, kept)}
        usual={keptUsual}
        note={
          v.kept.rate !== null ? `${pct(Math.max(0, v.kept.rate))} of income${v.kept.usual !== null ? ` · usual ${pct(v.kept.usual)}` : ''}` : 'No income yet'
        }
        chip={<Chip change={v.kept.change} points />}
      />
    </div>
  )
}

// One row: label, note, amount; a bar of this month with a mark at your usual
function MonthRow({ label, color, value, now, usual, note, chip }) {
  const max = Math.max(1, now, usual ?? 0) * 1.15
  return (
    <div className="px-[18px] py-2.5">
      <div className="flex items-baseline gap-2">
        <b className="text-[15px]">{label}</b>
        <span className="tabular min-w-0 flex-1 truncate text-[12.5px] text-muted">{note}</span>
        <b className="tabular font-display text-[17px]">{value}</b>
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <div className="relative h-2 flex-1 rounded-full bg-line">
          <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(now / max) * 100}%`, background: color }} />
          {usual !== null && usual > 0 && <span className="absolute -inset-y-1 w-[2.5px] rounded-full bg-ink" style={{ left: `${(usual / max) * 100}%` }} />}
        </div>
        {chip}
      </div>
    </div>
  )
}

// ---------- Worth noticing ----------

const TONES = {
  up: '#e8590c',
  down: '#0f8a5f',
  new: '#7c4dff',
  week: '#1f4fe0',
  invest: '#0c8599',
  big: '#5a6b8c',
}
const CARD_STEP = 222 // card width + gap, for the dots

function Noticing({ items }) {
  const [shown, setShown] = useState(0)
  if (!items.length) return null
  return (
    <section>
      <div className="mt-6 mb-2.5 flex items-center justify-between px-5">
        <h2 className="font-display text-[19px] font-bold">Worth noticing</h2>
        {items.length > 1 && (
          <span className="flex gap-1" aria-hidden="true">
            {items.map((x, i) => (
              <span key={x.key} className={`h-1.5 rounded-full transition-all ${i === shown ? 'w-4 bg-ink' : 'w-1.5 bg-line'}`} />
            ))}
          </span>
        )}
      </div>
      <div
        className="flex snap-x snap-mandatory scroll-px-4 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => setShown(Math.min(items.length - 1, Math.round(e.currentTarget.scrollLeft / CARD_STEP)))}
      >
        {items.map((x) => {
          const color = TONES[x.tone] ?? TONES.big
          return (
            <button
              key={x.key}
              onClick={() => x.to && navigate(x.to)}
              className={`w-[212px] shrink-0 snap-start rounded-[22px] bg-card p-3.5 text-left shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)] transition ${x.to ? 'active:scale-[0.98]' : 'cursor-default'}`}
            >
              <span className="grid size-9 place-items-center rounded-xl" style={{ background: `${color}22`, color }}>
                <Icon name={x.icon} size={18} strokeWidth={2.3} />
              </span>
              <b className="mt-2.5 block text-[15px] leading-snug">{x.title}</b>
              <span className="tabular mt-0.5 block text-[13px] leading-snug text-muted">{x.sub}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

// ---------- Explore ----------
// Four equal cards, each in its topic's colour: one number, a small picture and a short line (owner chose "E1 · Colour
// cards" from .harness/analytics-v4-explore.html)

function ColourCard({ to, icon, title, value, sub, from, toColor, glow, children }) {
  return (
    <button
      onClick={() => navigate(to)}
      className="relative flex min-h-[172px] min-w-0 flex-col overflow-hidden rounded-[24px] p-3.5 text-left text-white transition active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${from}, ${toColor})`, boxShadow: `0 16px 28px -20px ${glow}` }}
    >
      <span className="pointer-events-none absolute -top-10 -right-9 size-[120px] rounded-full bg-white/[.12]" />
      <span className="relative flex items-center justify-between">
        <span className="grid size-[34px] place-items-center rounded-[11px] bg-white/20">
          <Icon name={icon} size={17} strokeWidth={2.4} />
        </span>
        <Icon name="chevronRight" size={16} className="opacity-80" />
      </span>
      <b className="relative mt-2.5 block truncate text-[13.5px] text-white/90">{title}</b>
      <b className="tabular relative block truncate font-display text-2xl leading-tight">{value}</b>
      <span className="relative mt-auto block pt-2.5">
        {children}
        <span className="mt-1.5 block truncate text-[11.5px] text-white/85">{sub}</span>
      </span>
    </button>
  )
}

const WHITES = ['#fff', 'rgba(255,255,255,.8)', 'rgba(255,255,255,.62)', 'rgba(255,255,255,.46)', 'rgba(255,255,255,.32)']

function SpendTile({ a }) {
  const c = verdictOf(a).spending.change
  const sub = !a.totals.spent
    ? 'Nothing spent yet'
    : c === null
      ? 'so far this month'
      : Math.abs(c) < 0.03
        ? 'about your usual'
        : `${Math.round(Math.abs(c) * 100)}% ${c < 0 ? 'under' : 'over'} usual`
  const top = a.categories.slice(0, 5)
  return (
    <ColourCard
      to="/analytics/spending"
      icon="moneyOut"
      title="Spending"
      value={whole(a.totals.spent)}
      sub={sub}
      from="#ff9f43"
      toColor="#e8590c"
      glow="#e8590c"
    >
      <span className="flex h-2 gap-0.5">
        {top.length ? (
          top.map((x, i) => <span key={x.id ?? 'none'} className="rounded-[3px]" style={{ flex: x.cents, background: WHITES[i] }} />)
        ) : (
          <span className="flex-1 rounded-[3px] bg-white/20" />
        )}
      </span>
    </ColourCard>
  )
}

function SaveTile({ a }) {
  const { totals, saving } = a
  const income = Math.max(totals.income, 1)
  const saved = Math.max(0, totals.saved)
  const invested = Math.max(0, totals.invested)
  const rest = Math.max(0, totals.income - saved - invested)
  return (
    <ColourCard
      to="/analytics/saving"
      icon="savings"
      title="Saving & investing"
      value={saving.kept < 0 ? `−${whole(-saving.kept)}` : whole(saving.kept)}
      sub={saving.rate !== null ? `${pct(Math.max(0, saving.rate))} of income kept` : 'kept this month'}
      from="#17b3c6"
      toColor="#0a6f80"
      glow="#0c8599"
    >
      <span className="flex h-2 gap-0.5">
        {saved > 0 && <span className="rounded-[3px] bg-white" style={{ flex: saved / income }} />}
        {invested > 0 && <span className="rounded-[3px] bg-[#a5f0f7]" style={{ flex: invested / income }} />}
        {(rest > 0 || saved + invested === 0) && <span className="rounded-[3px] bg-white/20" style={{ flex: rest / income || 1 }} />}
      </span>
    </ColourCard>
  )
}

// Over time, the wide card at the bottom: net worth's change over the months shown (as a % when it started from a
// real amount, else in euros) and its line on the right
function TimeTile({ w }) {
  const values = w.line.map((p) => p.cents)
  const months = values.length - 1
  const first = values[0] ?? 0
  const share = months > 0 && first > 0 && Math.abs(w.lineChange / first) < 2 ? w.lineChange / first : null
  const arrow = w.lineChange >= 0 ? '▲' : '▼'
  const value = months < 1 ? '—' : share !== null ? `${arrow} ${Math.abs(Math.round(share * 100))}%` : `${arrow} ${whole(Math.abs(w.lineChange))}`
  const W = 120
  const H = 44
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [months ? (i / months) * W : W, H - ((v - min) / (max - min || 1)) * (H - 8) - 4])
  return (
    <WideCard
      to="/analytics/trends"
      icon="invest"
      title="Over time"
      value={value}
      sub={`net worth in ${months === 1 ? 'a month' : months >= 11 ? 'a year' : `${months} months`}`}
      from="#4c7dff"
      toColor="#1638a8"
      glow="#1f4fe0"
    >
      {months > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full overflow-visible" aria-hidden="true">
          <path
            d={pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')}
            fill="none"
            stroke="#fff"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="3.5" fill="#fff" stroke="#3f6df0" strokeWidth="2" />
        </svg>
      )}
    </WideCard>
  )
}

// A colour card across both columns: icon, title, value and line on the left, a small picture on the right
function WideCard({ to, icon, title, value, sub, from, toColor, glow, children }) {
  return (
    <button
      onClick={() => navigate(to)}
      className="relative col-span-2 flex items-center gap-3.5 overflow-hidden rounded-[24px] p-3.5 text-left text-white transition active:scale-[0.98]"
      style={{ background: `linear-gradient(135deg, ${from}, ${toColor})`, boxShadow: `0 16px 28px -20px ${glow}` }}
    >
      <span className="pointer-events-none absolute -top-10 -right-8 size-[120px] rounded-full bg-white/[.12]" />
      <span className="relative grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-white/20">
        <Icon name={icon} size={17} strokeWidth={2.4} />
      </span>
      <span className="relative min-w-0 flex-1">
        <b className="block text-[13.5px] text-white/90">{title}</b>
        <b className="tabular block truncate font-display text-[22px] leading-tight">{value}</b>
        <span className="block truncate text-[11.5px] text-white/85">{sub}</span>
      </span>
      <span className="relative block w-[120px] shrink-0">{children}</span>
    </button>
  )
}

function RecurringTile({ a }) {
  const pay = (a.recurring ?? []).filter((r) => r.active && r.type !== 'income').sort((x, y) => monthlyCents(y) - monthlyCents(x))
  const shown = pay.slice(0, 5)
  return (
    <ColourCard
      to="/analytics/recurring"
      icon="repeat"
      title="Recurring"
      value={whole(a.recurringMonthly)}
      sub={pay.length ? `a month · ${pay.length} active` : 'No recurring payments yet'}
      from="#9b7bff"
      toColor="#5b2fd6"
      glow="#7c4dff"
    >
      {shown.length > 0 && (
        <span className="flex items-center">
          {shown.map((r, i) => (
            <span key={r.id} className="relative rounded-full ring-2 ring-white/35" style={{ marginLeft: i ? -6 : 0, zIndex: 10 - i }}>
              <MerchantIcon name={r.name} className="size-6 rounded-full bg-white text-xs">
                {r.icon}
              </MerchantIcon>
            </span>
          ))}
        </span>
      )}
    </ColourCard>
  )
}

// Income (first card, next to Spending): this month's income vs usual, how many sources, the 12 months as white bars
function IncomeTile({ a }) {
  const c = verdictOf(a).income.change
  const n = incomeSources(a).list.length
  const sub = !a.totals.income
    ? 'Nothing yet this month'
    : c === null
      ? `${n} ${n === 1 ? 'source' : 'sources'}`
      : Math.abs(c) < 0.03
        ? 'about your usual'
        : `${Math.round(Math.abs(c) * 100)}% ${c < 0 ? 'below' : 'above'} usual`
  const rows = a.trend
  const max = Math.max(1, ...rows.map((t) => t.income))
  const W = 140
  const H = 30
  const step = W / 12
  return (
    <ColourCard to="/analytics/income" icon="moneyIn" title="Income" value={whole(a.totals.income)} sub={sub} from="#5fd38f" toColor="#2b8a3e" glow="#2b8a3e">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" aria-hidden="true">
        {rows.map((t, i) => {
          if (t.future) return null
          const h = Math.max(2, (t.income / max) * H)
          return <rect key={t.key} x={i * step + step * 0.2} y={H - h} width={step * 0.6} height={h} rx="2" fill="#fff" opacity={t.partial ? 0.55 : 0.92} />
        })}
      </svg>
    </ColourCard>
  )
}
