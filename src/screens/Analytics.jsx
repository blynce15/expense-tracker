import { useEffect, useState } from 'react'
import { Card, ChangeChip, Chip, linePath, Mini, ORANGE, pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import LynxWatermark from '../components/LynxWatermark'
import { fetchAnalytics, highlights, monthShort, periodLabel, prevLabel } from '../lib/analytics'
import { formatDayMonth } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { navigate } from '../lib/useRoute'

// One page with a summary card per area: net worth, spending, categories, saving & investing,
// trends and highlights. Month or Year, with arrows to move between periods.
export default function Analytics() {
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load analytics: {error}</p>

  const ready = data && data.period === period && categories
  const category = (id) => categories?.find((c) => c.id === id)

  return (
    <div className="space-y-3 px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {ready && (
        <>
          <WorthCard a={data} />
          <SpendingCard a={data} />
          {data.categories.length > 0 && <CategoriesCard a={data} category={category} />}
          <SavingCard a={data} />
          <TrendsCard a={data} />
          <HighlightsCard a={data} category={category} />
        </>
      )}
    </div>
  )
}

// ---------- Net worth ----------
function WorthCard({ a }) {
  const { worth, totals } = a
  const [euros, decimals] = formatCents(worth.end).split(',')
  const values = worth.line.map((p) => p.cents)
  const max = Math.max(...values)
  const min = Math.min(...values)
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#2b8ef7] via-cobalt to-cobalt-deep p-4 text-white shadow-[0_18px_30px_-20px_rgba(31,79,224,0.9)]">
      <LynxWatermark className="-right-8 -bottom-12" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white/85">Net worth</p>
        {worth.change !== 0 && (
          <Chip tone="light">
            {worth.change > 0 ? '▲' : '▼'} {whole(Math.abs(worth.change))} vs {prevLabel(a.period)}
          </Chip>
        )}
      </div>
      <p className="tabular relative truncate font-display leading-tight font-bold">
        <span className="text-[34px] tracking-tight">{euros}</span>
        <span className="text-lg text-white/55">,{decimals}</span>
      </p>
      {values.length > 1 && (
        <svg viewBox="0 0 300 40" preserveAspectRatio="none" className="relative mt-1 block h-10 w-full overflow-visible" aria-hidden="true">
          <path d={linePath(values, 300, 36, max, min)} transform="translate(0 2)" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      <div className="relative mt-3 grid grid-cols-3 gap-1.5">
        <Fact label="In" value={whole(totals.income)} />
        <Fact label="Spent" value={whole(totals.spent)} />
        <Fact label="Saved" value={whole(totals.saved)} />
      </div>
    </section>
  )
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0 rounded-xl bg-white/[.14] px-2 py-1.5">
      <p className="text-[11px] text-white/75">{label}</p>
      <p className="tabular truncate font-display text-sm font-bold">{value}</p>
    </div>
  )
}

// ---------- Spending ----------
function SpendingCard({ a }) {
  const { totals, spending } = a
  const { pace } = spending
  const max = Math.max(1, pace.current.at(-1) ?? 0, pace.previous.at(-1) ?? 0, spending.onTrack ?? 0)
  const lastX = ((pace.current.length - 1) / Math.max(1, pace.length - 1)) * 300
  const lastY = 56 - ((pace.current.at(-1) ?? 0) / max) * 52
  const trackY = spending.onTrack ? 56 - (spending.onTrack / max) * 52 : null
  return (
    <Card icon="card" color={ORANGE} title="Spending" onMore={() => navigate('/analytics/spending')}>
      <div className="flex items-end gap-2">
        <p className="tabular font-display text-[26px] leading-none font-bold">{whole(totals.spent)}</p>
        <ChangeChip now={totals.spent} before={a.compare.spent} goodWhenDown suffix={`vs ${prevLabel(a.period)}`} />
      </div>
      <svg viewBox="0 0 300 60" className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Spending so far compared with the period before">
        {pace.previous.length > 1 && (
          <path d={linePath(pace.previous, 300, 52, max, 0, pace.length)} transform="translate(0 4)" fill="none" stroke="var(--color-muted)" strokeOpacity=".45" strokeWidth="2" strokeDasharray="5 4" />
        )}
        {trackY !== null && pace.current.length < pace.length && (
          <path d={`M${lastX} ${lastY} L300 ${trackY}`} stroke={ORANGE} strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" opacity=".6" />
        )}
        {pace.current.length > 0 && (
          <>
            <path d={linePath(pace.current, 300, 52, max, 0, pace.length)} transform="translate(0 4)" fill="none" stroke={ORANGE} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={lastX} cy={lastY} r="4" fill={ORANGE} stroke="var(--color-card)" strokeWidth="2" />
          </>
        )}
      </svg>
      <p className="mt-1.5 flex gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="h-[3px] w-3 rounded-full" style={{ background: ORANGE }} />
          {periodLabel(a.period).split(' ')[0]}
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0 w-3 border-t-2 border-dashed border-muted/50" />
          {prevLabel(a.period)}
        </span>
      </p>
      <div className="mt-3 flex gap-2">
        <Mini label="Per day" value={whole(spending.perDay)} />
        {spending.onTrack !== null ? (
          <Mini label="On track for" value={whole(spending.onTrack)} />
        ) : (
          <Mini label={spending.biggestDay ? `Biggest · ${formatDayMonth(spending.biggestDay.date)}` : 'Biggest day'} value={spending.biggestDay ? whole(spending.biggestDay.cents) : '—'} />
        )}
        <Mini label="Fixed bills" value={whole(spending.fixed)} />
      </div>
    </Card>
  )
}

