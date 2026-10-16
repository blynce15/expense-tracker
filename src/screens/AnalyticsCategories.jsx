import { useEffect, useState } from 'react'
import { pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import { fetchAnalytics, monthShort, periodLabel, placesFrom, prevLabel } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { navigate } from '../lib/useRoute'

const GREY = '#94a3c4'
// Expenses without a category use "none" in the address
const idFor = (id) => id ?? 'none'
const sameId = (a, b) => idFor(a) === idFor(b)
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const dayMonth = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
}
// A darker version of a #rrggbb colour, for the hero gradient
function darker(hex, by = 0.3) {
  const n = parseInt((hex ?? GREY).replace('#', ''), 16)
  const ch = (s) => Math.round(((n >> s) & 255) * (1 - by))
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

// Loads the chosen period's analytics plus the category list
function useCategoryData() {
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

  const ready = data && data.period === period && categories ? data : null
  const category = (id) => categories?.find((c) => sameId(c.id, id))
  return { period, setPeriod, a: ready, category, error }
}

// A category's spending in each of the 12 months, and its usual month (average over full months that had any
// activity, leaving out the chosen month, so months before you started using the app don't count)
function monthsOf(a, id) {
  const thisMonth = todayISO().slice(0, 7)
  const months = a.last12.map((k) => ({ key: k, cents: a.catBy.get(`${k}|${id ?? null}`) ?? 0, partial: k === thisMonth, future: k > thisMonth }))
  const active = a.activeMonths.filter((k) => k !== a.period.key)
  const usual = active.length ? active.reduce((s, k) => s + (a.catBy.get(`${k}|${id ?? null}`) ?? 0), 0) / active.length : null
  return { months, usual }
}

// What this category usually costs by now: month = usual month scaled to the days passed; year = last year by now.
// null = nothing to compare with yet.
function usualByNow(a, row, usual) {
  if (a.period.kind === 'year') return a.compare.spent ? (row?.prev ?? 0) : null
  if (usual === null) return null
  return Math.round(usual * (a.current ? a.days.passed / a.days.total : 1))
}

function ChangePill({ now, usual, small = false }) {
  const size = small ? 'text-[11px] px-1.5' : 'text-xs px-2'
  if (usual === null) return null
  if (!usual) return <span className={`rounded-full bg-cobalt/10 py-0.5 font-bold text-cobalt ${size}`}>new</span>
  const c = now / usual - 1
  if (Math.abs(c) < 0.03) return <span className={`rounded-full bg-line/70 py-0.5 font-bold text-muted ${size}`}>= same</span>
  const up = c > 0
  const n = Math.round(Math.abs(c) * 100)
  return (
    <span className={`tabular rounded-full py-0.5 font-bold ${up ? 'bg-warn-bg text-orange-text' : 'bg-gain/12 text-gain'} ${size}`}>
      {up ? '▲' : '▼'} {n >= 200 ? `${Math.round(now / usual)}×` : `${n}%`}
    </span>
  )
}

const card = 'rounded-[24px] bg-card p-4'
const Label = ({ children }) => <h2 className="mt-5 mb-2.5 px-1 text-[11.5px] font-bold tracking-[0.08em] text-muted uppercase">{children}</h2>

// ---------- Analytics → Categories ----------
export default function AnalyticsCategories() {
  const { period, setPeriod, a, category, error } = useCategoryData()
  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your categories: {error}</p>

  return (
    <div className="px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a &&
        (a.categories.length === 0 ? (
          <p className="mt-3 rounded-[24px] bg-card px-5 py-8 text-center text-muted">No spending in {periodLabel(period)}.</p>
        ) : (
          <CategoryList a={a} category={category} />
        ))}
    </div>
  )
}

