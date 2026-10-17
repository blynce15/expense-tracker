import { useEffect, useState } from 'react'
import { pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, fetchAnalytics, monthShort, periodLabel, placesFrom, prevLabel, verdictOf } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { monthlyCents } from '../lib/recurring'
import { navigate } from '../lib/useRoute'

const pad = (n) => String(n).padStart(2, '0')
const DEEP = '#e8590c'
const VIOLET = '#7c4dff'
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const dayMonth = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
}

// Analytics → Where it goes: one section per question: how much you spent, what it went on, where exactly,
// fixed or not, when you spend, the big ones. Month view works in days; Year view in months.
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your spending: {error}</p>

  const a = data && data.period === period && categories ? data : null
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && (
        <>
          <Section n={1} title="How much you spent">
            <HowMuch a={a} />
          </Section>
          {a.expenses.length > 0 ? (
            <>
              <Section n={2} title="What it went on">
                <WentOn a={a} category={category} />
              </Section>
              <Section n={3} title="Where exactly">
                <Places a={a} category={category} />
              </Section>
              <Section n={4} title="Fixed or not">
                <Fixed a={a} />
              </Section>
              <Section n={5} title="When you spend">
                <When a={a} />
              </Section>
              <Section n={6} title="The big ones">
                <Biggest a={a} category={category} />
              </Section>
            </>
          ) : (
            <p className="mt-4 rounded-[24px] bg-card px-4 py-6 text-center text-sm text-muted">No spending in {periodLabel(a.period)}.</p>
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
        <span className="grid size-5 place-items-center rounded-full bg-[#e8590c] text-[11px] tracking-normal text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

const card = 'rounded-[24px] bg-card p-4'
const Title = ({ children, right }) => (
  <div className="flex items-baseline justify-between gap-2">
    <b className="font-display text-[17px]">{children}</b>
    {right && <span className="text-right text-[12.5px] text-muted">{right}</span>}
  </div>
)

// "▲ 18%" chips: orange when spending is up, green when down
function Change({ now, usual, isNew = false }) {
  if (isNew) return <span className="min-w-[58px] rounded-full bg-cobalt/10 px-2 py-0.5 text-center text-xs font-bold text-cobalt">new</span>
  if (!usual) return <span className="min-w-[58px]" />
  const c = now / usual - 1
  const size = Math.round(Math.abs(c) * 100)
  if (Math.abs(c) < 0.03) return <span className="min-w-[58px] rounded-full bg-line/70 px-2 py-0.5 text-center text-xs font-bold text-muted">= same</span>
  const up = c > 0
  return (
    <span className={`tabular min-w-[58px] rounded-full px-2 py-0.5 text-center text-xs font-bold ${up ? 'bg-warn-bg text-orange-text' : 'bg-gain/12 text-gain'}`}>
      {up ? '▲' : '▼'} {size >= 200 ? `${Math.round(now / usual)}×` : `${size}%`}
    </span>
  )
}

// ---------- 1 · How much you spent ----------
// The running total through the period against your usual pace (month: your usual month as a straight line;
// year: last year month by month), dashed on to where it's heading.
function HowMuch({ a }) {
  const year = a.period.kind === 'year'
  const v = verdictOf(a)
  const spent = a.totals.spent
  const { pace } = a.spending
  const [euros, decimals] = formatCents(spent).split(',')
  const usualTotal = year ? (pace.previous.at(-1) ?? 0) : (a.avgOut ?? 0)

  const W = 300
  const H = 74
  const n = pace.length
  const cur = pace.current
  const top = Math.max(1, a.spending.onTrack ?? 0, usualTotal, ...cur, ...(year ? pace.previous : [])) * 1.05
  const x = (i) => (n > 1 ? (i / (n - 1)) * W : 0)
  const y = (c) => H - (c / top) * H
  const line = cur.length ? `M${cur.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' L')}` : ''
  const lastI = cur.length - 1
  const usualPath = year
    ? pace.previous.some((c) => c > 0)
      ? `M${pace.previous.map((c, i) => `${x(i).toFixed(1)},${y(c).toFixed(1)}`).join(' L')}`
      : null
    : usualTotal > 0
      ? `M0,${H} L${W},${y(usualTotal).toFixed(1)}`
      : null
  const chipUp = v.spending.change !== null && v.spending.change >= 0.03
  const chipDown = v.spending.change !== null && v.spending.change <= -0.03
  const start = year ? `Jan` : `1 ${monthShort(a.period.key)}`
  const end = year ? `Dec` : `${n} ${monthShort(a.period.key)}`
  const label = year ? a.period.key : periodLabel(a.period).split(' ')[0]

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ff9f43] to-[#e8590c] p-4 text-white shadow-[0_18px_30px_-20px_rgba(232,89,12,0.9)]">
      <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/[.12]" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-white/90">Spent in {label}</p>
        {(chipUp || chipDown) && (
          <span className={`tabular rounded-full bg-white px-2.5 py-0.5 text-xs font-bold ${chipUp ? 'text-[#c26b00]' : 'text-[#0f8a5f]'}`}>
            {chipUp ? '▲' : '▼'} {Math.round(Math.abs(v.spending.change) * 100)}% vs {year ? prevLabel(a.period) : 'usual'}
          </span>
        )}
      </div>
      <p className="tabular relative truncate font-display leading-tight font-bold">
        <span className="text-[36px]">{euros}</span>
        <span className="text-lg text-white/60">,{decimals}</span>
      </p>
      <p className="relative text-[12.5px] text-white/90">
        {whole(a.spending.perDay * (year ? 30.44 : 1))} a {year ? 'month' : 'day'}
        {a.spending.onTrack !== null && a.current && (
          <>
            {' '}
            · on track for <b>{whole(a.spending.onTrack)}</b>
          </>
        )}
        {usualTotal > 0 && (
          <>
            {' '}
            · {year ? `${prevLabel(a.period)}` : 'usual month'} {whole(usualTotal)}
          </>
        )}
      </p>
      {cur.length > 0 && (
        <svg viewBox={`-4 -6 ${W + 8} ${H + 24}`} className="relative mt-2.5 block h-auto w-full overflow-visible" role="img" aria-label="Spending through the period">
          {usualPath && <path d={usualPath} fill="none" stroke="rgba(255,255,255,.7)" strokeWidth="1.5" strokeDasharray="4 5" />}
          {cur.length > 1 && <path d={`${line} L${x(lastI)},${H} L0,${H} Z`} fill="rgba(255,255,255,.18)" />}
          <path d={line} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {a.spending.onTrack !== null && a.current && lastI < n - 1 && (
            <line x1={x(lastI)} y1={y(cur[lastI])} x2={W} y2={y(a.spending.onTrack)} stroke="#fff" strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity=".75" />
          )}
          <circle cx={x(lastI)} cy={y(cur[lastI])} r="5" fill="#fff" />
          <text x="0" y={H + 15} fontSize="10.5" fill="rgba(255,255,255,.8)">
            {start}
          </text>
          <text x={W} y={H + 15} fontSize="10.5" fill="rgba(255,255,255,.8)" textAnchor="end">
            {end}
          </text>
        </svg>
      )}
      <p className="relative mt-1 flex gap-4 text-[11.5px] text-white/90">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-3 rounded-full bg-white" /> {label}
        </span>
        {usualPath && (
          <span className="flex items-center gap-1.5">
            <span className="w-3 border-t-[1.5px] border-dashed border-white/80" /> {year ? prevLabel(a.period) : 'your usual pace'}
          </span>
        )}
      </p>
    </div>
  )
}

// ---------- 2 · What it went on ----------
// A donut of the categories and each one against its usual (month: your usual month by now; year: last year by now)
function WentOn({ a, category }) {
  const year = a.period.kind === 'year'
  const share = a.current ? a.days.passed / a.days.total : 1
  const months = a.activeMonths.filter((k) => k !== a.period.key)
  const noHistory = year ? !a.compare.spent : !months.length
  const usualOf = (c) => {
    if (noHistory) return null
    if (year) return c.prev
    if (!months.length) return null
    return Math.round((months.reduce((s, k) => s + (a.catBy.get(`${k}|${c.id}`) ?? 0), 0) / months.length) * share)
  }
  const total = a.totals.spent || 1
  const list = a.categories.slice(0, 6)
  const rest = a.categories.slice(6).reduce((s, c) => s + c.cents, 0)
  const colorOf = (id) => category(id)?.color ?? '#94a3c4'
  const segs = [...list.map((c) => [c.cents / total, colorOf(c.id)]), ...(rest > 0 ? [[rest / total, 'var(--color-line)']] : [])]
  const top = a.categories[0]
  const topCat = category(top.id)
  const r = 44
  const C = 2 * Math.PI * r
  let off = 0

  return (
    <div className={card}>
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <svg width="112" height="112" className="-rotate-90" aria-hidden="true">
            {segs.map(([f, col], i) => {
              const el = <circle key={i} cx="56" cy="56" r={r} fill="none" stroke={col} strokeWidth="16" strokeDasharray={`${Math.max(0, f * C - (segs.length > 1 ? 2 : 0))} ${C}`} strokeDashoffset={-off * C} />
              off += f
              return el
            })}
          </svg>
          <span className="absolute inset-0 grid place-items-center text-center">
            <span>
              <b className="block font-display text-[17px]">{a.categories.length}</b>
              <span className="text-[10.5px] text-muted">{a.categories.length === 1 ? 'category' : 'categories'}</span>
            </span>
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[12.5px] text-muted">Most of it went on</span>
          <b className="block truncate font-display text-xl leading-tight">
            {topCat?.icon ?? '❔'} {topCat?.name ?? 'No category'}
          </b>
          <span className="tabular text-[12.5px] text-muted">
            {whole(top.cents)} · {pct(top.cents / total)} of spending
          </span>
        </div>
      </div>
      <ul className="mt-2.5">
        {list.map((c) => {
          const cat = category(c.id)
          const usual = usualOf(c)
          return (
            <li key={c.id ?? 'none'} className="border-t border-line">
              <button onClick={() => navigate(`/analytics/categories/${c.id ?? 'none'}`)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-[11px] text-[17px]" style={{ background: `${colorOf(c.id)}22` }}>
                  {cat?.icon ?? '❔'}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]">{cat?.name ?? 'No category'}</b>
                  <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-paper">
                    <span className="block h-full rounded-full" style={{ width: `${(c.cents / total) * 100}%`, background: colorOf(c.id) }} />
                  </span>
                </span>
                <b className="tabular w-14 text-right font-display text-[15px]">{whole(c.cents)}</b>
                <Change now={c.cents} usual={usual} isNew={usual === 0} />
              </button>
            </li>
          )
        })}
      </ul>
      <button onClick={() => navigate('/analytics/categories')} className="mt-1 flex w-full items-center justify-center text-[13.5px] font-bold text-cobalt">
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

// ---------- 4 · Fixed or not ----------
// Fixed = expenses named like a recurring payment; then your active subscriptions (recurring payments)
function Fixed({ a }) {
  const key = (t) => (t.note ?? '').trim().toLowerCase()
  let fixed = 0
  let fixedCount = 0
  for (const t of a.expenses) {
    if (a.fixedNames.has(key(t))) {
      fixed += t.amount_cents
      fixedCount += 1
    }
  }
  const spent = a.totals.spent || 1
  const everyday = a.totals.spent - fixed
  const subs = (a.recurring ?? []).filter((r) => r.active && r.type !== 'income').sort((x, y) => monthlyCents(y) - monthlyCents(x))
  const perMonth = subs.reduce((s, r) => s + monthlyCents(r), 0)
  const added = (r) => {
    const day = (r.created_at ?? '').slice(0, 10)
    return a.period.kind === 'year' ? day.slice(0, 4) === a.period.key : day.slice(0, 7) === a.period.key
  }
  const per = { weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' }

  return (
    <div className={card}>
      <Title>Fixed bills vs everyday</Title>
      <div className="mt-3 flex h-3.5 gap-[3px] overflow-hidden rounded-full">
        {fixed > 0 && <span style={{ flex: fixed, background: VIOLET }} />}
        {everyday > 0 && <span style={{ flex: everyday, background: '#f08c00' }} />}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-violet/12 px-3 py-2.5">
          <span className="flex items-center gap-1 text-[11.5px] font-bold text-violet uppercase">
            <Icon name="repeat" size={12} strokeWidth={2.6} />
            Fixed · {fixedCount} {fixedCount === 1 ? 'bill' : 'bills'}
          </span>
          <b className="tabular block font-display text-[19px]">{whole(fixed)}</b>
          <span className="text-[11.5px] text-muted">{pct(fixed / spent)} · recurring payments</span>
        </div>
        <div className="rounded-2xl bg-warn-bg px-3 py-2.5">
          <span className="text-[11.5px] font-bold text-orange-text uppercase">
            Everyday · {a.expenses.length - fixedCount} {a.expenses.length - fixedCount === 1 ? 'buy' : 'buys'}
          </span>
          <b className="tabular block font-display text-[19px]">{whole(everyday)}</b>
          <span className="text-[11.5px] text-muted">{pct(everyday / spent)} · what you can change</span>
        </div>
      </div>
      {subs.length > 0 && (
        <>
          <div className="mt-4 flex items-baseline justify-between gap-2">
            <b className="text-sm">Subscriptions</b>
            <span className="tabular text-[12.5px] text-muted">
              {whole(perMonth)} a month · {whole(perMonth * 12)} a year
            </span>
          </div>
          <ul className="mt-1.5">
            {subs.slice(0, 6).map((r) => (
              <li key={r.id}>
                <button onClick={() => navigate('/recurring')} className="flex w-full items-center gap-3 border-t border-line py-2.5 text-left">
                  <MerchantIcon name={r.name} className="size-8 rounded-[10px] bg-paper text-base">
                    {r.icon}
                  </MerchantIcon>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <b className="truncate text-sm">{r.name}</b>
                      {added(r) && <span className="rounded-full bg-cobalt/10 px-1.5 py-px text-[10.5px] font-bold text-cobalt">new</span>}
                    </span>
                    <span className="block text-[11.5px] text-muted">{per[r.frequency] ?? 'monthly'}</span>
                  </span>
                  <b className="tabular font-display text-[14.5px]">{formatCents(r.amount_cents)}</b>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
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
                style={{ height: Math.max(3, (v / maxAvg) * 44), background: i === topDay && v > 0 ? 'linear-gradient(180deg,#ff9f43,#e8590c)' : 'rgba(232,89,12,.18)' }}
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
    return { date, n: i + 1, cents: a.spentByDay.get(date) ?? 0, future: i >= a.days.passed }
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
              Priciest day: <b className="text-ink">{dayMonth(top.date)} · {whole(top.cents)}</b>
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
    return { key: k, cents: a.byMonth.get(k)?.spent ?? 0, future: k > thisMonth }
  })
  const past = months.filter((m) => !m.future && m.cents > 0)
  const max = Math.max(1, ...past.map((m) => m.cents))
  const top = past.reduce((b, m) => (m.cents > (b?.cents ?? 0) ? m : b), null)
  const low = past.length > 1 ? past.reduce((b, m) => (m.cents < b.cents ? m : b)) : null
  return (
    <>
      <Title right={low && <>Cheapest: <b className="text-gain">{monthShort(low.key)}</b></>}>{a.period.key} by month</Title>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        {months.map((m) => (
          <div
            key={m.key}
            className={`rounded-xl px-2 py-2 ${m.future ? 'ring-1 ring-line ring-inset' : ''} ${m.key === thisMonth ? 'ring-2 ring-ink ring-inset' : ''}`}
            style={m.future ? undefined : { background: heat(m.cents, max) }}
          >
            <span className={`block text-[11px] font-semibold ${m.future ? 'text-muted/50' : m.cents / max > 0.55 ? 'text-white/85' : 'text-muted'}`}>{monthShort(m.key)}</span>
            <b className={`tabular block font-display text-[13px] ${m.future ? 'text-muted/40' : m.cents / max > 0.55 ? 'text-white' : 'text-ink'}`}>
              {m.future ? '—' : whole(m.cents)}
            </b>
          </div>
        ))}
      </div>
      {top && (
        <p className="mt-2 text-[11.5px] text-muted">
          Priciest month: <b className="tabular text-ink">{monthShort(top.key)} · {whole(top.cents)}</b>
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
