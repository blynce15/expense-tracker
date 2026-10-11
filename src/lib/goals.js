import { balanceChanges, fetchAccountsWithBalances } from './balances'
import { formatCents } from './money'
import { supabase } from './supabase'

// Savings goals follow the real money (migration 011). Nothing is stored per goal: its money is
//   + how much each transaction tagged with it moves the savings accounts (in adds, out takes away)
//   + moves from other goals − moves to other goals (goal_moves, no money leaves the account).
// Savings money without a goal is General savings (key null): the savings accounts' starting
// balances, untagged transactions and moves to/from null. So goals + General savings always add up
// to the savings accounts' balance. Archived savings accounts count too (they're at €0 anyway).

export const GENERAL = { id: null, name: 'General savings', icon: '🏦', target_cents: null, deadline: null }

export const savingsAccounts = (accounts) => accounts.filter((a) => a.type === 'savings' && !a.archived)

// How much a transaction moves the savings accounts in total (transfers between two savings accounts: 0)
export function savingsEffect(accounts, t) {
  const ids = new Set(accounts.filter((a) => a.type === 'savings').map((a) => a.id))
  let cents = 0
  for (const [id, c] of balanceChanges(null, t)) if (ids.has(id)) cents += c
  return cents
}

// Map goal id (null = General savings) → cents
function holdings(accounts, transactions, moves) {
  const out = new Map([[null, 0]])
  const add = (id, cents) => out.set(id ?? null, (out.get(id ?? null) ?? 0) + cents)
  for (const a of accounts) if (a.type === 'savings') add(null, a.starting_balance_cents)
  for (const t of transactions) {
    const cents = savingsEffect(accounts, t)
    if (cents) add(t.goal_id, cents)
  }
  for (const m of moves) {
    add(m.from_goal_id, -m.amount_cents)
    add(m.to_goal_id, m.amount_cents)
  }
  return out
}

export async function fetchGoalsState() {
  const [accounts, goalsRes, txRes, movesRes] = await Promise.all([
    fetchAccountsWithBalances(),
    supabase.from('savings_goals').select('*').order('created_at'),
    supabase.from('transactions').select('id, type, amount_cents, date, account_id, to_account_id, goal_id'),
    supabase.from('goal_moves').select('*'),
  ])
  for (const r of [goalsRes, txRes, movesRes]) if (r.error) throw r.error
  const state = { accounts, transactions: txRes.data, moves: movesRes.data }
  const held = holdings(accounts, state.transactions, state.moves)
  const goals = goalsRes.data.map((g) => ({ ...g, saved_cents: held.get(g.id) ?? 0 }))
  const general = { ...GENERAL, saved_cents: held.get(null) }
  const pot = accounts.filter((a) => a.type === 'savings').reduce((s, a) => s + a.balance_cents, 0)
  return { ...state, goals, general, pot }
}

const goalName = (state, id) => (id ? (state.goals.find((g) => g.id === id)?.name ?? 'This goal') : GENERAL.name)

// Money rule: no goal (General savings included) can go below €0. Like the overdraft rule, only
// goals this change lowers are checked. `change` is { transactions?, moves?, accounts? } with the
// lists as they'd be after the change. Returns a message, or null if it's fine.
export function goalProblem(state, change) {
  const before = holdings(state.accounts, state.transactions, state.moves)
  const after = holdings(change.accounts ?? state.accounts, change.transactions ?? state.transactions, change.moves ?? state.moves)
  for (const [id, cents] of after) {
    const was = before.get(id) ?? 0
    if (cents < 0 && cents < was) {
      return `${goalName(state, id)} has ${formatCents(Math.max(was, 0))}, so this would leave it at ${formatCents(cents)}.`
    }
  }
  return null
}

// Replacing transaction `before` with `after` (either may be null; `after` carries goal_id)
export function transactionGoalProblem(state, before, after) {
  const list = state.transactions.filter((t) => !before || t.id !== before.id)
  if (after) list.push({ ...after, id: before?.id ?? 'new' })
  return goalProblem(state, { transactions: list })
}

// Same check with fresh data from the server
export async function checkGoals(before, after) {
  return transactionGoalProblem(await fetchGoalsState(), before, after)
}

// The goal a transaction touches, when it moves savings money (else no goal choice is needed)
export const needsGoal = (accounts, t) => savingsEffect(accounts, t) !== 0

// Moves money from one goal to another inside savings (null = General savings)
export async function moveBetweenGoals(fromId, toId, cents) {
  const { error } = await supabase.from('goal_moves').insert({ from_goal_id: fromId, to_goal_id: toId, amount_cents: cents })
  if (error) throw error
}
