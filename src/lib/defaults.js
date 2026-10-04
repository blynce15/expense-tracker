import { supabase } from './supabase'

const DEFAULT_CATEGORIES = [
  { name: 'Groceries', icon: '🛒', color: '#1f9d55', kind: 'expense' },
  { name: 'Eating out', icon: '🍽️', color: '#e8590c', kind: 'expense' },
  { name: 'Transport', icon: '🚆', color: '#1f4fe0', kind: 'expense' },
  { name: 'Housing', icon: '🏠', color: '#6741d9', kind: 'expense' },
  { name: 'Bills', icon: '🧾', color: '#495057', kind: 'expense' },
  { name: 'Shopping', icon: '🛍️', color: '#d6336c', kind: 'expense' },
  { name: 'Health', icon: '🩺', color: '#0c8599', kind: 'expense' },
  { name: 'Entertainment', icon: '🎬', color: '#f08c00', kind: 'expense' },
  { name: 'Travel', icon: '✈️', color: '#1c7ed6', kind: 'expense' },
  { name: 'Other', icon: '📦', color: '#868e96', kind: 'expense' },
  { name: 'Salary', icon: '💼', color: '#0f8a5f', kind: 'income' },
  { name: 'Other income', icon: '💶', color: '#2b8a3e', kind: 'income' },
]

// Creates the default categories the first time the user logs in.
// Safe to call repeatedly: existing (user, kind, name) rows are left alone.
export async function ensureDefaultCategories() {
  const { count, error } = await supabase
    .from('categories')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  if (count > 0) return

  const { error: insertError } = await supabase
    .from('categories')
    .upsert(DEFAULT_CATEGORIES, { onConflict: 'user_id,kind,name', ignoreDuplicates: true })
  if (insertError) throw insertError
}
