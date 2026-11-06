import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FullEmpty } from '../components/EmptyLynx'
import FullPage from '../components/FullPage'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { todayISO } from '../lib/dates'
import { cachedUsdRate, cashEntries, cashTotal, CURRENCIES, fetchUsdRate, formatIn, toEuroCents, updatedText, withAmount } from '../lib/cash'
import { cachedPortfolio, cleanGetquinLink, fetchPortfolio, forgetPortfolio } from '../lib/getquin'
import { centsToPad, formatCents, formatTyping, PAD_KEYS, parseToCents, pressKey } from '../lib/money'
import { allocation, lisbonDay, periodChange, PERIODS, seriesFor, todayMoves } from '../lib/portfolio'
import { fetchProfile, saveBrokerCash, saveGetquinLink } from '../lib/profile'

// Investments → Portfolio: the getquin portfolio (read through api/getquin.js each time the page opens) and
// the cash at the brokers. Value card with a chart per period, four tiles, today's best and worst,
// allocation, and Positions · Activity · Closed (10 each, the rest on a full page).

// ───────── formatting ─────────
const whole = (cents) => formatCents(cents).replace(/,\d\d$/, '')
const signed = (cents, decimals = false) => {
  const text = decimals ? formatCents(Math.abs(cents)) : whole(Math.abs(cents))
  return `${cents < 0 ? '−' : '+'}${text}`
}
const percent = (rate) => `${rate < 0 ? '−' : '+'}${Math.abs(rate * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const arrow = (n) => (n < 0 ? '▼' : '▲')
const number = (n, digits = 4) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: digits })
const inCurrency = (amount, currency) => `${currency === 'USD' ? '$' : '€'}${Number(amount).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const MONTH = (iso, year) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) }).replace('Sept', 'Sep')
const dayLabel = (iso) => MONTH(iso, iso.slice(0, 4) !== todayISO().slice(0, 4))
const shortName = (name = '') =>
  name
    .replace(/ (UCITS )?ETF.*$/i, ' ETF')
    .replace(/^iShares Core /, 'iShares ')
    .replace(/ Class [A-C]$/, '')
    .replace(/,? Inc\.?$/, '')
    .replace(/ (Platforms|Holdings|Technologies)$/, '')
const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' })

export const KIND_COLORS = { etf: '#1f4fe0', stock: '#6a8dff', crypto: '#f0a020', bond: '#0c8599', fund: '#0f8a5f', other: '#7c4dff', cash: '#9fb6f5' }
const KIND_ONE = { etf: 'ETF', stock: 'Stock', crypto: 'Crypto', bond: 'Bond', fund: 'Fund' }

// ───────── the top-bar refresh pill ─────────
// The page tells the top-bar button (next to the profile photo) when getquin's numbers are from and how to refresh them
let status = { time: null, refreshing: false, error: false, refresh: null }
const listeners = new Set()
function setStatus(patch) {
  status = { ...status, ...patch }
  listeners.forEach((listener) => listener(status))
}

// Top bar on Investments → Portfolio: "11:16" and a refresh icon; tap to fetch from getquin again
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
      <span className="grid size-7 place-items-center rounded-full bg-bubble text-cobalt">
        <Icon name="refresh" size={15} strokeWidth={2.4} className={s.refreshing ? 'animate-spin' : ''} />
      </span>
    </button>
  )
}