function CategoryList({ a, category }) {
  const total = a.totals.spent || 1
  const counts = new Map()
  for (const t of a.expenses) counts.set(idFor(t.category_id), (counts.get(idFor(t.category_id)) ?? 0) + 1)
  const colorOf = (id) => category(id)?.color ?? GREY
  const rows = a.categories.map((c) => {
    const { months, usual } = monthsOf(a, c.id)
    return { ...c, months, usual: usualByNow(a, c, usual) }
  })
  // Biggest moves: the largest rise and the largest fall in euros against usual
  const moves = rows.filter((r) => r.usual > 0).map((r) => ({ ...r, diff: r.cents - r.usual }))
  const rise = moves.filter((r) => r.diff >= 500).sort((x, y) => y.diff - x.diff)[0]
  const fall = moves.filter((r) => r.diff <= -500).sort((x, y) => x.diff - y.diff)[0]
  const year = a.period.kind === 'year'

  return (
    <>
      <section className="relative mt-3 overflow-hidden rounded-[24px] bg-gradient-to-br from-[#ff9f43] to-[#e8590c] p-4 text-white shadow-[0_18px_30px_-20px_rgba(232,89,12,0.9)]">
        <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/[.12]" />
        <p className="relative text-[13.5px] font-semibold text-white/90">Spent across {count(a.categories.length, 'category', 'categories')}</p>
        <p className="tabular relative font-display text-[34px] leading-tight font-bold">{whole(a.totals.spent)}</p>
        <div className="relative mt-2.5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-white/25 ring-2 ring-white/35">
          {a.categories.map((c) => (
            <span key={idFor(c.id)} style={{ flex: c.cents, background: colorOf(c.id) }} />
          ))}
        </div>
        <div className="relative mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {a.categories.slice(0, 4).map((c) => (
            <span key={idFor(c.id)} className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-white" style={{ boxShadow: `inset 0 0 0 3px ${colorOf(c.id)}` }} />
              {category(c.id)?.name ?? 'No category'} {pct(c.cents / total)}
            </span>
          ))}
        </div>
      </section>

      {(rise || fall) && (
        <>
          <Label>Biggest moves vs {year ? prevLabel(a.period) : 'usual'}</Label>
          <div className="grid grid-cols-2 gap-2.5">
            {[rise, fall].map((m, i) =>
              m ? (
                <button
                  key={idFor(m.id)}
                  onClick={() => navigate(`/analytics/categories/${idFor(m.id)}`)}
                  className={`rounded-[20px] border-t-4 bg-card p-3 text-left ${i === 0 ? 'border-[#f08c00]' : 'border-[#0f8a5f]'}`}
                >
                  <span className="text-xl">{category(m.id)?.icon ?? '❔'}</span>
                  <b className="mt-1 block truncate text-sm">{category(m.id)?.name ?? 'No category'}</b>
                  <span className="tabular block truncate text-[12.5px] text-muted">
                    {whole(m.cents)} · {year ? prevLabel(a.period) : 'usually'} {whole(m.usual)}
                  </span>
                  <span className={`tabular mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${i === 0 ? 'bg-warn-bg text-orange-text' : 'bg-gain/12 text-gain'}`}>
                    {i === 0 ? '▲' : '▼'} {whole(Math.abs(m.diff))}
                  </span>
                </button>
              ) : (
                <span key={i} />
              ),
            )}
          </div>
        </>
      )}

      <Label>All categories</Label>
      <ul className="overflow-hidden rounded-[24px] bg-card px-4">
        {rows.map((c) => {
          const cat = category(c.id)
          const spark = c.months.slice(-6).filter((m) => !m.future)
          return (
            <li key={idFor(c.id)} className="border-b border-line last:border-0">
              <button onClick={() => navigate(`/analytics/categories/${idFor(c.id)}`)} className="flex w-full items-center gap-3 py-3 text-left">
                <span className="grid size-9 shrink-0 place-items-center rounded-[11px] text-[17px]" style={{ background: `${colorOf(c.id)}22` }}>
                  {cat?.icon ?? '❔'}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[14.5px]">{cat?.name ?? 'No category'}</b>
                  <span className="block truncate text-xs text-muted">
                    {pct(c.cents / total)} · {count(counts.get(idFor(c.id)) ?? 0, 'time', 'times')}
                  </span>
                </span>
                <Sparkline values={spark.map((m) => m.cents)} color={colorOf(c.id)} />
                <span className="flex w-[64px] shrink-0 flex-col items-end gap-0.5">
                  <b className="tabular font-display text-[15px]">{whole(c.cents)}</b>
                  <ChangePill now={c.cents} usual={c.usual} small />
                </span>
                <Icon name="chevronRight" size={16} className="-mr-1 shrink-0 text-muted/60" />
              </button>
            </li>
          )
        })}
      </ul>
      <p className="mt-2.5 px-1 text-xs text-muted">
        Compared with {year ? `${prevLabel(a.period)}` : 'your usual month'}
        {a.current ? ' up to the same day' : ''} · lines show the last 6 months
      </p>
    </>
  )
}

