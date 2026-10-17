import { fetchProfile } from './profile'
import { supabase } from './supabase'
import { shared } from './shared'

// Last fetched values, so the Add screen can open instantly with them
// while a fresh copy loads in the background.
export const lookupCache = { lookups: null, lastUsedAccountId: null, pinnedAccountId: null }

// Accounts, categories and savings goals, used to fill pickers and label transactions.
export const fetchLookups = shared(async function fetchLookups() {
  const [accounts, categories, goals] = await Promise.all([
    supabase.from('accounts').select('id, name, type, color, archived').order('created_at'),
    supabase
      .from('categories')
      .select('id, name, icon, color, kind, archived, sort_order')
      .order('sort_order')
      .order('created_at'),
    supabase.from('savings_goals').select('id, name, icon').order('created_at'),
  ])
  if (accounts.error) throw accounts.error
  if (categories.error) throw categories.error
  if (goals.error) throw goals.error
  lookupCache.lookups = { accounts: accounts.data, categories: categories.data, goals: goals.data }
  return lookupCache.lookups
})

// The account used by the most recently added transaction, if any.
// Also loads the account pinned in Profile → Default account.
export async function fetchLastUsedAccountId() {
  const [{ data, error }, profile] = await Promise.all([
    supabase.from('transactions').select('account_id').order('created_at', { ascending: false }).limit(1),
    fetchProfile().catch(() => null),
  ])
  if (error) throw error
  lookupCache.lastUsedAccountId = data[0]?.account_id ?? null
  lookupCache.pinnedAccountId = profile?.answers?.defaultAccountId ?? null
  return lookupCache.lastUsedAccountId
}

// Picks the default account for a new transaction: the pinned one, else last used, else the first active one.
export function defaultAccountId(lookups, lastUsedId) {
  const active = lookups.accounts.filter((a) => !a.archived)
  const pick = (id) => active.find((a) => a.id === id)
  return (pick(lookupCache.pinnedAccountId) ?? pick(lastUsedId) ?? active[0])?.id ?? null
}
