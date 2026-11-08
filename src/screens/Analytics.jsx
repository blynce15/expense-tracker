import { useEffect, useState } from 'react'
import { BigAmount, NavyPill, NavyTop, Overlap, pct, resetPeriod, useWorthExtras, whole, WORTH_PARTS } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, creepOf, currentPeriod, fetchAnalytics, monthShort, noticings, periodLabel, verdictOf } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { netWorthOf } from '../lib/networth'
import { monthlyCents } from '../lib/recurring'
import { navigate } from '../lib/useRoute'
import { dueText } from './Recurring'

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
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="pb-6">
      <NavyTop>{ready ? <Standing a={data} invest={invest} pension={pension} /> : <div className="h-[230px]" />}</NavyTop>
      {ready && (
        <>
          <Overlap>
            <MonthCard a={data} />
          </Overlap>
          <Noticing items={noticings(data, category, whole)} />
          <h2 className="mt-6 mb-2.5 px-5 font-display text-[19px] font-bold">Explore</h2>
          <div className="grid grid-cols-2 gap-2.5 px-4">
            <SpendTile a={data} category={category} />
            <SaveTile a={data} />
            <TimeTile a={data} />
            <RecurringTile a={data} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------- Net worth (navy top) ----------

function Standing({ a, invest, pension }) {
  const w = netWorthOf(a, invest, pension)
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

function Tile({ to, wide = false, children }) {
  return (
    <button
      onClick={() => navigate(to)}
      className={`min-w-0 rounded-[24px] bg-card p-3.5 text-left shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)] transition active:scale-[0.98] ${wide ? 'col-span-2' : ''}`}
    >
      {children}
    </button>
  )
}

function TileHead({ icon, color, title, chevron = false }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: `${color}24`, color }}>
        <Icon name={icon} size={17} strokeWidth={2.4} />
      </span>
      <b className="min-w-0 flex-1 text-[14px] leading-tight">{title}</b>
      {chevron && <Icon name="chevronRight" size={16} className="text-muted" />}
    </span>
  )
}

const Big = ({ children }) => <b className="tabular mt-2.5 block truncate font-display text-[21px] leading-tight">{children}</b>
const Sub = ({ children }) => <span className="tabular block min-h-[32px] text-xs leading-snug text-muted">{children}</span>

function SpendTile({ a, category }) {
  const v = verdictOf(a)
  const c = v.spending.change
  const sub = !a.totals.spent
    ? 'Nothing spent yet'
    : c === null
      ? 'so far this month'
      : Math.abs(c) < 0.03
        ? 'about your usual by now'
        : `${Math.round(Math.abs(c) * 100)}% ${c < 0 ? 'under' : 'over'} usual by now`
  const top = a.categories.slice(0, 5)
  return (
    <Tile to="/analytics/spending">
      <TileHead icon="moneyOut" color="#e8590c" title="Spending" />
      <Big>{whole(a.totals.spent)}</Big>
      <Sub>{sub}</Sub>
      {top.length > 0 && (
        <>
          <span className="mt-2 flex h-2 gap-0.5">
            {top.map((x) => (
              <span
                key={x.id ?? 'none'}
                className="rounded-[3px]"
                style={{
                  flex: x.cents,
                  background: category(x.id)?.color ?? '#94a3c4',
                }}
              />
            ))}
          </span>
          <span className="mt-1.5 block truncate text-[11.5px] text-muted">
            {top
              .slice(0, 3)
              .map((x) => category(x.id)?.icon ?? '❔')
              .join(' ')}{' '}
            top {Math.min(3, top.length)}
          </span>
        </>
      )}
    </Tile>
  )
}

function SaveTile({ a }) {
  const { totals, saving } = a
  const saved = Math.max(0, totals.saved)
  const invested = Math.max(0, totals.invested)
  return (
    <Tile to="/analytics/saving">
      <TileHead icon="savings" color="#0c8599" title="Savings & Investments" />
      <Big>{saving.kept < 0 ? `−${whole(-saving.kept)}` : whole(saving.kept)}</Big>
      <Sub>{saving.rate !== null ? `kept · ${pct(Math.max(0, saving.rate))} of income` : 'kept this month'}</Sub>
      {saved + invested > 0 && (
        <span className="mt-2 flex h-2 gap-0.5">
          {saved > 0 && <span className="rounded-[3px] bg-cobalt" style={{ flex: saved }} />}
          {invested > 0 && <span className="rounded-[3px] bg-teal" style={{ flex: invested }} />}
        </span>
      )}
      {(totals.saved !== 0 || totals.invested !== 0) && (
        <span className="tabular mt-1.5 flex gap-2.5 text-[11.5px] text-muted">
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-[3px] bg-cobalt" />
            {whole(totals.saved)}
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2 rounded-[3px] bg-teal" />
            {whole(totals.invested)}
          </span>
        </span>
      )}
    </Tile>
  )
}

