import { useCallback, useEffect, useRef, useState } from 'react'
import BankCard, { cardBackground, MiniCard, TYPE_INFO } from '../components/BankCard'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import PaySheet from '../components/PaySheet'
import TransactionRow from '../components/TransactionRow'
import { fetchAccountsWithBalances } from '../lib/balances'
import { budgetPeriod, computeBudget, startDayOf } from '../lib/budget'
import { cachedUsdRate, cashEntries, cashTotal, fetchUsdRate } from '../lib/cash'
import { formatDayMonth, monthRange, todayISO } from '../lib/dates'
import { isRecurring, recurringNameSet } from '../lib/filters'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { cachedPortfolio, fetchPortfolio } from '../lib/getquin'
import { fetchPension, pensionValueOn } from '../lib/pension'
import { fetchProfile } from '../lib/profile'
import { recall, remember } from '../lib/memory'
import { daysUntil, fetchRecurring, FREQUENCIES, isIncome } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
import AccountPage from './AccountPage'
import { RecurringForm, shortDay } from './Recurring'
import RecurringDetails from './RecurringDetails'
import TransactionDetails from './TransactionDetails'

const RECENT_COUNT = 3
const UPCOMING_COUNT = 2
const HIDE_KEY = 'hideBalances'
const HIDDEN = '€ ••••'

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

const shortDate = formatDayMonth
// Home's navy top (always dark, also in dark mode)
const HERO = 'radial-gradient(120% 90% at 85% 0%, #22408f 0%, #0b1b45 55%, #070d24 100%)'

