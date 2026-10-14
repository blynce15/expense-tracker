import { useEffect, useState } from 'react'
import { Card, ChangeChip, Chip, ORANGE, pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import { fetchAnalytics, monthShort, periodLabel, placesFrom, prevLabel } from '../lib/analytics'
import { formatDayMonth } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { navigate } from '../lib/useRoute'

const GREY = '#94a3c4'
// Expenses without a category use "none" in the address
const idFor = (id) => id ?? 'none'
const sameId = (a, b) => idFor(a) === idFor(b)

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

// A category's spending in each of the 12 months, and its usual month (average over full
// months that had any activity, so months before you started using the app don't count)
function monthsOf(a, id) {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const months = a.last12.map((k) => ({ key: k, cents: a.catBy.get(`${k}|${id ?? null}`) ?? 0, partial: k === thisMonth, future: k > thisMonth }))
  const usual = a.activeMonths.length ? a.activeMonths.reduce((s, k) => s + (a.catBy.get(`${k}|${id ?? null}`) ?? 0), 0) / a.activeMonths.length : null
  return { months, usual }
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

// ---------- Analytics → Categories ----------
export default function AnalyticsCategories() {
  const { period, setPeriod, a, category, error } = useCategoryData()
  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your categories: {error}</p>

  return (
    <div className="space-y-3 px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && (a.categories.length === 0 ? <Empty period={period} /> : <CategoryList a={a} category={category} />)}
    </div>
  )
}

function Empty({ period }) {
  return <p className="rounded-[22px] bg-card px-5 py-8 text-center text-muted">No spending in {periodLabel(period)}.</p>
}

function CategoryList({ a, category }) {
  const total = a.totals.spent || 1
  const counts = new Map()
  for (const t of a.expenses) counts.set(idFor(t.category_id), (counts.get(idFor(t.category_id)) ?? 0) + 1)
  const top = a.categories[0]

  return (
    <>
      <section className="rounded-[22px] bg-card p-4">
        <div className="flex h-3.5 gap-0.5 overflow-hidden rounded-full">
          {a.categories.map((c) => (
            <span key={idFor(c.id)} style={{ flex: c.cents, background: category(c.id)?.color ?? GREY }} />
          ))}
        </div>
        <p className="mt-2.5 text-sm text-muted">
          <b className="tabular text-ink">{whole(a.totals.spent)}</b> across {count(a.categories.length, 'category', 'categories')} · biggest:{' '}
          <b className="text-ink">
            {category(top.id)?.name ?? 'No category'} {pct(top.cents / total)}
          </b>
        </p>
      </section>

      <ul className="overflow-hidden rounded-[22px] bg-card">
        {a.categories.map((c) => {
          const cat = category(c.id)
          const { months } = monthsOf(a, c.id)
          const spark = months.slice(-6).filter((m) => !m.future)
          return (
            <li key={idFor(c.id)} className="border-b border-line last:border-0">
              <button onClick={() => navigate(`/analytics/categories/${idFor(c.id)}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-paper">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `${cat?.color ?? GREY}22` }}>
                  {cat?.icon ?? '❔'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{cat?.name ?? 'No category'}</span>
                  <span className="block truncate text-xs text-muted">
                    {pct(c.cents / total)} · {count(counts.get(idFor(c.id)) ?? 0, 'time', 'times')}
                  </span>
                </span>
                <Sparkline values={spark.map((m) => m.cents)} color={cat?.color ?? GREY} />
                <span className="flex w-[74px] shrink-0 flex-col items-end gap-0.5">
                  <b className="tabular font-display">{whole(c.cents)}</b>
                  {c.prev ? <ChangeChip now={c.cents} before={c.prev} goodWhenDown suffix="" /> : <Chip tone="blue">new</Chip>}
                </span>
                <Icon name="chevronRight" size={16} className="-mr-1 shrink-0 text-muted" />
              </button>
            </li>
          )
        })}
      </ul>
      <p className="px-1 text-xs text-muted">
        Changes compare with {prevLabel(a.period)}
        {a.current ? ' up to the same day' : ''}. Tap a category for more.
      </p>
    </>
  )
}

function Sparkline({ values, color }) {
  if (values.length < 2) return <span className="w-14 shrink-0" />
  const max = Math.max(1, ...values)
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * 52 + 2).toFixed(1)},${(20 - (v / max) * 16).toFixed(1)}`).join(' ')
  return (
    <svg width="56" height="24" viewBox="0 0 56 24" className="shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ---------- Analytics → Categories → one category ----------
export function CategoryDetail({ id }) {
  const { period, setPeriod, a, category, error } = useCategoryData()
  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load this category: {error}</p>

  const catId = id === 'none' ? null : id
  return (
    <div className="space-y-3 px-4 pt-1 pb-6">
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
  const places = placesFrom(mine)
  const biggest = [...mine].sort((x, y) => y.amount_cents - x.amount_cents).slice(0, 5)
  const month = a.period.kind === 'month'

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Spent" value={whole(cents)}>
          {row?.prev ? <ChangeChip now={cents} before={row.prev} goodWhenDown suffix={`vs ${prevLabel(a.period)}`} /> : null}
        </Stat>
        <Stat label="Usual month" value={usual !== null ? whole(usual) : '—'}>
          <span className="text-xs text-muted">average of full months</span>
        </Stat>
        <Stat label="Share of spending" value={a.totals.spent ? pct(cents / a.totals.spent) : '—'}>
          {rank > 0 && <span className="text-xs text-muted">#{rank} category</span>}
        </Stat>
        <Stat label="Per visit" value={mine.length ? formatCents(Math.round(cents / mine.length)) : '—'}>
          <span className="text-xs text-muted">{count(mine.length, 'visit', 'visits')}</span>
        </Stat>
      </div>

      {month && usual !== null && usual > 0 && a.current && <UsualBar cents={cents} usual={usual} color={color} />}

      <TwelveMonths months={months} usual={usual} color={color} />

      {places.length > 0 && (
        <Card icon="tag" color={color} title="Where">
          <ul className="space-y-1">
            {places.map((g) => (
              <li key={g.name} className="flex items-center gap-3 py-1">
                <MerchantIcon name={g.name} className="size-10 rounded-xl text-lg" style={{ background: `${color}22` }}>
                  {cat?.icon ?? '🧾'}
                </MerchantIcon>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="truncate">{g.name}</b>
                    <b className="tabular shrink-0 font-display">{formatCents(g.cents)}</b>
                  </span>
                  <span className="mt-1 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line/70">
                      <span className="block h-full rounded-full" style={{ width: `${(g.cents / places[0].cents) * 100}%`, background: color }} />
                    </span>
                    <span className="shrink-0 text-xs text-muted">{count(g.count, 'time', 'times')}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {biggest.length > 0 && (
        <Card icon="arrowUp" color="var(--color-loss)" title="Biggest purchases">
          <ul>
            {biggest.map((t, i) => (
              <li key={i} className="flex items-center gap-3 border-b border-line py-2 last:border-0">
                <MerchantIcon name={t.note} className="size-10 rounded-xl text-lg" style={{ background: `${color}22` }}>
                  {cat?.icon ?? '🧾'}
                </MerchantIcon>
                <span className="min-w-0 flex-1">
                  <b className="block truncate">{t.note?.trim() || cat?.name || 'Expense'}</b>
                  <span className="block text-xs text-muted">{formatDayMonth(t.date)}</span>
                </span>
                <b className="tabular font-display">{formatCents(t.amount_cents)}</b>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {mine.length === 0 && <p className="rounded-[22px] bg-card px-5 py-6 text-center text-muted">Nothing in {periodLabel(a.period)}.</p>}
    </>
  )
}

function Stat({ label, value, children }) {
  return (
    <div className="min-w-0 rounded-[18px] bg-card px-3.5 py-3">
      <p className="truncate text-xs text-muted">{label}</p>
      <p className="tabular truncate font-display text-[22px] leading-tight font-bold">{value}</p>
      <div className="mt-1 min-h-5">{children}</div>
    </div>
  )
}

// This month so far against the usual month
function UsualBar({ cents, usual, color }) {
  const share = cents / usual
  return (
    <section className="rounded-[22px] bg-card p-4">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">So far this month</span>
        <span className="tabular">
          <b>{whole(cents)}</b> <span className="text-muted">of usual {whole(usual)}</span>
        </span>
      </div>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-line/70">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: share > 1 ? ORANGE : color }} />
      </div>
      {share > 1 && <p className="mt-1.5 text-xs text-orange-text">Already {whole(cents - usual)} above a usual month.</p>}
    </section>
  )
}

// Bars for the 12 months, with the usual month as a dashed line. Tap a bar to read it.
function TwelveMonths({ months, usual, color }) {
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 96
  const colW = W / 12
  const max = Math.max(1, ...months.map((m) => m.cents), usual ?? 0)
  const h = (c) => (c / max) * (H - 14)
  const p = picked === null ? null : months[picked]
  return (
    <Card icon="bars" color={color} title="Last 12 months">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Spending in this category each month">
        {months.map((m, i) => (
          <g key={m.key} onClick={() => !m.future && setPicked(i)} className="cursor-pointer">
            <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
            {m.cents > 0 && (
              <rect
                x={i * colW + 4}
                y={H - h(m.cents)}
                width={colW - 8}
                height={h(m.cents)}
                rx="5"
                fill={color}
                opacity={picked === i ? 1 : m.partial ? 0.45 : picked === null ? 0.85 : 0.4}
              />
            )}
            <text x={i * colW + colW / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className={picked === i ? 'fill-ink font-bold' : 'fill-muted'}>
              {monthShort(m.key)[0]}
            </text>
          </g>
        ))}
        {usual > 0 && <line x1="0" x2={W} y1={H - h(usual)} y2={H - h(usual)} stroke="var(--color-ink)" strokeOpacity=".45" strokeDasharray="4 3" />}
      </svg>
      <p className="mt-2 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' (so far)'}: <b className="tabular text-ink">{formatCents(p.cents)}</b>
          </>
        ) : usual !== null ? (
          <>
            Dashed line: usual month <b className="tabular text-ink">{whole(usual)}</b> · tap a bar
          </>
        ) : (
          'Tap a bar for details'
        )}
      </p>
    </Card>
  )
}
