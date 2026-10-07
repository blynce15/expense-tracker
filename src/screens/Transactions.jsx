import { useCallback, useEffect, useState } from 'react'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import TransactionRow from '../components/TransactionRow'
import { formatDay, todayISO } from '../lib/dates'
import { activeFilterCount, applyFilter, DATE_PRESETS, describeDate, describeRange, EMPTY_FILTER, shortDate, usesCategories } from '../lib/filters'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import TransactionDetails from './TransactionDetails'

const PAGE_SIZE = 100

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
]

// filter: see lib/filters.js — kept by App so it survives tab switches
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
        const query = applyFilter(supabase.from('transactions').select('*'), filter)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(0, count)

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
    // Keep only the selected categories that belong to the new type (transfers have none)
    const kinds = type === 'all' ? ['expense', 'income'] : [type]
    const categoryIds = filter.categoryIds.filter((id) => kinds.includes(lookups?.categories.find((c) => c.id === id)?.kind))
    onFilterChange({ ...filter, type, categoryIds })
  }

  const filtered = filter.type !== 'all' || activeFilterCount(filter) > 0

  return (
    <div className="px-4 pb-6">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 bg-paper/90 px-4 pt-1 pb-3 backdrop-blur">
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-card p-1">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => changeType(t.value)}
              aria-pressed={filter.type === t.value}
              className={`rounded-xl py-2.5 text-sm font-semibold transition ${
                filter.type === t.value ? 'bg-cobalt text-white shadow-[0_6px_14px_-8px_rgba(31,79,224,0.9)]' : 'text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeFilterCount(filter) > 0 && lookups && <ActiveFilters filter={filter} lookups={lookups} onChange={onFilterChange} />}
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
        <FilterSheet
          filter={filter}
          lookups={lookups}
          onApply={(next) => {
            onFilterChange(next)
            onFilterClose()
          }}
          onClose={onFilterClose}
        />
      )}

      {editing && (
        <TransactionDetails transaction={editing} onClose={() => setEditing(null)} onChanged={() => load(Math.max(rows.length, PAGE_SIZE))} />
      )}
    </div>
  )
}

// Chips for the filters that are on; tapping one removes it
function ActiveFilters({ filter, lookups, onChange }) {
  const chips = []
  if (filter.date.preset !== 'all') {
    chips.push({ key: 'date', label: `📅 ${describeDate(filter.date)}`, remove: () => onChange({ ...filter, date: EMPTY_FILTER.date }) })
  }
  for (const id of filter.accountIds) {
    const a = lookups.accounts.find((x) => x.id === id)
    chips.push({
      key: id,
      label: `💳 ${a?.name ?? 'Account'}`,
      remove: () => onChange({ ...filter, accountIds: filter.accountIds.filter((x) => x !== id) }),
    })
  }
  if (usesCategories(filter)) {
    for (const id of filter.categoryIds) {
      const c = lookups.categories.find((x) => x.id === id)
      chips.push({
        key: id,
        label: `${c?.icon ?? ''} ${c?.name ?? 'Category'}`,
        remove: () => onChange({ ...filter, categoryIds: filter.categoryIds.filter((x) => x !== id) }),
      })
    }
  }

  return (
    <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.remove}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-cobalt/10 pr-1.5 pl-3 text-[13px] font-semibold whitespace-nowrap text-cobalt"
          aria-label={`Remove filter ${c.label}`}
        >
          {c.label}
          <span className="grid size-[18px] place-items-center rounded-full bg-cobalt text-white">
            <Icon name="close" size={11} strokeWidth={3} />
          </span>
        </button>
      ))}
    </div>
  )
}

function TransactionList({ rows, lookups, filtered, onSelect }) {
  if (rows.length === 0) {
    return (
      <div className="mt-1 rounded-[20px] bg-card px-5 py-8 text-center">
        <p className="font-display text-lg font-bold">{filtered ? 'Nothing matches' : 'No transactions yet'}</p>
        <p className="mt-1 text-muted">
          {filtered ? 'Try another tab or change the filters.' : 'Tap the + button to record your first expense or income.'}
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
        <div className="flex items-center justify-between px-1 pb-1.5">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">{formatDay(day.date)}</h2>
          <span className="flex gap-1.5">
            {earned > 0 && <span className="tabular rounded-full bg-gain/10 px-2 py-0.5 text-xs font-semibold text-gain">+{formatCents(earned)}</span>}
            {spent > 0 && <span className="tabular rounded-full bg-card px-2 py-0.5 text-xs font-semibold text-ink/70">{formatCents(-spent)}</span>}
          </span>
        </div>
        <ul className="overflow-hidden rounded-[20px] bg-card">
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

const PAGE_TITLES = { main: 'Filters', date: 'Date range', cards: 'Cards', cats: 'Categories', from: 'From', to: 'To' }

// Filter sheet: a short list (date range, cards, categories); each row opens its own page
function FilterSheet({ filter, lookups, onApply, onClose }) {
  const [draft, setDraft] = useState(filter)
  const [page, setPage] = useState('main')
  const [count, setCount] = useState(null)

  // How many transactions the draft would show
  useEffect(() => {
    let cancelled = false
    setCount(null)
    const timer = setTimeout(async () => {
      const { count, error } = await applyFilter(supabase.from('transactions').select('id', { count: 'exact', head: true }), draft)
      if (!cancelled && !error) setCount(count)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draft])

  const accounts = lookups.accounts.filter((a) => !a.archived || draft.accountIds.includes(a.id))
  const kinds = draft.type === 'all' ? ['expense', 'income'] : [draft.type]
  const categories = lookups.categories.filter((c) => kinds.includes(c.kind) && (!c.archived || draft.categoryIds.includes(c.id)))
  const toggle = (key, id) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }))
  const setDate = (date) => setDraft((d) => ({ ...d, date }))

  const back = page === 'from' || page === 'to' ? 'date' : 'main'
  const resetButton = (
    <button onClick={() => setDraft({ ...EMPTY_FILTER, type: draft.type })} className="px-2 py-2 text-[15px] font-semibold text-cobalt">
      Reset
    </button>
  )

  const showButton = (
    <button
      onClick={() => onApply(draft)}
      className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep"
    >
      {count === null ? 'Show results' : `Show ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
    </button>
  )
  const doneButton = (
    <button onClick={() => setPage(back)} className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep">
      Done
    </button>
  )

  let body
  if (page === 'main') {
    const accountText =
      draft.accountIds.length === 0
        ? 'All cards'
        : draft.accountIds.length === 1
          ? (lookups.accounts.find((a) => a.id === draft.accountIds[0])?.name ?? '1 card')
          : `${draft.accountIds.length} cards`
    const categoryText =
      draft.categoryIds.length === 0
        ? 'All categories'
        : draft.categoryIds.length === 1
          ? (lookups.categories.find((c) => c.id === draft.categoryIds[0])?.name ?? '1 category')
          : `${draft.categoryIds.length} categories`
    body = (
      <div className="space-y-3">
        <ul className="overflow-hidden rounded-2xl bg-card">
          <FilterRow emoji="📅" tint="bg-cobalt/10" label="Date range" value={describeDate(draft.date)} set={draft.date.preset !== 'all'} onClick={() => setPage('date')} />
          <FilterRow emoji="💳" tint="bg-[#6741d9]/10" label="Cards" value={accountText} set={draft.accountIds.length > 0} onClick={() => setPage('cards')} />
          {draft.type !== 'transfer' && (
            <FilterRow emoji="🏷️" tint="bg-gain/10" label="Categories" value={categoryText} set={draft.categoryIds.length > 0} onClick={() => setPage('cats')} />
          )}
        </ul>
        <p className="px-1 text-sm text-muted">Tap a row to change it. Leave a row on "All" to include everything.</p>
        {showButton}
      </div>
    )
  } else if (page === 'date') {
    body = (
      <div className="space-y-3">
        <ul className="overflow-hidden rounded-2xl bg-card">
          {DATE_PRESETS.map((p) => {
            const on = draft.date.preset === p.value
            return (
              <li key={p.value} className="border-b border-line last:border-0">
                <button
                  onClick={() => {
                    if (p.value === 'custom') {
                      // Start a custom range at this month so far
                      if (!on) setDate({ preset: 'custom', from: `${todayISO().slice(0, 8)}01`, to: todayISO() })
                    } else {
                      setDate({ preset: p.value })
                      setPage('main')
                    }
                  }}
                  aria-pressed={on}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <Check on={on} round />
                  <span className="flex-1 text-base font-medium">{p.label}</span>
                  <span className="text-sm text-muted">{p.value === 'custom' ? (on ? '' : 'Pick dates') : describeRange({ preset: p.value })}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {draft.date.preset === 'custom' && (
          <div className="grid grid-cols-2 gap-2">
            {['from', 'to'].map((k) => (
              <button key={k} onClick={() => setPage(k)} className="rounded-2xl border-[1.5px] border-line bg-card px-4 py-2.5 text-left">
                <span className="block text-xs text-muted">{k === 'from' ? 'From' : 'To'}</span>
                <span className="block text-base font-semibold">{shortDate(draft.date[k])}</span>
              </button>
            ))}
          </div>
        )}
        {draft.date.preset === 'custom' && doneButton}
      </div>
    )
  } else if (page === 'from' || page === 'to') {
    body = (
      <DatePicker
        value={draft.date[page]}
        dimFuture={false}
        quickPicks={false}
        onChange={(iso) => {
          let { from, to } = { ...draft.date, [page]: iso }
          if (from > to) [from, to] = [to, from]
          setDate({ preset: 'custom', from, to })
          setPage('date')
        }}
      />
    )
  } else if (page === 'cards') {
    const allOn = accounts.length > 0 && accounts.every((a) => draft.accountIds.includes(a.id))
    body = (
      <div className="space-y-3">
        <div className="flex justify-between px-1">
          <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Your cards</span>
          <button
            onClick={() => setDraft((d) => ({ ...d, accountIds: allOn ? [] : accounts.map((a) => a.id) }))}
            className="text-sm font-semibold text-cobalt"
          >
            {allOn ? 'Clear' : 'Select all'}
          </button>
        </div>
        <ul className="overflow-hidden rounded-2xl bg-card">
          {accounts.map((a) => (
            <li key={a.id} className="border-b border-line last:border-0">
              <button onClick={() => toggle('accountIds', a.id)} aria-pressed={draft.accountIds.includes(a.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
                <Check on={draft.accountIds.includes(a.id)} />
                <span className="h-5 w-7 shrink-0 rounded" style={{ backgroundColor: a.color }} />
                <span className={`flex-1 text-base font-medium ${a.archived ? 'text-muted' : ''}`}>{a.name}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="px-1 text-sm text-muted">Transfers show up if the money left or arrived on a selected card.</p>
        {doneButton}
      </div>
    )
  } else {
    const groups = [
      { kind: 'expense', label: 'Expenses' },
      { kind: 'income', label: 'Income' },
    ]
      .map((g) => ({ ...g, items: categories.filter((c) => c.kind === g.kind) }))
      .filter((g) => g.items.length > 0)
    body = (
      <div className="space-y-3">
        {groups.map((g, i) => (
          <div key={g.kind} className="space-y-1.5">
            <div className="flex justify-between px-1">
              <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">{g.label}</span>
              {i === 0 && draft.categoryIds.length > 0 && (
                <button onClick={() => setDraft((d) => ({ ...d, categoryIds: [] }))} className="text-sm font-semibold text-cobalt">
                  Clear
                </button>
              )}
            </div>
            <ul className="overflow-hidden rounded-2xl bg-card">
              {g.items.map((c) => (
                <li key={c.id} className="border-b border-line last:border-0">
                  <button onClick={() => toggle('categoryIds', c.id)} aria-pressed={draft.categoryIds.includes(c.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <Check on={draft.categoryIds.includes(c.id)} />
                    <span className="grid size-8 shrink-0 place-items-center rounded-full text-base" style={{ backgroundColor: `${c.color}26` }}>
                      {c.icon}
                    </span>
                    <span className={`flex-1 text-base font-medium ${c.archived ? 'text-muted' : ''}`}>{c.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {doneButton}
      </div>
    )
  }

  return (
    <Sheet
      title={PAGE_TITLES[page]}
      onClose={onClose}
      onBack={page === 'main' ? undefined : () => setPage(back)}
      action={page === 'main' ? resetButton : undefined}
    >
      {body}
    </Sheet>
  )
}

function FilterRow({ emoji, tint, label, value, set, onClick }) {
  return (
    <li className="border-b border-line last:border-0">
      <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className={`grid size-8 shrink-0 place-items-center rounded-lg text-base ${tint}`}>{emoji}</span>
        <span className="flex-1 text-base font-semibold">{label}</span>
        <span className={`max-w-[45%] truncate text-sm ${set ? 'font-semibold text-cobalt' : 'text-muted'}`}>{value}</span>
        <Icon name="chevronRight" size={18} className="shrink-0 text-muted/60" />
      </button>
    </li>
  )
}

// Tick box (or round radio when `round`)
function Check({ on, round = false }) {
  return (
    <span
      className={`grid size-5 shrink-0 place-items-center border-2 ${round ? 'rounded-full' : 'rounded-md'} ${
        on ? 'border-cobalt bg-cobalt text-white' : 'border-line'
      }`}
      aria-hidden="true"
    >
      {on && (round ? <span className="size-2 rounded-full bg-white" /> : <Icon name="check" size={13} strokeWidth={3} />)}
    </span>
  )
}
