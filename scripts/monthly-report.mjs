// Monthly report for Obsidian: a short Markdown note on what happened in one calendar month
// (income, spending, kept, top categories, a few stats, savings and balances at the month's end).
// Built from the rows the monthly backup has just read (scripts/backup.mjs), so it never asks the database again.
// Same rules as the app: transfers and Invest / Take out are not spending or income; kept = net money into
// savings accounts + money invested (src/lib/analytics.js).
import { formatCents } from '../src/lib/money.js'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays']
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const pad = (n) => String(n).padStart(2, '0')

// The database hands dates over as Date objects at local midnight (or ISO text in backup.json): keep the calendar day
export function isoDate(value) {
  if (value instanceof Date) return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
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
    recurring: tables.recurring_payments ?? [],
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

const daysIn = (key) => {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m, 0).getDate()
}
export const monthTitle = (key) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`
export const reportFileName = (key) => `${key}.md` // "2026-10.md"

const dayLabel = (iso) => {
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

// "1234.56" for the note's properties (whole cents, no floating point)
function plain(cents) {
  const abs = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.trunc(abs / 100)}.${pad(abs % 100)}`
}
const pct = (share) => `${Math.round(share * 100)}%`
const cell = (text) => String(text).replace(/\|/g, '\\|')

function change(now, before) {
  if (!before) return now ? 'new' : '—'
  const c = (now - before) / before
  if (Math.abs(c) < 0.01) return '≈ same'
  return `${c > 0 ? '▲' : '▼'} ${Math.round(Math.abs(c) * 100)}%`
}

function points(now, before) {
  if (now === null || before === null) return '—'
  const p = Math.round((now - before) * 100)
  return p === 0 ? '≈ same' : `${p > 0 ? '▲' : '▼'} ${Math.abs(p)} pts`
}

function verdict(cur, prev, hasPrev) {
  const keptLine = cur.rate !== null ? ` and kept ${pct(Math.max(cur.rate, 0))} of your income` : ''
  if (!hasPrev) return `You spent ${formatCents(cur.spent)}${keptLine}.`
  const spentChange = prev.spent ? (cur.spent - prev.spent) / prev.spent : 0
  const less = spentChange <= -0.05
  const more = spentChange >= 0.05
  const pts = cur.rate !== null && prev.rate !== null ? cur.rate - prev.rate : 0
  const keptMore = pts >= 0.02
  const keptLess = pts <= -0.02
  const before = MONTHS[Number(prev.key.slice(5, 7)) - 1]
  if (less && keptMore) return `A good month: you spent less and kept more than in ${before}.`
  if (less) return `You spent ${pct(-spentChange)} less than in ${before}${keptLine}.`
  if (more && keptLess) return `A pricier month: you spent more and kept less than in ${before}.`
  if (more) return `You spent ${pct(spentChange)} more than in ${before}${keptLine}.`
  if (keptMore) return `Spending about the same as ${before}, and you kept more.`
  return `About the same as ${before}: you spent ${formatCents(cur.spent)}${keptLine}.`
}

