// Monthly report: one summary of what happened in a calendar month (summarizeMonth), written as a short
// Markdown note for Obsidian (buildMonthlyReport) and as the monthly email (scripts/email-report.mjs).
// Built from the rows the monthly backup has just read (scripts/backup.mjs), so it never asks the database again.
// Same rules as the app: transfers and Invest / Take out are not spending or income; kept = net money into
// savings accounts + money invested (src/lib/analytics.js).
import { formatCents } from '../src/lib/money.js'

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TYPE_NAMES = { debit: 'Bank', cash: 'Cash', savings: 'Savings', meal: 'Meal card' }
const pad = (n) => String(n).padStart(2, '0')

// The database hands dates over as Date objects at local midnight, backup.json as ISO text: keep the local calendar day
export function isoDate(value) {
  const d = value instanceof Date ? value : String(value).includes('T') ? new Date(value) : null
  if (d) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return String(value).slice(0, 10)
}

// bigint columns arrive as text
const num = (value) => Number(value ?? 0)

export function normalize(tables) {
  const money = (rows, fields) => (rows ?? []).map((r) => ({ ...r, ...Object.fromEntries(fields.map((f) => [f, num(r[f])])) }))
  const dated = (rows) => rows.map((r) => ({ ...r, date: isoDate(r.date) }))
  return {
    transactions: dated(money(tables.transactions, ['amount_cents'])),
    accounts: money(tables.accounts, ['starting_balance_cents']),
    categories: tables.categories ?? [],
    recurring: money(tables.recurring_payments, ['amount_cents']),
    goals: money(tables.savings_goals, ['target_cents']),
    moves: dated(money(tables.goal_moves, ['amount_cents'])),
    pension: dated(money(tables.pension_entries, ['value_cents', 'put_in_cents', 'company_put_in_cents'])),
  }
}

export function shiftMonth(key, n) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + n, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

const daysInYM = (y, m) => new Date(y, m, 0).getDate() // m is 1-12
const daysIn = (key) => daysInYM(...key.split('-').map(Number))
const monthName = (key) => MONTHS[Number(key.slice(5, 7)) - 1]
export const monthTitle = (key) => `${monthName(key)} ${key.slice(0, 4)}`
export const reportFileName = (key) => `${key}.md` // "2026-10.md"

export const dayLabel = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return `${SHORT_DAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1].slice(0, 3)}`
}

// How a transaction moves each account: [[account id, cents], …]
function effect(t) {
  if (t.type === 'income' || t.type === 'divest') return [[t.account_id, t.amount_cents]]
  if (t.type === 'expense' || t.type === 'invest') return [[t.account_id, -t.amount_cents]]
  if (t.type === 'transfer') return [[t.account_id, -t.amount_cents], [t.to_account_id, t.amount_cents]]
  return []
}

// Income, spending, saved (net into savings accounts), invested (Invest − Take out), kept = saved + invested
export function monthStats(data, key) {
  const savings = new Set(data.accounts.filter((a) => a.type === 'savings').map((a) => a.id))
  const rows = data.transactions.filter((t) => t.date.slice(0, 7) === key)
  const s = { rows, income: 0, spent: 0, saved: 0, invested: 0 }
  for (const t of rows) {
    if (t.type === 'income') s.income += t.amount_cents
    if (t.type === 'expense') s.spent += t.amount_cents
    if (t.type === 'invest') s.invested += t.amount_cents
    if (t.type === 'divest') s.invested -= t.amount_cents
    for (const [id, c] of effect(t)) if (savings.has(id)) s.saved += c
  }
  s.kept = s.saved + s.invested
  s.rate = s.income > 0 ? s.kept / s.income : null
  return s
}

