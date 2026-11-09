import { useEffect, useState } from 'react'
import { BigAmount, NavyPeriodBar, NavyPill, NavyTop, Overlap, pct, Section, usePeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, fetchAnalytics, monthShort, periodLabel, placesFrom, prevLabel, verdictOf } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { navigate } from '../lib/useRoute'

const pad = (n) => String(n).padStart(2, '0')
const DEEP = '#e8590c'
// The Spending card's orange (Analytics → Explore), as the top of this page
const ORANGE_TOP = 'radial-gradient(120% 90% at 85% 0%, #ffb066 0%, #f0701e 45%, #b8410a 100%)'
const VIOLET = '#7c4dff'
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const dayMonth = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
}

/// Analytics → Spending (owner chose "B · Daily allowance first" + C's "At a glance" tiles + categories as a pie,
// .harness/analytics-v10-spending.html): the orange top with the total (vs your usual, on track for); how much a day
// keeps you at your usual month on its edge; then when you spend (calendar + weekdays), at a glance, top categories
// as a pie, where exactly, the big ones. Fixed costs live on the Recurring page. Month view works in days; Year in months.
export default function AnalyticsSpending() {
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your spending: {error}</p>

  const a = data && data.period === period && categories ? data : null
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="pb-6">
      <NavyTop background={ORANGE_TOP}>
        <NavyPeriodBar period={period} onChange={setPeriod} />
        {a ? <Top a={a} /> : <div className="h-[92px]" />}
      </NavyTop>
      {a && (
        <>
          <Overlap>
            <Allowance a={a} />
          </Overlap>
          {a.expenses.length > 0 ? (
            <>
              <Section n={1} title="When you spend">
                <When a={a} />
              </Section>
              <Section n={2} title="At a glance">
                <Glance a={a} />
              </Section>
              <Section n={3} title="Top categories">
                <CategoryPie a={a} category={category} />
              </Section>
              <Section n={4} title="Where exactly">
                <Places a={a} category={category} />
              </Section>
              <Section n={5} title="The big ones">
                <Biggest a={a} category={category} />
              </Section>
            </>
          ) : (
            <p className="mx-4 mt-4 rounded-[24px] bg-card px-4 py-6 text-center text-sm text-muted">No spending in {periodLabel(a.period)}.</p>
          )}
        </>
      )}
    </div>
  )
}

const card = 'rounded-[24px] bg-card p-4'
const Title = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-2">
    <b className="font-display text-[17px]">{children}</b>
    {right && <span className="text-right text-[12.5px] text-muted">{right}</span>}
  </div>
)

// ---------- The navy top: how much you spent ----------
function Top({ a }) {
  const year = a.period.kind === 'year'
  const v = verdictOf(a)
  const c = v.spending.change
  const label = year ? a.period.key : periodLabel(a.period).split(' ')[0]
  return (
    <>
      <BigAmount cents={a.totals.spent} label={a.current ? 'Spent so far' : `Spent in ${label}`} />
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {c !== null && Math.abs(c) >= 0.03 && (
          <NavyPill tone={c < 0 ? 'good' : 'bad'}>
            {c < 0 ? '▼' : '▲'} {Math.round(Math.abs(c) * 100)}% vs {year ? prevLabel(a.period) : 'usual'}
            {a.current ? ' by now' : ''}
          </NavyPill>
        )}
        {a.spending.onTrack !== null && a.current && <NavyPill>On track for {whole(a.spending.onTrack)}</NavyPill>}
      </div>
    </>
  )
}

