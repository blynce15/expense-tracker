import { formatCents } from './money'
import { supabase } from './supabase'

// Balance = starting balance + income − expenses − transfers out + transfers in.
// Always calculated from transactions, never stored.
export async function fetchAccountsWithBalances() {
  const [accountsRes, txRes] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('transactions').select('type, amount_cents, account_id, to_account_id'),
  ])
  if (accountsRes.error) throw accountsRes.error
  if (txRes.error) throw txRes.error

  const delta = new Map()
  const add = (id, cents) => delta.set(id, (delta.get(id) ?? 0) + cents)
  const txCount = new Map()

  for (const t of txRes.data) {
    txCount.set(t.account_id, (txCount.get(t.account_id) ?? 0) + 1)
    if (t.type === 'income') add(t.account_id, t.amount_cents)
    else if (t.type === 'expense') add(t.account_id, -t.amount_cents)
    else if (t.type === 'transfer') {
      add(t.account_id, -t.amount_cents)
      add(t.to_account_id, t.amount_cents)
      txCount.set(t.to_account_id, (txCount.get(t.to_account_id) ?? 0) + 1)
    }
  }

  return accountsRes.data.map((a) => ({
    ...a,
    balance_cents: a.starting_balance_cents + (delta.get(a.id) ?? 0),
    transaction_count: txCount.get(a.id) ?? 0,
  }))
}

// Accounts that can't go below €0. Credit cards can: a negative balance is what you owe.
export const NO_OVERDRAFT_TYPES = ['debit', 'cash', 'savings', 'meal']

// How a transaction moves each account's balance: Map account id → cents
function effect(t, sign = 1) {
  const out = new Map()
  if (!t) return out
  if (t.type === 'income') out.set(t.account_id, sign * t.amount_cents)
  else if (t.type === 'expense') out.set(t.account_id, -sign * t.amount_cents)
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

// Money rule: a debit, cash or savings account can't go below €0 (checked against today's balance).
// `before` is the transaction as it is now (null when adding), `after` as it will be (null when deleting).
// Returns a message saying why the change isn't allowed, or null if it's fine.
// A change that doesn't lower an account is always allowed, even if that account is already below €0.
export function overdraftProblem(accounts, before, after) {
  for (const [id, cents] of balanceChanges(before, after)) {
    const a = accounts.find((x) => x.id === id)
    if (!a || cents >= 0 || !NO_OVERDRAFT_TYPES.includes(a.type)) continue
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
