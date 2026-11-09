import { useEffect, useState } from 'react'
import { BigAmount, NavyPeriodBar, NavyPill, NavyTop, Overlap, pct, Section, usePeriod, whole } from '../components/AnalyticsKit'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, fetchAnalytics, incomeSources, monthShort, periodLabel, prevLabel, verdictOf } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { daysUntil } from '../lib/recurring'
import { navigate } from '../lib/useRoute'

const GREEN = '#2b8a3e'
// The Income card's green (Analytics → Explore), as the top of this page
const GREEN_TOP = 'radial-gradient(120% 90% at 85% 0%, #5fd38f 0%, #2b8a3e 45%, #145c26 100%)'
const card = 'rounded-[24px] bg-card shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)]'
const COLORS = ['#2b8a3e', '#e8590c', '#1c7ed6', '#d6336c', '#7048e8', '#0c8599']

// Analytics → Income (owner chose "C · Source tiles", .harness/analytics-v8-income.html): the green top with the
// income and vs your usual, regular vs extras as a bar; the next payday on its edge; then where it came from (one
// tile per income category, regular or extra, with its last 12 months), the last 12 months stacked by source, and
// how steady it is. Regular = income named like a recurring income (Salary, meal card…); the rest are extras.
export default function AnalyticsIncome() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(() => cachedAnalytics(period))
  const [categories, setCategories] = useState(() => lookupCache.lookups?.categories ?? null)
  const [error, setError] = useState(null)

  useEffect(() => {
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your income: {error}</p>
  const a = data && data.period === period && categories ? data : null
  const s = a ? incomeSources(a) : null
  // Each source's look: its category, else a plain one; colours for the charts
  const look = (src, i) => {
    const c = categories?.find((x) => x.id === src.id)
    return { name: c?.name ?? 'No category', icon: c?.icon ?? '💶', color: c?.color ?? COLORS[i % COLORS.length] }
  }

  return (
    <div className="pb-6">
      <NavyTop background={GREEN_TOP}>
        <NavyPeriodBar period={period} onChange={setPeriod} />
        {a ? <Top a={a} s={s} /> : <div className="h-[110px]" />}
      </NavyTop>
      {a && (
        <>
          <Overlap>
            <Payday a={a} />
          </Overlap>
          {s.list.length > 0 ? (
            <>
              <Section n={1} title="Where it came from">
                <Sources a={a} s={s} look={look} />
              </Section>
              <Section n={2} title="The last 12 months">
                <Months a={a} s={s} look={look} />
              </Section>
              <Section n={3} title="Steady or not">
                <Steady a={a} />
              </Section>
            </>
          ) : (
            <p className={`${card} mx-4 mt-4 px-4 py-6 text-center text-sm text-muted`}>No income in {periodLabel(a.period)}.</p>
          )}
        </>
      )}
    </div>
  )
}

// ---------- The green top ----------
function Top({ a, s }) {
  const year = a.period.kind === 'year'
  const c = verdictOf(a).income.change
  const label = year ? a.period.key : periodLabel(a.period).split(' ')[0]
  return (
    <>
      <BigAmount cents={a.totals.income} label={a.current ? 'Income' : `Income in ${label}`} />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {c !== null && Math.abs(c) >= 0.03 && (
          <NavyPill>
            {c > 0 ? '▲' : '▼'} {Math.round(Math.abs(c) * 100)}% vs {year ? prevLabel(a.period) : 'usual'}
          </NavyPill>
        )}
        {s.total > 0 && (
          <NavyPill>
            Regular {pct(s.regular / s.total)} · Extras {pct(s.extra / s.total)}
          </NavyPill>
        )}
      </div>
      {s.total > 0 && (
        <div className="mt-3.5 flex h-2.5 gap-[3px]">
          {s.regular > 0 && <span className="rounded-full bg-white" style={{ flex: s.regular }} />}
          {s.extra > 0 && <span className="rounded-full bg-white/40" style={{ flex: s.extra }} />}
        </div>
      )}
    </>
  )
}

// ---------- The next payday (the card on the green edge) ----------
function Payday({ a }) {
  const today = todayISO()
  const next = (a.recurring ?? []).filter((r) => r.active && r.type === 'income' && r.next_due >= today).sort((x, y) => (x.next_due < y.next_due ? -1 : 1))[0]
  if (!next) {
    return (
      <div className={`${card} p-4 text-center text-[13.5px] text-muted`}>
        No regular income set up.{' '}
        <button onClick={() => navigate('/recurring')} className="font-semibold text-cobalt">
          Add one in Recurring
        </button>
      </div>
    )
  }
  const days = daysUntil(next.next_due)
  const [y, m, d] = next.next_due.split('-').map(Number)
  const date = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const size = 54
  const r = 23
  const C = 2 * Math.PI * r
  const fill = Math.max(0.04, 1 - Math.min(days, 30) / 30)
  return (
    <div className={`${card} p-3`}>
      <button
        onClick={() => navigate('/recurring')}
        className="flex w-full items-center gap-3 rounded-[18px] bg-gradient-to-br from-gain/15 to-gain/[.04] p-3 text-left ring-1 ring-gain/20 ring-inset"
      >
        <MerchantIcon name={next.name} className="size-12 rounded-2xl bg-card text-[23px]">
          {next.icon}
        </MerchantIcon>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-extrabold tracking-[0.08em] text-gain">NEXT PAYDAY</span>
          <b className="block truncate font-display text-lg leading-tight">{next.name}</b>
          <span className="tabular text-[12.5px] text-muted">
            {date} · <b className="text-ink">+{formatCents(next.amount_cents).replace(/,00$/, '')}</b>
          </span>
        </span>
        <span className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN} strokeOpacity=".16" strokeWidth="6" />
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={GREEN} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${fill * C} ${C}`} />
          </svg>
          <span className="absolute inset-0 grid place-items-center text-center leading-none">
            {days === 0 ? (
              <b className="text-[12px] text-gain">Today</b>
            ) : (
              <span>
                <b className="block font-display text-lg text-gain">{days}</b>
                <span className="text-[9.5px] font-bold text-muted">{days === 1 ? 'day' : 'days'}</span>
              </span>
            )}
          </span>
        </span>
      </button>
    </div>
  )
}

// ---------- Where it came from: a tile per source ----------
function Sources({ a, s, look }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {s.list.map((src, i) => {
        const l = look(src, i)
        const regular = src.regular >= src.cents / 2
        const max = Math.max(1, ...src.months)
        const thisIdx = a.last12.indexOf(a.period.kind === 'year' ? a.last12.at(-1) : a.period.key)
        return (
          <div key={src.id ?? 'none'} className={`${card} relative overflow-hidden p-3.5`}>
            <span className="pointer-events-none absolute -top-6 -right-6 size-[70px] rounded-full" style={{ background: `${l.color}1f` }} />
            <span className="relative flex items-start justify-between">
              <span className="grid size-10 place-items-center rounded-[13px] text-lg" style={{ background: `${l.color}26` }}>
                {l.icon}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${regular ? 'bg-gain/12 text-gain' : 'bg-line/70 text-muted'}`}>
                {regular ? 'regular' : 'extra'}
              </span>
            </span>
            <b className="relative mt-2.5 block truncate text-[14.5px]">{l.name}</b>
            <b className="tabular relative block font-display text-[19px] text-gain">+{whole(src.cents)}</b>
            <span className="tabular relative block text-xs text-muted">{pct(src.cents / s.total)} of income</span>
            <svg viewBox="0 0 120 26" className="relative mt-2 block h-auto w-full" aria-hidden="true">
              {src.months.map((c, k) => {
                const h = Math.max(c ? 2 : 1, (c / max) * 26)
                return (
                  <rect
                    key={k}
                    x={k * 10 + 1.5}
                    y={26 - h}
                    width="7"
                    height={h}
                    rx="2"
                    fill={c ? l.color : 'var(--color-line)'}
                    opacity={k === thisIdx ? 1 : 0.55}
                  />
                )
              })}
            </svg>
          </div>
        )
      })}
    </div>
  )
}

