// Investments page: reads the owner's public getquin share page (e.g. https://getqu.in/WO8FIo/) and returns
// the portfolio's current value, how much went in, and each position. getquin has no public API, so this
// reads the data the share page itself carries (Next.js __NEXT_DATA__); if getquin changes that page,
// this answers 502 and the app falls back to what it tracks itself.
// GET /api/getquin?url=<share link> with the user's login token (only signed-in users can use it).
//
// Needs these Vercel settings: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (only to check the login).

import { createClient } from '@supabase/supabase-js'

// Only getquin's own addresses are fetched (never any other site)
const ALLOWED_HOSTS = ['getqu.in', 'app.getquin.com', 'getquin.com', 'www.getquin.com']
const isAllowed = (u) => u.protocol === 'https:' && ALLOWED_HOSTS.includes(u.hostname)

const cents = (euros) => (Number.isFinite(euros) ? Math.round(euros * 100) : 0)

// Follows the short link's redirects by hand so every hop is checked
async function fetchPage(link) {
  let url = new URL(link)
  for (let hop = 0; hop < 5; hop++) {
    if (!isAllowed(url)) throw new Error('Not a getquin link.')
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (LynxOS)', 'accept-language': 'en' } })
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location'), url)
      continue
    }
    if (!res.ok) throw new Error(`getquin answered ${res.status}.`)
    return res.text()
  }
  throw new Error('Too many redirects.')
}

function readPortfolio(html) {
  const raw = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1]
  if (!raw) throw new Error('The getquin page looks different than expected.')
  const props = JSON.parse(raw)?.props
  // getquin picks the currency from where the visitor is (a US server got dollars); only euros are shown
  const query = Object.keys(props?.queryClientCache?.ROOT_QUERY ?? {}).find((k) => k.startsWith('getSharedAggregatedDashboard('))
  const currency = query?.match(/"currency":"([A-Z]+)"/)?.[1]
  if (currency !== 'EUR') throw new Error(`getquin sent ${currency ?? 'an unknown currency'} instead of euros.`)
  const dashboards = props?.initialState?.dashboard?.dashboards ?? {}
  const d = Object.values(dashboards).find((x) => x && Array.isArray(x.positions))
  if (!d) throw new Error('No portfolio found on that getquin page.')

  const positions = d.positions
    .filter((p) => !p.closed && p.current_value > 0)
    .map((p) => {
      const i = p.instrument ?? {}
      const invested = cents(p.capital_invested)
      const value = cents(p.current_value)
      const gain = p.returns?.all?.absolute
      return {
        name: p.title || p.name || i.name || p.isin,
        ticker: p.ticker || i.ticker || i.symbol || '',
        kind: p.category || i.category || '', // etf, stock, crypto…
        logo: p.logo || i.logo || null,
        units: p.units ?? null,
        price_cents: cents(p.lastValue?.value ?? p.instrument?.eodValue?.value),
        value_cents: value,
        invested_cents: invested,
        gain_cents: Number.isFinite(gain) ? cents(gain) : value - invested,
        gain_rate: p.returns?.all?.relative ?? (invested ? (value - invested) / invested : 0),
      }
    })
    .sort((a, b) => b.value_cents - a.value_cents)

  return {
    value_cents: cents(d.total),
    invested_cents: cents(d.capital_invested),
    dividends_cents: cents(d.dividends_received),
    positions,
    updated_at: new Date().toISOString(),
  }
}

export default async function handler(req, res) {
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) return res.status(500).json({ error: 'Not set up in Vercel.' })

  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const { data: auth, error: authError } = token ? await db.auth.getUser(token) : { data: null }
  if (authError || !auth?.user) return res.status(401).json({ error: 'Please sign in again.' })

  let link
  try {
    link = new URL(String(req.query.url || ''))
    if (!isAllowed(link)) throw new Error()
  } catch {
    return res.status(400).json({ error: 'That isn’t a getquin share link.' })
  }

  try {
    const portfolio = readPortfolio(await fetchPage(link.href))
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json(portfolio)
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Couldn’t read getquin.' })
  }
}
