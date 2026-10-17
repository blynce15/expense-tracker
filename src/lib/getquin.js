import { supabase } from './supabase'

// The owner's getquin portfolio (current value, invested, positions), read through api/getquin.js on Vercel
// each time the Investments page opens. The share link is kept in user_settings.answers.getquinUrl.
// The last answer is also kept on this phone (localStorage getquin) so the page shows it at once / offline.

const CACHE_KEY = 'getquin'

// Accepts "getqu.in/AbC123" or a full getquin address; null if it isn't one
export function cleanGetquinLink(text) {
  const t = text.trim()
  if (!t) return null
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`)
    if (!['getqu.in', 'app.getquin.com', 'getquin.com', 'www.getquin.com'].includes(u.hostname)) return null
    u.protocol = 'https:'
    return u.href
  } catch {
    return null
  }
}

export function cachedPortfolio(link) {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY))
    return c?.link === link ? c.portfolio : null
  } catch {
    return null
  }
}

export async function fetchPortfolio(link) {
  const { data } = await supabase.auth.getSession()
  const res = await fetch(`/api/getquin?url=${encodeURIComponent(link)}`, {
    headers: { authorization: `Bearer ${data.session?.access_token ?? ''}` },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || 'Couldn’t reach getquin.')
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ link, portfolio: body }))
  } catch {}
  return body
}

export function forgetPortfolio() {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {}
}