export default function Home({ onSeeAccount }) {
  const [data, setData] = useState(() => recall('home'))
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)
  const [hidden, setHidden] = useState(readHidden)
  const [openAccountId, setOpenAccountId] = useState(null)
  const [openPaymentId, setOpenPaymentId] = useState(null)
  const [editingPayment, setEditingPayment] = useState(null)
  // getquin, when linked: part of the net worth
  const [portfolio, setPortfolioState] = useState(() => recall('home:portfolio'))
  const setPortfolio = (value) => setPortfolioState(remember('home:portfolio', value))
  // Cash at the brokers (also only with getquin), and the dollar rate for it
  const [cash, setCashState] = useState(() => recall('home:cash') ?? [])
  const setCash = (value) => setCashState(remember('home:cash', value))
  const [usdRate, setUsdRate] = useState(() => cachedUsdRate()?.rate ?? null)
  // The pension fund's latest value (entered by hand once a month), also part of the net worth
  const [pensionCents, setPensionState] = useState(() => recall('home:pension') ?? 0)
  const setPension = (value) => setPensionState(remember('home:pension', value))

  const load = useCallback(async () => {
    try {
      const today = todayISO()
      const [monthStart] = monthRange(today)
      // Everything that doesn't need the profile starts right away, alongside it
      const others = Promise.all([
        fetchAccountsWithBalances(),
        fetchLookups(),
        supabase.from('transactions').select('type, amount_cents, account_id, to_account_id').gte('date', monthStart),
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(RECENT_COUNT),
        fetchRecurring(),
      ])
      others.catch(() => {}) // reported below, when awaited
      fetchPension()
        .then((p) => setPension(pensionValueOn(p.entries, today)))
        .catch(() => {}) // Keep the last value
      const profile = await fetchProfile()
      const period = budgetPeriod(today, startDayOf(profile))
      // Investments come from getquin: show the last value at once, then refresh it in the background
      const link = profile?.answers?.getquinUrl
      setCash(link ? cashEntries(profile) : [])
      if (link && cashEntries(profile).some((e) => e.currency === 'USD')) {
        fetchUsdRate()
          .then((r) => setUsdRate(r.rate))
          .catch(() => {}) // The last rate on this phone stays
      }
      if (link) {
        setPortfolio(cachedPortfolio(link))
        fetchPortfolio(link)
          .then(setPortfolio)
          .catch(() => {}) // Keep the last value; the Investments tab shows what went wrong
      } else setPortfolio(null)
      const [periodExpenses, [accounts, lookups, sinceMonthStart, recent, recurring]] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount_cents, date, account_id')
          .eq('type', 'expense')
          .gte('date', period.start)
          .lte('date', today),
        others,
      ])
      for (const res of [sinceMonthStart, periodExpenses, recent]) if (res.error) throw res.error

      // Money in and out of each account since the 1st of this month (transfers included)
      const flow = new Map()
      const add = (id, key, cents) => {
        const f = flow.get(id) ?? { in: 0, out: 0 }
        f[key] += cents
        flow.set(id, f)
      }
      for (const t of sinceMonthStart.data) {
        if (t.type === 'income' || t.type === 'divest') add(t.account_id, 'in', t.amount_cents)
        else if (t.type === 'expense' || t.type === 'invest') add(t.account_id, 'out', t.amount_cents)
        else {
          add(t.account_id, 'out', t.amount_cents)
          add(t.to_account_id, 'in', t.amount_cents)
        }
      }

      setData(remember('home', {
        accounts: accounts
          .filter((a) => !a.archived)
          .map((a) => ({ ...a, flow: flow.get(a.id) ?? { in: 0, out: 0 } })),
        budget: { ...computeBudget(accounts, periodExpenses.data, period), period },
        lookups,
        recent: recent.data,
        upcoming: recurring.filter((p) => p.active).slice(0, UPCOMING_COUNT),
        recurringNames: recurringNameSet(recurring),
      }))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function toggleHidden() {
    setHidden((h) => {
      try {
        localStorage.setItem(HIDE_KEY, h ? '0' : '1')
      } catch {
        // Not saved (e.g. private mode) — it still works for this visit
      }
      return !h
    })
  }

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your overview: {error}</p>
  if (!data) return null
  const openAccount = data.accounts.find((a) => a.id === openAccountId)
  const openPayment = data.upcoming.find((p) => p.id === openPaymentId)

  return (
    <div className="space-y-3 pb-1">
      {/* Navy top: reaches up behind the top bar (same height), the budget card overlaps its bottom edge */}
      <div className="-mt-[calc(3.5rem+env(safe-area-inset-top))] rounded-b-[34px] pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[88px]" style={{ background: HERO }}>
      <Balance
        accounts={data.accounts}
        portfolio={portfolio}
        cashCents={portfolio ? cashTotal(cash, usdRate) : 0}
        pensionCents={pensionCents}
        hidden={hidden}
        onToggleHidden={toggleHidden}
        onOpenAccount={setOpenAccountId}
      />
      </div>
      <BudgetCard budget={data.budget} hidden={hidden} />
      <ComingUp payments={data.upcoming} onPay={setPaying} onOpen={(p) => setOpenPaymentId(p.id)} />
      <Recent data={data} onSelect={setEditing} />

      {openPayment && !paying && !editingPayment && (
        <RecurringDetails
          payment={openPayment}
          lookups={data.lookups}
          onClose={() => setOpenPaymentId(null)}
          onPay={() => setPaying(openPayment)}
          onEdit={() => setEditingPayment(openPayment)}
          onChanged={() => {
            setOpenPaymentId(null)
            load()
          }}
        />
      )}

      {editingPayment && (
        <RecurringForm
          payment={editingPayment}
          lookups={data.lookups}
          onClose={() => setEditingPayment(null)}
          onSaved={() => {
            setEditingPayment(null)
            setOpenPaymentId(null)
            load()
          }}
        />
      )}

      {paying && (
        <PaySheet
          payment={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null)
            load()
          }}
        />
      )}

      {openAccount && (
        <AccountPage
          account={openAccount}
          monthFlow={openAccount.flow}
          lookups={data.lookups}
          hidden={hidden}
          onToggleHidden={toggleHidden}
          onClose={() => setOpenAccountId(null)}
          onSeeAll={() => onSeeAccount(openAccount.id)}
          onChanged={() => load()}
        />
      )}

      {editing && (
        <TransactionDetails transaction={editing} onClose={() => setEditing(null)} onChanged={() => load()} />
      )}
    </div>
  )
}

