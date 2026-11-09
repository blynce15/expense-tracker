import { useEffect, useState } from 'react'
import { BigAmount, NavyPeriodBar, NavyPill, NavyTop, Overlap, pct, Section, usePeriod, useWorthExtras, whole, WORTH_PARTS } from '../components/AnalyticsKit'
import { cachedAnalytics, creepOf, fetchAnalytics, fetchWorthHistory, monthShort, periodLabel, prevLabel, verdictOf } from '../lib/analytics'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { netWorthOf } from '../lib/networth'
import { navigate } from '../lib/useRoute'

// The Over time card's blue (Analytics → Explore), as the top of this page
const BLUE_TOP = 'radial-gradient(120% 90% at 85% 0%, #7fa2ff 0%, #3a63e8 45%, #14318f 100%)'
const signed = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)
const kept = (m) => (m ? m.saved + m.invested : 0)

// Analytics → Over time: the navy top with net worth (accounts, savings, investments, pension) and what it's made of
// over the 12 months up to the chosen period on its edge; then one section per question: income vs spending, is
// spending creeping up, which categories are changing, against the same time last year, your records.
export default function AnalyticsTrends() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(() => cachedAnalytics(period))
  const [categories, setCategories] = useState(() => lookupCache.lookups?.categories ?? null)
  const { invest, pension } = useWorthExtras()
  const [error, setError] = useState(null)
  // Net worth's line: the 12 months up to the period, or all time (every month since the first transaction,
  // loaded only when asked for and kept while the app is open)
  const [range, setRange] = useState('12')
  const [history, setHistory] = useState(() => allTime)
  const [loadingAll, setLoadingAll] = useState(false)
  const showAll = (next) => {
    setRange(next)
    if (next !== 'all' || allTime) return
    setLoadingAll(true)
    fetchWorthHistory()
      .then((h) => setHistory((allTime = h)))
      .catch(() => setRange('12'))
      .finally(() => setLoadingAll(false))
  }

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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your history: {error}</p>
  const a = data && data.period === period && categories ? data : null
  const all = range === 'all' && history
  const w = a && invest && pension ? netWorthOf(all ? { ...a, byMonth: history.byMonth, worth: { ...a.worth, line: history.line } } : a, invest, pension) : null
  const category = (id) => categories?.find((c) => (c.id ?? 'none') === (id ?? 'none'))
  // Full months with any activity in the 12 months (not the one still running)
  const full = a ? a.trend.filter((t) => !t.partial && !t.future && (t.income || t.spent)) : []

  return (
    <div className="pb-6">
      <NavyTop background={BLUE_TOP}>
        <NavyPeriodBar period={period} onChange={setPeriod} />
        {w ? <Top a={a} w={w} all={!!all} range={range} onRange={showAll} loading={loadingAll} /> : <div className="h-[92px]" />}
      </NavyTop>
      {a && w && (
        <>
          <Overlap>
            <MadeOf w={w} />
          </Overlap>
          <Section n={1} title="Income vs spending" right="12 months">
            <InOut a={a} />
          </Section>
          <Section n={2} title="Is spending creeping up?">
            <Creep a={a} />
          </Section>
          <Section n={3} title="Which categories are changing">
            <Changing a={a} category={category} />
          </Section>
          <Section
            n={4}
            title={a.period.kind === 'year' ? `vs ${prevLabel(a.period)}` : `vs ${monthShort(a.period.key)} last year`}
            right={a.current ? 'up to the same day' : null}
          >
            <LastYear a={a} />
          </Section>
          {full.length >= 2 && (
            <Section n={5} title="Your records">
              <Records a={a} full={full} />
            </Section>
          )}
        </>
      )}
    </div>
  )
}

const card = 'rounded-[24px] bg-card p-4'
const Empty = ({ children }) => <p className={`${card} text-center text-sm text-muted`}>{children}</p>
const Legend = ({ items }) => (
  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-muted">
    {items.map(([label, swatch]) => (
      <span key={label} className="flex items-center gap-1.5">
        {swatch}
        {label}
      </span>
    ))}
  </div>
)

