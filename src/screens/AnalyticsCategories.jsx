import { useEffect, useState } from 'react'
import { BigAmount, NavyPeriodBar, NavyPill, NavyTop, Overlap, pct, Section, usePeriod, whole } from '../components/AnalyticsKit'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, fetchAnalytics, monthShort, periodLabel, placesFrom, prevLabel, verdictOf } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
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

const card = 'rounded-[24px] bg-card p-4 shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)]'
// The Spending card's orange (Analytics → Explore), as the top of the categories list
const ORANGE_TOP = 'radial-gradient(120% 90% at 85% 0%, #ffb066 0%, #f0701e 45%, #b8410a 100%)'
const WHITES = ['#fff', 'rgba(255,255,255,.78)', 'rgba(255,255,255,.6)', 'rgba(255,255,255,.44)', 'rgba(255,255,255,.3)', 'rgba(255,255,255,.2)']
// A category's colour as a top: lighter at the corner, darker at the bottom
const topFor = (hex) => `radial-gradient(120% 90% at 85% 0%, ${lighter(hex)} 0%, ${hex} 45%, ${darker(hex, 0.45)} 100%)`
function lighter(hex, by = 0.35) {
  const n = parseInt((hex ?? GREY).replace('#', ''), 16)
  const ch = (s) => Math.round(((n >> s) & 255) + (255 - ((n >> s) & 255)) * by)
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`
}

// A ring (white on the coloured top): `share` filled, an optional dot at `dot` (how far through the month)
function Ring({ share, dot, size = 108, children }) {
  const r = size / 2 - 7
  const C = 2 * Math.PI * r
  const a = (dot ?? 0) * 2 * Math.PI - Math.PI / 2
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="12" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${Math.min(1, share) * C} ${C}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        {dot != null && <circle cx={size / 2 + Math.cos(a) * r} cy={size / 2 + Math.sin(a) * r} r="5" fill="#fff" stroke="rgba(0,0,0,.18)" strokeWidth="2" />}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">{children}</span>
    </div>
  )
}

// A donut of the categories, white shades on the orange top
function Donut({ parts, size = 108, children }) {
  const r = size / 2 - 8
  const C = 2 * Math.PI * r
  const total = parts.reduce((s, c) => s + c, 0) || 1
  const gap = parts.length > 1 ? 3 : 0
  let at = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="14" />
        {parts.map((c, i) => {
          const len = (c / total) * C
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={WHITES[Math.min(i, WHITES.length - 1)]}
              strokeWidth="14"
              strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`}
              strokeDashoffset={-at}
            />
          )
          at += len
          return el
        })}
      </svg>
      <span className="absolute inset-0 grid place-items-center text-center">{children}</span>
    </div>
  )
}

// ---------- Analytics → Categories (owner chose "L1 · Tiles", .harness/analytics-v9-categories.html) ----------
export default function AnalyticsCategories() {
  const { period, setPeriod, a, category, error } = useCategoryData()
  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your categories: {error}</p>
  const year = a?.period.kind === 'year'
  const v = a ? verdictOf(a).spending.change : null

  return (
    <div className="pb-6">
      <NavyTop background={ORANGE_TOP}>
        <NavyPeriodBar period={period} onChange={setPeriod} />
        {a ? (
          <div className="flex items-center gap-4">
            <div className="min-w-0 flex-1">
              <BigAmount cents={a.totals.spent} label={a.current ? 'Spent so far' : `Spent in ${year ? a.period.key : periodLabel(a.period).split(' ')[0]}`} />
              {v !== null && Math.abs(v) >= 0.03 && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <NavyPill>
                    {v < 0 ? '▼' : '▲'} {Math.round(Math.abs(v) * 100)}% vs {year ? prevLabel(a.period) : 'usual'}
                  </NavyPill>
                </div>
              )}
            </div>
            {a.categories.length > 0 && (
              <Donut parts={a.categories.map((c) => c.cents)}>
                <span>
                  <b className="block font-display text-xl leading-none">{a.categories.length}</b>
                  <span className="text-[11px] text-white/80">{a.categories.length === 1 ? 'category' : 'categories'}</span>
                </span>
              </Donut>
            )}
          </div>
        ) : (
          <div className="h-[108px]" />
        )}
      </NavyTop>
      {a &&
        (a.categories.length === 0 ? (
          <Overlap>
            <p className={`${card} px-5 py-8 text-center text-muted`}>No spending in {periodLabel(period)}.</p>
          </Overlap>
        ) : (
          <CategoryList a={a} category={category} />
        ))}
    </div>
  )
}