// "€7.854" big, ",43" small and faded (white, on the navy top)
function BigAmount({ cents, hidden }) {
  if (hidden) return <p className="mt-1 font-display text-[44px] leading-tight font-bold tracking-tight text-white">{HIDDEN}</p>
  const [whole, decimals] = formatCents(cents).split(',')
  return (
    <p className="tabular mt-1 truncate font-display leading-tight font-bold tracking-tight text-white">
      <span className="text-[44px]">{whole}</span>
      <span className="text-2xl text-white/45">,{decimals}</span>
    </p>
  )
}

// Net worth = every account (bank, cash, meal card, savings) + investments (getquin's portfolio value)
// + cash at the brokers + the pension fund, with a fan of account cards that opens a list of the accounts only (no investments).
// Picking an account opens its own page.
function Balance({ accounts, portfolio, cashCents, pensionCents = 0, hidden, onToggleHidden, onOpenAccount }) {
  const [open, setOpen] = useState(false)
  const accountsTotal = accounts.reduce((s, a) => s + a.balance_cents, 0)
  const total = accountsTotal + (portfolio?.value_cents ?? 0) + cashCents + pensionCents
  const fan = accounts.slice(0, 3)
  const offset = 3 - fan.length

  function pick(id) {
    setOpen(false)
    if (id) onOpenAccount(id)
  }

  if (accounts.length === 0) {
    return (
      <section className="px-4">
        <EmptyCard icon="card" title="Add your first account" text="Your bank account, cards and cash, with what's in each today." onClick={() => navigate('/settings/accounts')} />
      </section>
    )
  }

  return (
    <section className="relative flex min-h-[124px] items-center gap-3 px-5 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm text-white/70">Net worth</span>
          <button
            onClick={onToggleHidden}
            className="-my-2 grid size-9 shrink-0 place-items-center rounded-full text-white/70"
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          >
            <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} />
          </button>
        </div>
        <BigAmount cents={total} hidden={hidden} />
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Your accounts"
        className="flex shrink-0 flex-col items-center gap-1.5 active:scale-[.97]"
      >
        <span className="relative block h-[92px] w-[118px]">
          {fan.map((a, i) => (
            <span
              key={a.id}
              className="absolute"
              style={{ left: (offset + i) * 4, top: 10 + (offset + i) * 5, transform: `rotate(${-12 + (offset + i) * 7}deg)` }}
            >
              <BankCard
                account={a}
                corner={<span />}
                className="h-[66px] w-[102px] rounded-[14px] px-2.5 py-2 text-[9px] shadow-[0_10px_22px_-12px_rgba(11,27,69,0.65)] ring-1 ring-white/30"
              >
                <span className="mt-2.5 block truncate text-left text-[10px] font-semibold">{a.name}</span>
              </BankCard>
            </span>
          ))}
        </span>
        <span className="flex items-center gap-0.5 rounded-full bg-white/12 py-1 pr-2 pl-2.5 text-xs font-bold text-white">
          {accounts.length} {accounts.length === 1 ? 'account' : 'accounts'}
          <Icon name="chevronDown" size={14} strokeWidth={2.4} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-4 z-40 -mt-1 w-[min(310px,calc(100vw-2rem))] overflow-hidden rounded-[22px] bg-card shadow-[0_24px_50px_-14px_rgba(11,27,69,0.5)] ring-1 ring-line">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Your accounts</p>
            <ul className="px-1.5 pb-1.5">
              <AccountOption
                label="All accounts"
                sub={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
                cents={accountsTotal}
                hidden={hidden}
                selected
                onClick={() => pick(null)}
                swatch={
                  <span className="relative h-8 w-11 shrink-0">
                    {fan.map((a, i) => (
                      <span
                        key={a.id}
                        className="absolute h-7 w-9 rounded-md ring-1 ring-white"
                        style={{ left: i * 4, top: i * 1.5, background: cardBackground(a.color) }}
                      />
                    ))}
                  </span>
                }
              />
              {accounts.map((a) => (
                <AccountOption
                  key={a.id}
                  label={a.name}
                  sub={TYPE_INFO[a.type]?.label ?? a.type}
                  cents={a.balance_cents}
                  hidden={hidden}
                  onClick={() => pick(a.id)}
                  swatch={<MiniCard color={a.color} type={a.type} name={a.name} className="h-8 w-11 shrink-0 rounded-lg shadow-sm" />}
                  chevron
                />
              ))}
            </ul>
            <button
              onClick={() => navigate('/settings/accounts')}
              className="flex w-full items-center justify-center gap-1 border-t border-line py-3 text-sm font-semibold text-cobalt"
            >
              Manage accounts
              <Icon name="chevronRight" size={15} strokeWidth={2.4} />
            </button>
          </div>
        </>
      )}
    </section>
  )
}

