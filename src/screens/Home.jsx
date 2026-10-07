import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import PaySheet from '../components/PaySheet'
import TransactionRow from '../components/TransactionRow'
import { fetchAccountsWithBalances } from '../lib/balances'
import { budgetPeriod, computeBudget, startDayOf } from '../lib/budget'
import { formatDayMonth, monthRange, todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { fetchProfile } from '../lib/profile'
import { daysUntil, dueLabel, fetchRecurring, FREQUENCIES } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
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

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)
  const [hidden, setHidden] = useState(readHidden)

  const load = useCallback(async () => {
    try {
      const today = todayISO()
      const [monthStart] = monthRange(today)
      const period = budgetPeriod(today, startDayOf(await fetchProfile()))
      const [accounts, lookups, sinceMonthStart, periodExpenses, recent, recurring] = await Promise.all([
        fetchAccountsWithBalances(),
        fetchLookups(),
        supabase.from('transactions').select('type, amount_cents, account_id, to_account_id').gte('date', monthStart),
        supabase
          .from('transactions')
          .select('amount_cents, date, account_id')
          .eq('type', 'expense')
          .gte('date', period.start)
          .lte('date', today),
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(RECENT_COUNT),
        fetchRecurring(),
      ])
      for (const res of [sinceMonthStart, periodExpenses, recent]) if (res.error) throw res.error

      // How much each account changed since the 1st of this month
      const change = new Map()
      const add = (id, cents) => change.set(id, (change.get(id) ?? 0) + cents)
      for (const t of sinceMonthStart.data) {
        if (t.type === 'income') add(t.account_id, t.amount_cents)
        else if (t.type === 'expense') add(t.account_id, -t.amount_cents)
        else {
          add(t.account_id, -t.amount_cents)
          add(t.to_account_id, t.amount_cents)
        }
      }

      setData({
        accounts: accounts
          .filter((a) => !a.archived)
          .map((a) => ({ ...a, change_cents: change.get(a.id) ?? 0 })),
        budget: { ...computeBudget(accounts, periodExpenses.data, period), period },
        lookups,
        recent: recent.data,
        upcoming: recurring.filter((p) => p.active).slice(0, UPCOMING_COUNT),
      })
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

  return (
    <div className="space-y-3 pb-1">
      <Balance accounts={data.accounts} hidden={hidden} onToggleHidden={toggleHidden} />
      <BudgetCard budget={data.budget} hidden={hidden} />
      <ComingUp payments={data.upcoming} onPay={setPaying} />
      <Recent data={data} onSelect={setEditing} />

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

      {editing && (
        <TransactionDetails transaction={editing} onClose={() => setEditing(null)} onChanged={() => load()} />
      )}
    </div>
  )
}

// "↑ 15% this month" (or an amount when a % makes no sense)
function Change({ now, change, hidden }) {
  if (change === 0) return <p className="mt-0.5 text-sm text-muted">No change this month</p>
  const before = now - change
  const up = change > 0
  const amount = before > 0 ? `${Math.round((Math.abs(change) / before) * 100)}%` : hidden ? '••••' : formatCents(Math.abs(change))
  return (
    <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted">
      <span className={`flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? 'bg-gain/10 text-gain' : 'bg-loss/10 text-loss'}`}>
        <Icon name={up ? 'arrowUp' : 'arrowDown'} size={13} strokeWidth={2.6} />
        <span className="tabular">{amount}</span>
      </span>
      this month
    </p>
  )
}

// "€7.854" big, ",43" small and faded
function BigAmount({ cents, hidden }) {
  if (hidden) return <p className="font-display text-[38px] leading-tight font-bold tracking-tight">{HIDDEN}</p>
  const [whole, decimals] = formatCents(cents).split(',')
  return (
    <p className="tabular truncate font-display leading-tight font-bold tracking-tight">
      <span className="text-[38px]">{whole}</span>
      <span className="text-xl text-muted/60">,{decimals}</span>
    </p>
  )
}

const TYPE_INFO = {
  debit: { label: 'Bank', icon: 'bank' },
  savings: { label: 'Savings', icon: 'coins' },
  credit: { label: 'Credit card', icon: 'card' },
  cash: { label: 'Cash', icon: 'cash' },
}

// Darker version of a #rrggbb color, for card gradients
const shade = (hex, f) =>
  '#' + hex.slice(1).match(/../g).map((h) => Math.round(parseInt(h, 16) * f).toString(16).padStart(2, '0')).join('')

// A small card in an account's color (with the account type's icon when given)
function MiniCard({ color, type, className = '', style }) {
  return (
    <span
      className={`grid place-items-center rounded-xl text-white shadow-md ring-1 ring-white/40 ${className}`}
      style={{ background: `linear-gradient(135deg, ${color}, ${shade(color, 0.7)})`, ...style }}
    >
      {type && <Icon name={TYPE_INFO[type]?.icon ?? 'card'} size={15} strokeWidth={2} />}
    </span>
  )
}

// Total balance (or one account's), with a tilted card that opens a list of all accounts
function Balance({ accounts, hidden, onToggleHidden }) {
  const [selectedId, setSelectedId] = useState(null)
  const [open, setOpen] = useState(false)
  const selected = accounts.find((a) => a.id === selectedId)
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0)
  const totalChange = accounts.reduce((s, a) => s + a.change_cents, 0)
  const shown = selected
    ? { label: selected.name, cents: selected.balance_cents, change: selected.change_cents }
    : { label: 'Total balance', cents: total, change: totalChange }

  function pick(id) {
    setSelectedId(id)
    setOpen(false)
  }

  if (accounts.length === 0) {
    return (
      <section className="px-4">
        <EmptyCard icon="card" title="Add your first account" text="Your bank account, cards and cash, with what's in each today." onClick={() => navigate('/settings/accounts')} />
      </section>
    )
  }

  return (
    <section className="relative flex items-center gap-3 px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="truncate text-sm text-muted">{shown.label}</span>
          <button
            onClick={onToggleHidden}
            className="-my-2 grid size-9 shrink-0 place-items-center rounded-full text-muted"
            aria-label={hidden ? 'Show amounts' : 'Hide amounts'}
          >
            <Icon name={hidden ? 'eyeOff' : 'eye'} size={17} />
          </button>
        </div>
        <BigAmount cents={shown.cents} hidden={hidden} />
        <Change now={shown.cents} change={shown.change} hidden={hidden} />
      </div>

      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Choose an account"
        className="flex shrink-0 flex-col items-center gap-2 py-1"
      >
        <span className="relative block h-[52px] w-20">
          {selected ? (
            <MiniCard color={selected.color} className="absolute inset-0" style={{ transform: 'rotate(-8deg)' }} />
          ) : (
            accounts.slice(0, 3).map((a, i) => (
              <MiniCard
                key={a.id}
                color={a.color}
                className="absolute inset-0"
                style={{ transform: `rotate(${-14 + i * 7}deg) translateX(${i * 3}px)` }}
              />
            ))
          )}
        </span>
        <span className="flex max-w-24 items-center gap-0.5 text-xs font-semibold text-muted">
          <span className="truncate">{selected ? selected.name : 'All cards'}</span>
          <Icon name="chevronDown" size={14} strokeWidth={2.4} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-4 z-40 mt-1 w-[min(310px,calc(100vw-2rem))] overflow-hidden rounded-[22px] bg-card shadow-[0_24px_50px_-14px_rgba(11,27,69,0.5)] ring-1 ring-line">
            <p className="px-4 pt-3 pb-1 text-xs font-semibold tracking-wider text-muted uppercase">Your accounts</p>
            <ul className="px-1.5 pb-1.5">
              <AccountOption
                label="All accounts"
                sub={`${accounts.length} ${accounts.length === 1 ? 'account' : 'accounts'}`}
                cents={total}
                hidden={hidden}
                selected={!selected}
                onClick={() => pick(null)}
                swatch={
                  <span className="relative h-8 w-11 shrink-0">
                    {accounts.slice(0, 3).map((a, i) => (
                      <span
                        key={a.id}
                        className="absolute h-7 w-9 rounded-md ring-1 ring-white"
                        style={{ left: i * 4, top: i * 1.5, background: `linear-gradient(135deg, ${a.color}, ${shade(a.color, 0.7)})` }}
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
                  selected={a.id === selectedId}
                  onClick={() => pick(a.id)}
                  swatch={<MiniCard color={a.color} type={a.type} className="h-8 w-11 shrink-0 rounded-lg shadow-sm" />}
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

function AccountOption({ label, sub, cents, hidden, selected, onClick, swatch }) {
  return (
    <li>
      <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl px-2.5 py-2 text-left ${selected ? 'bg-cobalt/[.06]' : ''}`}>
        {swatch}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{label}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
        <span className={`tabular font-display font-semibold ${cents < 0 ? 'text-loss' : ''}`}>{hidden ? HIDDEN : formatCents(cents)}</span>
        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${selected ? 'bg-cobalt text-white' : ''}`}>
          {selected && <Icon name="check" size={12} strokeWidth={3.2} />}
        </span>
      </button>
    </li>
  )
}

// Spending through the budget period (yellow) against even spending (dashed).
// Touch or drag along the chart to read any day so far.
const W = 300
const H = 34
function BudgetCard({ budget, hidden }) {
  const { period, cumulative, budgetCents, leftCents, spentCents } = budget
  const [day, setDay] = useState(null) // day number being read, or null for today
  const chartRef = useRef(null)

  if (!budget.hasAccounts) {
    return (
      <section className="px-4">
        <button
          onClick={() => navigate('/settings/accounts')}
          className="relative w-full overflow-hidden rounded-[24px] bg-cobalt p-4 text-left text-white shadow-[0_18px_34px_-18px_#1f4fe0]"
        >
          <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/10" />
          <span className="relative flex items-center gap-2 font-semibold">
            <Icon name="calendar" size={18} />
            Budget
          </span>
          <span className="relative mt-1 block text-sm text-white/80">Add a bank or cash account to see what you have left to spend.</span>
        </button>
      </section>
    )
  }

  const today = period.dayNumber
  const shownDay = day ?? today
  const spentBy = cumulative[shownDay - 1] ?? 0
  const scale = Math.max(budgetCents, spentCents, 1)
  const x = (d) => (period.days > 1 ? ((d - 1) / (period.days - 1)) * W : 0)
  const y = (cents) => H - (Math.max(cents, 0) / scale) * H
  const points = cumulative.map((c, i) => `${x(i + 1).toFixed(1)},${y(c).toFixed(1)}`).join(' ')
  const evenBy = budgetCents > 0 ? Math.round((budgetCents * shownDay) / period.days) : 0
  const diff = spentBy - evenBy
  const money = (c) => (hidden ? '••••' : formatCents(c).replace(/,\d\d$/, ''))

  function read(e) {
    const r = chartRef.current.getBoundingClientRect()
    if (!r.width) return
    const d = Math.round(((e.clientX - r.left) / r.width) * (period.days - 1)) + 1
    const clamped = Math.max(1, Math.min(today, d))
    setDay(clamped === today ? null : clamped)
  }

  return (
    <section className="px-4">
      <div className="relative overflow-hidden rounded-[24px] bg-cobalt px-4 py-3 text-white shadow-[0_18px_34px_-18px_#1f4fe0]">
        <span className="pointer-events-none absolute -top-16 -right-12 size-44 rounded-full bg-white/10" />
        <div className="relative">
          <div className="flex items-center justify-between gap-2">
            <p className="flex min-w-0 items-center gap-1.5 truncate text-sm text-white/75">
              <Icon name="calendar" size={15} className="shrink-0" />
              {day ? `By ${shortDate(dateOf(period.start, day))} you had spent` : 'Left to spend'}
            </p>
            {budgetCents > 0 && (
              <span className={`shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold ${diff > 0 ? 'text-[#ffd2c7]' : 'text-[#b8f5d6]'}`}>
                {diff > 0 ? `▲ ${money(diff)} over pace` : `▼ ${money(-diff)} under pace`}
              </span>
            )}
          </div>
          <p className="tabular truncate font-display text-[24px] leading-tight font-bold">
            {day ? (
              hidden ? '€ ••••' : formatCents(spentBy)
            ) : (
              <>
                {hidden ? '€ ••••' : formatCents(leftCents).replace(/,\d\d$/, '')}
                <span className="text-base font-semibold text-white/65"> of {money(budgetCents)}</span>
              </>
            )}
          </p>
        </div>

        <svg
          ref={chartRef}
          viewBox={`-4 -6 ${W + 8} ${H + 10}`}
          className="relative mt-1.5 w-full cursor-crosshair touch-none select-none"
          onPointerDown={read}
          onPointerMove={(e) => (e.buttons || e.pointerType === 'mouse') && read(e)}
          onPointerLeave={() => setDay(null)}
          onPointerUp={(e) => e.pointerType !== 'mouse' && setDay(null)}
          role="img"
          aria-label={`Spent ${formatCents(spentCents)} of ${formatCents(budgetCents)} so far this period`}
        >
          <line x1="0" y1={H} x2={W} y2={y(budgetCents)} stroke="rgba(255,255,255,.45)" strokeWidth="1.2" strokeDasharray="4 3" />
          <polyline points={`0,${H} ${points}`} fill="none" stroke="#f7d84a" strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
          <line x1={x(shownDay)} y1="-4" x2={x(shownDay)} y2={H} stroke="rgba(255,255,255,.3)" />
          <circle cx={x(shownDay)} cy={y(spentBy)} r="4" fill="#f7d84a" stroke="#1f4fe0" strokeWidth="2" />
        </svg>
        <div className="relative flex justify-between text-[10px] leading-none text-white/60">
          <span>{shortDate(period.start)}</span>
          <span>- - - even spending · touch the line</span>
          <span>{shortDate(period.end)}</span>
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

// The next recurring payments, with the date shown like a calendar page
function ComingUp({ payments, onPay }) {
  return (
    <section>
      <SectionHead title="Coming up" onSeeAll={() => navigate('/recurring')} />
      {payments.length === 0 ? (
        <div className="px-4">
          <EmptyCard icon="repeat" title="Add regular payments" text="Rent, subscriptions and bills. See what's due next." onClick={() => navigate('/recurring')} />
        </div>
      ) : (
        <ul className="mx-4 overflow-hidden rounded-[20px] bg-card">
          {payments.map((p) => {
            const days = daysUntil(p.next_due)
            const due = days <= 0
            const [, m, d] = p.next_due.split('-').map(Number)
            const month = new Date(2000, m - 1, 1).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')
            const every = FREQUENCIES.find((f) => f.value === p.frequency)?.per
            return (
              <li key={p.id} className="flex items-center gap-3 border-b border-line px-4 py-2 last:border-0">
                <span
                  className={`flex size-10 shrink-0 flex-col items-center justify-center rounded-xl ${due ? 'bg-[#0d0f14] text-white' : 'bg-paper'}`}
                >
                  <span className="text-[9px] font-bold tracking-wider uppercase opacity-70">{days === 0 ? 'Today' : days < 0 ? 'Late' : month}</span>
                  <span className="font-display text-base leading-none font-bold">{d}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-medium">
                    {p.icon} {p.name}
                  </span>
                  <span className={`block text-sm ${days < 0 ? 'font-semibold text-loss' : 'text-muted'}`}>
                    {days < 0 ? dueLabel(p.next_due) : `Every ${every}`}
                  </span>
                </span>
                <span className="tabular shrink-0 font-display text-base font-semibold">{formatCents(p.amount_cents)}</span>
                {due && (
                  <button onClick={() => onPay(p)} className="shrink-0 rounded-full bg-cobalt px-3.5 py-1.5 text-sm font-semibold text-white">
                    Paid
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
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
                <TransactionRow t={t} category={category(t.category_id)} accountName={accountName} />
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
