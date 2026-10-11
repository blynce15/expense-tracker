import { todayISO } from './dates'
import { supabase } from './supabase'

export const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly', per: 'week' },
  { value: 'monthly', label: 'Monthly', per: 'month' },
  { value: 'yearly', label: 'Yearly', per: 'year' },
]

const pad = (n) => String(n).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`
const daysIn = (y, m) => new Date(y, m, 0).getDate() // m is 1-12

// The due date after `due`, keeping the start date's day of the month
// (a payment on the 31st falls on the 30th in 30-day months, 28th/29th in February)
export function nextDueAfter(due, startDate, frequency) {
  const [y, m, d] = due.split('-').map(Number)
  if (frequency === 'weekly') {
    const date = new Date(y, m - 1, d + 7)
    return toISO(date.getFullYear(), date.getMonth() + 1, date.getDate())
  }
  const anchorDay = Number(startDate.slice(8))
  if (frequency === 'yearly') return toISO(y + 1, m, Math.min(anchorDay, daysIn(y + 1, m)))
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  return toISO(ny, nm, Math.min(anchorDay, daysIn(ny, nm)))
}

// A recurring entry is a payment (expense) or income (salary, meal card…), migration 012
export const isIncome = (p) => p.type === 'income'

// Cost per month in cents: weekly × 52 / 12, yearly / 12
export function monthlyCents(p) {
  if (p.frequency === 'weekly') return Math.round((p.amount_cents * 52) / 12)
  if (p.frequency === 'yearly') return Math.round(p.amount_cents / 12)
  return p.amount_cents
}

// Whole days from today until `iso` (negative = in the past)
export function daysUntil(iso) {
  const [ty, tm, td] = todayISO().split('-').map(Number)
  const [y, m, d] = iso.split('-').map(Number)
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000)
}

// "Due today" / "Tomorrow" / "5 days left" / "2 days late"
export function dueLabel(iso) {
  const n = daysUntil(iso)
  if (n === 0) return 'Due today'
  if (n === 1) return 'Tomorrow'
  if (n > 1) return `${n} days left`
  return n === -1 ? '1 day late' : `${-n} days late`
}

export async function fetchRecurring() {
  const { data, error } = await supabase.from('recurring_payments').select('*').order('next_due').order('name')
  if (error) throw error
  return data
}

// Records one payment as an expense (income for income entries) and moves the due date forward, both in one step
// (database function from migrations 010/011). The expense is dated on the due date, or today if paying early.
// goalId: the savings goal it comes out of when paid from a savings account (null = General savings).
export async function recordPayment(p, { amountCents, accountId, goalId = null }) {
  const today = todayISO()
  const date = p.next_due < today ? p.next_due : today
  const nextDue = nextDueAfter(p.next_due, p.start_date, p.frequency)
  const { error: rpcError } = await supabase.rpc('record_recurring_payment', {
    p_payment_id: p.id,
    p_due: p.next_due,
    p_amount_cents: amountCents,
    p_account_id: accountId,
    p_date: date,
    p_next_due: nextDue,
    p_goal_id: goalId,
  })
  if (!rpcError) return
  // If the function is missing (migration not run): fall back to two separate saves
  if (rpcError.code !== 'PGRST202') throw rpcError

  const { error } = await supabase.from('transactions').insert({
    type: p.type ?? 'expense',
    amount_cents: amountCents,
    date,
    account_id: accountId,
    category_id: p.category_id,
    note: p.name,
    goal_id: goalId,
  })
  if (error) throw error

  const { error: updateError } = await supabase
    .from('recurring_payments')
    .update({ next_due: nextDue })
    .eq('id', p.id)
  if (updateError) throw updateError
}