// The next due dates of a recurring entry between start and end (ISO), from its next_due and repeat
export function dueDatesBetween(r, start, end) {
  const anchor = Number(isoDate(r.start_date ?? r.next_due).slice(8, 10))
  const step = (iso) => {
    let [y, m, d] = iso.split('-').map(Number)
    if (r.frequency === 'weekly') {
      const n = new Date(y, m - 1, d + 7)
      return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`
    }
    if (r.frequency === 'yearly') y += 1
    else if (m === 12) [y, m] = [y + 1, 1]
    else m += 1
    return `${y}-${pad(m)}-${pad(Math.min(anchor, daysInYM(y, m)))}`
  }
  const out = []
  let d = isoDate(r.next_due)
  for (let i = 0; i < 600 && d <= end; i++) {
    if (d >= start) out.push(d)
    d = step(d)
  }
  return out
}

const perMonth = (r) => (r.frequency === 'weekly' ? Math.round((r.amount_cents * 52) / 12) : r.frequency === 'yearly' ? Math.round(r.amount_cents / 12) : r.amount_cents)

function verdict(cur, prev, hasPrev, before) {
  const keptLine = cur.rate !== null ? ` and kept ${pct(Math.max(cur.rate, 0))} of your income` : ''
  if (!hasPrev) return `You spent ${formatCents(cur.spent)}${keptLine}.`
  const spentChange = prev.spent ? (cur.spent - prev.spent) / prev.spent : 0
  const less = spentChange <= -0.05
  const more = spentChange >= 0.05
  const pts = cur.rate !== null && prev.rate !== null ? cur.rate - prev.rate : 0
  const keptMore = pts >= 0.02
  const keptLess = pts <= -0.02
  if (less && keptMore) return `A good month: you spent less and kept more than in ${before}.`
  if (less) return `You spent ${pct(-spentChange)} less than in ${before}${keptLine}.`
  if (more && keptLess) return `A pricier month: you spent more and kept less than in ${before}.`
  if (more) return `You spent ${pct(spentChange)} more than in ${before}${keptLine}.`
  if (keptMore) return `Spending about the same as ${before}, and you kept more.`
  return `About the same as ${before}: you spent ${formatCents(cur.spent)}${keptLine}.`
}

// Everything the note and the email show about one month
export function summarizeMonth(tables, key) {
  const data = normalize(tables)
  const cur = monthStats(data, key)
  const prevKey = shiftMonth(key, -1)
  const prev = monthStats(data, prevKey)
  const hasPrev = prev.rows.length > 0
  const days = daysIn(key)
  const end = `${key}-${pad(days)}`
  const before = monthName(prevKey)
  const accountById = new Map(data.accounts.map((a) => [a.id, a]))
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const catInfo = (id) => {
    const c = catById.get(id)
    return { id: id ?? null, icon: c?.icon ?? '', name: c?.name ?? 'No category', color: c?.color ?? '#868e96' }
  }
  const catName = (id) => {
    const c = catInfo(id)
    return `${c.icon ? `${c.icon} ` : ''}${c.name}`
  }
  const expenses = cur.rows.filter((t) => t.type === 'expense')

  // Categories: top 5, the rest as Everything else
  const sumBy = (rows) => {
    const m = new Map()
    for (const t of rows) m.set(t.category_id ?? null, (m.get(t.category_id ?? null) ?? 0) + t.amount_cents)
    return m
  }
  const byCat = sumBy(expenses)
  const prevByCat = sumBy(prev.rows.filter((t) => t.type === 'expense'))
  const cats = [...byCat].sort((a, b) => b[1] - a[1])
  const categories = cats.slice(0, 5).map(([id, cents]) => ({ ...catInfo(id), label: catName(id), cents, share: cents / cur.spent, prevCents: prevByCat.get(id) ?? 0 }))
  const otherCents = cats.slice(5).reduce((s, [, c]) => s + c, 0)

  // Days
  const byDay = new Map()
  for (const t of expenses) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount_cents)
  const priciestDay = [...byDay].sort((a, b) => b[1] - a[1])[0] ?? null
  const weekday = Array(7).fill(0)
  for (const [date, c] of byDay) {
    const [y, m, d] = date.split('-').map(Number)
    weekday[(new Date(y, m - 1, d).getDay() + 6) % 7] += c
  }
  const topWeekday = weekday.some((c) => c > 0) ? WEEKDAYS[weekday.indexOf(Math.max(...weekday))] : null

  // Places you went back to (2+ times) and the biggest purchases
  const placeMap = new Map()
  for (const t of expenses) {
    const name = t.note?.trim()
    if (!name) continue
    const k = name.toLowerCase()
    const p = placeMap.get(k) ?? { name, times: 0, cents: 0 }
    p.times += 1
    p.cents += t.amount_cents
    placeMap.set(k, p)
  }
  const places = [...placeMap.values()].filter((p) => p.times > 1).sort((a, b) => b.times - a.times || b.cents - a.cents).slice(0, 3)
  const biggest = [...expenses]
    .sort((a, b) => b.amount_cents - a.amount_cents)
    .slice(0, 3)
    .map((t) => ({ name: t.note?.trim() || catInfo(t.category_id).name, icon: catInfo(t.category_id).icon, date: t.date, cents: t.amount_cents }))

  // Income by category, with the accounts it went into
  const incomeMap = new Map()
  for (const t of cur.rows.filter((t) => t.type === 'income')) {
    const k = t.category_id ?? null
    const s = incomeMap.get(k) ?? { ...catInfo(k), cents: 0, count: 0, accounts: new Set() }
    s.cents += t.amount_cents
    s.count += 1
    if (accountById.get(t.account_id)) s.accounts.add(accountById.get(t.account_id).name)
    incomeMap.set(k, s)
  }
  const incomeSources = [...incomeMap.values()].sort((a, b) => b.cents - a.cents).map((s) => ({ ...s, accounts: [...s.accounts] }))
  const incomeCount = cur.rows.filter((t) => t.type === 'income').length

  // Recurring: paid this month (expenses named like a recurring payment), coming up next month, cost a month
  const recurringByName = new Map(data.recurring.map((r) => [r.name.trim().toLowerCase(), r]))
  const recurringPaid = expenses
    .filter((t) => t.note && recurringByName.get(t.note.trim().toLowerCase())?.type !== 'income' && recurringByName.has(t.note.trim().toLowerCase()))
    .map((t) => {
      const r = recurringByName.get(t.note.trim().toLowerCase())
      return { name: r.name, icon: r.icon ?? '', date: t.date, cents: t.amount_cents, frequency: r.frequency }
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const nextKey = shiftMonth(key, 1)
  const active = data.recurring.filter((r) => r.active)
  const comingUp = active
    .flatMap((r) => dueDatesBetween(r, `${nextKey}-01`, `${nextKey}-${pad(daysIn(nextKey))}`).map((date) => ({ name: r.name, icon: r.icon ?? '', type: r.type ?? 'expense', date, cents: r.amount_cents, frequency: r.frequency })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
  const activePayments = active.filter((r) => r.type !== 'income')
  const recurring = {
    paid: recurringPaid,
    paidCents: recurringPaid.reduce((s, r) => s + r.cents, 0),
    comingUp,
    nextName: monthName(nextKey),
    activeCount: activePayments.length,
    monthlyCents: activePayments.reduce((s, r) => s + perMonth(r), 0),
  }

  // Saving & investing: which savings accounts got the money, the Invest transactions
  const savingsIds = new Set(data.accounts.filter((a) => a.type === 'savings').map((a) => a.id))
  const intoSavings = new Map()
  for (const t of cur.rows) for (const [id, c] of effect(t)) if (savingsIds.has(id)) intoSavings.set(id, (intoSavings.get(id) ?? 0) + c)
  const savedInto = [...intoSavings].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).map(([id]) => accountById.get(id)?.name).filter(Boolean)
  const investRows = cur.rows.filter((t) => t.type === 'invest' || t.type === 'divest').sort((a, b) => (a.date < b.date ? -1 : 1))

  // At the month's end: account balances, savings goals, pension
  const upToEnd = data.transactions.filter((t) => t.date <= end)
  const balance = new Map(data.accounts.map((a) => [a.id, a.starting_balance_cents]))
  for (const t of upToEnd) for (const [id, c] of effect(t)) if (balance.has(id)) balance.set(id, balance.get(id) + c)
  const accounts = data.accounts
    .filter((a) => !a.archived || balance.get(a.id) !== 0)
    .map((a) => ({ name: a.name, type: TYPE_NAMES[a.type] ?? 'Card', color: a.color || '#1f4fe0', cents: balance.get(a.id) }))
  const accountsTotal = accounts.reduce((s, a) => s + a.cents, 0)
  const goalMoney = new Map()
  const addGoal = (id, c) => goalMoney.set(id ?? null, (goalMoney.get(id ?? null) ?? 0) + c)
  for (const a of data.accounts) if (a.type === 'savings') addGoal(null, a.starting_balance_cents)
  for (const t of upToEnd) for (const [id, c] of effect(t)) if (savingsIds.has(id)) addGoal(t.goal_id, c)
  for (const m of data.moves.filter((m) => m.date <= end)) {
    addGoal(m.from_goal_id, -m.amount_cents)
    addGoal(m.to_goal_id, m.amount_cents)
  }
  const goals = data.goals
    .filter((g) => g.created_at == null || isoDate(g.created_at) <= end)
    .map((g) => ({ name: g.name, icon: g.icon ?? '', cents: goalMoney.get(g.id) ?? 0, target: g.target_cents }))
  const pensionEntry = data.pension.filter((p) => p.date <= end).sort((a, b) => (a.date < b.date ? 1 : -1))[0]
  const pension = pensionEntry
    ? { cents: pensionEntry.value_cents, date: pensionEntry.date, putIn: pensionEntry.date.slice(0, 7) === key ? pensionEntry.put_in_cents + pensionEntry.company_put_in_cents : 0 }
    : null

  return {
    key,
    title: monthTitle(key),
    month: monthName(key),
    before,
    hasPrev,
    days,
    end,
    cur,
    prev,
    verdict: verdict(cur, prev, hasPrev, before),
    count: cur.rows.length,
    expenseCount: expenses.length,
    incomeCount,
    avgExpense: expenses.length ? Math.round(cur.spent / expenses.length) : 0,
    perDay: Math.round(cur.spent / days),
    noSpendDays: days - byDay.size,
    byDay,
    priciestDay,
    topWeekday,
    categories,
    otherCents,
    places,
    biggest,
    incomeSources,
    recurring,
    savedInto,
    investRows,
    accounts,
    accountsTotal,
    goals,
    generalSavings: savingsIds.size ? goalMoney.get(null) ?? 0 : null,
    pension,
  }
}

// "1234.56" for the note's properties (whole cents, no floating point)
function plain(cents) {
  const abs = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${pad(abs % 100)}`
}
export const pct = (share) => `${Math.round(share * 100)}%`
const cell = (text) => String(text).replace(/\|/g, '\\|')

export function change(now, before) {
  if (!before) return now ? 'new' : '—'
  const c = (now - before) / before
  if (Math.abs(c) < 0.01) return '≈ same'
  return `${c > 0 ? '▲' : '▼'} ${Math.round(Math.abs(c) * 100)}%`
}

export function points(now, before) {
  if (now === null || before === null) return '—'
  const p = Math.round((now - before) * 100)
  return p === 0 ? '≈ same' : `${p > 0 ? '▲' : '▼'} ${Math.abs(p)} pts`
}

export function buildMonthlyReport(tables, key, { createdOn } = {}) {
  const s = summarizeMonth(tables, key)
  const { cur, prev, hasPrev, before } = s
  const vs = (text) => (hasPrev ? ` ${text} |` : '')

  const lines = [
    '---',
    'type: lynxos-report',
    `month: ${key}`,
    `income: ${plain(cur.income)}`,
    `spent: ${plain(cur.spent)}`,
    `kept: ${plain(cur.kept)}`,
    `kept_rate: ${cur.rate !== null ? Math.round(cur.rate * 100) : ''}`,
    `transactions: ${s.count}`,
    ...(createdOn ? [`created: ${createdOn}`] : []),
    'tags:',
    '  - lynxos',
    '  - finances',
    '---',
    '',
    `# ${s.title}`,
    '',
    `> ${s.verdict}`,
    '',
    `| | ${s.month} |${vs(`vs ${before}`)}`,
    `|---|---:|${hasPrev ? '---:|' : ''}`,
    `| Income | ${formatCents(cur.income)} |${vs(change(cur.income, prev.income))}`,
    `| Spending | ${formatCents(cur.spent)} |${vs(change(cur.spent, prev.spent))}`,
    `| Kept | ${formatCents(cur.kept)}${cur.rate !== null ? ` (${pct(cur.rate)})` : ''} |${vs(points(cur.rate, prev.rate))}`,
    `| ↳ Saved | ${formatCents(cur.saved)} |${vs(change(cur.saved, prev.saved))}`,
    `| ↳ Invested | ${formatCents(cur.invested)} |${vs(change(cur.invested, prev.invested))}`,
  ]

  if (s.categories.length) {
    lines.push('', '## Where it went', '', `| Category | Spent | Share |${vs(`vs ${before}`)}`, `|---|---:|---:|${hasPrev ? '---:|' : ''}`)
    for (const c of s.categories) lines.push(`| ${cell(c.label)} | ${formatCents(c.cents)} | ${pct(c.share)} |${vs(change(c.cents, c.prevCents))}`)
    if (s.otherCents) lines.push(`| Everything else | ${formatCents(s.otherCents)} | ${pct(s.otherCents / cur.spent)} |${hasPrev ? ' |' : ''}`)
  }

  const top = s.biggest[0]
  const place = s.places[0]
  lines.push('', '## Stats', '')
  lines.push(`- **${s.count} transactions**${s.expenseCount ? `, ${s.expenseCount} of them expenses (${formatCents(s.avgExpense)} on average)` : ''}`)
  lines.push(`- **Per day:** ${formatCents(s.perDay)} · **No-spend days:** ${s.noSpendDays} of ${s.days}`)
  if (s.priciestDay) lines.push(`- **Priciest day:** ${dayLabel(s.priciestDay[0])} · ${formatCents(s.priciestDay[1])}`)
  if (top) lines.push(`- **Biggest purchase:** ${cell(top.name)} · ${formatCents(top.cents)} (${dayLabel(top.date)})`)
  if (place) lines.push(`- **Most visited:** ${cell(place.name)} · ${place.times} times, ${formatCents(place.cents)}`)
  if (s.topWeekday) lines.push(`- **Most spent on:** ${s.topWeekday}`)
  if (s.recurring.paid.length) lines.push(`- **Recurring payments:** ${s.recurring.paid.length} paid · ${formatCents(s.recurring.paidCents)} (${pct(s.recurring.paidCents / cur.spent)} of spending)`)

  lines.push('', `## On ${Number(s.end.slice(8))} ${s.month.slice(0, 3)}`, '')
  if (s.accounts.length) lines.push(`- **Accounts:** ${formatCents(s.accountsTotal)} (${s.accounts.map((a) => `${cell(a.name)} ${formatCents(a.cents)}`).join(' · ')})`)
  if (s.goals.length || s.generalSavings !== null) {
    const parts = s.goals.map((g) => `${g.icon ? `${g.icon} ` : ''}${cell(g.name)} ${formatCents(g.cents)}${g.target ? ` of ${formatCents(g.target)} (${pct(Math.min(g.cents / g.target, 1))})` : ''}`)
    if (s.generalSavings !== null) parts.push(`General savings ${formatCents(s.generalSavings)}`)
    lines.push(`- **Savings goals:** ${parts.join(' · ')}`)
  }
  if (s.pension) lines.push(`- **Pension:** ${formatCents(s.pension.cents)} (updated ${dayLabel(s.pension.date)}${s.pension.putIn ? `, ${formatCents(s.pension.putIn)} put in` : ''})`)

  return lines.join('\n') + '\n'
}

// Finished months with transactions that don't have a note yet (so a missed run catches up, and notes are never overwritten)
export function monthsToReport(tables, existingFiles, today) {
  const done = new Set(existingFiles)
  const current = today.slice(0, 7)
  const months = new Set(normalize(tables).transactions.map((t) => t.date.slice(0, 7)))
  return [...months].filter((k) => k < current && !done.has(reportFileName(k))).sort()
}
