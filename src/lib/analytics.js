// Numbers for the Analytics page. Everything is calculated from accounts, transactions and recurring
// payments; nothing is stored. A period is a month ({ kind: 'month', key: '2026-10' }) or a year
// ({ kind: 'year', key: '2026' }).
import { fetchAccountsWithBalances } from './balances'
import { fetchAll } from './fetchAll'
import { todayISO } from './dates'
import { fetchRecurring, monthlyCents } from './recurring'
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
// The last answer for each period (shown at once next time, while a fresh one loads)
const lastAnalytics = new Map()
const periodId = (p) => `${p.kind}:${p.key}`
export function cachedAnalytics(p) {
  const a = lastAnalytics.get(periodId(p))
  return a ? { ...a, period: p } : null
}

export async function fetchAnalytics(p) {
  const prev = shiftPeriod(p, -1)
  const endMonth = p.kind === 'year' ? `${p.key}-12` : p.key
  const prevStart = prev.kind === 'year' ? `${prev.key}-01` : prev.key
  const twelveBack = shiftMonth(endMonth, -12) // the 12 months shown + the same month last year
  const from = prevStart < twelveBack ? prevStart : twelveBack

  const [accounts, recurring, tx] = await Promise.all([
    fetchAccountsWithBalances(),
    fetchRecurring().catch(() => []),
    // In pages of 1.000, so a long history is never cut short
    fetchAll(() =>
      supabase
        .from('transactions')
        .select('type, amount_cents, date, account_id, to_account_id, category_id, note, goal_id')
        .gte('date', `${from}-01`),
    ),
  ])
  const a = buildAnalytics(p, accounts, recurring, tx)
  lastAnalytics.set(periodId(p), a)
  return a
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

  // Per month: income, spending, money into savings and into investments (net), and net worth change.
  // investNet = Invest − Take out transactions only (that money leaves your accounts for getquin)
  const blank = () => ({ income: 0, spent: 0, saved: 0, invested: 0, investNet: 0 })
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
  // The same month last year, up to the same day while this month is running (Better or worse)
  const lyKey = p.kind === 'month' ? shiftMonth(p.key, -12) : null
  const lyCutoff = lyKey && isCurrentPeriod(p) ? `${lyKey}-${todayISO().slice(8, 10)}` : null
  const lastYear = { income: 0, spent: 0, kept: 0, any: false }
  // Expenses named like a recurring payment, by name: [{ date, cents }] (to spot price changes)
  const fixedHistory = new Map()
  let prevSpentSoFar = 0
  const catPrevSoFar = new Map()

  const flowByAccount = new Map() // savings account id → net money in during this period
  const flowByGoal = new Map() // savings goal id ('general' = General savings) → net money in during this period
  let currentTx = null // the transaction being counted (for its goal)
  const moveInto = (m, accountId, cents, k) => {
    if (typeOf.get(accountId) !== 'savings') return
    m.saved += cents
    if (months.includes(k)) {
      flowByAccount.set(accountId, (flowByAccount.get(accountId) ?? 0) + cents)
      const goal = currentTx?.goal_id ?? 'general'
      flowByGoal.set(goal, (flowByGoal.get(goal) ?? 0) + cents)
    }
  }

  for (const t of rows) {
    currentTx = t
    const k = t.date.slice(0, 7)
    const m = month(k)
    const keptBefore = m.saved + m.invested
    const inLastYear = k === lyKey && (!lyCutoff || t.date <= lyCutoff)
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
      if (t.note && fixedNames.has(t.note.trim().toLowerCase())) {
        fixedBy.set(k, (fixedBy.get(k) ?? 0) + t.amount_cents)
        const name = t.note.trim().toLowerCase()
        if (!fixedHistory.has(name)) fixedHistory.set(name, [])
        fixedHistory.get(name).push({ date: t.date, cents: t.amount_cents })
      }
      if (k >= last12[0] && k <= endMonth) {
        const [y, mo, d] = t.date.split('-').map(Number)
        weekday[(new Date(y, mo - 1, d).getDay() + 6) % 7] += t.amount_cents
      }
    } else if (t.type === 'invest' || t.type === 'divest') {
      // Not spending or income: money between your accounts and your investments
      const cents = t.type === 'invest' ? t.amount_cents : -t.amount_cents
      m.invested += cents
      m.investNet += cents
      moveInto(m, t.account_id, -cents, k)
    } else {
      moveInto(m, t.account_id, -t.amount_cents, k)
      moveInto(m, t.to_account_id, t.amount_cents, k)
    }
    if (inLastYear) {
      lastYear.any = true
      if (t.type === 'income') lastYear.income += t.amount_cents
      if (t.type === 'expense') lastYear.spent += t.amount_cents
      lastYear.kept += m.saved + m.invested - keptBefore
    }
  }

  const sum = (keys, field) => keys.reduce((s, k) => s + (byMonth.get(k)?.[field] ?? 0), 0)
  const totals = (keys) => ({ income: sum(keys, 'income'), spent: sum(keys, 'spent'), saved: sum(keys, 'saved'), invested: sum(keys, 'invested') })
  const cur = totals(months)
  const before = totals(prevMonths)

  // Net worth: today's total, then backwards: at the end of month M it was today's total minus all
  // income and spending after M (transfers move money between your own accounts, so they don't count;
  // money invested left the accounts, so it's added back).
  const nowTotal = accounts.reduce((s, a) => s + a.balance_cents, 0)
  const afterMonth = (k) => {
    let change = 0
    for (const [key, m] of byMonth) if (key > k) change += m.income - m.spent - m.investNet
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

  // Saving: what you kept out of your income = net money into savings accounts + money invested
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
    // Spending on recurring payments per month, and what the active ones cost per month today
    fixedBy,
    fixedHistory,
    lastYear: lyKey && lastYear.any ? { ...lastYear, key: lyKey } : null,
    recurringMonthly: recurring.filter((r) => r.active && r.type !== 'income').reduce((s, r) => s + monthlyCents(r), 0),
    recurring,
    // Savings accounts (today's balance) with the net money in during this period
    keepAccounts: accounts
      .filter((a) => a.type === 'savings')
      .map((a) => ({ id: a.id, name: a.name, type: a.type, color: a.color, archived: a.archived, balance: a.balance_cents, flow: flowByAccount.get(a.id) ?? 0 }))
      .filter((a) => !a.archived || a.flow !== 0 || a.balance !== 0),
    flowByGoal,
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

// ---------- The Analytics overview ----------

// "October so far" / "2026 so far": this period against your usual. Month: your usual month (average of full
// months with any activity), scaled to the days passed while the month is running. Year: the year before up to
// the same day. Changes: spending and income as a share, kept as percentage points of income.
export function verdictOf(a) {
  const year = a.period.kind === 'year'
  const share = a.current ? a.days.passed / a.days.total : 1
  const spendUsual = year ? a.compare.spent || null : a.avgOut !== null ? Math.round(a.avgOut * share) : null
  const incomeUsual = year ? Math.round(a.previous.income * share) || null : a.avgIn !== null ? Math.round(a.avgIn) : null
  const change = (now, usual) => (usual ? now / usual - 1 : null)
  const spending = { now: a.totals.spent, usual: spendUsual, change: change(a.totals.spent, spendUsual) }
  const income = { now: a.totals.income, usual: incomeUsual, change: change(a.totals.income, incomeUsual) }
  const kept = {
    rate: a.saving.rate,
    usual: a.saving.avgRate,
    change: a.saving.rate !== null && a.saving.avgRate !== null ? a.saving.rate - a.saving.avgRate : null,
  }

  const unit = year ? 'year' : 'month'
  const less = spending.change !== null && spending.change <= -0.03
  const more = spending.change !== null && spending.change >= 0.03
  const keptMore = kept.change !== null && kept.change >= 0.02
  const keptLess = kept.change !== null && kept.change <= -0.02
  let sentence
  if (!a.totals.spent && !a.totals.income) sentence = 'Nothing recorded yet.'
  else if (less && keptMore) sentence = `A good ${unit}: you spent less and kept more than usual.`
  else if (less) sentence = `A lighter ${unit}: you spent less than usual.`
  else if (more && keptLess) sentence = `A pricier ${unit}: you spent more and kept less than usual.`
  else if (more) sentence = `A pricier ${unit}: you spent more than usual.`
  else if (keptMore) sentence = `You kept more than usual this ${unit}.`
  else sentence = `A usual ${unit} so far.`
  return { spending, income, kept, sentence }
}

const dayMonth = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
}
const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + n)
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

