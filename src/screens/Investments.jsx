import { useCallback, useEffect, useState } from 'react'
import { FullEmpty } from '../components/EmptyLynx'
import Icon from '../components/Icon'
import LynxWatermark from '../components/LynxWatermark'
import Sheet from '../components/Sheet'
import { todayISO } from '../lib/dates'
import { cachedPortfolio, cleanGetquinLink, fetchPortfolio, forgetPortfolio } from '../lib/getquin'
import { formatCents } from '../lib/money'
import { fetchProfile, saveGetquinLink } from '../lib/profile'

const MONTHS_SHOWN = 6

// "2026-10" style month keys
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shortMonth = (key) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')

// "€2.400" (no cents)
const whole = (cents) => formatCents(cents).replace(/,\d\d$/, '')
// "+€518" / "−€11"
const signedWhole = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)
// "+17,7%"
const percent = (rate) => `${rate < 0 ? '−' : '+'}${Math.abs(rate * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })}%`
const KINDS = { etf: 'ETF', stock: 'Stock', crypto: 'Crypto', bond: 'Bond', fund: 'Fund', commodity: 'Commodity' }

// The last MONTHS_SHOWN months (oldest first) from getquin's [{ key: '2026-09', cents }]; missing months are 0
function lastMonths(months) {
  const byKey = new Map(months.map((m) => [m.key, m.cents]))
  const thisMonth = todayISO().slice(0, 7)
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const key = shiftMonth(thisMonth, i - (MONTHS_SHOWN - 1))
    return { key, cents: byKey.get(key) ?? 0, partial: key === thisMonth }
  })
}

// The page tells the top-bar button (next to the profile photo) when getquin's numbers are from and how to refresh them
let status = { time: null, refreshing: false, error: false, refresh: null }
const listeners = new Set()
function setStatus(patch) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener(status))
}

// Top bar on Investments: "11:16" and a refresh icon; tap to fetch from getquin again
export function InvestmentsRefresh() {
  const [s, setS] = useState(status)
  useEffect(() => {
    listeners.add(setS)
    return () => listeners.delete(setS)
  }, [])
  if (!s.refresh) return null
  return (
    <button
      onClick={s.refresh}
      disabled={s.refreshing}
      className="flex h-9 items-center gap-1.5 rounded-full bg-card pr-1 pl-3 text-[13px] font-semibold text-muted shadow-[0_4px_12px_-8px_rgba(11,27,69,0.35)] active:opacity-80"
      aria-label={s.time ? `Updated ${s.time}. Refresh from getquin` : 'Refresh from getquin'}
    >
      <span className={`tabular ${s.error ? 'text-loss' : ''}`}>{s.refreshing ? '…' : s.error ? 'Offline' : (s.time ?? '')}</span>
      <span className="grid size-7 place-items-center rounded-full bg-teal/12 text-teal">
        <Icon name="refresh" size={15} strokeWidth={2.4} className={s.refreshing ? 'animate-spin' : ''} />
      </span>
    </button>
  )
}

