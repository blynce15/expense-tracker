import { useEffect, useMemo, useState } from 'react'
import { Card, ChangeChip, linePath, Mini, ORANGE, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import MerchantIcon from '../components/MerchantIcon'
import { fetchAnalytics, monthShort, periodLabel, placesFrom, prevLabel, shiftMonth } from '../lib/analytics'
import { formatDayMonth } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'

const pad = (n) => String(n).padStart(2, '0')

// Analytics → Spending: how the period is going, day by day (month) or month by month (year),
// fixed vs everyday, quick facts, where the money goes and the biggest expenses.
export default function AnalyticsSpending() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(null)
  const [categories, setCategories] = useState(null)
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

  const facts = useMemo(() => (data ? spendingFacts(data) : null), [data])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your spending: {error}</p>

  const ready = data && data.period === period && categories && facts
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="space-y-3 px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {ready && (
        <>
          <Summary a={data} />
          <Pace a={data} />
          <Bars a={data} facts={facts} />
          <FixedVsEveryday facts={facts} />
          <QuickFacts a={data} facts={facts} />
          {facts.places.length > 0 && <Places facts={facts} category={category} />}
          {facts.biggest.length > 0 && <Biggest facts={facts} category={category} />}
        </>
      )}
    </div>
  )
}

// Everything the cards below need, from this period's expenses
function spendingFacts(a) {
  const { expenses, fixedNames, period, days } = a
  const key = (t) => (t.note ?? '').trim().toLowerCase()

  // One bar per day (month) or per month (year)
  const bars =
    period.kind === 'month'
      ? Array.from({ length: days.total }, (_, i) => {
          const date = `${period.key}-${pad(i + 1)}`
          return { key: date, label: String(i + 1), cents: a.spentByDay.get(date) ?? 0, future: i >= days.passed }
        })
      : Array.from({ length: 12 }, (_, i) => {
          const k = `${period.key}-${pad(i + 1)}`
          const now = new Date()
          const future = k > `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
          return { key: k, label: monthShort(k)[0], cents: a.byMonth.get(k)?.spent ?? 0, future }
        })
  const past = bars.filter((b) => !b.future)
  const average = past.length ? past.reduce((s, b) => s + b.cents, 0) / past.length : 0

  // Fixed = named like a recurring payment; everything else is everyday spending
  let fixed = 0
  let fixedCount = 0
  for (const t of expenses) {
    if (fixedNames.has(key(t))) {
      fixed += t.amount_cents
      fixedCount += 1
    }
  }

  const places = placesFrom(expenses)

  const biggest = [...expenses].sort((x, y) => y.amount_cents - x.amount_cents).slice(0, 5)
  const noSpendDays = period.kind === 'month' ? past.filter((b) => b.cents === 0).length : null

  return {
    bars,
    average,
    fixed,
    fixedCount,
    everyday: a.totals.spent - fixed,
    everydayCount: expenses.length - fixedCount,
    count: expenses.length,
    places,
    biggest,
    noSpendDays,
  }
}

function Summary({ a }) {
  const { totals, spending } = a
  const [euros, decimals] = formatCents(totals.spent).split(',')
  return (
    <section className="rounded-[22px] bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Spent in {periodLabel(a.period)}</p>
        <ChangeChip now={totals.spent} before={a.compare.spent} goodWhenDown suffix={`vs ${prevLabel(a.period)}`} />
      </div>
      <p className="tabular font-display leading-tight font-bold">
        <span className="text-[34px] tracking-tight">{euros}</span>
        <span className="text-lg text-muted/60">,{decimals}</span>
      </p>
      <p className="text-sm text-muted">
        {whole(spending.perDay)} a day
        {spending.onTrack !== null && (
          <>
            {' · on track for '}
            <b className="tabular text-ink">{whole(spending.onTrack)}</b>
          </>
        )}
      </p>
    </section>
  )
}

// Running total through the period, next to the period before
function Pace({ a }) {
  const { pace, onTrack } = a.spending
  const W = 300
  const H = 120
  const max = Math.max(1, pace.current.at(-1) ?? 0, pace.previous.at(-1) ?? 0, onTrack ?? 0)
  const x = (i) => (i / Math.max(1, pace.length - 1)) * W
  const y = (v) => H - (v / max) * (H - 6)
  const last = pace.current.length - 1
  const start = a.period.kind === 'month' ? `1 ${monthShort(a.period.key)}` : 'Jan'
  const end = a.period.kind === 'month' ? `${pace.length} ${monthShort(a.period.key)}` : 'Dec'
  const prevName = a.period.kind === 'month' ? monthShort(shiftMonth(a.period.key, -1)) : prevLabel(a.period)
  // Where the previous period was at the same point
  const prevThen = last >= 0 ? pace.previous[Math.min(last, pace.previous.length - 1)] : null

  return (
    <Card icon="chart" color={ORANGE} title="Spending pace">
      <svg viewBox={`0 0 ${W} ${H + 18}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Spending through the period compared with the period before">
        {[0.5, 1].map((f) => (
          <g key={f}>
            <line x1="0" x2={W} y1={y(max * f)} y2={y(max * f)} stroke="var(--color-line)" />
            <text x={W} y={y(max * f) - 4} textAnchor="end" fontSize="9.5" className="fill-muted">
              {whole(max * f)}
            </text>
          </g>
        ))}
        <line x1="0" x2={W} y1={H} y2={H} stroke="var(--color-line)" />
        {pace.previous.length > 1 && (
          <path d={linePath(pace.previous, W, H - 6, max, 0, pace.length)} transform="translate(0 6)" fill="none" stroke="var(--color-muted)" strokeOpacity=".45" strokeWidth="2" strokeDasharray="5 4" />
        )}
        {onTrack !== null && last >= 0 && last < pace.length - 1 && (
          <path d={`M${x(last)} ${y(pace.current[last])} L${W} ${y(onTrack)}`} stroke={ORANGE} strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity=".6" />
        )}
        {last >= 0 && (
          <>
            <path d={linePath(pace.current, W, H - 6, max, 0, pace.length)} transform="translate(0 6)" fill="none" stroke={ORANGE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={x(last)} cy={y(pace.current[last])} r="4.5" fill={ORANGE} stroke="var(--color-card)" strokeWidth="2" />
          </>
        )}
        <text x="0" y={H + 14} fontSize="10" className="fill-muted">
          {start}
        </text>
        <text x={W} y={H + 14} textAnchor="end" fontSize="10" className="fill-muted">
          {end}
        </text>
      </svg>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <span className="h-[3px] w-3.5 rounded-full" style={{ background: ORANGE }} />
          {periodLabel(a.period).split(' ')[0]} <b className="tabular text-ink">{whole(a.totals.spent)}</b>
        </span>
        {prevThen !== null && pace.previous.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3.5 border-t-2 border-dashed border-muted/50" />
            {prevName} by then <b className="tabular text-ink">{whole(prevThen)}</b>
          </span>
        )}
      </div>
    </Card>
  )
}

// A bar per day (or month); above-average ones in orange. Tap a bar to read it.
function Bars({ a, facts }) {
  const [picked, setPicked] = useState(null)
  const { bars, average } = facts
  const W = 300
  const H = 90
  const colW = W / bars.length
  const barW = Math.max(3, colW * 0.62)
  const max = Math.max(1, ...bars.map((b) => b.cents), average)
  const top = Math.max(1, Math.min(max, average * 4)) // very big days are capped at the top
  const h = (c) => Math.min(H, (c / top) * H)
  const month = a.period.kind === 'month'
  const p = picked === null ? null : bars[picked]
  return (
    <Card icon="bars" color={ORANGE} title={month ? 'Per day' : 'Per month'}>
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label={month ? 'Spending each day' : 'Spending each month'}>
        {bars.map((b, i) => (
          <g key={b.key} onClick={() => !b.future && setPicked(i)} className="cursor-pointer">
            <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
            {b.future ? (
              <rect x={i * colW + (colW - barW) / 2} y={H - 2} width={barW} height="2" rx="1" fill="var(--color-line)" />
            ) : (
              <rect
                x={i * colW + (colW - barW) / 2}
                y={H - Math.max(2, h(b.cents))}
                width={barW}
                height={Math.max(2, h(b.cents))}
                rx={Math.min(3, barW / 2)}
                fill={b.cents > average ? ORANGE : 'var(--color-cobalt)'}
                opacity={picked === null || picked === i ? 1 : 0.45}
              />
            )}
            {(!month || i === 0 || (i + 1) % 5 === 0) && (
              <text x={i * colW + colW / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className="fill-muted">
                {b.label}
              </text>
            )}
          </g>
        ))}
        {average > 0 && <line x1="0" x2={W} y1={H - h(average)} y2={H - h(average)} stroke="var(--color-ink)" strokeOpacity=".35" strokeDasharray="3 3" />}
      </svg>
      <p className="mt-2 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {month ? formatDayMonth(p.key) : monthShort(p.key)}: <b className="tabular text-ink">{formatCents(p.cents)}</b>
          </>
        ) : (
          <>
            Average <b className="tabular text-ink">{whole(average)}</b> a {month ? 'day' : 'month'} · tap a bar
          </>
        )}
      </p>
    </Card>
  )
}