function Sparkline({ values, color }) {
  if (values.length < 2) return <span className="w-[52px] shrink-0" />
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 48 + 2, 21 - (v / max) * 17])
  return (
    <svg width="52" height="24" viewBox="0 0 52 24" className="shrink-0 overflow-visible" aria-hidden="true">
      <polyline points={pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.at(-1)[0]} cy={pts.at(-1)[1]} r="2.6" fill={color} />
    </svg>
  )
}

// ---------- Analytics → Categories → one category ----------
export function CategoryDetail({ id }) {
  const { period, setPeriod, a, category, error } = useCategoryData()
  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load this category: {error}</p>

  const catId = id === 'none' ? null : id
  return (
    <div className="px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && <CategoryBody a={a} cat={category(catId)} catId={catId} />}
    </div>
  )
}

function CategoryBody({ a, cat, catId }) {
  const color = cat?.color ?? GREY
  const row = a.categories.find((c) => sameId(c.id, catId))
  const cents = row?.cents ?? 0
  const rank = a.categories.findIndex((c) => sameId(c.id, catId)) + 1
  const mine = a.expenses.filter((t) => sameId(t.category_id, catId))
  const { months, usual } = monthsOf(a, catId)
  const byNow = usualByNow(a, row, usual)

  return (
    <>
      <Hero a={a} cat={cat} color={color} cents={cents} usual={usual} byNow={byNow} rank={rank} visits={mine.length} />
      <TwelveMonths a={a} months={months} usual={usual} color={color} catId={catId} />
      {mine.length > 0 ? (
        <>
          <Where mine={mine} cat={cat} color={color} />
          <When a={a} mine={mine} cat={cat} color={color} />
          <Biggest mine={mine} cat={cat} color={color} />
        </>
      ) : (
        <p className="mt-3 rounded-[24px] bg-card px-5 py-6 text-center text-muted">Nothing in {periodLabel(a.period)}.</p>
      )}
    </>
  )
}

