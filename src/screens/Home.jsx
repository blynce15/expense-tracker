import { useCallback, useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import TransactionRow from '../components/TransactionRow'
import { fetchAccountsWithBalances } from '../lib/balances'
import { monthRange, todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
import TransactionSheet from './TransactionSheet'

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
  const [hidden, setHidden] = useState(readHidden)

  const load = useCallback(async () => {
    try {
      const [monthStart] = monthRange(todayISO())
      const [accounts, lookups, sinceMonthStart, recent] = await Promise.all([
        fetchAccountsWithBalances(),
        fetchLookups(),
        supabase.from('transactions').select('type, amount_cents, account_id, to_account_id').gte('date', monthStart),
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(RECENT_COUNT),
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
      <BalanceCarousel accounts={data.accounts} hidden={hidden} onToggleHidden={toggleHidden} />
      <Recent data={data} onSelect={setEditing} />

      {editing && (
        <TransactionSheet
          transaction={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </div>
  )
}

// Change since the start of the month, as "↑ 12%" (or an amount when a % makes no sense)
function Change({ now, change, hidden }) {
  if (change === 0) return <span className="text-sm opacity-70">No change</span>
  const before = now - change
  const up = change > 0
  const label =
    before > 0 ? `${Math.round((Math.abs(change) / before) * 100)}%` : hidden ? '••••' : formatCents(Math.abs(change))
  return (
    <span className={`flex items-center gap-1 text-base font-semibold ${up ? 'text-[#5ee0a5]' : 'text-[#ff9b8a]'}`}>
      <Icon name={up ? 'arrowUp' : 'arrowDown'} size={18} strokeWidth={2.4} />
      <span className="tabular">{label}</span>
    </span>
  )
}

function BalanceCarousel({ accounts, hidden, onToggleHidden }) {
  const scroller = useRef(null)
  const [active, setActive] = useState(0)
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0)
  const totalChange = accounts.reduce((s, a) => s + a.change_cents, 0)
  const money = (cents) => (hidden ? '€ ••••' : formatCents(cents))

  const cards = [{ id: 'total', name: 'Total balance', balance_cents: total, change_cents: totalChange }, ...accounts]

  function onScroll() {
    const el = scroller.current
    const card = el.firstElementChild
    if (!card) return
    setActive(Math.round(el.scrollLeft / (card.offsetWidth + 12)))
  }

  return (
    <section>
      <ul
        ref={scroller}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {cards.map((c) => {
          const isTotal = c.id === 'total'
          return (
            <li key={c.id} className="w-[86%] shrink-0 snap-start">
              <div
                className="relative flex h-44 flex-col overflow-hidden rounded-3xl p-5 text-white shadow-[0_12px_28px_-14px_rgba(11,27,69,0.7)]"
                style={{
                  background: isTotal
                    ? 'linear-gradient(140deg, #1b2f6b 0%, #0b1b45 55%, #081332 100%)'
                    : `linear-gradient(140deg, color-mix(in srgb, ${c.color} 82%, white) 0%, ${c.color} 60%, color-mix(in srgb, ${c.color} 75%, black) 100%)`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-base font-medium opacity-90">{c.name}</span>
                  {isTotal && (
                    <button
                      onClick={onToggleHidden}
                      className="-m-2 grid size-10 place-items-center rounded-full opacity-90"
                      aria-label={hidden ? 'Show balances' : 'Hide balances'}
                    >
                      <Icon name={hidden ? 'eyeOff' : 'eye'} size={20} />
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/settings/accounts')}
                    className="-m-2 ml-auto grid size-10 place-items-center rounded-full opacity-90"
                    aria-label="Manage accounts"
                  >
                    <Icon name="chevronRight" size={22} />
                  </button>
                </div>

                <div className="mt-3 flex items-end justify-between gap-3">
                  <p className="tabular truncate font-display text-[38px] leading-none font-bold tracking-tight">
                    {money(c.balance_cents)}
                  </p>
                  <Change now={c.balance_cents} change={c.change_cents} hidden={hidden} />
                </div>
                <p className="mt-auto text-sm opacity-75">Compared to the start of the month</p>
              </div>
            </li>
          )
        })}
        {/* Lets the last card scroll fully into place */}
        <li aria-hidden="true" className="w-1 shrink-0" />
      </ul>

      {cards.length > 1 && (
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {cards.map((c, i) => (
            <span key={c.id} className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-ink' : 'w-1.5 bg-line'}`} />
          ))}
        </div>
      )}

      {accounts.length === 0 && (
        <button onClick={() => navigate('/settings/accounts')} className="mx-4 mt-3 w-[calc(100%-2rem)] rounded-2xl bg-card py-4 text-cobalt">
          Add your first account
        </button>
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
