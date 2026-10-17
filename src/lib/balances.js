import { formatCents } from './money'
import { supabase } from './supabase'
import { shared } from './shared'

// Balance = starting balance + income − expenses − transfers out + transfers in − money invested + money taken
// back out of investments. Always calculated from transactions, never stored.

// Investing: 'invest' puts money into investments (it leaves account_id), 'divest' takes money back out of them
// (it arrives in account_id). Neither is spending or income (migration 015).
export const INVEST_TYPES = ['invest', 'divest']
export const isInvest = (t) => INVEST_TYPES.includes(t?.type)

// The adding up happens in the database (migration 019, account_balances): one row per account instead of
// every transaction, so it stays fast and complete however long the history gets.
export const fetchAccountsWithBalances = shared(async function fetchAccountsWithBalances() {
  const [accountsRes, changesRes] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.rpc('account_balances'),
  ])
  if (accountsRes.error) throw accountsRes.error
  if (changesRes.error) throw changesRes.error
  const changes = new Map(changesRes.data.map((r) => [r.account_id, r]))

  return accountsRes.data.map((a) => ({
    ...a,
    balance_cents: a.starting_balance_cents + Number(changes.get(a.id)?.change_cents ?? 0),
    transaction_count: Number(changes.get(a.id)?.transaction_count ?? 0),
  }))
})

// How a transaction moves each account's balance: Map account id → cents
function effect(t, sign = 1) {
  const out = new Map()
  if (!t) return out
  if (t.type === 'income' || t.type === 'divest') out.set(t.account_id, sign * t.amount_cents)
  else if (t.type === 'expense' || t.type === 'invest') out.set(t.account_id, -sign * t.amount_cents)
  else {
    out.set(t.account_id, -sign * t.amount_cents)
    out.set(t.to_account_id, (out.get(t.to_account_id) ?? 0) + sign * t.amount_cents)
  }
  return out
}

// How replacing `before` with `after` (either may be null) moves each account: Map account id → cents
export function balanceChanges(before, after) {
  const change = effect(after)
  for (const [id, cents] of effect(before, -1)) change.set(id, (change.get(id) ?? 0) + cents)
  return change
}

// Money rule: no account can go below €0 (checked against today's balance).
// `before` is the transaction as it is now (null when adding), `after` as it will be (null when deleting).
// Returns a message saying why the change isn't allowed, or null if it's fine.
// A change that doesn't lower an account is always allowed, even if that account is already below €0.
export function overdraftProblem(accounts, before, after) {
  for (const [id, cents] of balanceChanges(before, after)) {
    const a = accounts.find((x) => x.id === id)
    if (!a || cents >= 0) continue
    const result = a.balance_cents + cents
    if (result < 0) {
      return `Not enough money in ${a.name}: it has ${formatCents(Math.max(a.balance_cents, 0))}, so this would leave it at ${formatCents(result)}.`
    }
  }
  return null
}

// Same check with fresh balances from the server
export async function checkOverdraft(before, after) {
  return overdraftProblem(await fetchAccountsWithBalances(), before, after)
}
