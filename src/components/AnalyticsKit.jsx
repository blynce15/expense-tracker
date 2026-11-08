import { useEffect, useState } from 'react'
import Icon from './Icon'
import { currentPeriod, isCurrentPeriod, periodLabel, shiftPeriod } from '../lib/analytics'
import { cachedUsdRate, cashEntries, fetchUsdRate } from '../lib/cash'
import { cachedPortfolio, fetchPortfolio } from '../lib/getquin'
import { recall, remember } from '../lib/memory'
import { formatCents } from '../lib/money'
import { fetchPension } from '../lib/pension'
import { fetchProfile } from '../lib/profile'

// Pieces shared by the Analytics page and its details pages

// The chosen Month/Year period, kept while the app is open so a details page and the main
// page show the same one
let rememberedPeriod = null
export function usePeriod() {
  const [period, setPeriod] = useState(() => rememberedPeriod ?? currentPeriod('month'))
  const set = (next) => {
    rememberedPeriod = next
    setPeriod(next)
  }
  return [period, set]
}
// Back to this month (the overview always shows now; its details pages then start there)
export function resetPeriod() {
  rememberedPeriod = null
}

// "€2.400" (no cents), for compact numbers
export const whole = (cents) => formatCents(Math.round(cents)).replace(/,\d\d$/, '')
export const pct = (ratio) => `${Math.round(ratio * 100)}%`

export function PeriodBar({ period, onChange }) {
  const atNow = isCurrentPeriod(period)
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center rounded-2xl bg-card p-1">
        <button onClick={() => onChange(shiftPeriod(period, -1))} className="grid h-10 w-9 place-items-center rounded-xl text-ink" aria-label="Previous">
          <Icon name="chevronLeft" />
        </button>
        <p className="flex-1 truncate text-center font-display text-base font-bold">{periodLabel(period)}</p>
        <button
          onClick={() => onChange(shiftPeriod(period, 1))}
          disabled={atNow}
          className="grid h-10 w-9 place-items-center rounded-xl disabled:text-line"
          aria-label="Next"
        >
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="flex shrink-0 rounded-2xl bg-line/60 p-1" role="tablist">
        {['month', 'year'].map((kind) => (
          <button
            key={kind}
            role="tab"
            aria-selected={period.kind === kind}
            onClick={() => period.kind !== kind && onChange(currentPeriod(kind))}
            className={`rounded-xl px-2.5 py-2 text-[13px] font-semibold ${period.kind === kind ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
          >
            {kind === 'month' ? 'Month' : 'Year'}
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- The navy look (same as Home and Savings) ----------

export const HERO = 'radial-gradient(120% 90% at 85% 0%, #22408f 0%, #0b1b45 55%, #070d24 100%)'

// The navy top: reaches up behind the top bar (the route sets navy: true); a white card overlaps its bottom edge
// (`background` swaps the navy for another colour, e.g. Recurring's violet)
export function NavyTop({ children, className = '', background = HERO }) {
  return (
    <div
      className={`-mt-[calc(3.5rem+env(safe-area-inset-top))] rounded-b-[34px] px-5 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[92px] text-white ${className}`}
      style={{ background }}
    >
      {children}
    </div>
  )
}

// The card that overlaps the navy top's bottom edge
export function Overlap({ children, className = '' }) {
  return <section className={`relative z-10 -mt-[76px] px-4 ${className}`}>{children}</section>
}

// ‹ November 2026 › and Month | Year, white on navy
export function NavyPeriodBar({ period, onChange }) {
  const atNow = isCurrentPeriod(period)
  return (
    <div className="mb-4 flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center">
        <button
          onClick={() => onChange(shiftPeriod(period, -1))}
          className="grid size-9 place-items-center rounded-full bg-white/10 active:bg-white/20"
          aria-label="Previous"
        >
          <Icon name="chevronLeft" size={19} />
        </button>
        <p className="flex-1 truncate text-center text-[15px] font-semibold">{periodLabel(period)}</p>
        <button
          onClick={() => onChange(shiftPeriod(period, 1))}
          disabled={atNow}
          className="grid size-9 place-items-center rounded-full bg-white/10 active:bg-white/20 disabled:opacity-30"
          aria-label="Next"
        >
          <Icon name="chevronRight" size={19} />
        </button>
      </div>
      <div className="flex shrink-0 rounded-full bg-white/12 p-[3px]" role="tablist">
        {['month', 'year'].map((kind) => (
          <button
            key={kind}
            role="tab"
            aria-selected={period.kind === kind}
            onClick={() => period.kind !== kind && onChange(currentPeriod(kind))}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${period.kind === kind ? 'bg-white text-[#0b1b45]' : 'text-white/75'}`}
          >
            {kind === 'month' ? 'Month' : 'Year'}
          </button>
        ))}
      </div>
    </div>
  )
}

