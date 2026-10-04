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