export function buildMonthlyReport(tables, key, { createdOn } = {}) {
  const data = normalize(tables)
  const cur = monthStats(data, key)
  const prev = { ...monthStats(data, shiftMonth(key, -1)), key: shiftMonth(key, -1) }
  const hasPrev = prev.rows.length > 0
  const end = `${key}-${pad(daysIn(key))}`
  const before = MONTHS[Number(prev.key.slice(5, 7)) - 1]
  const catById = new Map(data.categories.map((c) => [c.id, c]))
  const catName = (id) => {
    const c = catById.get(id)
    return c ? `${c.icon ? `${c.icon} ` : ''}${c.name}` : 'No category'
  }
  const expenses = cur.rows.filter((t) => t.type === 'expense')

  // Categories: top 5, the rest as Everything else
  const byCat = new Map()
  for (const t of expenses) byCat.set(t.category_id ?? null, (byCat.get(t.category_id ?? null) ?? 0) + t.amount_cents)
  const prevByCat = new Map()
  for (const t of prev.rows) if (t.type === 'expense') prevByCat.set(t.category_id ?? null, (prevByCat.get(t.category_id ?? null) ?? 0) + t.amount_cents)
  const cats = [...byCat].sort((a, b) => b[1] - a[1])
  const top = cats.slice(0, 5)
  const otherCents = cats.slice(5).reduce((s, [, c]) => s + c, 0)

  // Days, places, biggest purchase, recurring
  const byDay = new Map()
  for (const t of expenses) byDay.set(t.date, (byDay.get(t.date) ?? 0) + t.amount_cents)
  const priciest = [...byDay].sort((a, b) => b[1] - a[1])[0]
  const weekday = Array(7).fill(0)
  for (const [date, c] of byDay) {
    const [y, m, d] = date.split('-').map(Number)
    weekday[(new Date(y, m - 1, d).getDay() + 6) % 7] += c
  }
  const topWeekday = weekday.some((c) => c > 0) ? weekday.indexOf(Math.max(...weekday)) : -1
  const places = new Map()
  for (const t of expenses) {
    const name = t.note?.trim()
    if (!name) continue
    const k = name.toLowerCase()
    const p = places.get(k) ?? { name, times: 0, cents: 0 }
    p.times += 1
    p.cents += t.amount_cents
    places.set(k, p)
  }
  // The place you went back to most (at least twice), else nothing: a one-off is already the biggest purchase
  const topPlace = [...places.values()].filter((p) => p.times > 1).sort((a, b) => b.times - a.times || b.cents - a.cents)[0]
  const biggest = [...expenses].sort((a, b) => b.amount_cents - a.amount_cents)[0]
  const fixedNames = new Set(data.recurring.filter((r) => r.type !== 'income').map((r) => r.name.trim().toLowerCase()))
  const fixed = expenses.filter((t) => t.note && fixedNames.has(t.note.trim().toLowerCase()))
  const fixedCents = fixed.reduce((s, t) => s + t.amount_cents, 0)

  // At the month's end: account balances, savings goals, pension
  const upToEnd = data.transactions.filter((t) => t.date <= end)
  const balance = new Map(data.accounts.map((a) => [a.id, a.starting_balance_cents]))
  for (const t of upToEnd) for (const [id, c] of effect(t)) if (balance.has(id)) balance.set(id, balance.get(id) + c)
  const shownAccounts = data.accounts.filter((a) => !a.archived || balance.get(a.id) !== 0)
  const savingsIds = new Set(data.accounts.filter((a) => a.type === 'savings').map((a) => a.id))
  const goalMoney = new Map()
  const addGoal = (id, c) => goalMoney.set(id ?? null, (goalMoney.get(id ?? null) ?? 0) + c)
  for (const a of data.accounts) if (a.type === 'savings') addGoal(null, a.starting_balance_cents)
  for (const t of upToEnd) for (const [id, c] of effect(t)) if (savingsIds.has(id)) addGoal(t.goal_id, c)
  for (const m of data.moves.filter((m) => m.date <= end)) {
    addGoal(m.from_goal_id, -m.amount_cents)
    addGoal(m.to_goal_id, m.amount_cents)
  }
  const pension = data.pension.filter((p) => p.date <= end).sort((a, b) => (a.date < b.date ? 1 : -1))[0]

  const lines = [
    '---',
    'type: lynxos-report',
    `month: ${key}`,
    `income: ${plain(cur.income)}`,
    `spent: ${plain(cur.spent)}`,
    `kept: ${plain(cur.kept)}`,
    `kept_rate: ${cur.rate !== null ? Math.round(cur.rate * 100) : ''}`,
    `transactions: ${cur.rows.length}`,
    ...(createdOn ? [`created: ${createdOn}`] : []),
    'tags:',
    '  - lynxos',
    '  - finances',
    '---',
    '',
    `# ${monthTitle(key)}`,
    '',
    `> ${verdict(cur, prev, hasPrev)}`,
    '',
    `| | ${MONTHS[Number(key.slice(5, 7)) - 1]} |${hasPrev ? ` vs ${before} |` : ''}`,
    `|---|---:|${hasPrev ? '---:|' : ''}`,
    `| Income | ${formatCents(cur.income)} |${hasPrev ? ` ${change(cur.income, prev.income)} |` : ''}`,
    `| Spending | ${formatCents(cur.spent)} |${hasPrev ? ` ${change(cur.spent, prev.spent)} |` : ''}`,
    `| Kept | ${formatCents(cur.kept)}${cur.rate !== null ? ` (${pct(cur.rate)})` : ''} |${hasPrev ? ` ${points(cur.rate, prev.rate)} |` : ''}`,
    `| ↳ Saved | ${formatCents(cur.saved)} |${hasPrev ? ` ${change(cur.saved, prev.saved)} |` : ''}`,
    `| ↳ Invested | ${formatCents(cur.invested)} |${hasPrev ? ` ${change(cur.invested, prev.invested)} |` : ''}`,
  ]

  if (top.length) {
    lines.push('', '## Where it went', '', `| Category | Spent | Share |${hasPrev ? ` vs ${before} |` : ''}`, `|---|---:|---:|${hasPrev ? '---:|' : ''}`)
    for (const [id, c] of top) lines.push(`| ${cell(catName(id))} | ${formatCents(c)} | ${pct(c / cur.spent)} |${hasPrev ? ` ${change(c, prevByCat.get(id) ?? 0)} |` : ''}`)
    if (otherCents) lines.push(`| Everything else | ${formatCents(otherCents)} | ${pct(otherCents / cur.spent)} |${hasPrev ? ' |' : ''}`)
  }

  lines.push('', '## Stats', '')
  lines.push(`- **${cur.rows.length} transactions**${expenses.length ? `, ${expenses.length} of them expenses (${formatCents(Math.round(cur.spent / expenses.length))} on average)` : ''}`)
  lines.push(`- **Per day:** ${formatCents(Math.round(cur.spent / daysIn(key)))} · **No-spend days:** ${daysIn(key) - byDay.size} of ${daysIn(key)}`)
  if (priciest) lines.push(`- **Priciest day:** ${dayLabel(priciest[0])} · ${formatCents(priciest[1])}`)
  if (biggest) lines.push(`- **Biggest purchase:** ${cell(biggest.note?.trim() || catName(biggest.category_id))} · ${formatCents(biggest.amount_cents)} (${dayLabel(biggest.date)})`)
  if (topPlace) lines.push(`- **Most visited:** ${cell(topPlace.name)} · ${topPlace.times} times, ${formatCents(topPlace.cents)}`)
  if (topWeekday >= 0) lines.push(`- **Most spent on:** ${WEEKDAYS[topWeekday]}`)
  if (fixed.length) lines.push(`- **Recurring payments:** ${fixed.length} paid · ${formatCents(fixedCents)} (${pct(fixedCents / cur.spent)} of spending)`)

  lines.push('', `## On ${Number(end.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1].slice(0, 3)}`, '')
  if (shownAccounts.length) {
    const total = shownAccounts.reduce((s, a) => s + balance.get(a.id), 0)
    lines.push(`- **Accounts:** ${formatCents(total)} (${shownAccounts.map((a) => `${cell(a.name)} ${formatCents(balance.get(a.id))}`).join(' · ')})`)
  }
  const goals = data.goals.filter((g) => g.created_at == null || isoDate(g.created_at) <= end)
  if (goals.length || savingsIds.size) {
    const parts = goals.map((g) => {
      const c = goalMoney.get(g.id) ?? 0
      return `${g.icon ? `${g.icon} ` : ''}${cell(g.name)} ${formatCents(c)}${g.target_cents ? ` of ${formatCents(g.target_cents)} (${pct(Math.min(c / g.target_cents, 1))})` : ''}`
    })
    if (savingsIds.size) parts.push(`General savings ${formatCents(goalMoney.get(null) ?? 0)}`)
    lines.push(`- **Savings goals:** ${parts.join(' · ')}`)
  }
  if (pension) {
    const putIn = pension.date.slice(0, 7) === key ? pension.put_in_cents + pension.company_put_in_cents : 0
    lines.push(`- **Pension:** ${formatCents(pension.value_cents)} (updated ${dayLabel(pension.date)}${putIn ? `, ${formatCents(putIn)} put in` : ''})`)
  }

  return lines.join('\n') + '\n'
}

// Finished months with transactions that don't have a note yet (so a missed run catches up, and notes are never overwritten)
export function monthsToReport(tables, existingFiles, today) {
  const done = new Set(existingFiles)
  const current = today.slice(0, 7)
  const months = new Set(normalize(tables).transactions.map((t) => t.date.slice(0, 7)))
  return [...months].filter((k) => k < current && !done.has(reportFileName(k))).sort()
}