function AccountOption({ label, sub, cents, hidden, selected, onClick, swatch, chevron }) {
  return (
    <li>
      <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ${selected ? 'bg-cobalt/[.06]' : ''}`}>
        {swatch}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{label}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
        <span className={`tabular font-display font-semibold ${cents < 0 ? 'text-loss' : ''}`}>{hidden ? HIDDEN : formatCents(cents)}</span>
        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${selected ? 'bg-cobalt text-white' : 'text-muted/60'}`}>
          {selected && <Icon name="check" size={12} strokeWidth={3.2} />}
          {chevron && <Icon name="chevronRight" size={16} strokeWidth={2.2} />}
        </span>
      </button>
    </li>
  )
}

// One bar per day of the budget period: blue when within the daily budget, orange when above it.
// Touch or drag along the bars to read any day so far.
const W = 300
const H = 56

// The budget card sits over the bottom edge of the navy top
const OVERLAP = 'relative z-10 -mt-[76px] px-4'

// Budget: a ring of what's left to spend (thin outer arc = how far through the period you are),
// and under it the money spent so far as a line against an even pace. Touch the line to read a day.
function BudgetCard({ budget, hidden }) {
  const { period, cumulative, budgetCents, leftCents } = budget
  const [day, setDay] = useState(null) // day number being read, or null for today
  const chartRef = useRef(null)

  if (!budget.hasAccounts) {
    return (
      <section className={OVERLAP}>
        <button
          onClick={() => navigate('/settings/accounts')}
          className="relative w-full overflow-hidden rounded-[24px] bg-gradient-to-br from-tint-from to-tint-to p-4 text-left"
        >
          <span className="flex items-center gap-2 font-semibold">
            <Icon name="calendar" size={18} className="text-cobalt" />
            Budget
          </span>
          <span className="mt-1 block text-sm text-muted">Add a bank or cash account to see what you have left to spend.</span>
        </button>
      </section>
    )
  }

  const today = period.dayNumber
  const daysLeft = period.days - today + 1 // today included
  const shown = day ?? today
  const spentBy = cumulative[shown - 1] ?? 0
  const paceBy = budgetCents > 0 ? Math.round((budgetCents * shown) / period.days) : 0
  const diff = (cumulative[today - 1] ?? 0) - (budgetCents > 0 ? Math.round((budgetCents * today) / period.days) : 0)
  const leftShare = budgetCents > 0 ? Math.max(0, Math.min(1, leftCents / budgetCents)) : 0
  const timeShare = Math.min(1, today / period.days)
  const perDayLeft = Math.max(0, Math.round(leftCents / daysLeft))
  const money = (c) => (hidden ? '••••' : formatCents(c).replace(/,\d\d$/, ''))
  const [euros, decimals] = formatCents(Math.max(leftCents, 0)).split(',')

  // Ring
  const R = 37
  const C = 2 * Math.PI * R
  const R2 = R + 11
  const C2 = 2 * Math.PI * R2

  // Pace chart: x = day, y = money spent so far (top = the whole budget)
  const top = Math.max(budgetCents, cumulative[today - 1] ?? 0, 1)
  const x = (d) => (d / period.days) * W
  const y = (c) => H - (Math.min(c, top) / top) * H
  const points = cumulative.slice(0, today).map((c, i) => `${x(i + 1).toFixed(1)},${y(c).toFixed(1)}`)
  const line = `M0,${H} L${points.join(' L')}`
  const area = `${line} L${x(today).toFixed(1)},${H} Z`
  const over = diff > 0

  function read(e) {
    const r = chartRef.current.getBoundingClientRect()
    if (!r.width) return
    const d = Math.round(((e.clientX - r.left) / r.width) * period.days)
    const clamped = Math.max(1, Math.min(today, d))
    setDay(clamped === today ? null : clamped)
  }

  return (
    <section className={OVERLAP}>
      <div className="relative overflow-hidden rounded-[26px] bg-card px-4 pt-3.5 pb-3.5 shadow-[0_24px_40px_-24px_rgba(11,27,69,0.6)]">
        <div className="relative flex items-center gap-4">
          {/* What's left, as a ring */}
          <div className="relative grid size-[104px] shrink-0 place-items-center">
            <svg width="104" height="104" viewBox="0 0 104 104" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="52" cy="52" r={R} fill="none" strokeWidth="10" className="stroke-tint-to" />
              <circle
                cx="52"
                cy="52"
                r={R}
                fill="none"
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${leftShare * C} ${C}`}
                className="stroke-cobalt transition-[stroke-dasharray] duration-700"
              />
              <circle cx="52" cy="52" r={R2} fill="none" strokeWidth="2" className="stroke-line" />
              <circle cx="52" cy="52" r={R2} fill="none" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${timeShare * C2} ${C2}`} className="stroke-cobalt/55" />
              <circle cx={52 + R2 * Math.cos(timeShare * 2 * Math.PI)} cy={52 + R2 * Math.sin(timeShare * 2 * Math.PI)} r="3.5" className="fill-cobalt" />
            </svg>
            <span className="relative text-center leading-none">
              <b className="tabular block font-display text-[21px]">{hidden ? '••' : `${Math.round(leftShare * 100)}%`}</b>
              <span className="mt-1 block text-[10.5px] font-semibold text-muted">left</span>
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-muted">Left to spend</p>
            <p className="tabular truncate font-display leading-tight font-bold tracking-tight">
              <span className="text-[32px]">{hidden ? '€ ••••' : euros}</span>
              {!hidden && <span className="text-lg text-muted/60">,{decimals}</span>}
            </p>
            <p className="tabular text-[12.5px] text-muted">of {money(budgetCents)}</p>
            <span className="tabular mt-2 inline-flex items-center gap-1 rounded-full bg-tint-from px-2.5 py-1 text-xs font-bold text-cobalt">
              {money(perDayLeft)}
              <span className="font-semibold text-muted">/ day · {daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span>
            </span>
          </div>
        </div>

        {/* Spending against an even pace */}
        <div className="relative mt-3 rounded-[20px] bg-paper px-3.5 pt-2.5 pb-2">
          <div className="flex items-center justify-between gap-2">
            <p className="tabular min-w-0 truncate text-xs font-semibold text-muted">
              {day ? (
                <>
                  {shortDate(dateOf(period.start, day))}: <b className="text-ink">{money(spentBy)}</b> spent · pace {money(paceBy)}
                </>
              ) : (
                'Spending vs pace'
              )}
            </p>
            {budgetCents > 0 && (
              <span className={`tabular shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold ${over ? 'bg-orange-text/13 text-orange-text' : 'bg-gain/13 text-gain'}`}>
                {over ? `▲ ${money(diff)} over` : `▼ ${money(-diff)} under`}
              </span>
            )}
          </div>
          <svg
            ref={chartRef}
            viewBox={`-6 -8 ${W + 12} ${H + 16}`}
            className="mt-1 w-full cursor-crosshair touch-none overflow-visible select-none"
            onPointerDown={read}
            onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && read(e)}
            onPointerLeave={() => setDay(null)}
            onPointerUp={(e) => e.pointerType !== 'mouse' && setDay(null)}
            role="img"
            aria-label={`Spent ${formatCents(cumulative[today - 1] ?? 0)} of ${formatCents(budgetCents)} so far this period`}
          >
            <defs>
              <linearGradient id="pace-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" style={{ stopColor: 'var(--color-cobalt)' }} stopOpacity=".22" />
                <stop offset="1" style={{ stopColor: 'var(--color-cobalt)' }} stopOpacity="0" />
              </linearGradient>
            </defs>
            {budgetCents > 0 && <line x1="0" y1={H} x2={W} y2={y(budgetCents)} strokeWidth="1.5" strokeDasharray="4 5" className="stroke-muted/45" />}
            <line x1={x(shown)} x2={x(shown)} y1="-4" y2={H} strokeWidth="1.5" className="stroke-cobalt/20" />
            <path d={area} fill="url(#pace-fill)" />
            <path d={line} fill="none" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" className="stroke-cobalt" />
            {budgetCents > 0 && <circle cx={x(shown)} cy={y(paceBy)} r="4" strokeWidth="2" className="fill-paper stroke-cobalt/60" />}
            <circle cx={x(shown)} cy={y(spentBy)} r="9" className="fill-cobalt/16" />
            <circle cx={x(shown)} cy={y(spentBy)} r="5" strokeWidth="2.5" className="fill-card stroke-cobalt" />
          </svg>
          <div className="mt-1 flex justify-between text-[10.5px] leading-none text-muted">
            <span>{shortDate(period.start)}</span>
            <span>- - even pace · touch the line</span>
            <span>{shortDate(period.end)}</span>
          </div>
        </div>
      </div>
    </section>
  )
}

