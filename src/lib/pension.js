import { todayISO } from './dates'
import { fetchProfile, savePensionFund } from './profile'
import { supabase } from './supabase'

// Pension fund (Investments → Pension): not an account, no money moves. Once a month the owner types in what
// the fund is worth, how much went in since the last time and how many units they hold.
// Table pension_entries (migration 020): { id, date, value_cents, put_in_cents, units }, one per calendar month.
// The first entry is the starting point: its put_in_cents is everything put in before LynxOS.
// The fund's name and provider: user_settings.answers.pension = { name, provider }.

const byDate = (entries) => [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
const units = (e) => Number(e.units) || 0

// Everything the Pension page shows, worked out from the entries (oldest first or not)
export function pensionSummary(entries, today = todayISO()) {
  const list = byDate(entries ?? [])
  if (!list.length) return null
  const last = list.at(-1)
  const first = list[0]
  const putIn = list.reduce((s, e) => s + e.put_in_cents, 0)
  const gain = last.value_cents - putIn
  const perUnit = (e) => (units(e) > 0 ? e.value_cents / units(e) : null) // cents per unit

  // This year: from the last entry before 1 January (else the first entry this year) to the latest one,
  // leaving out the money added in between
  const year = today.slice(0, 4)
  const base = list.filter((e) => e.date < `${year}-01-01`).at(-1) ?? first
  const addedSince = list.filter((e) => e.date > base.date).reduce((s, e) => s + e.put_in_cents, 0)
  const yearCents = last.value_cents - base.value_cents - addedSince
  const yearBase = base.value_cents + addedSince

  // History, newest first: each month's growth = change in value − money added that month
  let running = 0
  const history = list
    .map((e, i) => {
      running += e.put_in_cents
      const prev = list[i - 1]
      return { ...e, start: i === 0, putInTotal: running, growth: prev ? e.value_cents - prev.value_cents - e.put_in_cents : null }
    })
    .reverse()

  const unitNow = perUnit(last)
  const unitFirst = perUnit(first)
  return {
    last,
    first,
    value: last.value_cents,
    putIn,
    gain,
    rate: putIn > 0 ? gain / putIn : 0,
    year: { cents: yearCents, rate: yearBase > 0 ? yearCents / yearBase : 0, since: base.date },
    perUnit: unitNow,
    perUnitChange: unitNow != null && unitFirst ? unitNow / unitFirst - 1 : null,
    units: units(last),
    unitsAdded: units(last) - units(base),
    history,
  }
}

// Due when the fund exists and this calendar month has no entry yet
export function isPensionDue(entries, today = todayISO()) {
  if (!entries?.length) return false
  return !entries.some((e) => e.date.slice(0, 7) === today.slice(0, 7))
}

// The pension's value at the end of a day: the latest entry on or before it (0 before the first one)
export function pensionValueOn(entries, iso) {
  return byDate(entries ?? []).filter((e) => e.date <= iso).at(-1)?.value_cents ?? 0
}

// The entry for the month of `iso`, if there is one (saving again in the same month changes it)
export const entryForMonth = (entries, iso) => (entries ?? []).find((e) => e.date.slice(0, 7) === iso.slice(0, 7)) ?? null

// ───────── database ─────────

// { fund: { name, provider } | null, entries: [...] oldest first }
export async function fetchPension() {
  const [profile, res] = await Promise.all([fetchProfile(), supabase.from('pension_entries').select('*').order('date')])
  if (res.error) throw res.error
  return { fund: profile?.answers?.pension ?? null, entries: res.data ?? [] }
}

// Adds or changes an entry ({ id? , date, value_cents, put_in_cents, units })
export async function savePensionEntry(entry) {
  const row = { date: entry.date, value_cents: entry.value_cents, put_in_cents: entry.put_in_cents, units: entry.units }
  const { error } = entry.id ? await supabase.from('pension_entries').update(row).eq('id', entry.id) : await supabase.from('pension_entries').insert(row)
  if (error) throw error.code === '23505' ? new Error('This month already has an update.') : error
}

export async function deletePensionEntry(id) {
  const { error } = await supabase.from('pension_entries').delete().eq('id', id)
  if (error) throw error
}

// Setup: the fund and its starting point
export async function createPension({ name, provider, value_cents, put_in_cents, units: u }) {
  await savePensionEntry({ date: todayISO(), value_cents, put_in_cents, units: u })
  await savePensionFund({ name: name.trim(), provider: provider.trim() })
}

// Removes the fund and every entry
export async function removePension() {
  const { error } = await supabase.from('pension_entries').delete().not('id', 'is', null)
  if (error) throw error
  await savePensionFund(null)
}
