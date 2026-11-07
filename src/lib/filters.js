import { monthRange, todayISO } from './dates'

// Transactions filter, kept by App so it survives tab switches:
// { q: '' (search: the name contains this, any case),
//   types: [] (any of 'expense' | 'income' | 'transfer' | 'invest' (Put in and Take out); empty = all),
//   categoryIds: [], accountIds: [],
//   date: { preset: 'all' | 'thisMonth' | 'lastMonth' | 'last3' | 'thisYear' | 'custom', from, to },
//   recurring: false (true = only recurring), recurringIds: [] (which recurring entries; empty = all of them) }
export const EMPTY_FILTER = { q: '', types: [], categoryIds: [], accountIds: [], date: { preset: 'all' }, recurring: false, recurringIds: [] }

export const TYPES = ['expense', 'income', 'transfer', 'invest']

export const DATE_PRESETS = [
  { value: 'thisMonth', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: 'last3', label: 'Last 3 months' },
  { value: 'thisYear', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

function firstOfMonth(monthsBack) {
  const t = new Date()
  const d = new Date(t.getFullYear(), t.getMonth() - monthsBack, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// [from, to] as "YYYY-MM-DD" (inclusive), or null for all time
export function dateRange(date) {
  const today = todayISO()
  switch (date.preset) {
    case 'thisMonth':
      return monthRange(today)
    case 'lastMonth':
      return monthRange(firstOfMonth(1))
    case 'last3':
      return [firstOfMonth(2), monthRange(today)[1]]
    case 'thisYear':
      return [`${today.slice(0, 4)}-01-01`, `${today.slice(0, 4)}-12-31`]
    case 'custom':
      return [date.from, date.to]
    default:
      return null
  }
}

// The last 12 months up to this one (oldest first), each with whether `date` covers part of it:
// the little strip on the date tiles
export function monthStrip(date) {
  const range = dateRange(date)
  return Array.from({ length: 12 }, (_, i) => {
    const [from, to] = monthRange(firstOfMonth(11 - i))
    return !range || (range[0] <= to && range[1] >= from)
  })
}

// "14 Sep" or "14 Sep 2025" when not this year
export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const sameYear = y === new Date().getFullYear()
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace('Sept', 'Sep')
}

// e.g. "This month", "14 Sep – 3 Oct" or "14 Sep"
export function describeDate(date) {
  if (date.preset === 'custom') return date.from === date.to ? shortDate(date.from) : `${shortDate(date.from)} – ${shortDate(date.to)}`
  return DATE_PRESETS.find((p) => p.value === date.preset)?.label ?? 'All time'
}

// e.g. "1 Oct – 31 Oct", shown on each preset
export function describeRange(date) {
  const range = dateRange(date)
  if (!range) return 'Every transaction'
  return `${shortDate(range[0])} – ${shortDate(range[1])}`
}

// The category kinds (expense / income) the picked types include; with none picked, both
export function kindsOf(filter) {
  const types = filter.types.length ? filter.types : TYPES
  return ['expense', 'income'].filter((k) => types.includes(k))
}

// Categories and the recurring filter only apply to expenses and income
export function usesCategories(filter) {
  return filter.categoryIds.length > 0 && kindsOf(filter).length > 0
}

export function usesRecurring(filter) {
  return !!filter.recurring && kindsOf(filter).length > 0
}

export function activeFilterCount(filter) {
  return (
    (filter.q.trim() ? 1 : 0) +
    (filter.types.length ? 1 : 0) +
    (filter.date.preset !== 'all' ? 1 : 0) +
    (filter.accountIds.length ? 1 : 0) +
    (usesCategories(filter) ? 1 : 0) +
    (usesRecurring(filter) ? 1 : 0)
  )
}

// A transaction is recurring when its name is the name of a recurring payment or income
// (the same rule Analytics uses for fixed bills). Lower-case names, for isRecurring.
export function recurringNameSet(recurring) {
  return new Set(recurring.map((r) => r.name.trim().toLowerCase()).filter(Boolean))
}

export function isRecurring(t, names) {
  return (t.type === 'expense' || t.type === 'income') && !!t.note && names.has(t.note.trim().toLowerCase())
}

// Names of the recurring entries the filter is about
function recurringNames(filter, recurring) {
  const ids = filter.recurringIds ?? []
  return [...new Set(recurring.filter((r) => !ids.length || ids.includes(r.id)).map((r) => r.name.trim()).filter(Boolean))]
}

// A value inside a PostgREST or(...) list, quoted so commas and brackets in names are safe
const quoted = (text) => `"${text.replace(/["\\]/g, '\\$&')}"`

// Database types for the picked types (Invest = put in and take out)
const dbTypes = (types) => types.flatMap((t) => (t === 'invest' ? ['invest', 'divest'] : [t]))

// Adds the filter's conditions to a Supabase transactions query (`recurring` = the recurring entries, for that filter)
export function applyFilter(query, filter, recurring = []) {
  let q = query
  if (filter.types.length) q = q.in('type', dbTypes(filter.types))
  // Picked types without categories (transfers, investing) aren't narrowed by categories or recurring
  const pass = dbTypes(filter.types.filter((t) => t === 'transfer' || t === 'invest'))
  const orPass = pass.length ? `type.in.(${pass.join(',')}),` : ''

  const search = filter.q.trim()
  if (search) q = q.ilike('note', `%${search.replace(/[\\%_]/g, '\\$&')}%`)
  if (usesCategories(filter)) {
    q = pass.length ? q.or(`${orPass}category_id.in.(${filter.categoryIds.join(',')})`) : q.in('category_id', filter.categoryIds)
  }
  if (filter.accountIds.length) {
    // A transfer counts for a card if the money left or arrived there
    const ids = filter.accountIds.join(',')
    q = q.or(`account_id.in.(${ids}),to_account_id.in.(${ids})`)
  }
  const range = dateRange(filter.date)
  if (range) q = q.gte('date', range[0]).lte('date', range[1])
  if (usesRecurring(filter)) {
    // Names match ignoring upper/lower case, like isRecurring
    const names = recurringNames(filter, recurring)
    const nameConds = names.map((n) => `and(type.in.(expense,income),note.ilike.${quoted(n)})`)
    if (nameConds.length || pass.length) q = q.or(`${orPass}${nameConds.join(',')}`.replace(/,$/, ''))
    else q = q.is('id', null) // no recurring entries: nothing matches
  }
  return q
}
