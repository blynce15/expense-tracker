import { useCallback, useEffect, useState } from 'react'
import TransactionRow from '../components/TransactionRow'
import { fetchAccountsWithBalances } from '../lib/balances'
import { monthName, monthRange, todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
import TransactionSheet from './TransactionSheet'

const RECENT_COUNT = 5

export default function Home() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    try {
      const [from, to] = monthRange(todayISO())
      const [accounts, lookups, month, recent] = await Promise.all([
        fetchAccountsWithBalances(),
        fetchLookups(),
        supabase.from('transactions').select('type, amount_cents').gte('date', from).lte('date', to),
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(RECENT_COUNT),
      ])
      if (month.error) throw month.error
      if (recent.error) throw recent.error

      // Transfers are neither income nor spending
      const sum = (type) => month.data.filter((t) => t.type === type).reduce((s, t) => s + t.amount_cents, 0)
      setData({
        accounts: accounts.filter((a) => !a.archived),
        lookups,
        income: sum('income'),
        spent: sum('expense'),
        recent: recent.data,
      })
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your overview: {error}</p>
  if (!data) return null

  return (
    <div className="space-y-7 px-4 pt-1 pb-6">
      <MonthSummary income={data.income} spent={data.spent} />
      <AccountStrip accounts={data.accounts} />
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

function MonthSummary({ income, spent }) {
  const net = income - spent
  const max = Math.max(income, spent, 1)
  const bars = [
    { label: 'Income', cents: income, color: 'bg-gain' },
    { label: 'Spent', cents: spent, color: 'bg-cobalt' },
  ]

  return (
    <section className="rounded-3xl bg-card p-5">
      <p className="text-base font-medium text-muted">Spent in {monthName(todayISO())}</p>
      <p className="tabular mt-1 font-display text-[44px] leading-none font-bold tracking-tight">{formatCents(spent)}</p>

      <div className="mt-5 space-y-2.5">
        {bars.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-14 text-sm text-muted">{b.label}</span>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-paper">
              <div className={`h-full rounded-full ${b.color}`} style={{ width: `${(b.cents / max) * 100}%` }} />
            </div>
            <span className="tabular w-24 text-right text-sm font-semibold">{formatCents(b.cents)}</span>
          </div>
        ))}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-sm text-muted">
        {net >= 0 ? 'Left over this month: ' : 'Overspent this month: '}
        <span className={`tabular font-semibold ${net >= 0 ? 'text-gain' : 'text-loss'}`}>{formatCents(Math.abs(net))}</span>
      </p>
    </section>
  )
}

function AccountStrip({ accounts }) {
  const total = accounts.reduce((s, a) => s + a.balance_cents, 0)

  return (
    <section>
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-display text-lg font-bold">Accounts</h2>
        <span className={`tabular text-sm font-semibold ${total < 0 ? 'text-loss' : 'text-muted'}`}>Total {formatCents(total)}</span>
      </div>
      {accounts.length === 0 ? (
        <button onClick={() => navigate('/settings/accounts')} className="w-full rounded-2xl bg-card px-4 py-5 text-center text-cobalt">
          Add your first account
        </button>
      ) : (
        // Bleeds to the screen edges so cards can scroll sideways
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {accounts.map((a) => (
            <li key={a.id} className="snap-start">
              <button
                onClick={() => navigate('/settings/accounts')}
                className="flex h-28 w-40 flex-col justify-between rounded-2xl p-3.5 text-left text-white"
                style={{ backgroundColor: a.color }}
              >
                <span className="truncate text-sm font-semibold opacity-90">{a.name}</span>
                <span className="tabular font-display text-xl font-bold">{formatCents(a.balance_cents)}</span>
              </button>
            </li>
          ))}
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
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h2 className="font-display text-lg font-bold">Recent</h2>
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
