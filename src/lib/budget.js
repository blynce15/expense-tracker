import { shiftDays } from './dates'

// The budget is the money you can spend: the balance of debit, cash and meal card accounts
// (savings and investments are left out). Nothing is stored except the day
// the budget period starts, which lives in the user's profile.

export const BUDGET_ACCOUNT_TYPES = ['debit', 'cash', 'meal']

// Before user_settings existed the start day was kept on the device; still used until settings have one
const LEGACY_START_DAY_KEY = 'budgetStartDay'
function legacyStartDay() {
  try {
    const n = Number(localStorage.getItem(LEGACY_START_DAY_KEY))
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
  } catch {
    return null
  }
}

export function startDayOf(profile) {
  return profile?.budget_start_day ?? legacyStartDay() ?? 1
}

const pad = (n) => String(n).padStart(2, '0')
const daysIn = (y, m) => new Date(y, m, 0).getDate() // m is 1-12

// The period containing `today`, starting on `startDay` (the last day of the month
// when the month is shorter, e.g. 31 → 30 Sep). Returns ISO dates and day counts.
export function budgetPeriod(today, startDay) {
  let [y, m, d] = today.split('-').map(Number)
  if (d < Math.min(startDay, daysIn(y, m))) {
    m -= 1
    if (m === 0) {
      m = 12
      y -= 1
    }
  }
  const start = `${y}-${pad(m)}-${pad(Math.min(startDay, daysIn(y, m)))}`
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const end = shiftDays(`${ny}-${pad(nm)}-${pad(Math.min(startDay, daysIn(ny, nm)))}`, -1)
  return { start, end, days: daysBetween(start, end) + 1, dayNumber: daysBetween(start, today) + 1 }
}

function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

// accounts: with balance_cents; expenses: { amount_cents, date, account_id } in the period up to today.
// Returns what's left, the period's budget, and spending added up day by day.
export function computeBudget(accounts, expenses, period) {
  const counted = new Set(accounts.filter((a) => !a.archived && BUDGET_ACCOUNT_TYPES.includes(a.type)).map((a) => a.id))
  const leftCents = accounts.filter((a) => counted.has(a.id)).reduce((s, a) => s + a.balance_cents, 0)

  const perDay = new Array(period.dayNumber).fill(0)
  for (const t of expenses) {
    if (!counted.has(t.account_id)) continue
    const i = daysBetween(period.start, t.date)
    if (i >= 0 && i < perDay.length) perDay[i] += t.amount_cents
  }
  const cumulative = []
  perDay.reduce((s, c, i) => (cumulative[i] = s + c), 0)
  const spentCents = cumulative[cumulative.length - 1] ?? 0

  return { hasAccounts: counted.size > 0, leftCents, spentCents, budgetCents: leftCents + spentCents, cumulative }
}