// ---------- The daily allowance (the card on the orange edge) ----------
// Month in progress: how much a day keeps you at your usual month, with a ring of this month against a usual one
// (dot = how far through the month). A finished month or a year: how it ended against your usual / last year.
function Allowance({ a }) {
  const year = a.period.kind === 'year'
  const spent = a.totals.spent
  const usual = year ? (a.spending.pace.previous.at(-1) ?? 0) : (a.avgOut ?? 0)
  const card2 = 'rounded-[24px] bg-card p-4 shadow-[0_14px_30px_-22px_rgba(11,27,69,0.45)]'
  if (!usual) {
    return (
      <div className={card2}>
        <b className="font-display text-[17px]">{whole(a.spending.perDay * (year ? 30.44 : 1))}</b>
        <span className="text-[13px] text-muted"> a {year ? 'month' : 'day'} on average · not enough history yet to compare</span>
      </div>
    )
  }
  const share = spent / usual
  const daysLeft = a.days.total - a.days.passed
  const left = usual - spent
  const running = a.current && !year
  const size = 86
  const r = 36
  const C = 2 * Math.PI * r
  const dotA = (a.days.passed / a.days.total) * 2 * Math.PI - Math.PI / 2
  return (
    <div className={`${card2} flex items-center gap-3.5`}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={DEEP} strokeOpacity=".15" strokeWidth="10" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={DEEP}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${Math.min(1, share) * C} ${C}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          {a.current && (
            <circle cx={size / 2 + Math.cos(dotA) * r} cy={size / 2 + Math.sin(dotA) * r} r="4.5" fill="var(--color-card)" stroke={DEEP} strokeWidth="2.5" />
          )}
        </svg>
        <span className="absolute inset-0 grid place-items-center text-center leading-tight">
          <span>
            <b className="tabular block font-display text-base">{pct(share)}</b>
            <span className="text-[9.5px] font-bold text-muted">of {year ? prevLabel(a.period) : 'usual'}</span>
          </span>
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {running && left > 0 && daysLeft > 0 ? (
          <>
            <span className="block text-[12.5px] text-muted">To stay at your usual month</span>
            <b className="tabular block font-display text-2xl leading-tight">
              {whole(left / daysLeft)} <span className="font-sans text-[13px] font-medium text-muted">a day</span>
            </b>
            <span className="tabular block text-[12.5px] text-muted">
              {whole(left)} left of {whole(usual)} · {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
            </span>
          </>
        ) : (
          <>
            <span className="block text-[12.5px] text-muted">
              {year ? `${a.period.key} vs ${prevLabel(a.period)}` : a.current ? 'This month' : periodLabel(a.period)}
            </span>
            <b className={`tabular block font-display text-2xl leading-tight ${left < 0 ? 'text-orange-text' : 'text-gain'}`}>
              {whole(Math.abs(left))} {left < 0 ? 'over' : 'under'}
            </b>
            <span className="tabular block text-[12.5px] text-muted">
              {year ? prevLabel(a.period) : 'a usual month'}: {whole(usual)}
            </span>
          </>
        )}
      </div>
    </div>
  )
}

// ---------- At a glance ----------
// Month: per day, no-spend days, priciest day, weekends' share. Year: per month, no-spend days, priciest month, weekends.
function Glance({ a }) {
  const year = a.period.kind === 'year'
  const [y0, m0, d0] = (year ? `${a.period.key}-01-01` : `${a.period.key}-01`).split('-').map(Number)
  let noSpend = 0
  for (let d = new Date(y0, m0 - 1, d0), i = 0; i < a.days.passed; i += 1, d.setDate(d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    if (!(a.spentByDay.get(iso) > 0)) noSpend += 1
  }
  let weekend = 0
  for (const t of a.expenses) {
    const [y, m, d] = t.date.split('-').map(Number)
    if ([0, 6].includes(new Date(y, m - 1, d).getDay())) weekend += t.amount_cents
  }
  let top = null
  if (year) {
    for (const k of a.last12.filter((k) => k.slice(0, 4) === a.period.key)) {
      const c = a.byMonth.get(k)?.spent ?? 0
      if (c > 0 && (!top || c > top.cents)) top = { label: monthShort(k), cents: c }
    }
  } else if (a.spending.biggestDay) {
    top = { label: dayMonth(a.spending.biggestDay.date), cents: a.spending.biggestDay.cents }
  }
  const tiles = [
    [year ? 'Per month' : 'Per day', whole(a.spending.perDay * (year ? 30.44 : 1)), 'on average', DEEP],
    ['No-spend days', String(noSpend), `of ${a.days.passed} so far`, '#0f8a5f'],
    [year ? 'Priciest month' : 'Priciest day', top ? whole(top.cents) : '—', top?.label ?? 'nothing yet', '#c26b00'],
    ['Weekends', a.totals.spent ? pct(weekend / a.totals.spent) : '—', 'of your spending', VIOLET],
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {tiles.map(([l, v, s, c]) => (
        <div key={l} className={`${card} relative overflow-hidden p-3.5`}>
          <span className="pointer-events-none absolute -top-5 -right-5 size-16 rounded-full" style={{ background: `${c}1f` }} />
          <span className="relative block text-xs text-muted">{l}</span>
          <b className="tabular relative block font-display text-[22px] leading-tight" style={{ color: c }}>
            {v}
          </b>
          <span className="relative block truncate text-[11.5px] text-muted">{s}</span>
        </div>
      ))}
    </div>
  )
}

// ---------- Top categories: a pie with percentages ----------
function CategoryPie({ a, category }) {
  const total = a.totals.spent || 1
  const top = a.categories.slice(0, 5)
  const rest = a.categories.slice(5).reduce((s, c) => s + c.cents, 0)
  const slices = [
    ...top.map((c) => ({
      key: c.id ?? 'none',
      id: c.id,
      cents: c.cents,
      color: category(c.id)?.color ?? '#94a3c4',
      name: category(c.id)?.name ?? 'No category',
      icon: category(c.id)?.icon ?? '❔',
    })),
    ...(rest > 0 ? [{ key: 'rest', id: undefined, cents: rest, color: '#94a3c4', name: 'Other', icon: '•' }] : []),
  ]
  const size = 150
  const R = size / 2
  let at = -Math.PI / 2
  const arcs = slices.map((s) => {
    const f = s.cents / total
    const a0 = at
    const a1 = at + f * 2 * Math.PI
    at = a1
    const large = a1 - a0 > Math.PI ? 1 : 0
    const p = (ang, rad) => [R + Math.cos(ang) * rad, R + Math.sin(ang) * rad]
    const [x0, y0] = p(a0, R)
    const [x1, y1] = p(a1, R)
    const d = f >= 0.9999 ? `M${R} 0 A${R} ${R} 0 1 1 ${R - 0.01} 0 Z` : `M${R} ${R} L${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`
    const [lx, ly] = p((a0 + a1) / 2, R * 0.62)
    return { ...s, f, d, lx, ly }
  })
  return (
    <div className={card}>
      <div className="flex items-center gap-4">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img" aria-label="Spending by category">
          {arcs.map((s) => (
            <path key={s.key} d={s.d} fill={s.color} stroke="var(--color-card)" strokeWidth="2" strokeLinejoin="round" />
          ))}
          {arcs
            .filter((s) => s.f >= 0.08)
            .map((s) => (
              <text
                key={s.key}
                x={s.lx}
                y={s.ly + 4}
                textAnchor="middle"
                fontSize="12"
                fontWeight="800"
                fill="#fff"
                style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,.18)', strokeWidth: 2 }}
              >
                {pct(s.f)}
              </text>
            ))}
        </svg>
        <ul className="min-w-0 flex-1">
          {arcs.map((s) => (
            <li key={s.key}>
              <button
                disabled={s.id === undefined}
                onClick={() => navigate(`/analytics/categories/${s.id ?? 'none'}`)}
                className="flex w-full items-center gap-2 py-1 text-left text-[13px]"
              >
                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate">
                  {s.icon} {s.name}
                </span>
                <b className="tabular">{pct(s.f)}</b>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <button onClick={() => navigate('/analytics/categories')} className="mt-2 flex w-full items-center justify-center text-[13.5px] font-bold text-cobalt">
        All categories
        <Icon name="chevronRight" size={15} strokeWidth={2.6} />
      </button>
    </div>
  )
}

// ---------- 3 · Where exactly ----------
function Places({ a, category }) {
  const places = placesFrom(a.expenses, 5)
  const count = a.expenses.length
  if (!places.length) return <p className={`${card} text-center text-sm text-muted`}>Name your expenses to see where you spend most.</p>
  const max = places[0].cents || 1
  return (
    <div className={card}>
      <Title right={`${count} ${count === 1 ? 'purchase' : 'purchases'} · ${whole(a.totals.spent / count)} average`}>Top places</Title>
      <ul className="mt-1.5">
        {places.map((g, i) => {
          const cat = category(g.categoryId)
          return (
            <li key={g.name} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-line' : ''}`}>
              <MerchantIcon name={g.name} className="size-9 rounded-[11px] text-[17px]" style={{ background: `${cat?.color ?? '#94a3c4'}22` }}>
                {cat?.icon ?? '🧾'}
              </MerchantIcon>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <b className="truncate text-[14.5px]">{g.name}</b>
                  <b className="tabular shrink-0 font-display text-[15px]">{whole(g.cents)}</b>
                </span>
                <span className="mt-1.5 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                    <span className="block h-full rounded-full bg-gradient-to-r from-[#ff9f43] to-[#e8590c]" style={{ width: `${(g.cents / max) * 100}%` }} />
                  </span>
                  <span className="tabular w-6 text-right text-[11.5px] text-muted">{g.count}×</span>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------- 5 · When you spend ----------
// Month: a calendar shaded by spending, no-spend days, priciest day. Year: 12 month tiles. Then the average per weekday.
function When({ a }) {
  const year = a.period.kind === 'year'
  const today = todayISO()

  // Average per weekday over the days that have passed in the period
  const sums = Array(7).fill(0)
  const counts = Array(7).fill(0)
  const first = year ? `${a.period.key}-01-01` : `${a.period.key}-01`
  const [fy, fm, fd] = first.split('-').map(Number)
  for (let d = new Date(fy, fm - 1, fd), i = 0; i < a.days.passed; i += 1, d.setDate(d.getDate() + 1)) {
    counts[(d.getDay() + 6) % 7] += 1
  }
  for (const t of a.expenses) {
    const [y, m, d] = t.date.split('-').map(Number)
    sums[(new Date(y, m - 1, d).getDay() + 6) % 7] += t.amount_cents
  }
  const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0))
  const topDay = avgs.reduce((b, v, i) => (v > avgs[b] ? i : b), 0)
  const maxAvg = Math.max(1, ...avgs)

  return (
    <div className={card}>
      {year ? <YearTiles a={a} /> : <MonthCalendar a={a} today={today} />}
      <div className="mt-3 border-t border-line pt-3">
        <b className="text-[13px]">Average by weekday</b>
        <div className="mt-2 flex h-[70px] items-end gap-2">
          {avgs.map((v, i) => (
            <div key={i} className="flex-1 text-center">
              <span className={`tabular text-[10px] ${i === topDay && v > 0 ? 'font-bold text-[#e8590c]' : 'text-muted'}`}>{whole(v)}</span>
              <div
                className="mt-0.5 rounded-md"
                style={{
                  height: Math.max(3, (v / maxAvg) * 44),
                  background: i === topDay && v > 0 ? 'linear-gradient(180deg,#ff9f43,#e8590c)' : 'rgba(232,89,12,.18)',
                }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-2">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
            <span key={i} className="flex-1 text-center text-[10.5px] text-muted">
              {d}
            </span>
          ))}
        </div>
        {avgs[topDay] > 0 && (
          <p className="mt-2 text-[12.5px] text-muted">
            {WEEKDAYS[topDay]} cost you most: <b className="tabular text-ink">{whole(avgs[topDay])}</b> on average.
          </p>
        )}
      </div>
    </div>
  )
}

const heat = (cents, max) => (cents <= 0 ? 'var(--color-line)' : `rgba(232,89,12,${Math.min(1, 0.15 + (cents / max) * 0.85)})`)

function MonthCalendar({ a, today }) {
  const [y, m] = a.period.key.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const days = Array.from({ length: a.days.total }, (_, i) => {
    const date = `${a.period.key}-${pad(i + 1)}`
    return {
      date,
      n: i + 1,
      cents: a.spentByDay.get(date) ?? 0,
      future: i >= a.days.passed,
    }
  })
  const past = days.filter((d) => !d.future)
  const max = Math.max(1, ...past.map((d) => d.cents))
  const noSpend = past.filter((d) => d.cents === 0).length
  const top = past.reduce((b, d) => (d.cents > (b?.cents ?? 0) ? d : b), null)
  const [picked, setPicked] = useState(null)
  const p = picked && days.find((d) => d.date === picked)

  return (
    <>
      <Title
        right={
          <>
            <b className="text-gain">{noSpend}</b> no-spend {noSpend === 1 ? 'day' : 'days'}
          </>
        }
      >
        {monthShort(a.period.key)} by day
      </Title>
      <div className="mt-2.5 grid grid-cols-7 gap-1 text-center text-[10px] text-muted">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i}>{d}</span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {days.map((d) => (
          <button
            key={d.date}
            disabled={d.future}
            onClick={() => setPicked(d.date === picked ? null : d.date)}
            className={`tabular grid aspect-square place-items-center rounded-lg text-[10.5px] font-semibold ${
              d.future ? 'text-muted/50 ring-1 ring-line ring-inset' : d.cents / max > 0.55 ? 'text-white' : 'text-ink'
            } ${d.date === today || d.date === picked ? 'ring-2 ring-ink ring-inset' : ''}`}
            style={d.future ? undefined : { background: heat(d.cents, max) }}
          >
            {d.n}
          </button>
        ))}
      </div>
      <p className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-muted">
        <span className="tabular">
          {p ? (
            <>
              {dayMonth(p.date)}: <b className="text-ink">{whole(p.cents)}</b>
            </>
          ) : top && top.cents > 0 ? (
            <>
              Priciest day:{' '}
              <b className="text-ink">
                {dayMonth(top.date)} · {whole(top.cents)}
              </b>
            </>
          ) : (
            'Tap a day'
          )}
        </span>
        <span className="flex items-center gap-[3px]">
          less
          <span className="size-2.5 rounded-[3px]" style={{ background: 'rgba(232,89,12,.2)' }} />
          <span className="size-2.5 rounded-[3px]" style={{ background: 'rgba(232,89,12,.55)' }} />
          <span className="size-2.5 rounded-[3px]" style={{ background: DEEP }} />
          more
        </span>
      </p>
    </>
  )
}

function YearTiles({ a }) {
  const thisMonth = todayISO().slice(0, 7)
  const months = Array.from({ length: 12 }, (_, i) => {
    const k = `${a.period.key}-${pad(i + 1)}`
    return {
      key: k,
      cents: a.byMonth.get(k)?.spent ?? 0,
      future: k > thisMonth,
    }
  })
  const past = months.filter((m) => !m.future && m.cents > 0)
  const max = Math.max(1, ...past.map((m) => m.cents))
  const top = past.reduce((b, m) => (m.cents > (b?.cents ?? 0) ? m : b), null)
  const low = past.length > 1 ? past.reduce((b, m) => (m.cents < b.cents ? m : b)) : null
  return (
    <>
      <Title
        right={
          low && (
            <>
              Cheapest: <b className="text-gain">{monthShort(low.key)}</b>
            </>
          )
        }
      >
        {a.period.key} by month
      </Title>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {months.map((m) => (
          <div
            key={m.key}
            className={`rounded-xl px-2 py-2 ${m.future ? 'ring-1 ring-line ring-inset' : ''} ${m.key === thisMonth ? 'ring-2 ring-ink ring-inset' : ''}`}
            style={m.future ? undefined : { background: heat(m.cents, max) }}
          >
            <span className={`block text-[11px] font-semibold ${m.future ? 'text-muted/50' : m.cents / max > 0.55 ? 'text-white/85' : 'text-muted'}`}>
              {monthShort(m.key)}
            </span>
            <b className={`tabular block font-display text-[13px] ${m.future ? 'text-muted/40' : m.cents / max > 0.55 ? 'text-white' : 'text-ink'}`}>
              {m.future ? '—' : whole(m.cents)}
            </b>
          </div>
        ))}
      </div>
      {top && (
        <p className="mt-2 text-[11.5px] text-muted">
          Priciest month:{' '}
          <b className="tabular text-ink">
            {monthShort(top.key)} · {whole(top.cents)}
          </b>
        </p>
      )}
    </>
  )
}

// ---------- 6 · The big ones ----------
function Biggest({ a, category }) {
  const list = [...a.expenses].sort((x, y) => y.amount_cents - x.amount_cents).slice(0, 5)
  const share = list.reduce((s, t) => s + t.amount_cents, 0) / (a.totals.spent || 1)
  return (
    <div className={card}>
      <Title right={`top ${list.length} = ${pct(share)} of spending`}>Biggest purchases</Title>
      <ul className="mt-1.5">
        {list.map((t, i) => {
          const cat = category(t.category_id)
          return (
            <li key={`${t.date}-${t.amount_cents}-${i}`} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-line' : ''}`}>
              <span className={`w-4 font-display text-[13px] font-extrabold ${i === 0 ? 'text-[#e8590c]' : 'text-muted/60'}`}>{i + 1}</span>
              <MerchantIcon name={t.note} className="size-9 rounded-[11px] text-[17px]" style={{ background: `${cat?.color ?? '#94a3c4'}22` }}>
                {cat?.icon ?? '🧾'}
              </MerchantIcon>
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14.5px]">{t.note?.trim() || cat?.name || 'No category'}</b>
                <span className="block truncate text-xs text-muted">
                  {dayMonth(t.date)} · {cat?.name ?? 'No category'}
                </span>
              </span>
              <b className="tabular font-display text-[15px]">{formatCents(t.amount_cents)}</b>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