// ───────── the page ─────────
export default function Portfolio() {
  const [link, setLink] = useState(undefined) // getquin share link; null = not linked, undefined = loading
  const [portfolio, setPortfolio] = useState(null)
  const [portfolioError, setPortfolioError] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [editingLink, setEditingLink] = useState(false)
  const [cash, setCash] = useState([])
  const [rate, setRate] = useState(() => cachedUsdRate()) // { rate, date }: euros per dollar
  const [range, setRange] = useState('ALL')
  const [list, setList] = useState('positions')
  const [allocOpen, setAllocOpen] = useState(null)
  const [page, setPage] = useState(null) // { kind: 'all', list } | { kind: 'position', position }
  const [cashSheet, setCashSheet] = useState(null) // 'list' | entry | 'new'
  const listRef = useRef(null)

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

  useEffect(() => {
    const t = portfolio?.updated_at ? time(portfolio.updated_at) : null
    setStatus({ time: t, refreshing, error: !!portfolioError, refresh: link ? () => refresh(link) : null })
  }, [portfolio, refreshing, portfolioError, link, refresh])
  useEffect(() => () => setStatus({ refresh: null }), [])

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        const url = p?.answers?.getquinUrl ?? null
        setCash(cashEntries(p))
        setLink(url)
        refresh(url)
      })
      .catch(() => setLink(null))
    fetchUsdRate()
      .then(setRate)
      .catch(() => {}) // The last rate on this phone stays
  }, [refresh])

  const cashCents = cashTotal(cash, rate?.rate)
  const groups = useMemo(() => allocation(portfolio?.positions ?? [], cashCents), [portfolio, cashCents])

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
      <>
        <FullEmpty title="No investments yet">
          <button onClick={() => setEditingLink(true)} className="rounded-full bg-cobalt px-6 py-3 text-[15px] font-semibold text-white active:opacity-80">
            Connect getquin
          </button>
        </FullEmpty>
        {linkSheet}
      </>
    )
  }

  async function saveCash(next) {
    await saveBrokerCash(next)
    setCash(next)
    setCashSheet('list')
  }

  const showList = (name) => {
    setList(name)
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-3.5">
      <ValueCard portfolio={portfolio} cashCents={cashCents} range={range} onRange={setRange} error={portfolioError} />
      {portfolio && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile icon="coins" color="#0f8a5f" label="Dividends" value={formatCents(portfolio.dividends_cents ?? 0)} />
            <Tile icon="wallet" color="#e39b12" label="Cash" value={formatCents(cashCents)} badge="pencil" onClick={() => setCashSheet('list')} />
            {portfolio.realized_cents != null && (
              <Tile
                icon="invest"
                color="#1f4fe0"
                label="Realized profit"
                value={signed(portfolio.realized_cents, true)}
                valueClass={portfolio.realized_cents < 0 ? 'text-loss' : 'text-gain'}
                badge="chevronRight"
                onClick={() => showList('closed')}
              />
            )}
            <Tile icon="layers" color="#6a4cf0" label="Positions" value={String(portfolio.positions.length)} badge="chevronRight" onClick={() => showList('positions')} />
          </div>

          {portfolio.positions.some((p) => p.day_rate != null) && (
            <Today positions={portfolio.positions} onOpen={(p) => setPage({ kind: 'position', position: p })} />
          )}

          <h2 className="px-1 pt-1 font-display text-lg font-bold">Allocation</h2>
          <Allocation
            groups={groups}
            open={allocOpen}
            onToggle={(k) => setAllocOpen((o) => (o === k ? null : k))}
            onOpen={(p) => setPage({ kind: 'position', position: p })}
            cash={cash}
            cashCents={cashCents}
            rate={rate}
            onCash={(e) => setCashSheet(e ?? 'list')}
          />

          <div ref={listRef} className="scroll-mt-20 pt-1">
            <ListSwitch list={list} onChange={setList} portfolio={portfolio} />
          </div>
          <ListPreview list={list} portfolio={portfolio} onOpen={(p) => setPage({ kind: 'position', position: p })} onAll={() => setPage({ kind: 'all', list })} />
        </>
      )}
      {!portfolio && portfolioError && <p className="rounded-[22px] bg-card px-4 py-6 text-center text-muted">Couldn’t load your portfolio: {portfolioError}</p>}

      {page?.kind === 'all' && (
        <AllPage list={page.list} portfolio={portfolio} onClose={() => setPage(null)} onOpen={(p) => setPage({ kind: 'position', position: p, back: page })} />
      )}
      {page?.kind === 'position' && <PositionPage position={page.position} portfolio={portfolio} total={portfolio.value_cents + cashCents} onClose={() => setPage(page.back ?? null)} />}

      {cashSheet === 'list' && <CashListSheet entries={cash} totalCents={cashCents} rate={rate} onClose={() => setCashSheet(null)} onOpen={setCashSheet} />}
      {cashSheet && cashSheet !== 'list' && (
        <CashSheet
          entry={cashSheet === 'new' ? null : cashSheet}
          rate={rate}
          onClose={() => setCashSheet('list')}
          onSave={(entry) => saveCash(cashSheet === 'new' ? [...cash, entry] : cash.map((e) => (e.id === entry.id ? entry : e)))}
          onDelete={() => saveCash(cash.filter((e) => e.id !== cashSheet.id))}
        />
      )}
    </div>
  )
}

// ───────── value card ─────────
// Value = getquin's positions + your cash at the brokers. The gain is the positions' only (cash isn't profit).
function ValueCard({ portfolio, cashCents, range, onRange, error }) {
  if (!portfolio) {
    return (
      <section className="rounded-[24px] bg-card p-[18px]">
        <p className="text-sm font-semibold text-muted">Portfolio value</p>
        <p className="mt-2 text-sm text-muted">{error ? 'Couldn’t reach getquin right now.' : 'Checking getquin…'}</p>
      </section>
    )
  }
  const available = PERIODS.filter((p) => p.key === 'ALL' || seriesFor(portfolio, p.key))
  const key = available.some((p) => p.key === range) ? range : 'ALL'
  const change = periodChange(portfolio, key)
  const points = seriesFor(portfolio, key)
  const [euros, decimals] = formatCents(portfolio.value_cents + cashCents).split(',')
  const down = change && change.cents < 0
  return (
    <section className="rounded-[24px] bg-card p-[18px] pb-3.5">
      <p className="text-[13.5px] font-semibold text-muted">Portfolio value</p>
      <p className="tabular mt-1 font-display leading-none font-bold">
        <span className="text-[40px] tracking-tight">{euros}</span>
        <span className="text-[21px] text-muted/60">,{decimals}</span>
      </p>
      {change && (
        <div className="mt-2.5 flex items-center gap-2">
          <span className={`tabular rounded-full px-2.5 py-1 text-[13px] font-extrabold ${down ? 'bg-loss/10 text-loss' : 'bg-gain/12 text-gain'}`}>
            {arrow(change.cents)} {signed(change.cents, true)} · {percent(change.rate)}
          </span>
          <span className="text-[13px] font-semibold text-muted">{PERIODS.find((p) => p.key === key).label}</span>
        </div>
      )}
      {points && points.length > 1 && <ValueChart points={points} intraday={key === '1D'} down={down} />}
      <div className="mt-2.5 flex gap-1 rounded-full bg-paper p-[3px]" role="tablist">
        {PERIODS.map((p) => {
          const on = p.key === key
          const ok = available.includes(p)
          return (
            <button
              key={p.key}
              role="tab"
              aria-selected={on}
              disabled={!ok}
              onClick={() => onRange(p.key)}
              className={`flex-1 rounded-full py-[7px] text-[13px] font-bold transition disabled:opacity-30 ${
                on ? 'bg-cobalt text-white shadow-[0_4px_10px_-5px_rgba(31,79,224,0.8)]' : 'text-muted'
              }`}
            >
              {p.key}
            </button>
          )
        })}
      </div>
    </section>
  )
}

