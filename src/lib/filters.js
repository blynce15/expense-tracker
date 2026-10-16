import { monthRange, todayISO } from './dates'

// Transactions filter, kept by App so it survives tab switches:
// { type: 'all' | 'income' | 'expense' | 'transfer' | 'invest' (Put in and Take out), categoryIds: [], accountIds: [],
//   date: { preset: 'all' | 'thisMonth' | 'lastMonth' | 'last3' | 'thisYear' | 'custom', from, to },
//   recurring: 'all' | 'only' | 'not', recurringIds: [] (which recurring entries for 'only'; empty = all of them) }
export const EMPTY_FILTER = { type: 'all', categoryIds: [], accountIds: [], date: { preset: 'all' }, recurring: 'all', recurringIds: [] }

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

// "14 Sep" or "14 Sep 2025" when not this year
export function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const sameYear = y === new Date().getFullYear()
  return new Date(y, m - 1, d)
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace('Sept', 'Sep')
}

// e.g. "This month" or "14 Sep – 3 Oct"
export function describeDate(date) {
  if (date.preset === 'custom') return `${shortDate(date.from)} – ${shortDate(date.to)}`
  return DATE_PRESETS.find((p) => p.value === date.preset)?.label ?? 'All time'
}

// e.g. "1 Oct – 31 Oct", shown next to each preset
export function describeRange(date) {
  const range = dateRange(date)
  if (!range) return 'Everything'
  return `${shortDate(range[0])} – ${shortDate(range[1])}`
}

export function activeFilterCount(filter) {
  return (filter.date.preset !== 'all' ? 1 : 0) + (filter.accountIds.length ? 1 : 0) + (usesCategories(filter) ? 1 : 0) + (usesRecurring(filter) ? 1 : 0)
}

// The recurring filter doesn't apply to transfers either
export function usesRecurring(filter) {
  return filter.type !== 'transfer' && filter.type !== 'invest' && (filter.recurring ?? 'all') !== 'all'
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
  const ids = filter.recurring === 'only' ? (filter.recurringIds ?? []) : []
  return [...new Set(recurring.filter((r) => !ids.length || ids.includes(r.id)).map((r) => r.name.trim()).filter(Boolean))]
}

// A value inside a PostgREST or(...) list, quoted so commas and brackets in names are safe
const quoted = (text) => `"${text.replace(/["\\]/g, '\\$&')}"`

// Categories don't apply to transfers or investing
export function usesCategories(filter) {
  return filter.type !== 'transfer' && filter.type !== 'invest' && filter.categoryIds.length > 0
}

// Adds the filter's conditions to a Supabase transactions query (`recurring` = the recurring entries, for that filter)
export function applyFilter(query, filter, recurring = []) {
  let q = query
  if (filter.type === 'invest') q = q.in('type', ['invest', 'divest'])
  else if (filter.type !== 'all') q = q.eq('type', filter.type)
  if (usesCategories(filter)) q = q.in('category_id', filter.categoryIds)
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
    if (filter.recurring === 'only') {
      q = q.in('type', ['expense', 'income'])
      q = names.length ? q.or(names.map((n) => `note.ilike.${quoted(n)}`).join(',')) : q.is('id', null)
    } else if (names.length) {
      q = q.or(`type.in.(transfer,invest,divest),note.is.null,and(${names.map((n) => `note.not.ilike.${quoted(n)}`).join(',')})`)
    }
  }
  return q
}