// The category's own colour: spent, against usual (with a bar for this month so far), share, per visit, per day
function Hero({ a, cat, color, cents, usual, byNow, rank, visits }) {
  const year = a.period.kind === 'year'
  const [euros, decimals] = formatCents(cents).split(',')
  const label = year ? a.period.key : periodLabel(a.period).split(' ')[0]
  const change = byNow ? cents / byNow - 1 : null
  const showBar = !year && usual !== null && usual > 0
  const share = showBar ? cents / usual : 0
  const perDay = a.days.passed ? cents / a.days.passed : 0
  const facts = [
    ['Share', a.totals.spent ? pct(cents / a.totals.spent) : '—', rank > 0 ? `#${rank} category` : ''],
    ['Per visit', visits ? whole(cents / visits) : '—', count(visits, 'visit', 'visits')],
    year ? ['Per month', whole(perDay * 30.44), 'average'] : ['Per day', whole(perDay), 'average'],
  ]

  return (
    <section
      className="relative mt-3 overflow-hidden rounded-[24px] p-4 text-white"
      style={{ background: `linear-gradient(145deg, ${color}, ${darker(color)})`, boxShadow: `0 18px 30px -20px ${darker(color, 0.1)}` }}
    >
      <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/[.12]" />
      <div className="relative flex items-center justify-between gap-2">
        <p className="text-[13.5px] font-semibold text-white/90">Spent in {label}</p>
        {change !== null && Math.abs(change) >= 0.03 && (
          <span className={`tabular rounded-full bg-white px-2.5 py-0.5 text-xs font-bold ${change > 0 ? 'text-[#c26b00]' : 'text-[#0f8a5f]'}`}>
            {change > 0 ? '▲' : '▼'} {Math.round(Math.abs(change) * 100)}% vs {year ? prevLabel(a.period) : 'usual'}
          </span>
        )}
      </div>
      <p className="tabular relative font-display leading-tight font-bold">
        <span className="text-[36px]">{euros}</span>
        <span className="text-lg text-white/60">,{decimals}</span>
      </p>
      {showBar && (
        <div className="relative mt-2">
          <div className="flex justify-between text-xs text-white/90">
            <span>{a.current ? 'So far this month' : 'This month'}</span>
            <span className="tabular">
              usual month <b>{whole(usual)}</b>
            </span>
          </div>
          <div className="relative mt-1.5 h-2.5 rounded-full bg-white/[.22]">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, share * 100)}%` }} />
            {share > 1 && <span className="absolute -top-1 h-[18px] border-l-2 border-[#ffd43b]" style={{ left: `${100 / share}%` }} />}
          </div>
          <span className="tabular mt-1 block text-[11.5px] text-white/85">
            {share > 1
              ? `Already ${whole(cents - usual)} above a usual month`
              : a.current && byNow
                ? `Usually ${whole(byNow)} by day ${a.days.passed} of ${a.days.total}`
                : `${whole(usual - cents)} below a usual month`}
          </span>
        </div>
      )}
      {year && byNow > 0 && (
        <p className="tabular relative mt-1 text-[12.5px] text-white/90">
          {prevLabel(a.period)} by now: {whole(byNow)}
        </p>
      )}
      <div className="relative mt-3 grid grid-cols-3 rounded-2xl bg-white/[.14]">
        {facts.map(([l, v, s], i) => (
          <div key={l} className={`min-w-0 px-3 py-2 ${i ? 'border-l border-white/15' : ''}`}>
            <span className="block text-[10.5px] font-semibold text-white/80">{l}</span>
            <b className="tabular block truncate font-display text-base">{v}</b>
            <span className="block truncate text-[10.5px] text-white/80">{s}</span>
          </div>
        ))}
      </div>
      {!cat && <p className="relative mt-2 text-xs text-white/85">Expenses without a category.</p>}
    </section>
  )
}

// Bars for the 12 months up to the period's end, usual dashed; this month solid so far + faded to its pace
function TwelveMonths({ a, months, usual, color }) {
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 96
  const step = W / 12
  const bw = step * 0.56
  const cur = months.find((m) => m.partial)
  const pace = cur && a.days.passed && a.period.kind === 'month' && a.current ? Math.round((cur.cents / a.days.passed) * a.days.total) : null
  const max = Math.max(1, ...months.map((m) => m.cents), usual ?? 0, pace ?? 0) * 1.05
  const y = (c) => H - (c / max) * H
  const p = picked === null ? null : months[picked]

  return (
    <section className={`${card} mt-3`}>
      <div className="flex items-baseline justify-between gap-2">
        <b className="font-display text-[17px]">Last 12 months</b>
        {pace !== null && (
          <span className="tabular text-[12.5px] text-muted">
            on pace for <b className="text-ink">{whole(pace)}</b>
          </span>
        )}
      </div>
      <svg viewBox={`0 -12 ${W} ${H + 28}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Spending in this category each month">
        {months.map((m, i) => {
          const x = i * step + (step - bw) / 2
          return (
            <g key={m.key} onClick={() => !m.future && setPicked(i === picked ? null : i)} className="cursor-pointer">
              <rect x={i * step} y="-12" width={step} height={H + 28} fill="transparent" />
              {m.partial && pace > m.cents && <rect x={x} y={y(pace)} width={bw} height={H - y(pace)} rx="5" fill={color} opacity=".22" />}
              {m.cents > 0 && (
                <rect x={x} y={y(m.cents)} width={bw} height={Math.max(2, H - y(m.cents))} rx="5" fill={color} opacity={picked === i || (picked === null && m.partial) ? 1 : 0.45} />
              )}
              <text x={x + bw / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className={picked === i || m.partial ? 'fill-ink font-bold' : 'fill-muted'}>
                {monthShort(m.key)[0]}
              </text>
            </g>
          )
        })}
        {usual > 0 && (
          <>
            <line x1="0" x2={W} y1={y(usual)} y2={y(usual)} stroke="var(--color-muted)" strokeWidth="1.3" strokeDasharray="4 4" />
            <text x="0" y={y(usual) - 5} fontSize="10" fontWeight="600" className="fill-muted">
              usual {whole(usual)}
            </text>
          </>
        )}
      </svg>
      <p className="mt-2 min-h-5 text-center text-[12.5px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' so far'}: <b className="tabular text-ink">{formatCents(p.cents)}</b>
          </>
        ) : (
          'Tap a month · dashed line = your usual month'
        )}
      </p>
    </section>
  )
}

