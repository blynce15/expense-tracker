// Numbers for the Analytics page. Everything is calculated from accounts, transactions and recurring
// payments; nothing is stored. A period is a month ({ kind: 'month', key: '2026-10' }) or a year
// ({ kind: 'year', key: '2026' }).
import { fetchAccountsWithBalances } from './balances'
import { todayISO } from './dates'
import { fetchRecurring } from './recurring'
import { supabase } from './supabase'

// ---------- Months and periods ----------

export function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const daysInMonth = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)), 0).getDate()

// "Oct", "October 2026"
export const monthShort = (key) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')
const monthLong = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

export function currentPeriod(kind) {
  const month = todayISO().slice(0, 7)
  return kind === 'year' ? { kind, key: month.slice(0, 4) } : { kind, key: month }
}

export function shiftPeriod(p, delta) {
  return p.kind === 'year' ? { ...p, key: String(Number(p.key) + delta) } : { ...p, key: shiftMonth(p.key, delta) }
}

export const periodLabel = (p) => (p.kind === 'year' ? p.key : monthLong(p.key))
// For "vs Sep" / "vs 2025"
export const prevLabel = (p) => (p.kind === 'year' ? String(Number(p.key) - 1) : monthShort(shiftMonth(p.key, -1)))

export function isCurrentPeriod(p) {
  const month = todayISO().slice(0, 7)
  return p.kind === 'year' ? p.key === month.slice(0, 4) : p.key === month
}

// The months in a period, never past the current month
function periodMonths(p) {
  const now = todayISO().slice(0, 7)
  const all = p.kind === 'year' ? Array.from({ length: 12 }, (_, i) => `${p.key}-${String(i + 1).padStart(2, '0')}`) : [p.key]
  return all.filter((k) => k <= now)
}

// Days in the period, and how many of them have passed (all of them for a past period)
function periodDays(p) {
  const today = todayISO()
  if (p.kind === 'month') {
    const total = daysInMonth(p.key)
    return { total, passed: p.key === today.slice(0, 7) ? Number(today.slice(8)) : total }
  }
  const y = Number(p.key)
  const total = (new Date(y + 1, 0, 1) - new Date(y, 0, 1)) / 86400000
  if (p.key !== today.slice(0, 4)) return { total, passed: total }
  const [, m, d] = today.split('-').map(Number)
  return { total, passed: Math.round((new Date(y, m - 1, d) - new Date(y, 0, 1)) / 86400000) + 1 }
}

// ---------- Loading ----------

const BANK_TYPES = ['debit', 'cash', 'meal']

// Loads what the page needs for `p`: the period itself, the one before it (to compare), and the
// 12 months up to the period's end (trends, averages). Transactions after that are loaded too,
// because net worth in the past is worked out backwards from today's balances.
export async function fetchAnalytics(p) {
  const prev = shiftPeriod(p, -1)
  const endMonth = p.kind === 'year' ? `${p.key}-12` : p.key
  const prevStart = prev.kind === 'year' ? `${prev.key}-01` : prev.key
  const twelveBack = shiftMonth(endMonth, -11)
  const from = prevStart < twelveBack ? prevStart : twelveBack

  const [accounts, recurring, tx] = await Promise.all([
    fetchAccountsWithBalances(),
    fetchRecurring().catch(() => []),
    supabase
      .from('transactions')
      .select('type, amount_cents, date, account_id, to_account_id, category_id, note')
      .gte('date', `${from}-01`),
  ])
  if (tx.error) throw tx.error
  return buildAnalytics(p, accounts, recurring, tx.data)
}

// ---------- Calculations ----------

