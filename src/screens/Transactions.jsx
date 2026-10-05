import { useCallback, useEffect, useState } from 'react'
import Sheet from '../components/Sheet'
import TransactionRow from '../components/TransactionRow'
import { formatDay } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import TransactionSheet from './TransactionSheet'

const PAGE_SIZE = 100

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
]

// filter: { type: 'all' | 'income' | 'expense', categoryIds: [] } — kept by App so it survives tab switches
export default function Transactions({ filter, onFilterChange, filterOpen, onFilterClose }) {
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  // Loads the first `count` matching transactions (newest first)
  const load = useCallback(
    async (count) => {
      try {
        let query = supabase
          .from('transactions')
          .select('*')
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(0, count)
        if (filter.type !== 'all') query = query.eq('type', filter.type)
        if (filter.categoryIds.length > 0) query = query.in('category_id', filter.categoryIds)

        const [data, tx] = await Promise.all([fetchLookups(), query])
        if (tx.error) throw tx.error
        setLookups(data)
        // We ask for one extra row to know whether there are more
        setHasMore(tx.data.length > count)
        setRows(tx.data.slice(0, count))
      } catch (e) {
        setError(e.message)
      }
    },
    [filter],
  )

  useEffect(() => {
    load(PAGE_SIZE)
  }, [load])

  function changeType(type) {
    // Keep only the selected categories that belong to the new type
    const kinds = type === 'all' ? ['expense', 'income'] : [type]
    const categoryIds = filter.categoryIds.filter((id) => kinds.includes(lookups?.categories.find((c) => c.id === id)?.kind))
    onFilterChange({ type, categoryIds })
  }

  const filtered = filter.type !== 'all' || filter.categoryIds.length > 0

  return (
    <div className="px-4 pb-6">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 bg-paper/90 px-4 pt-1 pb-3 backdrop-blur">
        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-card p-1">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => changeType(t.value)}
              aria-pressed={filter.type === t.value}
              className={`rounded-xl py-2.5 text-base font-semibold ${filter.type === t.value ? 'bg-cobalt text-white' : 'text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {filter.categoryIds.length > 0 && lookups && (
          <ActiveCategories
            categories={lookups.categories.filter((c) => filter.categoryIds.includes(c.id))}
            onClear={() => onFilterChange({ ...filter, categoryIds: [] })}
          />
        )}
      </div>

      {error && <p className="pt-4 text-loss">Couldn't load transactions: {error}</p>}
      {rows && lookups && (
        <TransactionList
          rows={rows}
          lookups={lookups}
          filtered={filtered}
          onSelect={setEditing}
        />
      )}

      {hasMore && (
        <button onClick={() => load(rows.length + PAGE_SIZE)} className="mt-4 w-full py-3 text-base font-medium text-cobalt">
          Show older transactions
        </button>
      )}

      {filterOpen && lookups && (
        <CategoryFilter
          categories={lookups.categories.filter((c) => filter.type === 'all' || c.kind === filter.type)}
          selected={filter.categoryIds}
          onApply={(categoryIds) => {
            onFilterChange({ ...filter, categoryIds })
            onFilterClose()
          }}
          onClose={onFilterClose}
        />
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

function ActiveCategories({ categories, onClear }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <p className="min-w-0 flex-1 truncate text-sm text-muted">
        {categories.map((c) => `${c.icon} ${c.name}`).join(', ')}
      </p>
      <button onClick={onClear} className="shrink-0 py-1 text-sm font-semibold text-cobalt">
        Clear
      </button>
    </div>
  )
}

function TransactionList({ rows, lookups, filtered, onSelect }) {
  if (rows.length === 0) {
    return (
      <div className="mt-1 rounded-2xl bg-card px-5 py-8 text-center">
        <p className="font-display text-lg font-bold">{filtered ? 'Nothing matches' : 'No transactions yet'}</p>
        <p className="mt-1 text-muted">
          {filtered ? 'Try another type or clear the category filter.' : 'Tap the + button to record your first expense or income.'}
        </p>
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

  return days.map((day) => {
    const spent = day.items.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount_cents, 0)
    const earned = day.items.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount_cents, 0)
    return (
      <section key={day.date} className="mt-4 first:mt-1">
        <div className="flex items-baseline justify-between px-1 pb-1.5">
          <h2 className="text-sm font-semibold text-muted">{formatDay(day.date)}</h2>
          <span className="tabular text-sm text-muted">
            {earned > 0 && <span className="text-gain">+{formatCents(earned)}</span>}
            {earned > 0 && spent > 0 && '  '}
            {spent > 0 && formatCents(-spent)}
          </span>
        </div>
        <ul className="overflow-hidden rounded-2xl bg-card">
          {day.items.map((t) => (
            <li key={t.id} className="border-b border-line last:border-0">
              <button onClick={() => onSelect(t)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                <TransactionRow t={t} category={category(t.category_id)} accountName={accountName} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  })
}

function CategoryFilter({ categories, selected, onApply, onClose }) {
  const [picked, setPicked] = useState(selected)
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  const groups = [
    { kind: 'expense', label: 'Expenses' },
    { kind: 'income', label: 'Income' },
  ]
    .map((g) => ({ ...g, items: categories.filter((c) => c.kind === g.kind) }))
    .filter((g) => g.items.length > 0)

  return (
    <Sheet title="Filter by category" onClose={onClose}>
      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.kind}>
            {groups.length > 1 && <h3 className="px-1 pb-1.5 text-sm font-semibold text-muted">{g.label}</h3>}
            <div className="grid grid-cols-4 gap-2">
              {g.items.map((c) => (
                <button
                  key={c.id}
                  onClick={() => toggle(c.id)}
                  aria-pressed={picked.includes(c.id)}
                  className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${
                    picked.includes(c.id) ? 'bg-cobalt text-white' : 'bg-card'
                  } ${c.archived ? 'opacity-60' : ''}`}
                >
                  <span className="text-xl leading-none">{c.icon}</span>
                  <span className="w-full truncate text-center text-[11px] font-medium">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => setPicked([])}
            disabled={picked.length === 0}
            className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium disabled:text-muted"
          >
            Clear
          </button>
          <button
            onClick={() => onApply(picked)}
            className="flex-[2] rounded-2xl bg-cobalt py-3.5 text-base font-semibold text-white active:bg-cobalt-deep"
          >
            {picked.length === 0 ? 'Show all categories' : `Show ${picked.length} ${picked.length === 1 ? 'category' : 'categories'}`}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