// Investments come only from getquin (no investment accounts since 2026-10-14): the share link's value,
// the money put in each month and the positions, read through api/getquin.js each time the page opens.
export default function Investments() {
  const [link, setLink] = useState(undefined) // getquin share link; null = not linked, undefined = loading
  const [portfolio, setPortfolio] = useState(null)
  const [portfolioError, setPortfolioError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editingLink, setEditingLink] = useState(false) // only from the empty page; changing the link is in Profile

  // Fresh numbers from getquin every time the page opens; the last ones show meanwhile
  const refresh = useCallback((url) => {
    setPortfolioError(null)
    if (!url) return setPortfolio(null)
    setPortfolio(cachedPortfolio(url))
    setRefreshing(true)
    fetchPortfolio(url)
      .then(setPortfolio)
      .catch((e) => setPortfolioError(e.message))
      .finally(() => setRefreshing(false))
  }, [])

  // Keep the top-bar button up to date
  useEffect(() => {
    const time = portfolio?.updated_at ? new Date(portfolio.updated_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : null
    setStatus({ time, refreshing, error: !!portfolioError, refresh: link ? () => refresh(link) : null })
  }, [portfolio, refreshing, portfolioError, link, refresh])
  useEffect(() => () => setStatus({ refresh: null }), [])

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        const url = p?.answers?.getquinUrl ?? null
        setLink(url)
        refresh(url)
      })
      .catch(() => setLink(null))
  }, [refresh])

  if (link === undefined) return null

  const linkSheet = editingLink && (
    <LinkSheet
      link={link}
      onClose={() => setEditingLink(false)}
      onSaved={(url) => {
        setEditingLink(false)
        if (!url) forgetPortfolio()
        setLink(url)
        refresh(url)
      }}
    />
  )

  if (!link) {
    return (
      <div className="px-4 pt-1 pb-6">
        <FullEmpty title="No investments yet">
          <button onClick={() => setEditingLink(true)} className="rounded-full bg-teal px-6 py-3 text-[15px] font-semibold text-white active:opacity-80">
            Connect getquin
          </button>
        </FullEmpty>
        {linkSheet}
      </div>
    )
  }

  // getquin's own monthly amounts (buys − sales)
  const flow = portfolio?.months ? lastMonths(portfolio.months) : null

  return (
    <div className="space-y-4 px-4 pt-1 pb-6">
      <ValueCard portfolio={portfolio} monthCents={flow ? flow.at(-1).cents : null} error={portfolioError} />
      {flow && <InvestChart flow={flow} />}

      <h2 className="px-1 pt-2 font-display text-lg font-bold">
        Positions {portfolio && <span className="tabular text-base font-semibold text-muted">· {portfolio.positions.length}</span>}
      </h2>
      {portfolio ? (
        <ul className="space-y-2.5">
          {portfolio.positions.map((p) => (
            <PositionRow key={`${p.ticker}-${p.name}`} position={p} />
          ))}
        </ul>
      ) : (
        <p className="rounded-[22px] bg-card px-4 py-6 text-center text-muted">
          {portfolioError ? `Couldn't load your positions: ${portfolioError}` : 'Loading your positions…'}
        </p>
      )}
    </div>
  )
}

// Today's value from getquin with the overall gain; Invested = what getquin says the positions cost
function ValueCard({ portfolio, monthCents, error }) {
  const header = <p className="relative text-sm font-semibold text-white/80">Portfolio value</p>
  if (!portfolio) {
    return (
      <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#14a3b8] via-[#0c8599] to-[#08606f] p-[18px] text-white">
        {header}
        <p className="mt-2 text-sm text-white/80">{error ? 'Couldn’t reach getquin right now.' : 'Checking getquin…'}</p>
      </section>
    )
  }
  const gain = portfolio.value_cents - portfolio.invested_cents
  const rate = portfolio.invested_cents ? gain / portfolio.invested_cents : 0
  const [euros, decimals] = formatCents(portfolio.value_cents).split(',')
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#14a3b8] via-[#0c8599] to-[#08606f] p-[18px] pb-3.5 text-white shadow-[0_18px_30px_-20px_rgba(12,133,153,0.9)]">
      <LynxWatermark className="-bottom-14 -left-10" />
      {header}
      <div className="relative mt-0.5 flex items-end justify-between gap-2">
        <p className="tabular min-w-0 truncate font-display leading-none font-bold">
          <span className="text-[38px] tracking-tight">{euros}</span>
          <span className="text-lg text-white/55">,{decimals}</span>
        </p>
        <span className="tabular mb-1 shrink-0 rounded-full bg-white/20 px-2.5 py-1 text-[13px] font-bold">
          {signedWhole(gain)} · {percent(rate)}
        </span>
      </div>
      <div className="relative mt-3.5 grid grid-cols-2 rounded-2xl bg-white/[.12]">
        <Fact label="Invested" value={whole(portfolio.invested_cents)} />
        {monthCents != null ? (
          <Fact label="Put in this month" value={signedWhole(monthCents)} divider />
        ) : (
          <Fact label="Dividends" value={formatCents(portfolio.dividends_cents)} divider />
        )}
      </div>
    </section>
  )
}

