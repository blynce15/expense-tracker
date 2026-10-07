import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import PaySheet from '../components/PaySheet'
import TransactionRow from '../components/TransactionRow'
import { fetchAccountsWithBalances } from '../lib/balances'
import { monthRange, todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { daysUntil, dueLabel, fetchRecurring, FREQUENCIES } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
import TransactionDetails from './TransactionDetails'

const RECENT_COUNT = 8
const HIDE_KEY = 'hideBalances'

function readHidden() {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)
  const [paying, setPaying] = useState(null)
  const [hidden, setHidden] = useState(readHidden)

  const load = useCallback(async () => {
    try {
      const [monthStart] = monthRange(todayISO())
      const [accounts, lookups, sinceMonthStart, recent, recurring] = await Promise.all([
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
      if (sinceMonthStart.error) throw sinceMonthStart.error
      if (recent.error) throw recent.error

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
        lookups,
        recent: recent.data,
        upcoming: recurring.filter((p) => p.active),
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
    <div className="space-y-6 pt-1 pb-6">
      <BalanceCard accounts={data.accounts} hidden={hidden} onToggleHidden={toggleHidden} />
      <Upcoming payments={data.upcoming} onPay={setPaying} />
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

// "↓ 15% this month" (or an amount when a % makes no sense)
function Change({ now, change, hidden }) {
  if (change === 0) return <span className="text-sm text-white/60">No change this month</span>
  const before = now - change
  const up = change > 0
  const amount = before > 0 ? `${Math.round((Math.abs(change) / before) * 100)}%` : hidden ? '••••' : formatCents(Math.abs(change))
  return (
    <span className="flex items-center gap-1 text-sm text-white/70">
      <span className={`flex items-center gap-0.5 font-semibold ${up ? 'text-[#5ee0a5]' : 'text-[#ff9b8a]'}`}>
        <Icon name={up ? 'arrowUp' : 'arrowDown'} size={16} strokeWidth={2.4} />
        <span className="tabular">{amount}</span>
      </span>
      this month
    </span>
  )
}

// "€7.854" big, ",43" small and faded
function BigAmount({ cents, hidden }) {
  if (hidden) return <p className="font-display text-[44px] leading-none font-bold tracking-tight">€ ••••</p>
  const [whole, decimals] = formatCents(cents).split(',')
  return (
    <p className="tabular truncate font-display leading-none font-bold tracking-tight">
      <span className="text-[44px]">{whole}</span>
      <span className="text-2xl text-white/45">,{decimals}</span>
    </p>
  )
}

function BalanceCard({ accounts, hidden, onToggleHidden }) {
  const [selectedId, setSelectedId] = useState(null)
  const selected = accounts.find((a) => a.id === selectedId)
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0)
  const totalChange = accounts.reduce((s, a) => s + a.change_cents, 0)

  const shown = selected
    ? { label: selected.name, cents: selected.balance_cents, change: selected.change_cents }
    : { label: 'Total balance', cents: total, change: totalChange }

  // Card edges peeking from the right; they get narrower when there are many accounts
  const step = accounts.length ? Math.min(30, Math.floor(120 / accounts.length)) : 0
  const stackWidth = accounts.length ? accounts.length * step + 14 : 0

  return (
    <section className="px-4">
      <div
        className="relative h-48 overflow-hidden rounded-3xl text-white shadow-[0_14px_30px_-16px_rgba(11,27,69,0.8)]"
        style={{ background: 'radial-gradient(120% 140% at 85% 10%, #22386f 0%, #0f1f4a 45%, #0a1533 100%)' }}
      >
        <div className="flex h-full flex-col justify-center gap-3 py-5 pl-5" style={{ paddingRight: stackWidth + 12 }}>
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-medium text-white/70">{shown.label}</span>
            <button
              onClick={onToggleHidden}
              className="-m-2 grid size-10 shrink-0 place-items-center rounded-full text-white/70"
              aria-label={hidden ? 'Show balances' : 'Hide balances'}
            >
              <Icon name={hidden ? 'eyeOff' : 'eye'} size={19} />
            </button>
          </div>
          <BigAmount cents={shown.cents} hidden={hidden} />
          <div className="flex items-center gap-3">
            <Change now={shown.cents} change={shown.change} hidden={hidden} />
          </div>
          {selected && (
            <button onClick={() => setSelectedId(null)} className="-my-1 self-start py-1 text-sm font-semibold text-white/85 underline-offset-4 hover:underline">
              Back to total
            </button>
          )}
        </div>

        {/* One card edge per account; tap to show that account */}
        <div className="absolute top-5 right-0 bottom-5" style={{ width: stackWidth }}>
          {accounts.map((a, i) => {
            const isSelected = a.id === selectedId
            return (
              <button
                key={a.id}
                onClick={() => setSelectedId(isSelected ? null : a.id)}
                aria-pressed={isSelected}
                aria-label={`Show ${a.name}`}
                className="absolute top-0 bottom-0 w-32 rounded-2xl shadow-[-6px_0_14px_-6px_rgba(0,0,0,0.55)] ring-1 ring-white/35 transition-transform duration-200 ease-out"
                style={{
                  left: i * step,
                  zIndex: i + 1,
                  backgroundColor: a.color,
                  transform: isSelected ? 'translateX(-10px) scale(1.03)' : 'none',
                }}
              />
            )
          })}
        </div>
      </div>

      {accounts.length === 0 && (
        <button onClick={() => navigate('/settings/accounts')} className="mt-3 w-full rounded-2xl bg-card py-4 text-cobalt">
          Add your first account
        </button>
      )}
    </section>
  )
}

// Recurring payments, soonest first; the first card is highlighted
function Upcoming({ payments, onPay }) {
  return (
    <section>
      <div className="flex items-baseline justify-between px-5 pb-2">
        <h2 className="font-display text-lg font-bold">Upcoming payments</h2>
        <button onClick={() => navigate('/recurring')} className="text-sm font-semibold text-cobalt">
          {payments.length ? 'See all' : 'Add'}
        </button>
      </div>
      {payments.length === 0 ? (
        <button onClick={() => navigate('/recurring')} className="mx-4 w-[calc(100%-2rem)] rounded-2xl bg-card px-4 py-4 text-left text-muted">
          Add rent, subscriptions and bills to see what's due next.
        </button>
      ) : (
        <ul className="flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {payments.map((p, i) => {
            const first = i === 0
            const days = daysUntil(p.next_due)
            const per = FREQUENCIES.find((f) => f.value === p.frequency)?.per
            return (
              <li key={p.id} className="w-44 shrink-0 snap-start">
                <div className={`flex h-full flex-col rounded-3xl p-4 ${first ? 'bg-cobalt text-white' : 'bg-card'}`}>
                  <span className={`grid size-11 place-items-center rounded-full text-xl ${first ? 'bg-white' : 'bg-paper'}`}>{p.icon}</span>
                  <p className="mt-3 line-clamp-2 font-display text-lg leading-tight font-bold break-words">{p.name}</p>
                  <p className="tabular mt-1 text-base font-semibold">
                    {formatCents(p.amount_cents)}
                    <span className={`text-sm font-normal ${first ? 'text-white/70' : 'text-muted'}`}>/{per}</span>
                  </p>
                  <p className={`mt-1 text-sm ${days < 0 ? (first ? 'font-semibold text-white' : 'font-semibold text-loss') : first ? 'text-white/80' : 'text-muted'}`}>
                    {dueLabel(p.next_due)}
                  </p>
                  {days <= 0 && (
                    <button
                      onClick={() => onPay(p)}
                      className={`mt-3 rounded-full py-2 text-sm font-semibold ${first ? 'bg-white text-cobalt' : 'bg-cobalt text-white'}`}
                    >
                      Paid
                    </button>
                  )}
                </div>
              </li>
            )
          })}
          <li aria-hidden="true" className="w-1 shrink-0" />
        </ul>
      )}
    </section>
  )
}

function Recent({ data, onSelect }) {
  const accountName = (id) => data.lookups.accounts.find((a) => a.id === id)?.name ?? 'Unknown account'
  const category = (id) => data.lookups.categories.find((c) => c.id === id)

  return (
    <section className="px-4">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-display text-lg font-bold">Recent transactions</h2>
        {data.recent.length > 0 && (
          <button onClick={() => navigate('/transactions')} className="text-sm font-semibold text-cobalt">
            See all
          </button>
        )}
      </div>
      {data.recent.length === 0 ? (
        <p className="rounded-2xl bg-card px-4 py-5 text-center text-muted">Tap + to record your first transaction.</p>
      ) : (
        <ul className="overflow-hidden rounded-2xl bg-card">
          {data.recent.map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <button onClick={() => onSelect(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <TransactionRow t={t} category={category(t.category_id)} accountName={accountName} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
