import { monthRange, todayISO } from './dates'

// Transactions filter, kept by App so it survives tab switches:
// { type: 'all' | 'income' | 'expense' | 'transfer', categoryIds: [], accountIds: [],
//   date: { preset: 'all' | 'thisMonth' | 'lastMonth' | 'last3' | 'thisYear' | 'custom', from, to } }
export const EMPTY_FILTER = { type: 'all', categoryIds: [], accountIds: [], date: { preset: 'all' } }

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
  return (filter.date.preset !== 'all' ? 1 : 0) + (filter.accountIds.length ? 1 : 0) + (usesCategories(filter) ? 1 : 0)
}

// Categories don't apply to transfers
export function usesCategories(filter) {
  return filter.type !== 'transfer' && filter.categoryIds.length > 0
}

// Adds the filter's conditions to a Supabase transactions query
export function applyFilter(query, filter) {
  let q = query
  if (filter.type !== 'all') q = q.eq('type', filter.type)
  if (usesCategories(filter)) q = q.in('category_id', filter.categoryIds)
  if (filter.accountIds.length) {
    // A transfer counts for a card if the money left or arrived there
    const ids = filter.accountIds.join(',')
    q = q.or(`account_id.in.(${ids}),to_account_id.in.(${ids})`)
  }
  const range = dateRange(filter.date)
  if (range) q = q.gte('date', range[0]).lte('date', range[1])
  return q
}