function PositionRow({ position: p }) {
  const units = p.units != null ? `${p.units.toLocaleString('de-DE', { maximumFractionDigits: 4 })} ${p.units === 1 ? 'unit' : 'units'}` : null
  const kind = KINDS[p.kind] ?? (p.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : null)
  return (
    <li className="flex items-center gap-3 rounded-[22px] bg-card p-4">
      <PositionLogo position={p} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-bold">{p.name}</span>
        <span className="tabular block truncate text-xs text-muted">{[p.ticker, units, kind].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block font-display text-base font-bold">{formatCents(p.value_cents)}</span>
        <span className={`tabular block text-xs font-semibold ${p.gain_cents < 0 ? 'text-loss' : 'text-gain'}`}>
          {signedWhole(p.gain_cents)} · {percent(p.gain_rate)}
        </span>
      </span>
    </li>
  )
}

// getquin's logo on a white tile, else the ticker on a teal tile
function PositionLogo({ position }) {
  const [broken, setBroken] = useState(false)
  if (position.logo && !broken) {
    return (
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_var(--color-line)]">
        <img src={position.logo} alt="" className="size-9 object-contain" onError={() => setBroken(true)} />
      </span>
    )
  }
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-teal text-sm font-bold text-white">
      {(position.ticker || position.name).slice(0, 3).toUpperCase()}
    </span>
  )
}

export function LinkSheet({ link, onClose, onSaved }) {
  const [value, setValue] = useState(link ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(url) {
    setBusy(true)
    setError(null)
    try {
      await saveGetquinLink(url)
      onSaved(url)
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  function submit(e) {
    e.preventDefault()
    const url = cleanGetquinLink(value)
    if (!url) return setError('Paste your getquin share link, like getqu.in/AbC123.')
    save(url)
  }

  return (
    <Sheet title="getquin link" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 pt-1">
        <p className="text-sm text-muted">In getquin, share your portfolio and copy the link. LynxOS reads it each time you open Investments.</p>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://getqu.in/…"
          inputMode="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-teal"
        />
        {error && <p className="text-sm text-loss">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-2xl bg-teal py-4 text-base font-semibold text-white active:opacity-80 disabled:opacity-50">
          Save
        </button>
        {link && (
          <button type="button" disabled={busy} onClick={() => save(null)} className="w-full py-2 text-sm font-semibold text-loss disabled:opacity-50">
            Disconnect getquin
          </button>
        )}
      </form>
    </Sheet>
  )
}

function Fact({ label, value, divider }) {
  return (
    <div className={`px-3.5 py-2.5 ${divider ? 'border-l border-white/15' : ''}`}>
      <span className="block text-[11px] font-semibold text-white/70">{label}</span>
      <span className="tabular block truncate font-display text-[17px] font-bold">{value}</span>
    </div>
  )
}

// One bar per month: how much went into the investment accounts
function InvestChart({ flow }) {
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 150
  const top = 18
  const bottom = 22
  const colW = W / flow.length
  const barW = 26
  const max = Math.max(1, ...flow.map((d) => d.cents))
  const base = H - bottom
  const done = flow.filter((d) => !d.partial)
  const average = done.length ? done.reduce((s, d) => s + d.cents, 0) / done.length : 0
  const p = picked === null ? null : flow[picked]

  return (
    <section className="rounded-[24px] bg-gradient-to-br from-teal-from to-teal-to px-4 pt-3.5 pb-3 shadow-[0_16px_30px_-22px_rgba(12,133,153,0.7)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-muted">
          <Icon name="invest" size={15} strokeWidth={2.2} className="shrink-0 text-teal" />
          Put in · last 6 months
        </p>
        {average > 0 && (
          <span className="tabular shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-bold text-teal">avg {whole(Math.round(average))} / month</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Money invested each month">
        <line x1="0" x2={W} y1={base} y2={base} strokeWidth="1" stroke="var(--color-ink)" strokeOpacity=".15" />
        {flow.map((d, i) => {
          const x = i * colW + (colW - barW) / 2
          const h = d.cents > 0 ? Math.max(4, (d.cents / max) * (base - top)) : 0
          return (
            <g key={d.key} onClick={() => setPicked(i)} className="cursor-pointer">
              <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
              {h > 0 && <rect x={x} y={base - h} width={barW} height={h} rx="7" fill="var(--color-teal)" opacity={d.partial ? 0.45 : 1} />}
              {d.cents > 0 && (
                <text x={x + barW / 2} y={base - h - 5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-ink)">
                  {Math.round(d.cents / 100)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight={picked === i ? '700' : '400'}
                className={picked === i ? 'fill-ink' : 'fill-muted'}
              >
                {shortMonth(d.key)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-1 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {shortMonth(p.key)}
            {p.partial && ' (so far)'}: <span className="tabular font-semibold text-ink">{formatCents(p.cents)}</span>
          </>
        ) : (
          'Tap a bar for details'
        )}
      </p>
    </section>
  )
}