function TimeTile({ a }) {
  const rows = a.trend.filter((t) => !t.future)
  const inTotal = rows.reduce((s, t) => s + t.income, 0)
  const outTotal = rows.reduce((s, t) => s + t.spent, 0)
  const creep = creepOf(a)
  const W = 180
  const H = 70
  const step = W / 12
  const bw = step * 0.3
  const max = Math.max(1, ...rows.map((t) => Math.max(t.income, t.spent)))
  const y = (c) => H - (c / max) * H
  const label = {
    up: 'spending creeping up',
    down: 'spending coming down',
    steady: 'spending steady',
  }
  const tone = {
    up: 'bg-warn-bg text-orange-text',
    down: 'bg-gain/12 text-gain',
    steady: 'bg-line/70 text-muted',
  }
  return (
    <Tile to="/analytics/trends" wide>
      <TileHead icon="invest" color="#1f4fe0" title="Over time" chevron />
      <span className="mt-2.5 flex items-end gap-3.5">
        <span className="min-w-[124px]">
          <span className="block text-xs text-muted">Last 12 months</span>
          <span className="tabular mt-1 block text-[13px]">
            <b className="text-gain">In</b> {whole(inTotal)}
          </span>
          <span className="tabular block text-[13px]">
            <b className="text-orange-text">Out</b> {whole(outTotal)}
          </span>
          {creep && <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[11.5px] font-bold ${tone[creep.trend]}`}>{label[creep.trend]}</span>}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto min-w-0 flex-1" aria-hidden="true">
          {rows.map((t, i) => {
            const x = i * step + step / 2 - bw - 0.5
            return (
              <g key={t.key} opacity={t.partial ? 0.45 : 1}>
                {t.income > 0 && <rect x={x} y={y(t.income)} width={bw} height={H - y(t.income)} rx="2" fill="#2b8a3e" />}
                {t.spent > 0 && <rect x={x + bw + 1} y={y(t.spent)} width={bw} height={H - y(t.spent)} rx="2" fill="#e8590c" />}
              </g>
            )
          })}
        </svg>
      </span>
    </Tile>
  )
}

// Recurring: what the payments cost a month and a year, their logos, what was added this month, the next one
function RecurringTile({ a }) {
  const today = todayISO()
  const pay = (a.recurring ?? []).filter((r) => r.active && r.type !== 'income').sort((x, y) => monthlyCents(y) - monthlyCents(x))
  const added = pay.filter((r) => (r.created_at ?? '').slice(0, 7) === today.slice(0, 7)).reduce((s, r) => s + monthlyCents(r), 0)
  const next = pay.filter((r) => r.next_due >= today).sort((x, y) => (x.next_due < y.next_due ? -1 : 1))[0]
  const shown = pay.slice(0, 6)
  return (
    <Tile to="/analytics/recurring" wide>
      <TileHead icon="repeat" color="#7c4dff" title="Recurring" chevron />
      {pay.length === 0 ? (
        <span className="mt-2 block text-[13px] text-muted">No recurring payments yet.</span>
      ) : (
        <>
          <span className="mt-2.5 flex items-baseline gap-2">
            <b className="tabular font-display text-2xl">{whole(a.recurringMonthly)}</b>
            <span className="text-[13px] text-muted">a month</span>
            <span className="tabular ml-auto text-[13px] text-muted">{whole(a.recurringMonthly * 12)} a year</span>
          </span>
          <span className="mt-3 flex items-center">
            {shown.map((r, i) => (
              <span key={r.id} className="relative rounded-full ring-[2.5px] ring-card" style={{ marginLeft: i ? -8 : 0, zIndex: 10 - i }}>
                <MerchantIcon name={r.name} className="size-[34px] rounded-full bg-tint-from text-base">
                  {r.icon}
                </MerchantIcon>
              </span>
            ))}
            {pay.length > shown.length && <span className="ml-2 text-[13px] font-semibold text-muted">+{pay.length - shown.length}</span>}
            {added > 0 && <span className="tabular ml-auto rounded-full bg-violet/12 px-2 py-0.5 text-xs font-bold text-violet">▲ {whole(added)} new</span>}
          </span>
          {next && (
            <span className="mt-3 flex items-center gap-2.5 rounded-[14px] bg-tint-from px-3 py-2.5">
              <MerchantIcon name={next.name} className="size-6 rounded-lg text-sm">
                {next.icon}
              </MerchantIcon>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                <b>Next: {next.name}</b> <span className="text-muted">· {dueText(next).split(' · ')[0].toLowerCase()}</span>
              </span>
              <b className="tabular text-[13.5px]">{formatCents(next.amount_cents)}</b>
            </span>
          )}
        </>
      )}
    </Tile>
  )
}
