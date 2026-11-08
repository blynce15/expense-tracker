// Net worth for Analytics (overview and Over time): accounts + savings + investments (getquin portfolio and
// cash at the brokers) + the pension fund. Accounts and savings come from buildAnalytics (worked out backwards
// from today's balances); investments and pension are added here.
import { cashOn, cashTotal } from './cash'
import { todayISO } from './dates'
import { pensionValueOn } from './pension'
import { shiftMonth } from './analytics'

// Back in time the portfolio is its real value at the end of each month (getquin's value history). If getquin
// can't give the history: today's value minus what was put in after that month (getquin's trades before
// getquinSince, your Invest transactions after).
// Cash at the brokers counts with the investments (only when getquin is linked): back in time, what you had
// entered by the end of each month (dollars at today's rate).
// The pension fund counts too: back in time, its last monthly entry by the end of each month.
// `invest` = { portfolio, since, cash, rate } ({} when getquin isn't linked); `pension` = its entries.
export function netWorthOf(a, invest = {}, pension = []) {
  const cash = invest.portfolio ? (invest.cash ?? []) : []
  const put = new Map()
  const add = (k, cents) => put.set(k, (put.get(k) ?? 0) + cents)
  const p = invest.portfolio
  if (p && invest.since) {
    if (p.days) for (const d of p.days) d.date < invest.since && add(d.date.slice(0, 7), d.cents)
    else if (p.months) for (const m of p.months) m.key < invest.since.slice(0, 7) && add(m.key, m.cents)
  }
  for (const [k, m] of a.byMonth) if (m.investNet) add(k, m.investNet)
  const history = p?.history?.length ? p.history : null
  const thisMonth = todayISO().slice(0, 7)
  const positions = p?.value_cents ?? 0
  const positionsAt = (k) => {
    if (!positions) return 0
    if (history) {
      if (k >= thisMonth) return positions
      // The value at the end of month k (the last one known up to then; before the first one, nothing)
      let found = 0
      for (const h of history) if (h.date.slice(0, 7) <= k) found = h.cents
      return found
    }
    let after = 0
    for (const [key, cents] of put) if (key > k) after += cents
    return Math.max(0, positions - after)
  }
  const cashAt = (k) => (k >= thisMonth ? cashTotal(cash, invest.rate) : cashOn(cash, `${k}-31`, invest.rate))
  const pensionAt = (k) => pensionValueOn(pension, k >= thisMonth ? todayISO() : `${k}-31`)
  const partsAt = (k, accountsCents, savingsCents) => ({
    accounts: accountsCents - savingsCents,
    savings: savingsCents,
    investments: positionsAt(k) + cashAt(k),
    pension: pensionAt(k),
  })
  const total = (x) => x.accounts + x.savings + x.investments + x.pension

  const line = a.worth.line.map((pt) => {
    const parts = partsAt(pt.key, pt.cents, pt.savings ?? 0)
    return { key: pt.key, cents: total(parts), parts }
  })
  const endKey = a.period.kind === 'year' ? `${a.period.key}-12` : a.period.key
  const prevKey = a.period.kind === 'year' ? `${Number(a.period.key) - 1}-12` : shiftMonth(a.period.key, -1)
  const extras = (k) => positionsAt(k) + cashAt(k) + pensionAt(k)
  const end = a.worth.end + extras(endKey)
  const before = a.worth.end - a.worth.change + extras(prevKey)
  const now = partsAt(thisMonth, a.worth.now, a.worth.savings)
  return {
    end,
    change: end - before,
    line,
    // Today's parts (accounts = bank, cash and meal card accounts)
    parts: now,
    // Change over the line (first point → last), in total and per part
    lineChange: line.length > 1 ? line.at(-1).cents - line[0].cents : 0,
    partChange: line.length > 1 ? Object.fromEntries(Object.keys(now).map((k) => [k, line.at(-1).parts[k] - line[0].parts[k]])) : null,
    hasInvestments: now.investments + now.pension > 0,
  }
}