// ---------- Categories ----------
function CategoriesCard({ a, category }) {
  const total = a.totals.spent || 1
  const top = a.categories.slice(0, 4)
  const rest = a.categories.slice(4).reduce((s, c) => s + c.cents, 0)
  return (
    <Card icon="tag" color="#12b886" title="Categories" onMore={() => navigate('/analytics/categories')}>
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
        {top.map((c) => (
          <span key={c.id ?? 'none'} style={{ flex: c.cents, background: category(c.id)?.color ?? '#94a3c4' }} />
        ))}
        {rest > 0 && <span className="bg-line" style={{ flex: rest }} />}
      </div>
      <ul className="mt-2">
        {a.categories.slice(0, 3).map((c) => {
          const cat = category(c.id)
          return (
            <li key={c.id ?? 'none'} className="flex items-center gap-2.5 py-1.5">
              <span className="text-lg">{cat?.icon ?? '❔'}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium">{cat?.name ?? 'No category'}</span>
                <span className="text-xs text-muted">{pct(c.cents / total)} of spending</span>
              </span>
              <b className="tabular font-display">{whole(c.cents)}</b>
              <span className="w-[68px] text-right">
                {c.prev ? <ChangeChip now={c.cents} before={c.prev} goodWhenDown suffix="" /> : <Chip tone="blue">new</Chip>}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}

// ---------- Saving ----------
function SavingCard({ a }) {
  const { totals, saving } = a
  const r = 30
  const c = 2 * Math.PI * r
  const income = totals.income || 0
  const savedShare = income > 0 ? Math.max(0, Math.min(1, totals.saved / income)) : 0
  return (
    <Card icon="savings" color="var(--color-cobalt)" title="Saving" onMore={() => navigate('/analytics/saving')}>
      <div className="flex items-center gap-4">
        <div className="relative grid size-[76px] shrink-0 place-items-center">
          <svg width="76" height="76" viewBox="0 0 76 76" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="38" cy="38" r={r} fill="none" strokeWidth="9" stroke="var(--color-line)" />
            {savedShare > 0 && <circle cx="38" cy="38" r={r} fill="none" strokeWidth="9" stroke="var(--color-cobalt)" strokeDasharray={`${savedShare * c} ${c}`} />}
          </svg>
          <span className="tabular relative font-display text-base font-extrabold">{saving.rate !== null ? pct(Math.max(0, saving.rate)) : '—'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted">You saved</p>
          <p className="tabular truncate font-display text-[24px] leading-tight font-bold">
            {whole(saving.kept)} {income > 0 && <span className="font-sans text-sm font-medium text-muted">of {whole(income)}</span>}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Mini label={`Saved in ${saving.year}`} value={whole(saving.yearKept)} />
        <Mini label="Average rate" value={saving.avgRate !== null ? pct(saving.avgRate) : '—'} />
        <Mini label="Best month" value={saving.best ? monthShort(saving.best.key) : '—'} />
      </div>
    </Card>
  )
}

// ---------- Trends ----------
function TrendsCard({ a }) {
  const max = Math.max(1, ...a.trend.map((t) => Math.max(t.income, t.spent)))
  const colW = 300 / 12
  const H = 62
  return (
    <Card icon="chart" color="#7048e8" title="Trends" onMore={() => navigate('/analytics/trends')}>
      <div className="-mt-1 mb-1 flex justify-end gap-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-gain" /> In
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm" style={{ background: ORANGE }} /> Out
        </span>
      </div>
      <svg viewBox="0 0 300 78" className="block h-auto w-full" role="img" aria-label="Money in and out over the last 12 months">
        {a.trend.map((t, i) => {
          const x = i * colW + 2
          const hi = (t.income / max) * H
          const ho = (t.spent / max) * H
          return (
            <g key={t.key} opacity={t.future ? 0.25 : t.partial ? 0.5 : 1}>
              {hi > 0 && <rect x={x} y={H - hi} width="9" height={hi} rx="2.5" fill="var(--color-gain)" />}
              {ho > 0 && <rect x={x + 10} y={H - ho} width="9" height={ho} rx="2.5" fill={ORANGE} />}
              <text x={x + 9.5} y="76" textAnchor="middle" fontSize="9.5" className="fill-muted">
                {monthShort(t.key)[0]}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {a.avgIn !== null && <Chip tone="good">Avg in {whole(a.avgIn)}</Chip>}
        {a.avgOut !== null && <Chip tone="bad">Avg out {whole(a.avgOut)}</Chip>}
      </div>
    </Card>
  )
}

// ---------- Highlights ----------
function HighlightsCard({ a, category }) {
  const items = highlights(a, (id) => category(id)?.name ?? 'No category', whole)
  if (!items.length) return null
  return (
    <Card icon="sun" color="#fab005" title="Highlights">
      <ul className="space-y-1">
        {items.map((h) => (
          <li key={h.key} className="flex items-center gap-3 py-1 text-sm">
            <span
              className={`grid size-8 shrink-0 place-items-center rounded-[10px] ${
                h.good === true ? 'bg-gain/12 text-gain' : h.good === false ? 'bg-loss/10 text-loss' : 'bg-cobalt/10 text-cobalt'
              }`}
            >
              <Icon name={h.icon} size={16} strokeWidth={2.2} />
            </span>
            <span>
              {h.text[0]}
              <b>{h.text[1]}</b>
              {h.text[2]}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