// ---------- The last 12 months, stacked by source ----------
function Months({ a, s, look }) {
  const [picked, setPicked] = useState(null)
  const top = s.list.slice(0, 4)
  const rest = s.list.slice(4)
  const series = [
    ...top.map((src, i) => ({ key: src.id ?? 'none', ...look(src, i), months: src.months })),
    ...(rest.length ? [{ key: 'rest', name: 'Other', color: '#94a3c4', months: a.last12.map((_, k) => rest.reduce((x, r) => x + r.months[k], 0)) }] : []),
  ]
  const now = todayISO().slice(0, 7)
  const totals = a.last12.map((_, k) => series.reduce((x, se) => x + se.months[k], 0))
  const max = Math.max(1, ...totals) * 1.05
  const W = 300
  const H = 100
  const step = W / 12
  const bw = step * 0.56
  const p = picked === null ? null : picked
  return (
    <div className={`${card} p-4`}>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Income each month by source">
        {a.last12.map((k, i) => {
          let y = H
          const future = k > now
          return (
            <g key={k} onClick={() => setPicked(i === picked ? null : i)} className="cursor-pointer">
              <rect x={i * step} y="0" width={step} height={H + 16} fill="transparent" />
              {!future &&
                series.map((se) => {
                  const c = se.months[i]
                  if (!c) return null
                  const h = (c / max) * H
                  y -= h
                  return (
                    <rect
                      key={se.key}
                      x={i * step + (step - bw) / 2}
                      y={y}
                      width={bw}
                      height={h}
                      rx="3"
                      fill={se.color}
                      opacity={picked !== null && picked !== i ? 0.3 : k === now ? 0.7 : 1}
                    />
                  )
                })}
              <text
                x={i * step + step / 2}
                y={H + 13}
                textAnchor="middle"
                fontSize="9.5"
                className={k === now || picked === i ? 'fill-ink font-bold' : 'fill-muted'}
              >
                {monthShort(k)[0]}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="tabular mt-1 min-h-5 text-center text-[12.5px] text-muted">
        {p !== null ? (
          <>
            {monthShort(a.last12[p])}
            {a.last12[p] === now && ' so far'}: <b className="text-ink">+{whole(totals[p])}</b>
          </>
        ) : (
          'Tap a month'
        )}
      </p>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
        {series.map((se) => (
          <span key={se.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[3px]" style={{ background: se.color }} />
            {se.name}
          </span>
        ))}
      </div>
    </div>
  )
}

// ---------- Steady or not: your usual month, the highest and the lowest (full months with any activity) ----------
function Steady({ a }) {
  const full = a.trend.filter((t) => !t.partial && !t.future && (t.income || t.spent))
  if (full.length < 2) return <p className={`${card} px-4 py-5 text-center text-sm text-muted`}>A few more months of history are needed.</p>
  const hi = full.reduce((b, t) => (t.income > b.income ? t : b))
  const lo = full.reduce((b, t) => (t.income < b.income ? t : b))
  const boxes = [
    ['Usual month', whole(a.avgIn ?? 0), `over ${full.length} months`],
    ['Highest', whole(hi.income), monthShort(hi.key)],
    ['Lowest', whole(lo.income), monthShort(lo.key)],
  ]
  return (
    <div className="grid grid-cols-3 gap-2">
      {boxes.map(([l, v, sub]) => (
        <div key={l} className={`${card} px-2 py-3 text-center`}>
          <span className="block text-xs text-muted">{l}</span>
          <b className="tabular block truncate font-display text-lg">{v}</b>
          <span className="block truncate text-[11px] text-muted">{sub}</span>
        </div>
      ))}
    </div>
  )
}