function CategoryList({ a, category }) {
  const total = a.totals.spent || 1
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
      <Overlap>
        <div className={card}>
          <b className="font-display text-[17px]">Biggest moves</b>
          {rise || fall ? (
            <div className={`mt-2.5 grid gap-2.5 ${rise && fall ? 'grid-cols-2' : ''}`}>
              {[rise, fall].map((m, i) =>
                m ? (
                  <button
                    key={idFor(m.id)}
                    onClick={() => navigate(`/analytics/categories/${idFor(m.id)}`)}
                    className="relative overflow-hidden rounded-[18px] bg-paper p-3 text-left"
                  >
                    <span
                      className="pointer-events-none absolute -top-5 -right-5 size-14 rounded-full"
                      style={{ background: `${i ? '#0f8a5f' : '#e8590c'}1f` }}
                    />
                    <span className="relative block text-[11px] font-extrabold tracking-[0.06em] text-muted uppercase">
                      {i ? 'Biggest fall' : 'Biggest rise'}
                    </span>
                    <span className="relative mt-1.5 flex items-center gap-1.5">
                      <span className="text-lg">{category(m.id)?.icon ?? '❔'}</span>
                      <b className="truncate text-[14px]">{category(m.id)?.name ?? 'No category'}</b>
                    </span>
                    <b className={`tabular relative block font-display text-xl ${i ? 'text-gain' : 'text-orange-text'}`}>
                      {i ? '−' : '+'}
                      {whole(Math.abs(m.diff))}
                    </b>
                    <span className="relative block text-[11.5px] text-muted">vs {year ? prevLabel(a.period) : 'usual'} by now</span>
                  </button>
                ) : null,
              )}
            </div>
          ) : (
            <p className="mt-1.5 text-[13.5px] text-muted">Every category is close to its usual.</p>
          )}
        </div>
      </Overlap>

      <Section n={1} title="All categories" right={year ? `vs ${prevLabel(a.period)}` : 'vs usual'}>
        <div className="grid grid-cols-2 gap-2.5">
          {rows.map((c) => {
            const cat = category(c.id)
            const color = colorOf(c.id)
            const spark = c.months.slice(-6).filter((m) => !m.future)
            return (
              <button
                key={idFor(c.id)}
                onClick={() => navigate(`/analytics/categories/${idFor(c.id)}`)}
                className={`${card} relative overflow-hidden p-3.5 text-left`}
              >
                <span className="pointer-events-none absolute -top-6 -right-6 size-[70px] rounded-full" style={{ background: `${color}1f` }} />
                <span className="relative flex items-start justify-between gap-1">
                  <span className="grid size-10 place-items-center rounded-[13px] text-lg" style={{ background: `${color}29` }}>
                    {cat?.icon ?? '❔'}
                  </span>
                  <ChangePill now={c.cents} usual={c.usual} small />
                </span>
                <b className="relative mt-2.5 block truncate text-[14.5px]">{cat?.name ?? 'No category'}</b>
                <span className="relative block">
                  <b className="tabular font-display text-[19px]">{whole(c.cents)}</b>
                  <span className="text-xs text-muted"> · {pct(c.cents / total)}</span>
                </span>
                <span className="relative mt-1.5 block">
                  <Sparkline values={spark.map((m) => m.cents)} color={color} wide />
                </span>
              </button>
            )
          })}
        </div>
        <p className="mt-2.5 px-1 text-xs text-muted">
          Compared with {year ? `${prevLabel(a.period)}` : 'your usual month'}
          {a.current ? ' up to the same day' : ''} · lines show the last 6 months
        </p>
      </Section>
    </>
  )
}

