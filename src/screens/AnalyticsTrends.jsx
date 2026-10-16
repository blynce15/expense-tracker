import { useEffect, useState } from 'react'
import { pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import MerchantIcon from '../components/MerchantIcon'
import { fetchAnalytics, monthShort, periodLabel, prevLabel, verdictOf } from '../lib/analytics'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { monthlyCents } from '../lib/recurring'
import { navigate } from '../lib/useRoute'

const signed = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)
const kept = (m) => (m ? m.saved + m.invested : 0)

// Analytics → Better or worse: one section per question: overall (vs usual and vs last year), the last 12 months
// in and out, is spending creeping up, which categories are changing, are fixed costs growing, your records.
export default function AnalyticsTrends() {
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your trends: {error}</p>
  const a = data && data.period === period && categories ? data : null
  const category = (id) => categories?.find((c) => (c.id ?? 'none') === (id ?? 'none'))
  // Full months with any activity in the 12 months (not the one still running)
  const full = a ? a.trend.filter((t) => !t.partial && !t.future && (t.income || t.spent)) : []

  return (
    <div className="px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && (
        <>
          <Section n={1} title="Overall">
            <Overall a={a} />
          </Section>
          <Section n={2} title="The last 12 months">
            <InOut a={a} />
          </Section>
          <Section n={3} title="Is spending creeping up?">
            <Creep a={a} full={full} />
          </Section>
          <Section n={4} title="Which categories are changing">
            <Changing a={a} category={category} />
          </Section>
          <Section n={5} title="Are fixed costs growing">
            <FixedCosts a={a} />
          </Section>
          {full.length >= 2 && (
            <Section n={6} title="Your records">
              <Records a={a} full={full} />
            </Section>
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
        <span className="grid size-5 place-items-center rounded-full bg-[#2b3a6b] text-[11px] tracking-normal text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
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

// ---------- 1 · Overall ----------
// Chips on navy: green = better, amber = worse. Spending is better when down; income and kept when up.
function chip(change, { goodWhenDown = false, points = false } = {}) {
  if (change === null || change === undefined || !Number.isFinite(change)) return { text: '—', tone: 'none' }
  const n = Math.round(Math.abs(change) * 100)
  if (Math.abs(change) < (points ? 0.02 : 0.03) || n === 0) return { text: '= same', tone: 'same' }
  const up = change > 0
  return { text: `${up ? '▲' : '▼'} ${n}${points ? ' pts' : '%'}`, tone: up !== goodWhenDown ? 'good' : 'bad' }
}
const TONE = {
  good: 'bg-[#7ef0b4]/20 text-[#7ef0b4]',
  bad: 'bg-[#ffb84d]/20 text-[#ffb84d]',
  same: 'bg-white/[.14] text-white/80',
  none: 'bg-white/[.08] text-white/50',
}

function Overall({ a }) {
  const year = a.period.kind === 'year'
  const v = verdictOf(a)
  const ly = a.lastYear
  const rate = a.saving.rate
  // vs last year: month = same month last year up to the same day; year = last year up to the same day
  const prevIncome = year ? Math.round(a.previous.income * (a.current ? a.days.passed / a.days.total : 1)) : ly?.income
  const prevKept = year ? kept(a.previous) * (a.current ? a.days.passed / a.days.total : 1) : ly?.kept
  const vsYear = {
    spending: year ? v.spending.change : ly && ly.spent ? a.totals.spent / ly.spent - 1 : null,
    income: prevIncome ? a.totals.income / prevIncome - 1 : null,
    kept: rate !== null && prevIncome ? rate - prevKept / prevIncome : null,
  }
  const rows = [
    ['Spending', whole(a.totals.spent), year ? null : chip(v.spending.change, { goodWhenDown: true }), chip(vsYear.spending, { goodWhenDown: true })],
    ['Income', whole(a.totals.income), year ? null : chip(v.income.change), chip(vsYear.income)],
    ['Kept', rate !== null ? pct(Math.max(0, rate)) : '—', year ? null : chip(v.kept.change, { points: true }), chip(vsYear.kept, { points: true })],
  ]
  // The verdict: count better vs worse across all chips
  const tones = rows.flatMap((r) => [r[2]?.tone, r[3].tone]).filter((t) => t === 'good' || t === 'bad')
  const good = tones.filter((t) => t === 'good').length
  const bad = tones.length - good
  const verdict = !tones.length ? 'Not enough history yet' : good > bad ? 'Better than usual' : bad > good ? 'Worse than usual' : 'About the same as usual'
  const mark = good > bad ? '▲' : bad > good ? '▼' : '='
  const markTone = good > bad ? 'bg-[#7ef0b4]/[.18] text-[#7ef0b4]' : bad > good ? 'bg-[#ffb84d]/[.18] text-[#ffb84d]' : 'bg-white/[.14] text-white/80'
  const label = year ? `${a.period.key}${a.current ? ' so far' : ''}` : `${periodLabel(a.period).split(' ')[0]}${a.current ? ' so far' : ''}`
  const lyLabel = year ? `VS ${prevLabel(a.period)}` : `VS ${monthShort(a.lastYear?.key ?? a.period.key).toUpperCase()} ${String(Number(a.period.key.slice(0, 4)) - 1).slice(2)}`

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#3a4a7a] to-[#1b2550] p-4 text-white shadow-[0_18px_30px_-20px_rgba(27,37,80,0.9)]">
      <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/[.08]" />
      <div className="relative flex items-center gap-3">
        <span className={`grid size-[50px] shrink-0 place-items-center rounded-2xl font-display text-2xl font-extrabold ${markTone}`}>{mark}</span>
        <span className="min-w-0">
          <span className="text-[12.5px] font-semibold text-white/80">{label}</span>
          <b className="block font-display text-[22px] leading-tight">{verdict}</b>
        </span>
      </div>
      <div className={`relative mt-3.5 grid ${year ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_auto_auto]'} gap-x-2 text-[10.5px] font-bold tracking-[0.06em] text-white/70`}>
        <span />
        {!year && <span className="w-[66px] text-center">VS USUAL</span>}
        <span className="w-[66px] text-center">{lyLabel}</span>
      </div>
      {rows.map(([l, value, c1, c2]) => (
        <div key={l} className={`relative grid ${year ? 'grid-cols-[1fr_auto]' : 'grid-cols-[1fr_auto_auto]'} items-center gap-x-2 border-t border-white/[.12] py-2.5`}>
          <span>
            <span className="text-[13px] text-white/85">{l}</span>
            <b className="tabular block font-display text-[17px]">{value}</b>
          </span>
          {!year && <span className={`tabular w-[66px] rounded-full py-0.5 text-center text-xs font-bold ${TONE[c1.tone]}`}>{c1.text}</span>}
          <span className={`tabular w-[66px] rounded-full py-0.5 text-center text-xs font-bold ${TONE[c2.tone]}`}>{c2.text}</span>
        </div>
      ))}
    </div>
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
              <text x={i * step + step / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className={t.partial || picked === i ? 'fill-ink font-bold' : 'fill-muted'}>
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
function Creep({ a, full }) {
  if (full.length < 4) return <Empty>A few more months of history are needed to see a trend.</Empty>
  const half = Math.min(6, Math.floor(full.length / 2))
  const avg = (list) => list.reduce((s, t) => s + t.spent, 0) / list.length
  const recent = avg(full.slice(-half))
  const before = avg(full.slice(-2 * half, -half))
  const diff = Math.round(recent - before)
  const rise = before ? recent / before - 1 : 0
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
      <svg viewBox={`-6 -8 ${W + 12} ${H + 26}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Spending each month with its trend">
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
          <circle key={i} cx={x(i)} cy={y(v)} r={i === n - 1 ? 4.5 : 2.5} fill={i === n - 1 ? '#f08c00' : 'var(--color-card)'} stroke="#f08c00" strokeWidth="2" />
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
    .map((id) => ({ id: id === 'null' ? null : id, diff: Math.round(avg(recent, id) - avg(before, id)) }))
    .filter((m) => Math.abs(m.diff) >= 500)
  const up = moves.filter((m) => m.diff > 0).sort((x, y) => y.diff - x.diff).slice(0, 3)
  const down = moves.filter((m) => m.diff < 0).sort((x, y) => x.diff - y.diff).slice(0, 3)
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

// ---------- 5 · Are fixed costs growing ----------
// Recurring payments paid each month (expenses named like one), what they cost now, and which were added or
// got more expensive (a payment recorded for more than before)
function FixedCosts({ a }) {
  const now = a.recurringMonthly
  const rows = a.trend.filter((t) => !t.future).map((t) => ({ key: t.key, cents: a.fixedBy.get(t.key) ?? 0, partial: t.partial }))
  const fullFixed = rows.filter((r) => !r.partial && a.activeMonths.includes(r.key))
  const first = fullFixed.find((r) => r.cents > 0)
  const growth = first ? now - first.cents : null
  const start = a.last12[0]
  const added = (a.recurring ?? [])
    .filter((r) => r.active && r.type !== 'income' && (r.created_at ?? '').slice(0, 7) >= start)
    .map((r) => ({ key: `n${r.id}`, name: r.name, icon: r.icon, note: `added ${monthShort(r.created_at.slice(0, 7))}`, cents: monthlyCents(r) }))
  const ups = []
  for (const r of a.recurring ?? []) {
    if (!r.active || r.type === 'income') continue
    const hist = (a.fixedHistory.get(r.name.trim().toLowerCase()) ?? []).sort((x, y) => (x.date < y.date ? -1 : 1))
    if (hist.length < 2) continue
    const lastPaid = hist.at(-1)
    const earlier = [...hist].reverse().find((h) => h.cents !== lastPaid.cents)
    if (earlier && lastPaid.cents > earlier.cents) {
      ups.push({ key: `u${r.id}`, name: r.name, icon: r.icon, note: `price up ${monthShort(lastPaid.date.slice(0, 7))}`, cents: lastPaid.cents - earlier.cents })
    }
  }
  const changes = [...added, ...ups]
  const W = 300
  const H = 70
  const max = Math.max(1, now, ...rows.map((r) => r.cents)) * 1.1
  const step = W / Math.max(1, rows.length)
  const bw = step * 0.56

  if (!now && !rows.some((r) => r.cents)) return <Empty>No recurring payments yet.</Empty>
  return (
    <div className={card}>
      <div className="flex items-start justify-between gap-2">
        <span>
          <span className="text-[12.5px] text-muted">Recurring payments now</span>
          <b className="tabular block font-display text-2xl leading-tight">
            {whole(now)} <span className="font-sans text-[13px] font-medium text-muted">a month</span>
          </b>
        </span>
        {growth !== null && Math.abs(growth) >= 100 && (
          <span className={`tabular rounded-full px-2 py-0.5 text-xs font-bold ${growth > 0 ? 'bg-warn-bg text-orange-text' : 'bg-gain/12 text-gain'}`}>
            {growth > 0 ? '▲' : '▼'} {whole(Math.abs(growth))} since {monthShort(first.key)}
          </span>
        )}
      </div>
      <svg viewBox={`0 -4 ${W} ${H + 20}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Recurring payments paid each month">
        {rows.map((r, i) => (
          <g key={r.key}>
            {r.cents > 0 && <rect x={i * step + (step - bw) / 2} y={H - (r.cents / max) * H} width={bw} height={(r.cents / max) * H} rx="4" fill="#7c4dff" opacity={r.partial ? 0.45 : 0.8} />}
            <text x={i * step + step / 2} y={H + 14} textAnchor="middle" fontSize="9.5" className={r.partial ? 'fill-ink font-bold' : 'fill-muted'}>
              {monthShort(r.key)[0]}
            </text>
          </g>
        ))}
        {now > 0 && <line x1="0" x2={W} y1={H - (now / max) * H} y2={H - (now / max) * H} stroke="#7c4dff" strokeWidth="1.4" strokeDasharray="4 4" />}
      </svg>
      <Legend
        items={[
          ['Paid each month', <span key="p" className="size-2.5 rounded-[3px] bg-[#7c4dff]" />],
          ['What they cost now', <span key="n" className="w-3 border-t-[1.5px] border-dashed border-[#7c4dff]" />],
        ]}
      />
      {changes.length > 0 && (
        <ul className="mt-2">
          {changes.slice(0, 5).map((c) => (
            <li key={c.key}>
              <button onClick={() => navigate('/recurring')} className="flex w-full items-center gap-3 border-t border-line py-2.5 text-left">
                <MerchantIcon name={c.name} className="size-[34px] rounded-[10px] bg-violet/12 text-base">
                  {c.icon}
                </MerchantIcon>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{c.name}</b>
                  <span className="text-[11.5px] text-muted">{c.note}</span>
                </span>
                <b className="tabular font-display text-[14.5px] text-orange-text">
                  +{formatCents(c.cents)}
                  <span className="font-sans text-[11px] font-medium text-muted">/mo</span>
                </b>
              </button>
            </li>
          ))}
        </ul>
      )}
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