function FixedVsEveryday({ facts }) {
  const total = facts.fixed + facts.everyday || 1
  return (
    <Card icon="repeat" color="var(--color-cobalt)" title="Fixed vs everyday">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {facts.fixed > 0 && <span className="bg-cobalt" style={{ flex: facts.fixed }} />}
        {facts.everyday > 0 && <span style={{ flex: facts.everyday, background: ORANGE }} />}
        {facts.fixed + facts.everyday === 0 && <span className="flex-1 bg-line" />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-cobalt/10 px-3 py-2.5">
          <p className="text-xs text-muted">Fixed · {facts.fixedCount} {facts.fixedCount === 1 ? 'bill' : 'bills'}</p>
          <p className="tabular font-display text-lg font-bold">{whole(facts.fixed)}</p>
          <p className="text-xs text-muted">{Math.round((facts.fixed / total) * 100)}%</p>
        </div>
        <div className="rounded-2xl px-3 py-2.5" style={{ background: 'color-mix(in srgb, #f08c00 13%, transparent)' }}>
          <p className="text-xs text-muted">
            Everyday · {facts.everydayCount} {facts.everydayCount === 1 ? 'buy' : 'buys'}
          </p>
          <p className="tabular font-display text-lg font-bold">{whole(facts.everyday)}</p>
          <p className="text-xs text-muted">{Math.round((facts.everyday / total) * 100)}%</p>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted">Fixed = expenses named like one of your recurring payments.</p>
    </Card>
  )
}

function QuickFacts({ a, facts }) {
  const big = a.spending.biggestDay
  return (
    <div className="grid grid-cols-2 gap-2">
      <Mini onPage label="Transactions" value={facts.count} />
      <Mini onPage label="Average each" value={facts.count ? formatCents(Math.round(a.totals.spent / facts.count)) : '—'} />
      {facts.noSpendDays !== null ? (
        <Mini onPage label="No-spend days" value={`${facts.noSpendDays} of ${a.days.passed}`} />
      ) : (
        <Mini onPage label="Average month" value={whole(facts.average)} />
      )}
      <Mini onPage label={big ? `Biggest day · ${formatDayMonth(big.date)}` : 'Biggest day'} value={big ? whole(big.cents) : '—'} />
    </div>
  )
}

function Places({ facts, category }) {
  const max = facts.places[0].cents || 1
  return (
    <Card icon="tag" color="#12b886" title="Where you spend most">
      <ul className="space-y-1">
        {facts.places.map((g) => {
          const cat = category(g.categoryId)
          return (
            <li key={g.name} className="flex items-center gap-3 py-1">
              <MerchantIcon name={g.name} className="size-10 rounded-xl text-lg" style={{ background: `${cat?.color ?? '#94a3c4'}22` }}>
                {cat?.icon ?? '🧾'}
              </MerchantIcon>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <b className="truncate">{g.name}</b>
                  <b className="tabular shrink-0 font-display">{formatCents(g.cents)}</b>
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
                    <span className="block h-full rounded-full" style={{ width: `${(g.cents / max) * 100}%`, background: cat?.color ?? ORANGE }} />
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {g.count} {g.count === 1 ? 'time' : 'times'}
                  </span>
                </span>
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

function Biggest({ facts, category }) {
  return (
    <Card icon="arrowUp" color="var(--color-loss)" title="Biggest expenses">
      <ul>
        {facts.biggest.map((t, i) => {
          const cat = category(t.category_id)
          return (
            <li key={i} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
              <MerchantIcon name={t.note} className="size-10 rounded-xl text-lg" style={{ background: `${cat?.color ?? '#94a3c4'}22` }}>
                {cat?.icon ?? '🧾'}
              </MerchantIcon>
              <span className="min-w-0 flex-1">
                <b className="block truncate">{t.note?.trim() || cat?.name || 'Expense'}</b>
                <span className="block truncate text-xs text-muted">
                  {formatDayMonth(t.date)}
                  {cat && ` · ${cat.name}`}
                </span>
              </span>
              <b className="tabular font-display">{formatCents(t.amount_cents)}</b>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