const dateOf = (startISO, dayNumber) => {
  const [y, m, d] = startISO.split('-').map(Number)
  const date = new Date(y, m - 1, d + dayNumber - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function SectionHead({ title, onSeeAll }) {
  return (
    <div className="flex items-baseline justify-between px-5 pb-1.5">
      <h2 className="font-display text-lg font-bold">{title}</h2>
      {onSeeAll && (
        <button onClick={onSeeAll} className="text-sm font-semibold text-cobalt">
          See all
        </button>
      )}
    </div>
  )
}

// The next recurring payments and income as two tiles side by side: logo, name and date on top;
// "In 3 days" (or Paid / Received when due) bottom left, the amount and how often bottom right
function ComingUp({ payments, onPay, onOpen }) {
  return (
    <section>
      <SectionHead title="Coming up" onSeeAll={() => navigate('/recurring')} />
      {payments.length === 0 ? (
        <div className="px-4">
          <EmptyCard icon="repeat" title="Add regular payments" text="Rent, subscriptions and bills. See what's due next." onClick={() => navigate('/recurring')} />
        </div>
      ) : (
        <ul className="mx-4 grid grid-cols-2 gap-2.5">
          {payments.map((p) => (
            <li key={p.id}>
              <PaymentTile p={p} onOpen={onOpen} onPay={onPay} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PaymentTile({ p, onOpen, onPay }) {
  const days = daysUntil(p.next_due)
  const due = days <= 0
  const income = isIncome(p)
  const per = FREQUENCIES.find((f) => f.value === p.frequency)?.per
  const [whole, cents] = formatCents(p.amount_cents).split(',')
  // Amounts from €1.000 up get a slightly smaller size, and no ",00", so they fit next to the Paid / Received button
  const long = whole.length + (income ? 1 : 0) >= 6
  const showCents = !(long && cents === '00')
  return (
    <div className="relative h-full rounded-[22px] bg-card p-3">
      {/* The whole tile opens the payment; the Paid button sits above it */}
      <button onClick={() => onOpen(p)} className="absolute inset-0 rounded-[22px]" aria-label={`${p.name}, ${shortDay(p.next_due)}`} />
      <div className="pointer-events-none flex items-center gap-2.5">
        <MerchantIcon name={p.name} className="size-10 rounded-xl bg-paper text-lg">
          {p.icon}
        </MerchantIcon>
        <span className="min-w-0">
          <span className="block truncate text-[15.5px] font-semibold">{p.name}</span>
          <span className={`flex items-center gap-[3px] text-xs font-semibold ${days < 0 ? 'text-loss' : due ? 'text-orange-text' : 'text-muted'}`}>
            <Icon name="clock" size={13} strokeWidth={2.4} />
            <span className="truncate">{days < 0 ? `${-days} ${days === -1 ? 'day' : 'days'} late` : shortDay(p.next_due)}</span>
          </span>
        </span>
      </div>
      <div className="pointer-events-none mt-3 flex items-end justify-between gap-1.5">
        {due ? (
          <button
            onClick={() => onPay(p)}
            className="pointer-events-auto relative shrink-0 rounded-[11px] bg-cobalt px-3 py-1.5 text-[13.5px] font-bold text-white shadow-[0_8px_14px_-8px_var(--color-cobalt)] active:bg-cobalt-deep"
          >
            {income ? 'Received' : 'Paid'}
          </button>
        ) : (
          <span className="truncate text-[12.5px] font-bold">{days === 1 ? 'Tomorrow' : `In ${days} days`}</span>
        )}
        <span className="min-w-0 text-right">
          <span className={`tabular block font-display leading-tight font-bold tracking-tight whitespace-nowrap ${long ? 'text-[15px]' : 'text-lg'} ${income ? 'text-gain' : ''}`}>
            {income && '+'}
            {whole}
            {showCents && <span className="text-[0.66em] opacity-50">,{cents}</span>}
          </span>
          {per && <span className="block text-[11.5px] font-medium text-muted">a {per}</span>}
        </span>
      </div>
    </div>
  )
}

function Recent({ data, onSelect }) {
  const accountName = (id) => data.lookups.accounts.find((a) => a.id === id)?.name ?? 'Unknown account'
  const category = (id) => data.lookups.categories.find((c) => c.id === id)

  return (
    <section>
      <SectionHead title="Recent transactions" onSeeAll={data.recent.length ? () => navigate('/transactions') : null} />
      {data.recent.length === 0 ? (
        <div className="px-4">
          <EmptyCard icon="plus" title="No transactions yet" text="Tap the + button to record your first expense or income." />
        </div>
      ) : (
        <ul className="mx-4 overflow-hidden rounded-[20px] bg-card">
          {data.recent.map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <button onClick={() => onSelect(t)} className="flex w-full items-center gap-3 px-4 py-2 text-left">
                <TransactionRow
                  t={t}
                  category={category(t.category_id)}
                  accountName={accountName}
                  recurring={!!data.recurringNames && isRecurring(t, data.recurringNames)}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// A friendly placeholder with an icon tile; tappable when it has onClick
function EmptyCard({ icon, title, text, onClick }) {
  const inner = (
    <>
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cobalt/10 text-cobalt">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm text-muted">{text}</span>
      </span>
      {onClick && <Icon name="chevronRight" size={18} className="shrink-0 text-muted/60" />}
    </>
  )
  const cls = 'flex w-full items-center gap-3 rounded-[20px] bg-card px-4 py-3.5 text-left'
  return onClick ? (
    <button onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}