function buildAnalytics(p, accounts, recurring, rows) {
  const typeOf = new Map(accounts.map((a) => [a.id, a.type]))
  const now = todayISO().slice(0, 7)
  const prev = shiftPeriod(p, -1)
  const months = periodMonths(p)
  const prevMonths = periodMonths(prev)
  const endMonth = months.length ? months[months.length - 1] : p.kind === 'year' ? `${p.key}-12` : p.key
  const last12 = Array.from({ length: 12 }, (_, i) => shiftMonth(endMonth, i - 11))

  // Per month: income, spending, money into savings and into investments (net), and net worth change
  const blank = () => ({ income: 0, spent: 0, saved: 0, invested: 0 })
  const byMonth = new Map()
  const month = (k) => byMonth.get(k) ?? byMonth.set(k, blank()).get(k)
  const spentByDay = new Map() // date → cents
  const catBy = new Map() // `${monthKey}|${categoryId}` → cents
  const fixedNames = new Set(recurring.filter((r) => r.type !== 'income').map((r) => r.name.trim().toLowerCase()))
  const fixedBy = new Map() // monthKey → cents of expenses that are recurring payments
  const weekday = Array(7).fill(0) // Mon..Sun, spending over the 12 months
  // While a period is still running, compare with the one before only up to the same day
  // (e.g. 1–12 Oct with 1–12 Sep), else a part month always looks cheaper than a full one
  const cutoff = isCurrentPeriod(p) ? sameDayBefore(p) : null
  let prevSpentSoFar = 0
  const catPrevSoFar = new Map()

  const flowByAccount = new Map() // savings/investment account id → net money in during this period
  const moveInto = (m, accountId, cents, k) => {
    const t = typeOf.get(accountId)
    if (t === 'savings') m.saved += cents
    else if (t === 'investment') m.invested += cents
    else return
    if (months.includes(k)) flowByAccount.set(accountId, (flowByAccount.get(accountId) ?? 0) + cents)
  }

  for (const t of rows) {
    const k = t.date.slice(0, 7)
    const m = month(k)
    if (t.type === 'income') {
      m.income += t.amount_cents
      moveInto(m, t.account_id, t.amount_cents, k)
    } else if (t.type === 'expense') {
      m.spent += t.amount_cents
      moveInto(m, t.account_id, -t.amount_cents, k)
      spentByDay.set(t.date, (spentByDay.get(t.date) ?? 0) + t.amount_cents)
      catBy.set(`${k}|${t.category_id}`, (catBy.get(`${k}|${t.category_id}`) ?? 0) + t.amount_cents)
      if (prevMonths.includes(k) && (!cutoff || t.date <= cutoff)) {
        prevSpentSoFar += t.amount_cents
        catPrevSoFar.set(String(t.category_id), (catPrevSoFar.get(String(t.category_id)) ?? 0) + t.amount_cents)
      }
      if (t.note && fixedNames.has(t.note.trim().toLowerCase())) fixedBy.set(k, (fixedBy.get(k) ?? 0) + t.amount_cents)
      if (k >= last12[0] && k <= endMonth) {
        const [y, mo, d] = t.date.split('-').map(Number)
        weekday[(new Date(y, mo - 1, d).getDay() + 6) % 7] += t.amount_cents
      }
    } else {
      moveInto(m, t.account_id, -t.amount_cents, k)
      moveInto(m, t.to_account_id, t.amount_cents, k)
    }
  }

  const sum = (keys, field) => keys.reduce((s, k) => s + (byMonth.get(k)?.[field] ?? 0), 0)
  const totals = (keys) => ({ income: sum(keys, 'income'), spent: sum(keys, 'spent'), saved: sum(keys, 'saved'), invested: sum(keys, 'invested') })
  const cur = totals(months)
  const before = totals(prevMonths)

  // Net worth: today's total, then backwards: at the end of month M it was today's total minus all
  // income and spending after M (transfers move money between your own accounts, so they don't count).
  const nowTotal = accounts.reduce((s, a) => s + a.balance_cents, 0)
  const afterMonth = (k) => {
    let change = 0
    for (const [key, m] of byMonth) if (key > k) change += m.income - m.spent
    return nowTotal - change
  }
  const worthLine = last12.filter((k) => k <= now).map((k) => ({ key: k, cents: afterMonth(k) }))
  const worthEnd = afterMonth(endMonth)
  const worthBefore = afterMonth(p.kind === 'year' ? `${Number(p.key) - 1}-12` : shiftMonth(p.key, -1))
  const byType = (types) => accounts.filter((a) => types.includes(a.type)).reduce((s, a) => s + a.balance_cents, 0)

  // Spending pace: running total through this period next to the one before
  const days = periodDays(p)
  const pace =
    p.kind === 'month'
      ? {
          unit: 'day',
          length: daysInMonth(p.key),
          current: running(Array.from({ length: days.passed }, (_, i) => spentByDay.get(`${p.key}-${String(i + 1).padStart(2, '0')}`) ?? 0)),
          previous: running(
            Array.from({ length: daysInMonth(prev.key) }, (_, i) => spentByDay.get(`${prev.key}-${String(i + 1).padStart(2, '0')}`) ?? 0),
          ),
        }
      : {
          unit: 'month',
          length: 12,
          current: running(months.map((k) => byMonth.get(k)?.spent ?? 0)),
          previous: running(periodMonths(prev).map((k) => byMonth.get(k)?.spent ?? 0)),
        }
  const current = isCurrentPeriod(p)
  let biggestDay = null
  for (const [date, cents] of spentByDay) {
    if (months.includes(date.slice(0, 7)) && (!biggestDay || cents > biggestDay.cents)) biggestDay = { date, cents }
  }

  // Categories: this period vs the one before
  const catTotals = (keys) => {
    const out = new Map()
    for (const [key, cents] of catBy) {
      const [k, id] = key.split('|')
      if (keys.includes(k)) out.set(id, (out.get(id) ?? 0) + cents)
    }
    return out
  }
  const catNow = catTotals(months)
  const categories = [...catNow.entries()]
    .map(([id, cents]) => ({ id: id === 'null' ? null : id, cents, prev: catPrevSoFar.get(id) ?? 0 }))
    .sort((a, b) => b.cents - a.cents)

  // Saving: what you kept (saved + invested) out of your income
  const keptOf = (m) => m.saved + m.invested
  const fullMonths = last12.filter((k) => k < now || !current) // leave out a month still in progress
  const rateMonths = fullMonths.filter((k) => (byMonth.get(k)?.income ?? 0) > 0)
  const rateIncome = sum(rateMonths, 'income')
  const avgRate = rateIncome > 0 ? rateMonths.reduce((s, k) => s + keptOf(byMonth.get(k)), 0) / rateIncome : null
  const yearKeys = last12.filter((k) => k.slice(0, 4) === endMonth.slice(0, 4))
  let best = null
  for (const k of last12) {
    const m = byMonth.get(k)
    if (m && keptOf(m) > 0 && (!best || keptOf(m) > best.cents)) best = { key: k, cents: keptOf(m) }
  }

  // Trends: 12 months of money in and out; averages over full months that have any activity
  const trend = last12.map((k) => ({ key: k, income: byMonth.get(k)?.income ?? 0, spent: byMonth.get(k)?.spent ?? 0, partial: k === now, future: k > now }))
  const active = trend.filter((t) => !t.partial && !t.future && (t.income || t.spent))
  const avg = (f) => (active.length ? active.reduce((s, t) => s + t[f], 0) / active.length : null)

  // Weekday averages (per weekday that has passed in the 12 months)
  const weekdayCount = Array(7).fill(0)
  const first = new Date(Number(last12[0].slice(0, 4)), Number(last12[0].slice(5)) - 1, 1)
  const lastDay = new Date(Math.min(new Date(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5)), 0), new Date()))
  for (let d = new Date(first); d <= lastDay; d.setDate(d.getDate() + 1)) weekdayCount[(d.getDay() + 6) % 7] += 1
  const weekdayAvg = weekday.map((c, i) => (weekdayCount[i] ? c / weekdayCount[i] : 0))

  const expenses = rows.filter((t) => t.type === 'expense' && months.includes(t.date.slice(0, 7)))

  return {
    period: p,
    current,
    days,
    // This period's expenses, for the details pages
    expenses,
    // Spending per category per month (`${monthKey}|${categoryId}` → cents), the 12 months up to
    // the period's end, and which of them are full months with any activity (for "usual month")
    catBy,
    last12,
    activeMonths: active.map((t) => t.key),
    // Savings and investment accounts (today's balance) with the net money in during this period
    keepAccounts: accounts
      .filter((a) => a.type === 'savings' || a.type === 'investment')
      .map((a) => ({ id: a.id, name: a.name, type: a.type, color: a.color, archived: a.archived, balance: a.balance_cents, flow: flowByAccount.get(a.id) ?? 0 }))
      .filter((a) => !a.archived || a.flow !== 0 || a.balance !== 0),
    fixedNames,
    spentByDay,
    byMonth,
    totals: cur,
    previous: before,
    // The period before, up to the same day while this one is still running (for comparisons)
    compare: { spent: prevSpentSoFar },
    worth: {
      now: nowTotal,
      end: worthEnd,
      change: worthEnd - worthBefore,
      line: worthLine,
      bank: byType(BANK_TYPES),
      savings: byType(['savings']),
      investments: byType(['investment']),
      owed: byType(['credit']),
    },
    spending: {
      perDay: days.passed ? cur.spent / days.passed : 0,
      onTrack: current && days.passed ? Math.round((cur.spent / days.passed) * days.total) : null,
      fixed: months.reduce((s, k) => s + (fixedBy.get(k) ?? 0), 0),
      biggestDay,
      pace,
    },
    categories,
    saving: {
      kept: keptOf(cur),
      rate: cur.income > 0 ? keptOf(cur) / cur.income : null,
      avgRate,
      yearKept: yearKeys.reduce((s, k) => s + keptOf(byMonth.get(k) ?? blank()), 0),
      year: endMonth.slice(0, 4),
      best,
    },
    trend,
    avgIn: avg('income'),
    avgOut: avg('spent'),
    weekdayAvg,
  }
}

