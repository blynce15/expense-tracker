import { balanceChanges, fetchAccountsWithBalances } from './balances'
import { supabase } from './supabase'

// Savings goals share one pot: the money in savings-type accounts. Money in all goals together
// can never be more than that pot; the rest is "not in a goal". Nothing extra is stored:
// goals keep their saved_cents, the pot is calculated from account balances.

export const savingsAccounts = (accounts) => accounts.filter((a) => a.type === 'savings' && !a.archived)

export async function fetchGoalsState() {
  const [accounts, goalsRes] = await Promise.all([
    fetchAccountsWithBalances(),
    supabase.from('savings_goals').select('*').order('created_at'),
  ])
  if (goalsRes.error) throw goalsRes.error
  const pot = savingsAccounts(accounts).reduce((s, a) => s + a.balance_cents, 0)
  const inGoals = goalsRes.data.reduce((s, g) => s + g.saved_cents, 0)
  return { accounts, goals: goalsRes.data, pot, inGoals, free: pot - inGoals }
}

// How much goal money a transaction change uses up: the savings pot may only drop below what
// the goals hold if that money is taken out of goals. 0 when the change doesn't touch goal money.
// Like the overdraft rule, only the part this change causes counts (an older mismatch isn't charged to it).
export function goalShortfall(state, before, after) {
  const ids = new Set(savingsAccounts(state.accounts).map((a) => a.id))
  let change = 0
  for (const [id, cents] of balanceChanges(before, after)) if (ids.has(id)) change += cents
  if (change >= 0) return 0
  return Math.max(0, Math.min(-change, state.inGoals - (state.pot + change)))
}

// picks: [{ goal, cents }] → lowers each goal's saved money
export async function takeFromGoals(picks) {
  for (const { goal, cents } of picks) {
    const { error } = await supabase
      .from('savings_goals')
      .update({ saved_cents: goal.saved_cents - cents })
      .eq('id', goal.id)
    if (error) throw error
  }
}
