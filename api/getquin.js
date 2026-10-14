// Investments page: reads the owner's public getquin share page (e.g. https://getqu.in/WO8FIo/) and returns
// the portfolio's current value, how much went in, each position, and the money put in each month.
// getquin has no public API, so this reads the data the share page itself carries (Next.js __NEXT_DATA__)
// and its trades from getquin's data service; if getquin changes either, the app falls back to what it
// tracks itself.
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

  // Each instrument's own currency (open, partly and fully sold positions), for the monthly amounts
  const currencies = {}
  for (const p of [...d.positions, ...(d.sold?.partial ?? []), ...(d.sold?.total ?? []), ...(d.soldPositions ?? [])]) {
    if (p?.isin && p.original_currency) currencies[p.isin] = p.original_currency
  }

  return {
    portfolio: {
      value_cents: cents(d.total),
      invested_cents: cents(d.capital_invested),
      dividends_cents: cents(d.dividends_received),
      positions,
      updated_at: new Date().toISOString(),
    },
    code: query.match(/"code":"([^"]+)"/)?.[1],
    currencies,
  }
}

// The share's trades come from getquin's own data service (the same one its share page uses). It turns
// away requests that don't look like a browser, so this asks like one.
const GQL_HEADERS = {
  'content-type': 'application/json',
  origin: 'https://app.getquin.com',
  referer: 'https://app.getquin.com/',
  accept: '*/*',
  'accept-language': 'en-GB,en;q=0.9',
  'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
}

async function fetchTrades(code) {
  const trades = []
  for (let offset = 0; offset < 5000; offset += 500) {
    const res = await fetch('https://api-gql-v2.getquin.com/', {
      method: 'POST',
      headers: GQL_HEADERS,
      body: JSON.stringify({
        query: `query($code: String!, $offset: Int) { t: getSharedAggregatedDashboardTransactions(code: $code, limit: 500, offset: $offset) { count results { timestamp transaction_type units price isin } } }`,
        variables: { code, offset },
      }),
    })
    const body = await res.json()
    const page = body?.data?.t
    if (!page) throw new Error(body?.errors?.[0]?.message || `getquin answered ${res.status}.`)
    trades.push(...page.results)
    if (trades.length >= page.count || page.results.length === 0) break
  }
  return trades
}

// "2026-09-23": the trade's day where the owner lives (getquin stores e.g. 2026-09-22T22:00:00Z)
const lisbonDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Europe/Lisbon' })

// Money put in each month = buys − sales. Trades in other currencies (US stocks are in dollars) are
// converted at the European Central Bank rate of that day (Frankfurter, free, sees only dates).
async function monthlyAmounts(code, currencies) {
  const trades = (await fetchTrades(code))
    .filter((t) => t.transaction_type === 'BUYING' || t.transaction_type === 'SELLING')
    .map((t) => ({ ...t, day: lisbonDay(t.timestamp), currency: currencies[t.isin] || 'EUR' }))
  if (!trades.length) return []

  const foreign = [...new Set(trades.map((t) => t.currency).filter((c) => c !== 'EUR'))]
  let rateDays = []
  let rates = {}
  if (foreign.length) {
    const first = trades.map((t) => t.day).sort()[0]
    // A few days earlier, so a weekend trade at the start still has a rate before it
    const start = new Date(Date.parse(first) - 7 * 864e5).toISOString().slice(0, 10)
    const res = await fetch(`https://api.frankfurter.dev/v1/${start}..?base=EUR&symbols=${foreign.join(',')}`)
    if (!res.ok) throw new Error('Exchange rates unavailable.')
    rates = (await res.json()).rates
    rateDays = Object.keys(rates).sort()
  }
  // Latest ECB rate on or before the day (none on weekends and holidays)
  const toEuros = (amount, currency, day) => {
    if (currency === 'EUR') return amount
    let rate
    for (const k of rateDays) {
      if (k > day) break
      rate = rates[k][currency] ?? rate
    }
    if (!rate) throw new Error(`No exchange rate for ${currency}.`)
    return amount / rate
  }

  const byMonth = new Map()
  for (const t of trades) {
    const euros = toEuros(t.units * t.price, t.currency, t.day) * (t.transaction_type === 'SELLING' ? -1 : 1)
    const key = t.day.slice(0, 7)
    byMonth.set(key, (byMonth.get(key) ?? 0) + euros)
  }
  return [...byMonth].sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, euros]) => ({ key, cents: cents(euros) }))
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
    const { portfolio, code, currencies } = readPortfolio(await fetchPage(link.href))
    // Monthly amounts are extra: without them the page uses what LynxOS tracks (months = null)
    try {
      portfolio.months = code ? await monthlyAmounts(code, currencies) : null
    } catch (e) {
      portfolio.months = null
      portfolio.months_error = e.message
    }
    res.setHeader('cache-control', 'no-store')
    return res.status(200).json(portfolio)
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Couldn’t read getquin.' })
  }
}