// ---------- The blue top: net worth and its line ----------
// (owner chose "A · Line on top" with C's last-year cards, .harness/analytics-v7-time.html)
let allTime = null

function Top({ a, w, all, range, onRange, loading }) {
  const first = w.line[0]?.cents ?? 0
  const months = w.line.length - 1
  // As a % only when it started from a real amount (a start near €0 gives silly percentages)
  const share = months > 0 && first > 0 && Math.abs(w.lineChange / first) < 2 ? w.lineChange / first : null
  const values = w.line.map((pt) => pt.cents)
  const W = 300
  const H = 70
  const max = Math.max(...values)
  const min = Math.min(...values)
  const pts = values.map((v, i) => [months ? (i / months) * W : W, H - ((v - min) / (max - min || 1)) * (H - 8) - 4])
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const span = all
    ? `since ${monthShort(w.line[0].key)} ${w.line[0].key.slice(0, 4)}`
    : months === 1
      ? 'in a month'
      : months >= 11
        ? 'in a year'
        : `in ${months} months`
  const label = (k) => (all ? `${monthShort(k)} ${k.slice(2, 4)}` : monthShort(k))
  return (
    <>
      <BigAmount
        cents={w.end}
        label={a.current ? 'Net worth' : `Net worth · end of ${a.period.kind === 'year' ? a.period.key : periodLabel(a.period).split(' ')[0]}`}
      />
      {months > 0 && w.lineChange !== 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <NavyPill>
            {w.lineChange > 0 ? '▲' : '▼'} {whole(Math.abs(w.lineChange))} {span}
          </NavyPill>
          {share !== null && Math.round(share * 100) !== 0 && (
            <NavyPill>
              {share > 0 ? '▲' : '▼'} {Math.abs(Math.round(share * 100))}%
            </NavyPill>
          )}
        </div>
      )}
      {months > 0 && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block h-auto w-full overflow-visible" aria-hidden="true">
            <path d={`${line} L${W} ${H} L0 ${H} Z`} fill="rgba(255,255,255,.16)" />
            <path d={line} fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="5" fill="#fff" />
          </svg>
          <div className="mt-1 flex justify-between text-[10.5px] text-white/70">
            <span>{label(w.line[0].key)}</span>
            <span>{label(w.line.at(-1).key)}</span>
          </div>
        </>
      )}
      <div className="mt-3 flex justify-center">
        <div className="flex rounded-full bg-white/12 p-[3px]" role="tablist" aria-label="Net worth over">
          {[
            ['12', '12 months'],
            ['all', 'All time'],
          ].map(([key, text]) => (
            <button
              key={key}
              role="tab"
              aria-selected={range === key}
              onClick={() => range !== key && onRange(key)}
              className={`rounded-full px-3.5 py-1 text-[12.5px] font-semibold ${range === key ? 'bg-white text-[#14318f]' : 'text-white/75'}`}
            >
              {key === 'all' && loading ? 'Loading…' : text}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

// ---------- What it's made of (the card on the edge) ----------
// Today's parts as one bar, then each part with its change over the months shown
function MadeOf({ w }) {
  const shown = WORTH_PARTS.filter((p) => w.parts[p.key] !== 0 || (w.partChange?.[p.key] ?? 0) !== 0)
  const inBar = shown.filter((p) => w.parts[p.key] > 0)
  return (
    <div className="rounded-[24px] bg-card p-4 shadow-[0_14px_30px_-22px_rgba(11,27,69,0.45)]">
      <b className="font-display text-[17px]">What it&apos;s made of</b>
      {inBar.length > 0 && (
        <div className="mt-3 mb-1.5 flex h-3.5 gap-[3px]">
          {inBar.map((p) => (
            <span key={p.key} className="rounded-[5px]" style={{ flex: w.parts[p.key], background: p.color }} />
          ))}
        </div>
      )}
      <ul>
        {shown.map((p) => {
          const change = w.partChange?.[p.key] ?? 0
          return (
            <li key={p.key} className="flex items-center gap-2 border-t border-line py-2 text-sm first:border-0">
              <span className="size-2.5 rounded-[3px]" style={{ background: p.color }} />
              <span className="flex-1">{p.label}</span>
              {Math.abs(change) >= 100 && (
                <span className={`tabular rounded-full px-2 py-0.5 text-xs font-bold ${change > 0 ? 'bg-gain/12 text-gain' : 'bg-warn-bg text-orange-text'}`}>
                  {change > 0 ? '▲' : '▼'} {whole(Math.abs(change))}
                </span>
              )}
              <b className="tabular min-w-[76px] text-right">{whole(w.parts[p.key])}</b>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------- vs last year ----------
// Month: the same month last year (up to the same day while this one is running); year: last year by now.
// Spending is better when down; income and kept when up.
function LastYear({ a }) {
  const year = a.period.kind === 'year'
  const v = verdictOf(a)
  const ly = a.lastYear
  const rate = a.saving.rate
  const share = a.current ? a.days.passed / a.days.total : 1
  const prevSpent = year ? a.compare.spent : ly?.spent
  const prevIncome = year ? Math.round(a.previous.income * share) : ly?.income
  const prevKept = year ? kept(a.previous) * share : ly?.kept
  if (!prevSpent && !prevIncome) return <Empty>Nothing recorded a year earlier.</Empty>
  const prevRate = prevIncome ? prevKept / prevIncome : null
  const rows = [
    [
      'Spending',
      whole(a.totals.spent),
      prevSpent ? whole(prevSpent) : '—',
      year ? v.spending.change : prevSpent ? a.totals.spent / prevSpent - 1 : null,
      { goodWhenDown: true },
    ],
    ['Income', whole(a.totals.income), prevIncome ? whole(prevIncome) : '—', prevIncome ? a.totals.income / prevIncome - 1 : null, {}],
    [
      'Kept',
      rate !== null ? pct(Math.max(0, rate)) : '—',
      prevRate !== null ? pct(Math.max(0, prevRate)) : '—',
      rate !== null && prevRate !== null ? rate - prevRate : null,
      { points: true },
    ],
  ]
  // Three cards side by side: this period, what it was a year earlier, the change
  return (
    <div className="grid grid-cols-3 gap-2">
      {rows.map(([label, now, before, change, opts]) => (
        <div key={label} className="rounded-[20px] bg-card px-2 py-3 text-center shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)]">
          <span className="block text-xs text-muted">{label}</span>
          <b className="tabular block truncate font-display text-[19px]">{now}</b>
          <span className="tabular block truncate text-[11.5px] text-muted">was {before}</span>
          <span className="mt-1.5 flex justify-center">
            <ChangeChip change={change} {...opts} />
          </span>
        </div>
      ))}
    </div>
  )
}

function ChangeChip({ change, goodWhenDown = false, points = false }) {
  if (change === null || !Number.isFinite(change)) return <span className="min-w-[64px]" />
  const n = Math.round(Math.abs(change) * 100)
  if (Math.abs(change) < (points ? 0.02 : 0.03) || n === 0)
    return <span className="min-w-[64px] rounded-full bg-line/70 px-2 py-0.5 text-center text-xs font-bold text-muted">= same</span>
  const up = change > 0
  const good = up !== goodWhenDown
  return (
    <span
      className={`tabular min-w-[64px] rounded-full px-2 py-0.5 text-center text-xs font-bold ${good ? 'bg-gain/12 text-gain' : 'bg-warn-bg text-orange-text'}`}
    >
      {up ? '▲' : '▼'} {n}
      {points ? ' pts' : '%'}
    </span>
  )
}

// ---------- 2 · The last 12 months ----------
function InOut({ a }) {
  const rows = a.trend.filter((t) => !t.future)
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 110
  const step = W / 12
  const bw = step * 0.32
  const max = Math.max(1, ...rows.map((t) => Math.max(t.income, t.spent))) * 1.05
  const y = (c) => H - (c / max) * H
  const keptTotal = a.last12.reduce((s, k) => s + kept(a.byMonth.get(k)), 0)
  const avgLeft = a.avgIn !== null && a.avgOut !== null ? Math.round(a.avgIn) - Math.round(a.avgOut) : null
  const p = picked === null ? null : rows[picked]
  if (!rows.some((t) => t.income || t.spent)) return <Empty>Nothing recorded in the last 12 months.</Empty>

  return (
    <div className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="font-display text-[17px]">In and out</b>
        <span className="text-[12.5px] text-muted">
          kept <b className={`tabular ${keptTotal >= 0 ? 'text-gain' : 'text-loss'}`}>{signed(keptTotal)}</b> in 12 months
        </span>
      </div>
      <svg viewBox={`0 -6 ${W} ${H + 22}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Money in and out each month">
        {rows.map((t, i) => {
          const x = i * step + step * 0.16
          const dim = picked !== null && picked !== i ? 0.35 : t.partial ? 0.55 : 0.9
          return (
            <g key={t.key} onClick={() => setPicked(i === picked ? null : i)} className="cursor-pointer">
              <rect x={i * step} y="-6" width={step} height={H + 22} fill="transparent" />
              {t.income > 0 && <rect x={x} y={y(t.income)} width={bw} height={H - y(t.income)} rx="3" fill="#0f8a5f" opacity={dim} />}
              {t.spent > 0 && <rect x={x + bw + 1.5} y={y(t.spent)} width={bw} height={H - y(t.spent)} rx="3" fill="#f08c00" opacity={dim} />}
              <text
                x={i * step + step / 2}
                y={H + 13}
                textAnchor="middle"
                fontSize="9.5"
                className={t.partial || picked === i ? 'fill-ink font-bold' : 'fill-muted'}
              >
                {monthShort(t.key)[0]}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-1 min-h-5 text-center text-[12.5px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' so far'}: in <b className="tabular text-ink">{whole(p.income)}</b> · out <b className="tabular text-ink">{whole(p.spent)}</b> · left{' '}
            <b className={`tabular ${p.income - p.spent >= 0 ? 'text-gain' : 'text-loss'}`}>{signed(p.income - p.spent)}</b>
          </>
        ) : (
          'Tap a month'
        )}
      </p>
      <Legend
        items={[
          ['In', <span key="i" className="size-2.5 rounded-[3px] bg-[#0f8a5f]" />],
          ['Out', <span key="o" className="size-2.5 rounded-[3px] bg-[#f08c00]" />],
        ]}
      />
      {a.avgIn !== null && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['Avg in', whole(a.avgIn), 'text-gain'],
            ['Avg out', whole(a.avgOut), 'text-orange-text'],
            ['Avg left', signed(avgLeft), 'text-cobalt'],
          ].map(([l, val, c]) => (
            <div key={l} className="rounded-[14px] bg-paper px-2.5 py-2">
              <span className="text-[11px] font-semibold text-muted">{l}</span>
              <b className={`tabular block font-display text-base ${c}`}>{val}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- 3 · Is spending creeping up ----------
// Monthly spending (full months with activity) with a straight trend line through them; headline from the
// last 6 months against the 6 before (or 3 vs 3 when there's less history).
function Creep({ a }) {
  const c = creepOf(a)
  if (!c) return <Empty>A few more months of history are needed to see a trend.</Empty>
  const { full, half, recent, before, diff, rise } = c
  const headline = rise >= 0.05 ? 'Spending is creeping up' : rise <= -0.05 ? 'Spending is coming down' : 'Spending is steady'
  const tone = rise >= 0.05 ? 'bg-warn-bg text-orange-text' : rise <= -0.05 ? 'bg-gain/12 text-gain' : 'bg-line/70 text-muted'

  const W = 300
  const H = 90
  const vals = full.map((t) => t.spent)
  // Trend: through the average of the earlier months (at their middle) and of the recent ones, so it agrees
  // with the headline
  const n = vals.length
  const midBefore = n - half - (half + 1) / 2
  const midRecent = n - (half + 1) / 2
  const slope = (recent - before) / (midRecent - midBefore)
  const at = (i) => recent + slope * (i - midRecent)
  const lo = Math.min(...vals, at(0), at(n - 1)) * 0.9
  const hi = Math.max(...vals, at(0), at(n - 1)) * 1.05
  const x = (i) => (full.length > 1 ? (i / (full.length - 1)) * W : W / 2)
  const y = (c) => H - ((c - lo) / (hi - lo || 1)) * H
  const line = `M${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' L')}`

  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <b className="font-display text-[17px]">{headline}</b>
        <span className={`tabular shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>{signed(diff)} a month</span>
      </div>
      <p className="mt-1 text-[12.5px] text-muted">
        Last {half} months average <b className="tabular text-ink">{whole(recent)}</b> vs <b className="tabular text-ink">{whole(before)}</b> the {half} before
      </p>
      <svg
        viewBox={`-6 -8 ${W + 12} ${H + 26}`}
        className="mt-3 block h-auto w-full overflow-visible"
        role="img"
        aria-label="Spending each month with its trend"
      >
        <defs>
          <linearGradient id="creep-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#f08c00" stopOpacity=".22" />
            <stop offset="1" stopColor="#f08c00" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${line} L${x(n - 1)},${H} L0,${H} Z`} fill="url(#creep-fill)" />
        <path d={line} fill="none" stroke="#f08c00" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(0)} y1={y(at(0))} x2={x(n - 1)} y2={y(at(n - 1))} stroke="var(--color-ink)" strokeOpacity=".6" strokeWidth="1.6" strokeDasharray="5 4" />
        {vals.map((v, i) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={i === n - 1 ? 4.5 : 2.5}
            fill={i === n - 1 ? '#f08c00' : 'var(--color-card)'}
            stroke="#f08c00"
            strokeWidth="2"
          />
        ))}
        {full.map((t, i) => (
          <text key={t.key} x={x(i)} y={H + 15} textAnchor="middle" fontSize="9.5" className="fill-muted">
            {monthShort(t.key)[0]}
          </text>
        ))}
      </svg>
      <Legend
        items={[
          ['Spent each full month', <span key="s" className="h-[2.5px] w-3 bg-[#f08c00]" />],
          ['Trend', <span key="t" className="w-3 border-t-[1.5px] border-dashed border-ink/60" />],
        ]}
      />
    </div>
  )
}

// ---------- 4 · Which categories are changing ----------
// Per category: average per month over the last 3 full active months vs the 3 before
function Changing({ a, category }) {
  const months = a.activeMonths
  if (months.length < 4) return <Empty>A few more months of history are needed to compare categories.</Empty>
  const half = Math.min(3, Math.floor(months.length / 2))
  const recent = months.slice(-half)
  const before = months.slice(-2 * half, -half)
  const ids = new Set([...a.catBy.keys()].map((k) => k.split('|')[1]))
  const avg = (keys, id) => keys.reduce((s, k) => s + (a.catBy.get(`${k}|${id}`) ?? 0), 0) / keys.length
  const moves = [...ids]
    .map((id) => ({
      id: id === 'null' ? null : id,
      diff: Math.round(avg(recent, id) - avg(before, id)),
    }))
    .filter((m) => Math.abs(m.diff) >= 500)
  const up = moves
    .filter((m) => m.diff > 0)
    .sort((x, y) => y.diff - x.diff)
    .slice(0, 3)
  const down = moves
    .filter((m) => m.diff < 0)
    .sort((x, y) => x.diff - y.diff)
    .slice(0, 3)
  const list = [...up, ...down]
  if (!list.length) return <Empty>No category changed much lately.</Empty>
  const max = Math.max(...list.map((m) => Math.abs(m.diff)))

  return (
    <div className={card}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="font-display text-[17px]">Rising and falling</b>
        <span className="text-right text-xs text-muted">
          last {half} months vs {half} before
        </span>
      </div>
      <ul className="mt-1.5">
        {list.map((m) => {
          const cat = category(m.id)
          const color = cat?.color ?? '#94a3c4'
          return (
            <li key={m.id ?? 'none'} className="border-t border-line first:border-0">
              <button onClick={() => navigate(`/analytics/categories/${m.id ?? 'none'}`)} className="flex w-full items-center gap-3 py-2.5 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-[11px] text-[17px]" style={{ background: `${color}22` }}>
                  {cat?.icon ?? '❔'}
                </span>
                <b className="w-[92px] shrink-0 truncate text-sm">{cat?.name ?? 'No category'}</b>
                <span className="relative h-3 flex-1">
                  <span className="absolute inset-y-[-4px] left-1/2 border-l border-line" />
                  {m.diff > 0 ? (
                    <span className="absolute left-1/2 h-full rounded-r-md bg-[#f08c00]" style={{ width: `${(m.diff / max) * 50}%` }} />
                  ) : (
                    <span className="absolute right-1/2 h-full rounded-l-md bg-gain" style={{ width: `${(-m.diff / max) * 50}%` }} />
                  )}
                </span>
                <b className={`tabular w-14 text-right font-display text-[14.5px] ${m.diff > 0 ? 'text-orange-text' : 'text-gain'}`}>{signed(m.diff)}</b>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-1 text-[11.5px] text-muted">Change in the average per month</p>
    </div>
  )
}

// ---------- 6 · Your records ----------
// Over the full months with activity in the 12 months, next to this period's figure
function Records({ a, full }) {
  const by = (f, dir) => full.reduce((b, t) => (dir * f(t) > dir * f(b) ? t : b))
  const keptOf = (t) => kept(a.byMonth.get(t.key))
  const year = a.period.kind === 'year'
  const nowMonth = year ? null : a.byMonth.get(a.period.key)
  const months = year ? Math.max(1, a.days.passed / 30.44) : 1
  const now = {
    spent: year ? a.totals.spent / months : a.totals.spent,
    kept: year ? (a.totals.saved + a.totals.invested) / months : kept(nowMonth),
    income: year ? a.totals.income / months : a.totals.income,
  }
  const nowLabel = year ? `${a.period.key} average` : `${monthShort(a.period.key)}${a.current ? ' so far' : ''}`
  const items = [
    ['Lowest spending', by((t) => t.spent, -1), (t) => t.spent, now.spent, '🏆', '#0f8a5f'],
    ['Highest spending', by((t) => t.spent, 1), (t) => t.spent, now.spent, '🔥', '#c26b00'],
    ['Most kept', by(keptOf, 1), keptOf, now.kept, '💰', '#0c8599'],
    ['Highest income', by((t) => t.income, 1), (t) => t.income, now.income, '💼', '#1f4fe0'],
  ]
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map(([label, t, value, nowValue, emoji, color]) => (
        <div key={label} className="relative overflow-hidden rounded-[22px] bg-card p-3.5">
          <span className="pointer-events-none absolute -top-5 -right-5 size-16 rounded-full" style={{ background: `${color}14` }} />
          <span className="relative text-xl">{emoji}</span>
          <span className="relative mt-1.5 block text-[11px] font-bold tracking-[0.04em] uppercase" style={{ color }}>
            {label}
          </span>
          <b className="tabular relative block font-display text-[19px]">{whole(value(t))}</b>
          <span className="tabular relative text-xs text-muted">
            {monthShort(t.key)} · {nowLabel} {whole(nowValue)}
          </span>
        </div>
      ))}
    </div>
  )
}
