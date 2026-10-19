import { todayISO } from './dates'
import { formatCents } from './money'

// Cash at the brokers, added by hand on the Investments page (Cash tab). Not an account: it's part of the
// investments and counts only while getquin is connected (portfolio value, Home and Analytics net worth).
// Kept in user_settings.answers.brokerCash (no extra table):
//   [{ id, name, currency: 'EUR' | 'USD', cents, history: [{ date: 'YYYY-MM-DD', cents }] }]
// `cents` is in the entry's own currency; `history` holds every amount it had (one per day, oldest first),
// so past net worth uses what was there then. Dollars become euros at today's ECB rate.

export const CURRENCIES = {
  EUR: { symbol: '€', label: 'Euros' },
  USD: { symbol: '$', label: 'US dollars' },
}

// "$1.200,00" / "€1.746,00"
export const formatIn = (cents, currency) => (currency === 'USD' ? formatCents(cents).replace('€', '$') : formatCents(cents))

export const cashEntries = (profile) => profile?.answers?.brokerCash ?? []

// `rate` = euros per dollar (null when unknown: dollars then count as nothing rather than as euros)
export function toEuroCents(cents, currency, rate) {
  if (currency !== 'USD') return cents
  return rate ? Math.round(cents * rate) : 0
}

export const cashTotal = (entries, rate) => entries.reduce((sum, e) => sum + toEuroCents(e.cents, e.currency, rate), 0)

// Cash on a day (end of it): each entry's last amount set on or before that day; nothing before its first one
export function cashOn(entries, iso, rate) {
  let sum = 0
  for (const e of entries) {
    let found = 0
    for (const h of e.history ?? [{ date: '0000-00-00', cents: e.cents }]) if (h.date <= iso) found = h.cents
    sum += toEuroCents(found, e.currency, rate)
  }
  return sum
}

// A new entry, or one with a new amount: today's amount replaces an earlier one from today
export function withAmount(entry, { name, currency, cents }, today = todayISO()) {
  const history = (entry?.currency === currency ? (entry.history ?? []) : []).filter((h) => h.date !== today)
  return {
    id: entry?.id ?? (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
    name: name?.trim() || null,
    currency,
    cents,
    history: [...history, { date: today, cents }],
  }
}

// When the entry last changed ("today", "3 days ago")
export function updatedText(entry, today = todayISO()) {
  const last = entry.history?.at(-1)?.date
  if (!last) return null
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86400000)
  return days <= 0 ? 'Updated today' : days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`
}

// ---------- The dollar rate (api.frankfurter.dev: free ECB rates, no key) ----------

const RATE_KEY = 'usdRate'

// The last rate seen on this phone: { rate, date } or null
export function cachedUsdRate() {
  try {
    return JSON.parse(localStorage.getItem(RATE_KEY)) ?? null
  } catch {
    return null
  }
}

let asking = null
export function fetchUsdRate() {
  asking ??= fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR')
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error('No exchange rate right now.'))))
    .then((body) => {
      const value = { rate: body.rates.EUR, date: body.date }
      try {
        localStorage.setItem(RATE_KEY, JSON.stringify(value))
      } catch {}
      return value
    })
    .finally(() => (asking = null))
  return asking
}