// "Worth noticing": things that stand out this period, most useful first (at most 5).
// Each: { key, icon, tone ('up' | 'down' | 'new' | 'week' | 'invest' | 'big'), title, sub, to? (address to open) }
export function noticings(a, category, euros) {
  const out = []
  const year = a.period.kind === 'year'
  const share = a.current ? a.days.passed / a.days.total : 1
  const name = (id) => category(id)?.name ?? 'No category'

  // Categories well above (or below) their usual: month = your usual month; year = the year before by now
  const usualOf = (id) => {
    const months = a.activeMonths.filter((k) => k !== a.period.key)
    if (!months.length) return null
    const total = months.reduce((s, k) => s + (a.catBy.get(`${k}|${id}`) ?? 0), 0)
    return Math.round((total / months.length) * share)
  }
  const moves = a.categories
    .map((c) => ({ ...c, usual: year ? c.prev : usualOf(c.id) }))
    .filter((c) => c.usual > 0)
    .map((c) => ({ ...c, diff: c.cents - c.usual, rise: c.cents / c.usual - 1 }))
  const versus = (usual) => (year ? `${euros(usual)} in ${prevLabel(a.period)} by now` : `usually ${euros(usual)}`)
  const up = moves.filter((c) => c.rise >= 0.3 && c.diff >= 2000).sort((x, y) => y.diff - x.diff)[0]
  if (up) {
    const how = up.rise >= 2 ? `${Math.round(up.cents / up.usual)}× your usual` : `${Math.round(up.rise * 100)}% above your usual`
    out.push({
      key: 'up',
      icon: 'tag',
      tone: 'up',
      title: `${name(up.id)} is ${how} ${year ? 'year' : 'month'}`,
      sub: `${euros(up.cents)} vs ${versus(up.usual)}`,
      to: `/analytics/categories/${up.id ?? 'none'}`,
    })
  }

  // New recurring payments or income added during this period (at most 2)
  let added = 0
  for (const r of a.recurring ?? []) {
    const day = (r.created_at ?? '').slice(0, 10)
    if (!day || !r.active || added >= 2) continue
    if (year ? day.slice(0, 4) !== a.period.key : day.slice(0, 7) !== a.period.key) continue
    const per = { weekly: 'a week', monthly: 'a month', yearly: 'a year' }[r.frequency] ?? 'a month'
    out.push({ key: `rec-${r.id}`, icon: 'repeat', tone: 'new', title: `New recurring: ${r.name}`, sub: `${euros(r.amount_cents)} ${per} since ${dayMonth(day)}`, to: '/recurring' })
    added += 1
  }

  // The priciest week (Monday to Sunday) of the month, and what most of it went on
  if (!year && a.expenses.length) {
    const weeks = new Map()
    for (const t of a.expenses) {
      const [y, m, d] = t.date.split('-').map(Number)
      const monday = addDays(t.date, -((new Date(y, m - 1, d).getDay() + 6) % 7))
      const w = weeks.get(monday) ?? { start: monday, cents: 0, cats: new Map() }
      w.cents += t.amount_cents
      w.cats.set(t.category_id, (w.cats.get(t.category_id) ?? 0) + t.amount_cents)
      weeks.set(monday, w)
    }
    if (weeks.size >= 2) {
      const top = [...weeks.values()].sort((x, y) => y.cents - x.cents)[0]
      const mainCat = [...top.cats].sort((x, y) => y[1] - x[1])[0]?.[0]
      out.push({
        key: 'week',
        icon: 'calendar',
        tone: 'week',
        title: `Your priciest week: ${dayMonth(top.start).split(' ')[0]}–${dayMonth(addDays(top.start, 6))}`,
        sub: `${euros(top.cents)} spent, mostly ${name(mainCat)}`,
      })
    }
  }

  // Investing several months in a row (Invest transactions)
  const endMonth = year ? `${a.period.key}-12` : a.period.key
  let k = endMonth > todayISO().slice(0, 7) ? todayISO().slice(0, 7) : endMonth
  if (!((a.byMonth.get(k)?.invested ?? 0) > 0)) k = shiftMonth(k, -1)
  let streak = 0
  let streakCents = 0
  while ((a.byMonth.get(k)?.invested ?? 0) > 0) {
    streak += 1
    streakCents += a.byMonth.get(k).invested
    k = shiftMonth(k, -1)
  }
  if (streak >= 2) {
    out.push({
      key: 'invest',
      icon: 'invest',
      tone: 'invest',
      title: `You invested ${streak} months in a row`,
      sub: `${euros(streakCents)} put in since ${monthShort(shiftMonth(k, 1))}`,
      to: '/investments',
    })
  }

  // A category well below its usual (good news)
  const down = moves.filter((c) => c.rise <= -0.3 && -c.diff >= 2000 && c.usual >= 5000).sort((x, y) => x.diff - y.diff)[0]
  if (down) {
    out.push({
      key: 'down',
      icon: 'tag',
      tone: 'down',
      title: `${name(down.id)} is ${Math.round(-down.rise * 100)}% below your usual`,
      sub: `${euros(down.cents)} vs ${versus(down.usual)}`,
      to: `/analytics/categories/${down.id ?? 'none'}`,
    })
  }

  // When there's little else: the biggest purchase
  if (out.length < 2 && a.expenses.length) {
    const big = [...a.expenses].sort((x, y) => y.amount_cents - x.amount_cents)[0]
    out.push({ key: 'big', icon: 'card', tone: 'big', title: `Biggest purchase: ${big.note?.trim() || name(big.category_id)}`, sub: `${euros(big.amount_cents)} on ${dayMonth(big.date)}` })
  }
  return out.slice(0, 5)
}