// Today's date one period earlier, e.g. 2026-10-12 → 2026-09-12 (month) or 2025-10-12 (year);
// the 31st becomes the last day of a shorter month
function sameDayBefore(p) {
  const [y, m, d] = todayISO().split('-').map(Number)
  const ty = p.kind === 'year' ? y - 1 : m === 1 ? y - 1 : y
  const tm = p.kind === 'year' ? m : m === 1 ? 12 : m - 1
  const day = Math.min(d, new Date(ty, tm, 0).getDate())
  return `${ty}-${String(tm).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// Expenses grouped by their name (shop, place), biggest first: { name, cents, count, categoryId }
export function placesFrom(expenses, limit = 5) {
  const groups = new Map()
  for (const t of expenses) {
    const k = (t.note ?? '').trim().toLowerCase()
    if (!k) continue
    const g = groups.get(k) ?? { name: t.note.trim(), cents: 0, count: 0, categoryId: t.category_id }
    g.cents += t.amount_cents
    g.count += 1
    groups.set(k, g)
  }
  return [...groups.values()].sort((x, y) => y.cents - x.cents).slice(0, limit)
}

function running(values) {
  let total = 0
  return values.map((v) => (total += v))
}

const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']

// Short facts in plain words, most useful first. `name(id)` gives a category's name.
export function highlights(a, name, euros) {
  const out = []
  const vs = a.period.kind === 'year' ? `in ${prevLabel(a.period)}` : `in ${monthLong(shiftMonth(a.period.key, -1)).split(' ')[0]}`
  const diff = a.totals.spent - a.compare.spent
  if (a.compare.spent > 0 && Math.abs(diff) >= 100) {
    const when = a.current ? ` than by this time ${vs}` : ` than ${vs}`
    out.push({ key: 'spent', good: diff < 0, icon: diff < 0 ? 'arrowDown' : 'arrowUp', text: [`You've spent `, `${euros(Math.abs(diff))} ${diff < 0 ? 'less' : 'more'}`, `${when}.`] })
  }
  const changes = a.categories.filter((c) => c.prev > 0 && c.cents - c.prev >= 1000)
  if (changes.length) {
    const top = changes.sort((x, y) => (y.cents - y.prev) / y.prev - (x.cents - x.prev) / x.prev)[0]
    const rise = (top.cents - top.prev) / top.prev
    const by = rise >= 2 ? `${Math.round(top.cents / top.prev)}× higher` : `up ${Math.round(rise * 100)}%`
    out.push({ key: 'cat', good: false, icon: 'tag', text: ['', name(top.id), ` is ${by}, your biggest rise.`] })
  }
  const maxDay = a.weekdayAvg.reduce((best, v, i) => (v > a.weekdayAvg[best] ? i : best), 0)
  if (a.weekdayAvg[maxDay] > 0) {
    out.push({ key: 'day', good: null, icon: 'calendar', text: ['', WEEKDAYS[maxDay], ` cost you most: ${euros(Math.round(a.weekdayAvg[maxDay]))} on average.`] })
  }
  if (a.saving.rate !== null && a.saving.avgRate !== null) {
    const r = Math.round(a.saving.rate * 100)
    const avg = Math.round(a.saving.avgRate * 100)
    const how = r > avg ? 'above' : r < avg ? 'below' : 'the same as'
    out.push({ key: 'kept', good: r >= avg, icon: 'invest', text: ['You kept ', `${r}%`, ` of your income, ${how} your ${avg}% average.`] })
  }
  return out
}
