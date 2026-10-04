import { supabase } from './supabase'

// Last fetched values, so the Add screen can open instantly with them
// while a fresh copy loads in the background.
export const lookupCache = { lookups: null, lastUsedAccountId: null }

// Accounts and categories, used to fill pickers and label transactions.
export async function fetchLookups() {
  const [accounts, categories] = await Promise.all([
    supabase.from('accounts').select('id, name, type, color, archived').order('created_at'),
    supabase
      .from('categories')
      .select('id, name, icon, color, kind, archived, sort_order')
      .order('sort_order')
      .order('created_at'),
  ])
  if (accounts.error) throw accounts.error
  if (categories.error) throw categories.error
  lookupCache.lookups = { accounts: accounts.data, categories: categories.data }
  return lookupCache.lookups
}

// The account used by the most recently added transaction, if any.
export async function fetchLastUsedAccountId() {
  const { data, error } = await supabase
    .from('transactions')
    .select('account_id')
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  lookupCache.lastUsedAccountId = data[0]?.account_id ?? null
  return lookupCache.lastUsedAccountId
}

// Picks the default account for a new transaction: last used, else the first active one.
export function defaultAccountId(lookups, lastUsedId) {
  const active = lookups.accounts.filter((a) => !a.archived)
  return (active.find((a) => a.id === lastUsedId) ?? active[0])?.id ?? null
}