// Big amount on navy: "€612" with ",40" faded
export function BigAmount({ cents, label }) {
  const [euros, decimals] = formatCents(cents).split(',')
  return (
    <>
      {label && <p className="text-sm font-semibold text-white/75">{label}</p>}
      <p className="tabular mt-0.5 truncate font-display leading-tight font-bold tracking-tight">
        <span className="text-[40px]">{euros}</span>
        <span className="text-xl text-white/50">,{decimals}</span>
      </p>
    </>
  )
}

// Translucent pill on navy; tone 'good' (green text), 'bad' (orange text) or plain
export function NavyPill({ children, tone }) {
  const color = tone === 'good' ? 'text-[#7ee2b0]' : tone === 'bad' ? 'text-[#ffc078]' : 'text-white/90'
  return <span className={`tabular inline-flex items-center gap-1 rounded-full bg-white/12 px-2.5 py-1 text-[13px] font-semibold ${color}`}>{children}</span>
}

// Numbered section heading: a small dark tile with the number, then the title (and an optional note at the right)
export function Section({ n, title, right, children }) {
  return (
    <section className="px-4">
      <div className="mt-6 mb-2.5 flex items-baseline justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 font-display text-[18px] font-bold">
          {n && <span className="grid size-[22px] shrink-0 place-items-center rounded-[7px] bg-ink font-sans text-xs text-paper">{n}</span>}
          {title}
        </h2>
        {right && <span className="shrink-0 text-[12.5px] text-muted">{right}</span>}
      </div>
      {children}
    </section>
  )
}

// ---------- Investments and pension, for net worth ----------

// { invest, pension }: invest = { portfolio, since, cash, rate } from getquin and the cash at the brokers ({} when
// not linked); pension = the fund's monthly entries. Both start from what was shown last time; null while loading.
export function useWorthExtras() {
  const [invest, setInvestState] = useState(() => recall('analytics:invest'))
  const setInvest = (value) => setInvestState(remember('analytics:invest', value))
  const [pension, setPensionState] = useState(() => recall('analytics:pension'))
  const setPension = (value) => setPensionState(remember('analytics:pension', value))

  useEffect(() => {
    fetchPension()
      .then((p) => setPension(p.entries))
      .catch(() => setPension([]))
  }, [])

  // The getquin portfolio: the last answer kept on the phone, else a fresh one
  useEffect(() => {
    fetchProfile()
      .then((p) => {
        const link = p?.answers?.getquinUrl
        const since = p?.answers?.getquinSince ?? null
        if (!link) return setInvest({})
        const cash = cashEntries(p)
        let now = {
          portfolio: cachedPortfolio(link),
          since,
          cash,
          rate: cachedUsdRate()?.rate ?? null,
        }
        const update = (patch) => setInvest((now = { ...now, ...patch }))
        update({})
        // Fresh numbers (and the value history) in the background
        fetchPortfolio(link)
          .then((portfolio) => update({ portfolio }))
          .catch(() => {})
        if (cash.some((e) => e.currency === 'USD')) {
          fetchUsdRate()
            .then((r) => update({ rate: r.rate }))
            .catch(() => {})
        }
      })
      .catch(() => setInvest({}))
  }, [])

  return { invest, pension }
}

// Net worth's parts, in this order and colour everywhere (src/lib/networth.js)
export const WORTH_PARTS = [
  { key: 'accounts', label: 'Accounts', color: '#6f9bff' },
  { key: 'savings', label: 'Savings', color: '#8fd3ff' },
  { key: 'investments', label: 'Investments', color: '#3bc0d4' },
  { key: 'pension', label: 'Pension', color: '#b7a6ff' },
]