function Sparkline({ values, color, wide = false }) {
  const W = wide ? 130 : 52
  if (values.length < 2) return <span className="block h-6" />
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 4) + 2, 21 - (v / max) * 17])
  return (
    <svg viewBox={`0 0 ${W} 24`} className={`${wide ? 'block h-6 w-full' : 'shrink-0'} overflow-visible`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

// ---------- Analytics → Categories → one category (owner chose "C1 · Ring") ----------
export function CategoryDetail({ id }) {
  const { period, setPeriod, a, category, error } = useCategoryData()
  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load this category: {error}</p>
  const catId = id === 'none' ? null : id
  const cat = a ? category(catId) : null
  const color = cat?.color ?? GREY

  return (
    <div className="pb-6">
      <NavyTop background={topFor(color)}>
        <NavyPeriodBar period={period} onChange={setPeriod} />
        {a ? <CategoryTop a={a} catId={catId} /> : <div className="h-[108px]" />}
      </NavyTop>
      {a && <CategoryBody a={a} cat={cat} catId={catId} color={color} />}
    </div>
  )
}

// The coloured top: spent, against usual by now, and a ring of this month against a usual month (dot = how far
// through the month). Year: against last year by now, no ring.
function CategoryTop({ a, catId }) {
  const year = a.period.kind === 'year'
  const row = a.categories.find((c) => sameId(c.id, catId))
  const cents = row?.cents ?? 0
  const { usual } = monthsOf(a, catId)
  const byNow = usualByNow(a, row, usual)
  const change = byNow ? cents / byNow - 1 : null
  const label = year ? a.period.key : periodLabel(a.period).split(' ')[0]
  const ring = !year && usual > 0
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <BigAmount cents={cents} label={a.current ? 'Spent so far' : `Spent in ${label}`} />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {change !== null && Math.abs(change) >= 0.03 && (
            <NavyPill>
              {change > 0 ? '▲' : '▼'} {Math.round(Math.abs(change) * 100)}% vs {year ? prevLabel(a.period) : 'usual'}
              {a.current ? ' by now' : ''}
            </NavyPill>
          )}
          {year && byNow > 0 && (
            <NavyPill>
              {prevLabel(a.period)} by now {whole(byNow)}
            </NavyPill>
          )}
        </div>
      </div>
      {ring && (
        <Ring share={cents / usual} dot={a.current ? a.days.passed / a.days.total : null}>
          <span>
            <b className="block font-display text-xl leading-none">{pct(cents / usual)}</b>
            <span className="block text-[10px] leading-tight text-white/80">
              of a usual
              <br />
              month
            </span>
          </span>
        </Ring>
      )}
    </div>
  )
}

function CategoryBody({ a, cat, catId, color }) {
  const row = a.categories.find((c) => sameId(c.id, catId))
  const cents = row?.cents ?? 0
  const rank = a.categories.findIndex((c) => sameId(c.id, catId)) + 1
  const mine = a.expenses.filter((t) => sameId(t.category_id, catId))
  const { months, usual } = monthsOf(a, catId)
  const year = a.period.kind === 'year'
  const perDay = a.days.passed ? cents / a.days.passed : 0
  const facts = [
    ['Share', a.totals.spent ? pct(cents / a.totals.spent) : '—', rank > 0 ? `#${rank} category` : ''],
    ['Per visit', mine.length ? whole(cents / mine.length) : '—', count(mine.length, 'visit', 'visits')],
    year ? ['Per month', whole(perDay * 30.44), 'average'] : ['Per day', whole(perDay), 'average'],
  ]
  let n = 1
  return (
    <>
      <Overlap>
        <div className={`${card} grid grid-cols-3 px-1 py-3.5 text-center`}>
          {facts.map(([l, v, s], i) => (
            <div key={l} className={`min-w-0 px-2 ${i ? 'border-l border-line' : ''}`}>
              <span className="block text-xs text-muted">{l}</span>
              <b className="tabular block truncate font-display text-[17px]">{v}</b>
              <span className="block truncate text-[11px] text-muted">{s}</span>
            </div>
          ))}
          {!cat && <p className="col-span-3 mt-2 text-xs text-muted">Expenses without a category.</p>}
        </div>
      </Overlap>
      <Section n={n++} title="Last 12 months">
        <TwelveMonths a={a} months={months} usual={usual} color={color} />
      </Section>
      {mine.length > 0 ? (
        <>
          <Section n={n++} title="Where">
            <Where mine={mine} cat={cat} color={color} />
          </Section>
          <Section n={n++} title="When">
            <When a={a} mine={mine} cat={cat} color={color} />
          </Section>
          <Section n={n++} title="Biggest purchases">
            <Biggest mine={mine} cat={cat} color={color} />
          </Section>
        </>
      ) : (
        <p className={`${card} mx-4 mt-4 text-center text-muted`}>Nothing in {periodLabel(a.period)}.</p>
      )}
    </>
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
    <section className={card}>
      <div className="flex items-baseline justify-end gap-2">
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
                <rect
                  x={x}
                  y={y(m.cents)}
                  width={bw}
                  height={Math.max(2, H - y(m.cents))}
                  rx="5"
                  fill={color}
                  opacity={picked === i || (picked === null && m.partial) ? 1 : 0.45}
                />
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
    <section className={`${card} py-2`}>
      <ul>
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
    <section className={card}>
      <div className="flex h-[66px] items-end gap-2">
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
    <section className={`${card} py-2`}>
      <ul>
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