function Where({ mine, cat, color }) {
  const places = placesFrom(mine, 5)
  if (!places.length) return null
  const max = places[0].cents || 1
  return (
    <section className={`${card} mt-3`}>
      <b className="font-display text-[17px]">Where</b>
      <ul className="mt-1.5">
        {places.map((g, i) => (
          <li key={g.name} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-line' : ''}`}>
            <MerchantIcon name={g.name} className="size-9 rounded-[11px] text-[17px]" style={{ background: `${color}22` }}>
              {cat?.icon ?? '🧾'}
            </MerchantIcon>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <b className="truncate text-[14.5px]">{g.name}</b>
                <b className="tabular shrink-0 font-display text-[15px]">{whole(g.cents)}</b>
              </span>
              <span className="mt-1.5 flex items-center gap-2">
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper">
                  <span className="block h-full rounded-full" style={{ width: `${(g.cents / max) * 100}%`, background: color }} />
                </span>
                <span className="tabular w-6 text-right text-[11.5px] text-muted">{g.count}×</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// Average spent in this category per weekday over the period
function When({ a, mine, cat, color }) {
  const sums = Array(7).fill(0)
  const counts = Array(7).fill(0)
  const first = a.period.kind === 'year' ? `${a.period.key}-01-01` : `${a.period.key}-01`
  const [fy, fm, fd] = first.split('-').map(Number)
  for (let d = new Date(fy, fm - 1, fd), i = 0; i < a.days.passed; i += 1, d.setDate(d.getDate() + 1)) counts[(d.getDay() + 6) % 7] += 1
  for (const t of mine) {
    const [y, m, d] = t.date.split('-').map(Number)
    sums[(new Date(y, m - 1, d).getDay() + 6) % 7] += t.amount_cents
  }
  const avgs = sums.map((s, i) => (counts[i] ? s / counts[i] : 0))
  const top = avgs.reduce((b, v, i) => (v > avgs[b] ? i : b), 0)
  const max = Math.max(1, ...avgs)
  return (
    <section className={`${card} mt-3`}>
      <b className="font-display text-[17px]">When</b>
      <div className="mt-2.5 flex h-[66px] items-end gap-2">
        {avgs.map((v, i) => (
          <div key={i} className="flex-1 text-center">
            <span className={`tabular text-[10px] ${i === top && v > 0 ? 'font-bold' : 'text-muted'}`} style={i === top && v > 0 ? { color } : undefined}>
              {whole(v)}
            </span>
            <div className="mt-0.5 rounded-md" style={{ height: Math.max(3, (v / max) * 42), background: i === top && v > 0 ? color : `${color}33` }} />
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
      {avgs[top] > 0 && (
        <p className="mt-2 text-[12.5px] text-muted">
          You spend on {cat?.name?.toLowerCase() ?? 'this'} most on <b className="text-ink">{WEEKDAYS[top]}</b>.
        </p>
      )}
    </section>
  )
}

function Biggest({ mine, cat, color }) {
  const list = [...mine].sort((x, y) => y.amount_cents - x.amount_cents).slice(0, 5)
  return (
    <section className={`${card} mt-3`}>
      <b className="font-display text-[17px]">Biggest purchases</b>
      <ul className="mt-1.5">
        {list.map((t, i) => (
          <li key={i} className={`flex items-center gap-3 py-2.5 ${i ? 'border-t border-line' : ''}`}>
            <MerchantIcon name={t.note} className="size-9 rounded-[11px] text-[17px]" style={{ background: `${color}22` }}>
              {cat?.icon ?? '🧾'}
            </MerchantIcon>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[14.5px]">{t.note?.trim() || cat?.name || 'Expense'}</b>
              <span className="block text-xs text-muted">{dayMonth(t.date)}</span>
            </span>
            <b className="tabular font-display text-[15px]">{formatCents(t.amount_cents)}</b>
          </li>
        ))}
      </ul>
    </section>
  )
}
