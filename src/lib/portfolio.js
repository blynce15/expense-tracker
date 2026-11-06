import { todayISO } from './dates'

// Calculations for Investments → Portfolio, from api/getquin.js's answer (all amounts in cents, euros).
// Kept free of React and the database so they can be tested (tests/portfolio.test.js).

// Chart buttons → getquin periods
export const PERIODS = [
  { key: '1D', series: 'intraday', label: 'today' },
  { key: '1M', series: 'month', label: 'this month' },
  { key: 'YTD', series: 'ytd', label: 'this year' },
  { key: '1Y', series: 'year', label: 'in 1 year' },
  { key: 'ALL', series: 'all', label: 'all time' },
]

// "2026-11-06": a point's day where the owner lives
export const lisbonDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })

// The points to draw for a period, ending at today's value (getquin's last point can be a little older)
export function seriesFor(portfolio, key) {
  const period = PERIODS.find((p) => p.key === key)
  const points = portfolio?.series?.[period?.series]
  if (!points?.length) return null
  if (key === '1D') return points
  return [...points, [portfolio.updated_at ?? new Date().toISOString(), portfolio.value_cents]]
}

// Gain over a period = value now − value at its start − money put in during it (buys − sales).
// ALL = getquin's own gain (value − what the positions cost). Rate = gain ÷ (start value + money put in).
export function periodChange(portfolio, key, today = todayISO()) {
  if (!portfolio) return null
  if (key === 'ALL') {
    const cents = portfolio.value_cents - portfolio.invested_cents
    return { cents, rate: portfolio.invested_cents ? cents / portfolio.invested_cents : 0 }
  }
  const points = seriesFor(portfolio, key)
  if (!points) return null
  const start = points[0][1]
  const from = lisbonDay(points[0][0])
  const put = (portfolio.days ?? []).filter((d) => (key === '1D' ? d.date === today : d.date > from && d.date <= today)).reduce((s, d) => s + d.cents, 0)
  const cents = portfolio.value_cents - start - put
  const base = start + Math.max(0, put)
  return { cents, rate: base > 0 ? cents / base : 0 }
}

// Today's move: the total, and the 3 best and 3 worst positions by % (a position can be in both lists only
// when there are fewer than 6)
export function todayMoves(positions = []) {
  const cents = positions.reduce((s, p) => s + (p.day_cents ?? 0), 0)
  const before = positions.reduce((s, p) => s + p.value_cents - (p.day_cents ?? 0), 0)
  const sorted = [...positions].sort((a, b) => (b.day_rate ?? 0) - (a.day_rate ?? 0))
  return { cents, rate: before > 0 ? cents / before : 0, best: sorted.slice(0, 3), worst: sorted.slice(-3).reverse() }
}

// Allocation by kind of investment, biggest first; cash at the brokers is its own slice
export const KIND_LABELS = { etf: 'ETFs', stock: 'Stocks', crypto: 'Crypto', bond: 'Bonds', fund: 'Funds', other: 'Other', cash: 'Cash' }
export function allocation(positions = [], cashCents = 0) {
  const groups = new Map()
  for (const p of positions) {
    const kind = KIND_LABELS[p.kind] && p.kind !== 'cash' ? p.kind : 'other'
    if (!groups.has(kind)) groups.set(kind, { kind, label: KIND_LABELS[kind], cents: 0, positions: [] })
    const g = groups.get(kind)
    g.cents += p.value_cents
    g.positions.push(p)
  }
  const list = [...groups.values()].sort((a, b) => b.cents - a.cents)
  if (cashCents > 0) list.push({ kind: 'cash', label: 'Cash', cents: cashCents, positions: [] })
  const total = list.reduce((s, g) => s + g.cents, 0)
  return list.map((g) => ({ ...g, share: total > 0 ? g.cents / total : 0, positions: g.positions.sort((a, b) => b.value_cents - a.value_cents) }))
}

// "2026-10" style month keys
export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// Money put into investments per month, the last `count` months (oldest first):
// getquin's trades before `since` (the day getquin was first connected), your Invest − Take out transactions
// from that day on, plus money put into the pension fund (each entry's put_in, except the starting one, which
// is everything before LynxOS). fromGetquin: the whole month's portfolio money came from getquin.
export function putInMonths({ portfolio, since, own = [], pension = [], count = 12, today = todayISO() }) {
  const thisMonth = today.slice(0, 7)
  const sinceMonth = since ? since.slice(0, 7) : null
  const portfolioIn = new Map()
  const pensionIn = new Map()
  const add = (map, key, cents) => map.set(key, (map.get(key) ?? 0) + cents)
  if (since) {
    if (portfolio?.days) {
      for (const d of portfolio.days) if (d.date < since) add(portfolioIn, d.date.slice(0, 7), d.cents)
    } else if (portfolio?.months) {
      // An older answer without days: whole months before the one getquin was connected in
      for (const m of portfolio.months) if (m.key < sinceMonth) add(portfolioIn, m.key, m.cents)
    }
    for (const t of own) if (t.date >= since) add(portfolioIn, t.date.slice(0, 7), t.type === 'invest' ? t.amount_cents : -t.amount_cents)
  }
  const sorted = [...pension].sort((a, b) => (a.date < b.date ? -1 : 1))
  for (const e of sorted.slice(1)) add(pensionIn, e.date.slice(0, 7), e.put_in_cents)
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonth(thisMonth, i - (count - 1))
    const p = portfolioIn.get(key) ?? 0
    const q = pensionIn.get(key) ?? 0
    return { key, portfolio: p, pension: q, cents: p + q, partial: key === thisMonth, fromGetquin: !!sinceMonth && key < sinceMonth }
  })
}
