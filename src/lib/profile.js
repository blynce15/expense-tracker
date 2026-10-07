import { supabase } from './supabase'

// The user's profile row: budget start day, "About you" answers, onboarding status.
// Created on first save; until then fetchProfile() returns null.

// The table doesn't exist yet (migration 005 not run): behave as if there's no profile
const isMissingTable = (error) => error?.code === '42P01' || error?.code === 'PGRST205'

export async function fetchProfile() {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
  if (error && !isMissingTable(error)) throw error
  return data ?? null
}

// Creates the row if needed and updates only the given fields
export async function saveProfile(patch) {
  const { error } = await supabase.from('profiles').upsert(patch, { onConflict: 'user_id' })
  if (error) throw error
}