// The value over the period; touch or drag to read a point
function ValueChart({ points, intraday, down }) {
  const [picked, setPicked] = useState(null)
  const ref = useRef(null)
  const W = 354
  const H = 150
  const values = points.map((p) => p[1])
  const min = Math.min(...values)
  const range = Math.max(...values) - min || 1
  const xy = points.map((p, i) => [(i / (points.length - 1)) * W, H - 10 - ((p[1] - min) / range) * (H - 26)])
  const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('')
  const color = down ? 'var(--color-loss)' : 'var(--color-cobalt)'
  const dot = xy[picked ?? xy.length - 1]
  const pick = (e) => {
    const box = ref.current.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width))
    setPicked(Math.round(x * (points.length - 1)))
  }
  const p = picked != null ? points[picked] : null
  return (
    <div
      ref={ref}
      className="relative -mx-1 mt-3 touch-none select-none"
      onPointerDown={pick}
      onPointerMove={(e) => (e.pointerType === 'mouse' && e.buttons === 0 ? null : pick(e))}
      onPointerUp={() => setPicked(null)}
      onPointerLeave={() => setPicked(null)}
      onPointerCancel={() => setPicked(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-[150px] w-full overflow-visible" preserveAspectRatio="none" role="img" aria-label="Portfolio value over time">
        <defs>
          <linearGradient id="pf-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".2" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={xy[0][1]} y2={xy[0][1]} stroke="var(--color-line)" strokeDasharray="3 5" vectorEffect="non-scaling-stroke" />
        <path d={`${line}L${W},${H}L0,${H}Z`} fill="url(#pf-fill)" />
        <path d={line} fill="none" stroke={color} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {p && <line x1={dot[0]} x2={dot[0]} y1="0" y2={H} stroke={color} strokeOpacity=".35" vectorEffect="non-scaling-stroke" />}
      </svg>
      <span
        className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card"
        style={{ left: `${(dot[0] / W) * 100}%`, top: dot[1], background: color }}
      />
      {p && (
        <span
          className="tabular pointer-events-none absolute -top-1 -translate-x-1/2 rounded-lg bg-ink px-2 py-1 text-xs font-bold whitespace-nowrap text-paper"
          style={{ left: `${Math.min(86, Math.max(14, (dot[0] / W) * 100))}%` }}
        >
          {intraday ? time(p[0]) : dayLabel(lisbonDay(p[0]))} · {formatCents(p[1])}
        </span>
      )}
    </div>
  )
}

// ───────── tiles ─────────
function Tile({ icon, color, label, value, valueClass = '', badge, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={`relative flex items-center gap-3 rounded-[20px] bg-card px-3.5 py-3 text-left ${onClick ? 'active:scale-[.98]' : ''}`}>
      <span className="grid size-[38px] shrink-0 place-items-center rounded-xl text-white" style={{ background: color }}>
        <Icon name={icon} size={19} strokeWidth={2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-semibold text-muted">{label}</span>
        <span className={`tabular block truncate font-display text-[17px] leading-tight font-bold ${valueClass}`}>{value}</span>
      </span>
      {badge && <Icon name={badge} size={14} className="absolute top-3 right-3 text-muted/50" />}
    </Tag>
  )
}

// ───────── today ─────────
function Today({ positions, onOpen }) {
  const t = todayMoves(positions)
  const row = (p) => (
    <button key={p.ticker + p.name} onClick={() => onOpen(p)} className="flex w-full items-center gap-2 border-t border-line py-[7px] text-left first:border-t-0">
      <Logo item={p} small />
      <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.ticker || shortName(p.name)}</span>
      <span className={`tabular text-[13px] font-extrabold ${p.day_rate < 0 ? 'text-loss' : 'text-gain'}`}>{percent(p.day_rate)}</span>
    </button>
  )
  return (
    <>
      <div className="flex items-baseline justify-between px-1 pt-1">
        <h2 className="font-display text-lg font-bold">Today</h2>
        <span className={`tabular text-[13px] font-extrabold ${t.cents < 0 ? 'text-loss' : 'text-gain'}`}>
          {arrow(t.cents)} {signed(t.cents, true)} · {percent(t.rate)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-[20px] bg-card px-3 pt-3 pb-1.5">
          <p className="mb-1 text-[12.5px] font-bold text-muted">
            <span className="text-gain">▲</span> Best
          </p>
          {t.best.map(row)}
        </div>
        <div className="rounded-[20px] bg-card px-3 pt-3 pb-1.5">
          <p className="mb-1 text-[12.5px] font-bold text-muted">
            <span className="text-loss">▼</span> Worst
          </p>
          {t.worst.map(row)}
        </div>
      </div>
    </>
  )
}

// ───────── allocation ─────────
function Allocation({ groups, open, onToggle, onOpen, cash, cashCents, rate, onCash }) {
  const total = groups.reduce((s, g) => s + g.cents, 0)
  const picked = groups.find((g) => g.kind === open)
  const R = 62
  const C = 2 * Math.PI * R
  let at = 0
  return (
    <section className="rounded-[24px] bg-card p-3.5">
      <div className="flex items-center gap-3.5">
        <svg viewBox="0 0 160 160" className="size-[150px] shrink-0 overflow-visible" role="img" aria-label="Allocation">
          {groups.map((g) => {
            const len = (g.cents / (total || 1)) * C
            const el = (
              <circle
                key={g.kind}
                cx="80"
                cy="80"
                r={R}
                fill="none"
                stroke={KIND_COLORS[g.kind]}
                strokeWidth={open === g.kind ? 24 : 18}
                strokeDasharray={`${Math.max(0, len - 3)} ${C}`}
                strokeDashoffset={-at}
                transform="rotate(-90 80 80)"
                opacity={!open || open === g.kind ? 1 : 0.25}
                className="cursor-pointer transition-all"
                onClick={() => onToggle(g.kind)}
              />
            )
            at += len
            return el
          })}
          <text x="80" y="75" textAnchor="middle" fontSize="12" fontWeight="700" className="fill-muted">
            {picked ? picked.label : 'Total'}
          </text>
          <text x="80" y="96" textAnchor="middle" fontSize="19" fontWeight="700" className="fill-ink font-display">
            {whole(picked ? picked.cents : total)}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          {groups.map((g) => (
            <button
              key={g.kind}
              onClick={() => onToggle(g.kind)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${open === g.kind ? 'bg-paper' : open ? 'opacity-45' : ''}`}
            >
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: KIND_COLORS[g.kind] }} />
              <span className="flex-1 truncate text-[14.5px] font-semibold">{g.label}</span>
              <span className="tabular font-display text-[14.5px] font-bold">{Math.round(g.share * 100)}%</span>
            </button>
          ))}
        </div>
      </div>
      {picked && picked.kind !== 'cash' && (
        <div className="mt-2.5 border-t border-line pt-2">
          <div className="flex justify-between py-0.5 text-[13px] text-muted">
            <b className="text-ink">
              {picked.label} · {picked.positions.length}
            </b>
            <span className="tabular">{whole(picked.cents)}</span>
          </div>
          {picked.positions.map((p) => (
            <button key={p.ticker + p.name} onClick={() => onOpen(p)} className="flex w-full items-center gap-2.5 py-[7px] text-left">
              <Logo item={p} small />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{shortName(p.name)}</span>
              <span className="h-1.5 w-[60px] overflow-hidden rounded-full bg-paper">
                <span className="block h-full rounded-full" style={{ width: `${(p.value_cents / picked.cents) * 100}%`, background: KIND_COLORS[picked.kind] }} />
              </span>
              <span className="tabular w-10 text-right text-[12.5px] font-bold text-muted">{Math.round((p.value_cents / picked.cents) * 100)}%</span>
            </button>
          ))}
        </div>
      )}
      {picked?.kind === 'cash' && <CashDrop entries={cash} totalCents={cashCents} rate={rate} onEdit={onCash} />}
    </section>
  )
}

// € / $ badge
const CURRENCY_LOOK = {
  EUR: 'linear-gradient(135deg,#3d6cff,#1638a8)',
  USD: 'linear-gradient(135deg,#1fb37a,#0b7a52)',
}
function CurrencyBadge({ currency, big }) {
  return (
    <span
      className={`grid shrink-0 place-items-center font-display font-extrabold text-white shadow-[0_6px_14px_-8px_rgba(11,27,69,0.6)] ${
        big ? 'size-14 rounded-[18px] text-[26px]' : 'size-[42px] rounded-[14px] text-[19px]'
      }`}
      style={{ background: CURRENCY_LOOK[currency] }}
    >
      {CURRENCIES[currency].symbol}
    </span>
  )
}

function CashCards({ entries, totalCents, rate, onOpen, onCard = 'bg-paper' }) {
  return (
    <div className="space-y-2">
      {entries.map((e) => {
        const euros = toEuroCents(e.cents, e.currency, rate?.rate)
        return (
          <button key={e.id} onClick={() => onOpen(e)} className={`flex w-full items-center gap-3 rounded-[18px] ${onCard} p-3 text-left active:scale-[.99]`}>
            <CurrencyBadge currency={e.currency} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-bold">{e.name || CURRENCIES[e.currency].label}</span>
              <span className="block truncate text-xs font-semibold text-muted">
                {[e.currency, updatedText(e)?.replace(/^Updated/, 'updated')].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="shrink-0 text-right">
              <span className="tabular block font-display text-base font-bold">{formatIn(e.cents, e.currency)}</span>
              <span className="tabular block text-xs font-semibold text-muted">
                {e.currency === 'USD' ? (rate ? `≈ ${formatCents(euros)}` : 'No rate yet') : `${totalCents > 0 ? Math.round((euros / totalCents) * 100) : 0}% of cash`}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

const rateLine = (rate) => `1 € = ${(1 / rate.rate).toLocaleString('de-DE', { maximumFractionDigits: 2 })} $ · ECB rate`

// Cash inside the allocation card: total, Edit, a bar of each currency's share and its cards
function CashDrop({ entries, totalCents, rate, onEdit }) {
  return (
    <div className="mt-2.5 border-t border-line pt-2.5">
      <div className="flex items-center justify-between pb-2.5">
        <div>
          <p className="text-[12.5px] font-bold text-muted">Cash at the brokers</p>
          <p className="tabular font-display text-xl font-bold">{formatCents(totalCents)}</p>
        </div>
        <button onClick={() => onEdit(null)} className="flex items-center gap-1.5 rounded-full bg-bubble px-3 py-[7px] text-[13px] font-bold text-cobalt">
          <Icon name="pencil" size={14} /> Edit
        </button>
      </div>
      {entries.length > 1 && (
        <div className="mb-2.5 flex h-2 gap-[3px] overflow-hidden rounded-full">
          {entries.map((e) => (
            <span key={e.id} style={{ flex: toEuroCents(e.cents, e.currency, rate?.rate) || 0.0001, background: CURRENCY_LOOK[e.currency] }} />
          ))}
        </div>
      )}
      <CashCards entries={entries} totalCents={totalCents} rate={rate} onOpen={onEdit} />
      {entries.some((e) => e.currency === 'USD') && rate && <p className="tabular mt-2.5 text-center text-xs font-semibold text-muted">{rateLine(rate)}</p>}
    </div>
  )
}

// ───────── Positions · Activity · Closed ─────────
const PREVIEW = 10
function ListSwitch({ list, onChange, portfolio }) {
  const tabs = [
    { value: 'positions', label: 'Positions', count: portfolio.positions.length },
    { value: 'activity', label: 'Activity', count: portfolio.activity?.length },
    { value: 'closed', label: 'Closed', count: portfolio.closed?.length },
  ].filter((t) => t.count != null)
  return (
    <div className="flex gap-1 rounded-full bg-line/60 p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={list === t.value}
          onClick={() => onChange(t.value)}
          className={`flex-1 rounded-full py-2 text-sm font-bold transition ${list === t.value ? 'bg-card text-ink shadow-[0_3px_10px_-6px_rgba(11,27,69,0.4)]' : 'text-muted'}`}
        >
          {t.label}
          <span className="tabular ml-1 text-xs opacity-60">{t.count}</span>
        </button>
      ))}
    </div>
  )
}

function ListPreview({ list, portfolio, onOpen, onAll }) {
  const items = list === 'activity' ? (portfolio.activity ?? []) : list === 'closed' ? (portfolio.closed ?? []) : portfolio.positions
  if (!items.length) return <p className="rounded-[22px] bg-card px-4 py-6 text-center text-muted">{list === 'closed' ? 'Nothing sold yet' : 'Nothing here yet'}</p>
  return (
    <div className="overflow-hidden rounded-[22px] bg-card">
      {items.slice(0, PREVIEW).map((item, i) =>
        list === 'activity' ? (
          <ActivityRow key={i} trade={item} withDate />
        ) : list === 'closed' ? (
          <ClosedRow key={item.isin ?? i} position={item} />
        ) : (
          <PositionRow key={item.ticker + item.name} position={item} onOpen={onOpen} />
        ),
      )}
      {items.length > PREVIEW && (
        <button onClick={onAll} className="flex w-full items-center justify-center gap-1.5 border-t border-line py-3.5 text-[14.5px] font-bold text-cobalt">
          See all {items.length} <Icon name="chevronRight" size={16} />
        </button>
      )}
    </div>
  )
}

const rowClass = 'flex w-full items-center gap-3 border-t border-line px-3.5 py-[11px] text-left first:border-t-0'

function PositionRow({ position: p, onOpen, today }) {
  const units = p.units != null ? `${number(p.units)} ${p.kind === 'crypto' ? p.ticker : p.units === 1 ? 'unit' : 'units'}` : null
  return (
    <button onClick={() => onOpen(p)} className={rowClass}>
      <Logo item={p} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{shortName(p.name)}</span>
        <span className="tabular block truncate text-[12.5px] text-muted">{[p.ticker, units].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className="tabular block font-display text-[15px] font-bold">{formatCents(p.value_cents)}</span>
        {today ? (
          <span className={`tabular block text-[12.5px] font-bold ${p.day_rate < 0 ? 'text-loss' : 'text-gain'}`}>
            {signed(p.day_cents ?? 0, true)} · {percent(p.day_rate ?? 0)}
          </span>
        ) : (
          <span className={`tabular block text-[12.5px] font-bold ${p.gain_cents < 0 ? 'text-loss' : 'text-gain'}`}>
            {signed(p.gain_cents)} · {percent(p.gain_rate)}
          </span>
        )}
      </span>
    </button>
  )
}

const TRADE = {
  buy: { word: 'Bought', tag: 'BUY', look: 'bg-bubble text-cobalt' },
  sell: { word: 'Sold', tag: 'SELL', look: 'bg-warn-bg text-warn' },
  reward: { word: 'Reward', tag: 'STAKING', look: 'bg-violet/12 text-violet' },
  dividend: { word: 'Dividend', tag: 'DIV', look: 'bg-gain/12 text-gain' },
}
function ActivityRow({ trade: t, withDate }) {
  const k = TRADE[t.type] ?? TRADE.buy
  const detail = t.type === 'dividend' ? shortName(t.name) : `${number(t.units, 5)} × ${inCurrency(t.price, t.currency)}`
  return (
    <div className={rowClass}>
      <Logo item={t} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[15px] font-semibold">
          {k.word} {t.ticker}
          <span className={`rounded-md px-1.5 py-px text-[10.5px] font-extrabold ${k.look}`}>{k.tag}</span>
        </span>
        <span className="tabular block truncate text-[12.5px] text-muted">
          {withDate && `${dayLabel(t.date)} · `}
          {detail}
        </span>
      </span>
      <span className={`tabular shrink-0 font-display text-[15px] font-bold ${t.type === 'buy' ? '' : 'text-gain'}`}>
        {t.type === 'buy' ? '' : '+'}
        {formatCents(t.cents)}
      </span>
    </div>
  )
}

function ClosedRow({ position: p }) {
  return (
    <div className={rowClass}>
      <Logo item={p} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{shortName(p.name)}</span>
        <span className="tabular block truncate text-[12.5px] text-muted">
          {p.opened && p.closed ? `${dayLabel(p.opened)} → ${dayLabel(p.closed)}` : 'Sold'}
          {p.trades ? ` · ${p.trades} trades` : ''}
        </span>
      </span>
      <span className={`shrink-0 text-right ${p.realized_cents < 0 ? 'text-loss' : 'text-gain'}`}>
        <span className="tabular block font-display text-[15px] font-bold">{signed(p.realized_cents, true)}</span>
        <span className="tabular block text-[12.5px] font-bold">{percent(p.realized_rate)}</span>
      </span>
    </div>
  )
}

// getquin's logo on a white tile, else the ticker
function Logo({ item, small }) {
  const [broken, setBroken] = useState(false)
  const size = small ? 'size-8 rounded-[10px]' : 'size-10 rounded-[13px]'
  if (item.logo && !broken) {
    return (
      <span className={`grid ${size} shrink-0 place-items-center overflow-hidden bg-white shadow-[0_0_0_1px_var(--color-line)]`}>
        <img src={item.logo} alt="" className={small ? 'size-6 object-contain' : 'size-[30px] object-contain'} onError={() => setBroken(true)} />
      </span>
    )
  }
  return (
    <span className={`grid ${size} shrink-0 place-items-center bg-bubble text-[11px] font-extrabold text-cobalt`}>
      {(item.ticker || item.name || '?').slice(0, 3).toUpperCase()}
    </span>
  )
}

// ───────── full pages ─────────
function Chips({ options, value, onChange }) {
  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
      {options.map(([k, label]) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-bold ${value === k ? 'bg-ink text-paper' : 'bg-card text-muted'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const ACTIVITY_PAGE = 50
function AllPage({ list, portfolio, onClose, onOpen }) {
  const [sort, setSort] = useState('value')
  const [type, setType] = useState('all')
  const [shown, setShown] = useState(ACTIVITY_PAGE)
  const end = useRef(null)
  const trades = (portfolio.activity ?? []).filter((t) => type === 'all' || t.type === type)
  const more = list === 'activity' && trades.length > shown

  // Activity: the next 50 appear as you scroll near the end
  useEffect(() => {
    if (!more || !end.current) return
    const watch = new IntersectionObserver((seen) => seen[0].isIntersecting && setShown((n) => n + ACTIVITY_PAGE), { rootMargin: '600px 0px' })
    watch.observe(end.current)
    return () => watch.disconnect()
  }, [more, shown])

  if (list === 'positions') {
    const by = { value: (a, b) => b.value_cents - a.value_cents, gain: (a, b) => b.gain_rate - a.gain_rate, today: (a, b) => (b.day_rate ?? 0) - (a.day_rate ?? 0) }
    return (
      <FullPage title={`Positions · ${portfolio.positions.length}`} onClose={onClose}>
        <Chips
          options={[
            ['value', 'Value'],
            ['gain', 'Gain'],
            ['today', 'Today'],
          ]}
          value={sort}
          onChange={setSort}
        />
        <div className="overflow-hidden rounded-[22px] bg-card">
          {[...portfolio.positions].sort(by[sort]).map((p) => (
            <PositionRow key={p.ticker + p.name} position={p} onOpen={onOpen} today={sort === 'today'} />
          ))}
        </div>
      </FullPage>
    )
  }

  if (list === 'closed') {
    return (
      <FullPage title={`Closed · ${portfolio.closed.length}`} onClose={onClose}>
        <div className="rounded-[22px] bg-card px-4 py-3.5">
          <p className="text-[13.5px] font-semibold text-muted">Realized profit</p>
          <p className={`tabular font-display text-[26px] font-bold ${portfolio.realized_cents < 0 ? 'text-loss' : 'text-gain'}`}>{signed(portfolio.realized_cents, true)}</p>
        </div>
        <div className="overflow-hidden rounded-[22px] bg-card">
          {portfolio.closed.map((p, i) => (
            <ClosedRow key={p.isin ?? i} position={p} />
          ))}
        </div>
      </FullPage>
    )
  }

  // Activity, grouped by month
  const months = []
  for (const t of trades.slice(0, shown)) {
    const key = t.date.slice(0, 7)
    if (months.at(-1)?.key !== key) months.push({ key, trades: [] })
    months.at(-1).trades.push(t)
  }
  return (
    <FullPage title={`Activity · ${portfolio.activity.length}`} onClose={onClose}>
      <Chips
        options={[
          ['all', 'All'],
          ['buy', 'Buys'],
          ['sell', 'Sells'],
          ['reward', 'Rewards'],
          ['dividend', 'Dividends'],
        ]}
        value={type}
        onChange={(t) => {
          setType(t)
          setShown(ACTIVITY_PAGE)
        }}
      />
      {months.map((m) => {
        const put = m.trades.reduce((s, t) => s + (t.type === 'buy' ? t.cents : t.type === 'sell' ? -t.cents : 0), 0)
        return (
          <div key={m.key}>
            <div className="flex justify-between px-1.5 pt-2 pb-1.5 text-xs font-extrabold tracking-[.06em] text-muted uppercase">
              <span>{new Date(`${m.key}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>
              <span className="tabular tracking-normal normal-case">
                {m.trades.length}
                {put ? ` · put in ${whole(put)}` : ''}
              </span>
            </div>
            <div className="overflow-hidden rounded-[22px] bg-card">
              {m.trades.map((t, i) => (
                <ActivityRow key={i} trade={t} withDate />
              ))}
            </div>
          </div>
        )
      })}
      {!trades.length && <p className="rounded-[22px] bg-card px-4 py-6 text-center text-muted">Nothing here yet</p>}
      {more && (
        <p ref={end} className="py-3 text-center text-[13px] font-semibold text-muted">
          Loading more…
        </p>
      )}
    </FullPage>
  )
}

function PositionPage({ position: p, portfolio, total, onClose }) {
  const trades = (portfolio.activity ?? []).filter((t) => t.isin && t.isin === p.isin)
  const kind = KIND_ONE[p.kind] ?? (p.kind ? p.kind[0].toUpperCase() + p.kind.slice(1) : null)
  const avg = p.units ? p.invested_cents / p.units / 100 : null
  const facts = [
    ['Units', p.units != null ? number(p.units, 5) : '—'],
    ['Share of portfolio', total ? `${((p.value_cents / total) * 100).toLocaleString('de-DE', { maximumFractionDigits: 1 })}%` : '—'],
    ['Average buy price', avg ? inCurrency(avg, 'EUR') : '—'],
    ['Price now', p.price != null ? inCurrency(p.price, p.currency) : '—'],
    ['Invested', formatCents(p.invested_cents)],
    ['Realized', p.realized_cents ? signed(p.realized_cents, true) : '—'],
  ]
  return (
    <FullPage title={p.ticker || shortName(p.name)} onClose={onClose}>
      <section className="rounded-[24px] bg-card p-[18px]">
        <div className="flex items-center gap-3">
          <Logo item={p} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold">{shortName(p.name)}</p>
            <p className="text-[13px] font-semibold text-muted">{[kind, p.opened && `since ${dayLabel(p.opened)}`].filter(Boolean).join(' · ')}</p>
          </div>
        </div>
        <p className="tabular mt-3 font-display text-[40px] leading-none font-bold tracking-tight">
          {formatCents(p.value_cents).split(',')[0]}
          <span className="text-[21px] text-muted/60">,{formatCents(p.value_cents).split(',')[1]}</span>
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className={`tabular rounded-full px-2.5 py-1 text-[13px] font-extrabold ${p.gain_cents < 0 ? 'bg-loss/10 text-loss' : 'bg-gain/12 text-gain'}`}>
            {arrow(p.gain_cents)} {signed(p.gain_cents, true)} · {percent(p.gain_rate)}
          </span>
          <span className="text-[13px] font-semibold text-muted">all time</span>
          {p.day_rate != null && (
            <span className={`tabular ml-auto rounded-full px-2.5 py-1 text-[13px] font-extrabold ${p.day_rate < 0 ? 'bg-loss/10 text-loss' : 'bg-gain/12 text-gain'}`}>
              {percent(p.day_rate)} today
            </span>
          )}
        </div>
      </section>
      <section className="grid grid-cols-2 overflow-hidden rounded-[22px] bg-card">
        {facts.map(([label, value], i) => (
          <div key={label} className={`px-3.5 py-3 ${i % 2 ? '' : 'border-r border-line'} ${i > 1 ? 'border-t border-line' : ''}`}>
            <p className="text-[12.5px] font-semibold text-muted">{label}</p>
            <p className="tabular font-display text-base font-bold">{value}</p>
          </div>
        ))}
      </section>
      {trades.length > 0 && (
        <>
          <div className="flex items-baseline justify-between px-1 pt-1">
            <h3 className="font-display text-lg font-bold">Trades</h3>
            <span className="text-[13px] font-semibold text-muted">{trades.length}</span>
          </div>
          <div className="overflow-hidden rounded-[22px] bg-card">
            {trades.map((t, i) => (
              <ActivityRow key={i} trade={t} withDate />
            ))}
          </div>
        </>
      )}
    </FullPage>
  )
}

// ───────── cash sheets ─────────
function CashListSheet({ entries, totalCents, rate, onClose, onOpen }) {
  return (
    <Sheet title="Cash at the brokers" onClose={onClose}>
      <div className="space-y-3 pb-3">
        <p className="tabular text-sm font-semibold text-muted">{formatCents(totalCents)} in total · counts in your portfolio</p>
        <CashCards entries={entries} totalCents={totalCents} rate={rate} onOpen={onOpen} onCard="bg-card" />
        <button
          onClick={() => onOpen('new')}
          className="w-full rounded-[18px] border-2 border-dashed border-line py-3.5 text-[15px] font-bold text-cobalt active:opacity-70"
        >
          + Add cash
        </button>
        {entries.some((e) => e.currency === 'USD') && rate && <p className="tabular text-center text-xs font-semibold text-muted">{rateLine(rate)}</p>}
      </div>
    </Sheet>
  )
}

// Add or change a cash position: € or $, the amount on the number pad, an optional name
function CashSheet({ entry, rate, onClose, onSave, onDelete }) {
  const [currency, setCurrency] = useState(entry?.currency ?? 'EUR')
  const [amount, setAmount] = useState(entry ? centsToPad(entry.cents) : '')
  const [name, setName] = useState(entry?.name ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const cents = parseToCents(amount || '0') ?? 0
  const symbol = CURRENCIES[currency].symbol

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Sheet title={entry ? 'Edit cash' : 'Add cash'} onClose={onClose}>
      <div className="space-y-3 pb-4">
        <div className="flex flex-col items-center gap-2.5 pt-1">
          <CurrencyBadge currency={currency} big />
          <div className="flex w-44 gap-1 rounded-full bg-line/60 p-1">
            {Object.entries(CURRENCIES).map(([code, c]) => (
              <button
                key={code}
                onClick={() => setCurrency(code)}
                aria-pressed={currency === code}
                className={`flex-1 rounded-full py-1.5 text-sm font-bold ${currency === code ? 'bg-card text-ink shadow-[0_3px_10px_-6px_rgba(11,27,69,0.4)]' : 'text-muted'}`}
              >
                {c.symbol} {code}
              </button>
            ))}
          </div>
          <p className={`tabular truncate font-display text-[42px] leading-tight font-extrabold tracking-tight ${amount ? '' : 'text-muted/40'}`}>
            {symbol}
            {amount ? formatTyping(amount) : '0'}
          </p>
          <p className="tabular -mt-2 min-h-5 text-sm font-semibold text-muted">
            {currency === 'USD' && cents > 0 && (rate ? `≈ ${formatCents(toEuroCents(cents, 'USD', rate.rate))} at today's ECB rate` : 'No exchange rate yet')}
          </p>
        </div>
        <label className="flex items-center gap-3 rounded-2xl bg-card px-4 py-3">
          <span className="font-semibold">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Trade Republic (optional)"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-right text-base outline-none placeholder:text-muted"
          />
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {PAD_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setAmount((a) => pressKey(a, k))}
              className={`grid h-12 place-items-center rounded-2xl font-display text-[22px] font-semibold active:bg-line ${k === '.' || k === 'back' ? '' : 'bg-card'}`}
              aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            >
              {k === 'back' ? <Icon name="backspace" size={22} /> : k === '.' ? ',' : k}
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <button
          onClick={() => run(() => onSave(withAmount(entry, { name, currency, cents })))}
          disabled={busy || (!entry && cents === 0)}
          className="w-full rounded-full bg-cobalt py-4 text-base font-bold text-white shadow-[0_10px_20px_-12px_rgba(31,79,224,0.9)] active:opacity-80 disabled:opacity-40"
        >
          Save
        </button>
        {entry && (
          <button onClick={() => run(onDelete)} disabled={busy} className="w-full py-1.5 text-sm font-semibold text-loss disabled:opacity-50">
            Remove this cash
          </button>
        )}
      </div>
    </Sheet>
  )
}

// ───────── getquin link (also used in Profile → Investments) ─────────
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
          className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt"
        />
        {error && <p className="text-sm text-loss">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:opacity-80 disabled:opacity-50">
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
