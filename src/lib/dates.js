// Dates are stored as "YYYY-MM-DD" in the user's local time zone.

export function todayISO() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function shiftDays(iso, days) {
  const d = parseISO(iso)
  d.setDate(d.getDate() + days)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// "🗓️ Mon, 5 Oct"
export function formatTodayLabel() {
  // en-GB writes September as "Sept"; keep every month at three letters
  const d = new Date()
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'short' })
  const dayMonth = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
  return `🗓️ ${weekday}, ${dayMonth}`
}

// "Today", "Yesterday", or e.g. "Mon 29 Sep" (adds the year if not this year)
export function formatDay(iso) {
  const today = todayISO()
  if (iso === today) return 'Today'
  if (iso === shiftDays(today, -1)) return 'Yesterday'
  const d = parseISO(iso)
  const sameYear = d.getFullYear() === new Date().getFullYear()
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

// First and last day of the month containing `iso`, e.g. ["2026-10-01", "2026-10-31"]
export function monthRange(iso) {
  const [y, m] = iso.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  const mm = String(m).padStart(2, '0')
  return [`${y}-${mm}-01`, `${y}-${mm}-${last}`]
}

// "October"
export function monthName(iso) {
  return parseISO(iso).toLocaleDateString('en-GB', { month: 'long' })
}
