import { fetchLastUsedAccountId, fetchLookups } from './lookups'
import { saveProfile } from './profile'
import { supabase } from './supabase'

// A new user is someone with no accounts who hasn't finished setup.
export async function needsOnboarding(profile) {
  if (profile?.onboarded_at) return false
  const { count, error } = await supabase.from('accounts').select('id', { count: 'exact', head: true })
  if (error) throw error
  return count === 0
}

// Categories the user already has (e.g. created before onboarding existed)
export async function fetchExistingCategories() {
  const { data, error } = await supabase.from('categories').select('id, name, icon, color, kind, archived').order('sort_order')
  if (error) throw error
  return data
}

// Saves everything from the setup flow. `done` remembers what was already saved,
// so pressing "Try again" after a dropped connection doesn't create duplicates.
//   accounts:   [{ key, name, type, cents, color }]  (cents = amount owed for credit cards)
//   categories: [{ id?, name, icon, color, kind, selected }]
//   payments:   [{ type, name, icon, cents, frequency, nextDue, accountKey, categoryName }]  (type: expense | income)
export async function saveOnboarding({ accounts, categories, payments, startDay }, done) {
  if (!done.accountIds) {
    const ids = {}
    for (const a of accounts) {
      const { data, error } = await supabase
        .from('accounts')
        .insert({
          name: a.name,
          type: a.type,
          // A credit card's balance is what's owed, so it starts below zero
          starting_balance_cents: a.type === 'credit' ? -a.cents : a.cents,
          color: a.color,
        })
        .select('id')
        .single()
      if (error) throw error
      ids[a.key] = data.id
    }
    done.accountIds = ids
  }

  if (!done.categoryIds) {
    const ids = {}
    const key = (c) => `${c.kind}:${c.name.toLowerCase()}`
    for (const kind of ['expense', 'income']) {
      const ofKind = categories.filter((c) => c.kind === kind)
      // Keep or archive the ones that already exist, in the shown order
      for (const [i, c] of ofKind.entries()) {
        if (!c.id) continue
        const { error } = await supabase.from('categories').update({ archived: !c.selected, sort_order: i + 1 }).eq('id', c.id)
        if (error) throw error
        if (c.selected) ids[key(c)] = c.id
      }
      const fresh = ofKind
        .map((c, i) => ({ ...c, sort_order: i + 1 }))
        .filter((c) => !c.id && c.selected)
        .map(({ name, icon, color, sort_order }) => ({ name, icon, color, kind, sort_order }))
      if (fresh.length) {
        const { data, error } = await supabase.from('categories').insert(fresh).select('id, name, kind')
        if (error) throw error
        for (const c of data) ids[key(c)] = c.id
      }
    }
    done.categoryIds = ids
  }

  if (!done.payments && payments.length) {
    const { error } = await supabase.from('recurring_payments').insert(
      payments.map((p) => ({
        name: p.name,
        icon: p.icon,
        amount_cents: p.cents,
        frequency: p.frequency,
        // The first due date sets the day of the month later payments keep
        start_date: p.nextDue,
        next_due: p.nextDue,
        account_id: done.accountIds[p.accountKey],
        type: p.type ?? 'expense',
        category_id: done.categoryIds[`${p.type ?? 'expense'}:${p.categoryName?.toLowerCase()}`] ?? null,
        active: true,
      })),
    )
    if (error) throw error
  }
  done.payments = true

  await saveProfile({ budget_start_day: startDay, onboarded_at: new Date().toISOString() })

  // Refresh what the Add screen uses, so it opens with the new accounts and categories
  await Promise.all([fetchLookups(), fetchLastUsedAccountId()])
}
