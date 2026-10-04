import { useCallback, useEffect, useState } from 'react'
import { formatDay } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import TransactionSheet from './TransactionSheet'

const PAGE_SIZE = 100

export default function Transactions() {
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  // Loads the first `count` transactions (newest first)
  const load = useCallback(async (count) => {
    try {
      const [data, tx] = await Promise.all([
        fetchLookups(),
        supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(0, count),
      ])
      if (tx.error) throw tx.error
      setLookups(data)
      // We ask for one extra row to know whether there are more
      setHasMore(tx.data.length > count)
      setRows(tx.data.slice(0, count))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load(PAGE_SIZE)
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load transactions: {error}</p>
  if (!rows) return null

  if (rows.length === 0) {
    return (
      <div className="mx-4 mt-2 rounded-2xl bg-card px-5 py-8 text-center">
        <p className="font-display text-lg font-bold">No transactions yet</p>
        <p className="mt-1 text-muted">Tap the + button to record your first expense or income.</p>
      </div>
    )
  }

  const accountName = (id) => lookups.accounts.find((a) => a.id === id)?.name ?? 'Unknown account'
  const category = (id) => lookups.categories.find((c) => c.id === id)

  // Group consecutive rows by date (rows are already sorted newest first)
  const days = []
  for (const t of rows) {
    const last = days[days.length - 1]
    if (last?.date === t.date) last.items.push(t)
    else days.push({ date: t.date, items: [t] })
  }

  return (
    <div className="px-4 pb-6">
      {days.map((day) => {
        const spent = day.items.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount_cents, 0)
        return (
          <section key={day.date} className="mt-4 first:mt-1">
            <div className="flex items-baseline justify-between px-1 pb-1.5">
              <h2 className="text-sm font-semibold text-muted">{formatDay(day.date)}</h2>
              {spent > 0 && <span className="tabular text-sm text-muted">{formatCents(-spent)}</span>}
            </div>
            <ul className="overflow-hidden rounded-2xl bg-card">
              {day.items.map((t) => (
                <li key={t.id} className="border-b border-line last:border-0">
                  <button onClick={() => setEditing(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <TransactionRow t={t} category={category(t.category_id)} accountName={accountName} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      {hasMore && (
        <button onClick={() => load(rows.length + PAGE_SIZE)} className="mt-4 w-full py-3 text-base font-medium text-cobalt">
          Show older transactions
        </button>
      )}

      {editing && (
        <TransactionSheet
          transaction={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load(Math.max(rows.length, PAGE_SIZE))
          }}
        />
      )}
    </div>
  )
}

function TransactionRow({ t, category, accountName }) {
  const isTransfer = t.type === 'transfer'
  const title = isTransfer ? 'Transfer' : (category?.name ?? 'No category')
  const subtitle = isTransfer
    ? `${accountName(t.account_id)} → ${accountName(t.to_account_id)}`
    : accountName(t.account_id)

  const amountText =
    t.type === 'expense' ? formatCents(-t.amount_cents) : t.type === 'income' ? `+${formatCents(t.amount_cents)}` : formatCents(t.amount_cents)
  const amountColor = t.type === 'income' ? 'text-gain' : t.type === 'transfer' ? 'text-muted' : 'text-ink'

  return (
    <>
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
        style={{ backgroundColor: isTransfer ? '#dce4f5' : `${category?.color ?? '#868e96'}22` }}
      >
        {isTransfer ? '⇄' : category?.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{t.note || title}</span>
        <span className="block truncate text-sm text-muted">{t.note ? `${title}, ${subtitle}` : subtitle}</span>
      </span>
      <span className={`tabular shrink-0 font-display text-base font-semibold ${amountColor}`}>{amountText}</span>
    </>
  )
}
