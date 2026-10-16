import { useCallback, useEffect, useState } from 'react'
import { FullEmpty } from '../components/EmptyLynx'
import { MiniCard, TYPE_INFO } from '../components/BankCard'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import RangeCalendar from '../components/RangeCalendar'
import Sheet from '../components/Sheet'
import TransactionRow from '../components/TransactionRow'
import { formatDay, todayISO } from '../lib/dates'
import {
  activeFilterCount,
  applyFilter,
  DATE_PRESETS,
  describeDate,
  describeRange,
  EMPTY_FILTER,
  isRecurring,
  recurringNameSet,
  usesCategories,
  usesRecurring,
} from '../lib/filters'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { fetchRecurring, isIncome } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import TransactionDetails from './TransactionDetails'

const PAGE_SIZE = 100

const TYPE_TABS = [
  { value: 'all', label: 'All' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'invest', label: 'Invest' },
]

// filter: see lib/filters.js — kept by App so it survives tab switches
export default function Transactions({ filter, onFilterChange, filterOpen, onFilterClose }) {
  const [rows, setRows] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [recurring, setRecurring] = useState(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  // Loads the first `count` matching transactions (newest first)
  const load = useCallback(
    async (count) => {
      try {
        const [data, entries] = await Promise.all([fetchLookups(), fetchRecurring()])
        const tx = await applyFilter(supabase.from('transactions').select('*'), filter, entries)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .range(0, count)
        if (tx.error) throw tx.error
        setLookups(data)
        setRecurring(entries)
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
    const kinds = type === 'all' ? ['expense', 'income'] : type === 'invest' ? [] : [type]
    const categoryIds = filter.categoryIds.filter((id) => kinds.includes(lookups?.categories.find((c) => c.id === id)?.kind))
    onFilterChange({ ...filter, type, categoryIds })
  }

  const filtered = filter.type !== 'all' || activeFilterCount(filter) > 0

  return (
    <div className="px-4 pb-6">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 bg-paper/90 px-4 pt-1 pb-3 backdrop-blur">
        <div className="grid grid-cols-5 gap-0.5 rounded-2xl bg-card p-1">
          {TYPE_TABS.map((t) => (
            <button
              key={t.value}
              onClick={() => changeType(t.value)}
              aria-pressed={filter.type === t.value}
              className={`rounded-xl py-2.5 text-[13px] font-semibold transition ${
                filter.type === t.value ? 'bg-cobalt text-white shadow-[0_6px_14px_-8px_rgba(31,79,224,0.9)]' : 'text-muted'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        {activeFilterCount(filter) > 0 && lookups && recurring && (
          <ActiveFilters filter={filter} lookups={lookups} recurring={recurring} onChange={onFilterChange} />
        )}
      </div>

      {error && <p className="pt-4 text-loss">Couldn't load transactions: {error}</p>}
      {rows && lookups && recurring && (
        <TransactionList
          rows={rows}
          lookups={lookups}
          recurringNames={recurringNameSet(recurring)}
          filtered={filtered}
          onSelect={setEditing}
        />
      )}

      {hasMore && (
        <button onClick={() => load(rows.length + PAGE_SIZE)} className="mt-4 w-full py-3 text-base font-medium text-cobalt">
          Show older transactions
        </button>
      )}

      {filterOpen && lookups && recurring && (
        <FilterSheet
          filter={filter}
          lookups={lookups}
          recurring={recurring}
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
function ActiveFilters({ filter, lookups, recurring, onChange }) {
  const chips = []
  if (filter.date.preset !== 'all') {
    chips.push({ key: 'date', label: `📅 ${describeDate(filter.date)}`, remove: () => onChange({ ...filter, date: EMPTY_FILTER.date }) })
  }
  for (const id of filter.accountIds) {
    const a = lookups.accounts.find((x) => x.id === id)
    chips.push({
      key: id,
      label: a?.name ?? 'Account',
      swatch: a && <MiniCard color={a.color} name={a.name} className="h-[15px] w-[22px] rounded-[4px]" />,
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

  if (usesRecurring(filter)) {
    chips.push({
      key: 'recurring',
      label: recurringText(filter, recurring),
      swatch: <Icon name="repeat" size={14} strokeWidth={2.5} />,
      violet: true,
      remove: () => onChange({ ...filter, recurring: 'all', recurringIds: [] }),
    })
  }

  return (
    <div className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.remove}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-1.5 pl-3 text-[13px] font-semibold whitespace-nowrap ${
            c.violet ? 'bg-violet/12 text-violet' : 'bg-cobalt/10 text-cobalt'
          }`}
          aria-label={`Remove filter ${c.label}`}
        >
          {c.swatch}
          {c.label}
          <span className={`grid size-[18px] place-items-center rounded-full text-white ${c.violet ? 'bg-violet' : 'bg-cobalt'}`}>
            <Icon name="close" size={11} strokeWidth={3} />
          </span>
        </button>
      ))}
    </div>
  )
}

function TransactionList({ rows, lookups, recurringNames, filtered, onSelect }) {
  if (rows.length === 0) {
    return (
      <FullEmpty
        className="mt-1"
        title={filtered ? 'Nothing matches' : 'No transactions yet'}
        text={filtered ? 'Try other filters' : 'Tap + to add one'}
      />
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
                <TransactionRow t={t} category={category(t.category_id)} accountName={accountName} recurring={isRecurring(t, recurringNames)} />
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  })
}

const PAGE_TITLES = { main: 'Filters', date: 'Date range', cards: 'Cards', cats: 'Categories', range: 'Custom dates', recurring: 'Recurring' }

// "Recurring", "Not recurring", "Netflix" or "3 recurring"
function recurringText(filter, recurring) {
  if ((filter.recurring ?? 'all') === 'all') return 'All'
  if (filter.recurring === 'not') return 'Not recurring'
  const ids = filter.recurringIds ?? []
  if (!ids.length) return 'Recurring'
  if (ids.length === 1) return recurring.find((r) => r.id === ids[0])?.name ?? '1 recurring'
  return `${ids.length} recurring`
}

// Filter sheet: a short list (date range, cards, categories); each row opens its own page
function FilterSheet({ filter, lookups, recurring, onApply, onClose }) {
  const [draft, setDraft] = useState(filter)
  const [page, setPage] = useState('main')
  const [count, setCount] = useState(null)

  // How many transactions the draft would show
  useEffect(() => {
    let cancelled = false
    setCount(null)
    const timer = setTimeout(async () => {
      const { count, error } = await applyFilter(supabase.from('transactions').select('id', { count: 'exact', head: true }), draft, recurring)
      if (!cancelled && !error) setCount(count)
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [draft])

  const accounts = lookups.accounts.filter((a) => !a.archived || draft.accountIds.includes(a.id))
  const kinds = draft.type === 'all' ? ['expense', 'income'] : draft.type === 'invest' ? [] : [draft.type]
  const categories = lookups.categories.filter((c) => kinds.includes(c.kind) && (!c.archived || draft.categoryIds.includes(c.id)))
  const toggle = (key, id) =>
    setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }))
  const setDate = (date) => setDraft((d) => ({ ...d, date }))

  const back = page === 'range' ? 'date' : 'main'
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
          {draft.type !== 'transfer' && draft.type !== 'invest' && (
            <FilterRow emoji="🏷️" tint="bg-gain/10" label="Categories" value={categoryText} set={draft.categoryIds.length > 0} onClick={() => setPage('cats')} />
          )}
          {draft.type !== 'transfer' && draft.type !== 'invest' && (
            <FilterRow
              emoji={<Icon name="repeat" size={17} strokeWidth={2.4} />}
              tint="bg-violet/12 text-violet"
              label="Recurring"
              value={recurringText(draft, recurring)}
              set={usesRecurring(draft)}
              onClick={() => setPage('recurring')}
            />
          )}
        </ul>
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
                      // Start a custom range at this month so far, then open the calendar
                      if (!on) setDate({ preset: 'custom', from: `${todayISO().slice(0, 8)}01`, to: todayISO() })
                      setPage('range')
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
                  <span className="text-sm text-muted">{p.value === 'custom' ? (on ? describeDate(draft.date) : 'Pick dates') : describeRange({ preset: p.value })}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    )
  } else if (page === 'range') {
    body = (
      <div className="space-y-3">
        <RangeCalendar from={draft.date.from} to={draft.date.to} onChange={({ from, to }) => setDate({ preset: 'custom', from, to })} />
        <button onClick={() => setPage('main')} className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep">
          Done
        </button>
      </div>
    )
  } else if (page === 'recurring') {
    body = (
      <div className="space-y-3">
        <RecurringPage draft={draft} setDraft={setDraft} recurring={recurring} />
        {showButton}
      </div>
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
                <MiniCard color={a.color} type={a.type} name={a.name} className="h-[30px] w-11 rounded-lg" />
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-base font-medium ${a.archived ? 'text-muted' : ''}`}>{a.name}</span>
                  <span className="block text-sm text-muted">{TYPE_INFO[a.type]?.label ?? a.type}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
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
      action={
        page === 'main' ? (
          resetButton
        ) : page === 'recurring' && usesRecurring(draft) ? (
          <button onClick={() => setDraft((d) => ({ ...d, recurring: 'all', recurringIds: [] }))} className="px-2 py-2 text-[15px] font-semibold text-cobalt">
            Clear
          </button>
        ) : undefined
      }
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

const MODES = [
  { value: 'all', label: 'All', icon: 'list' },
  { value: 'only', label: 'Recurring', icon: 'repeat' },
  { value: 'not', label: 'Not recurring', icon: 'close' },
]
const PER = { weekly: 'wk', monthly: 'mo', yearly: 'yr' }

// Filters → Recurring: three cards with how many transactions each shows (with the other filters),
// then, for "Recurring", the recurring payments and income as logo tiles to pick from (none picked = all of them).
function RecurringPage({ draft, setDraft, recurring }) {
  const [counts, setCounts] = useState({})
  const mode = draft.recurring ?? 'all'
  const ids = draft.recurringIds ?? []
  const picked = (r) => !ids.length || ids.includes(r.id)

  // Counts for the three cards; "Recurring" counts only the picked ones
  const key = JSON.stringify({ ...draft, recurring: null })
  useEffect(() => {
    let cancelled = false
    for (const m of MODES) {
      applyFilter(supabase.from('transactions').select('id', { count: 'exact', head: true }), { ...draft, recurring: m.value }, recurring).then(
        ({ count, error }) => !cancelled && !error && setCounts((c) => ({ ...c, [m.value]: count })),
      )
    }
    return () => {
      cancelled = true
    }
  }, [key, recurring]) // `key` stands for the draft without its recurring choice

  function toggle(id) {
    const now = ids.length ? ids : recurring.map((r) => r.id)
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id]
    if (!next.length) return // keep at least one
    setDraft((d) => ({ ...d, recurring: 'only', recurringIds: next.length === recurring.length ? [] : next }))
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Recurring">
        {MODES.map((m) => {
          const on = mode === m.value
          return (
            <button
              key={m.value}
              role="radio"
              aria-checked={on}
              onClick={() => setDraft((d) => ({ ...d, recurring: m.value, recurringIds: m.value === 'only' ? (d.recurringIds ?? []) : [] }))}
              className={`rounded-[18px] p-2.5 text-left transition active:scale-[0.97] ${
                on ? 'bg-gradient-to-br from-[#8d63ff] to-[#6a3df0] text-white shadow-[0_12px_22px_-14px_rgba(124,77,255,0.9)]' : 'bg-card'
              }`}
            >
              <span className={`grid size-7 place-items-center rounded-[9px] ${on ? 'bg-white/20' : 'bg-paper text-muted'}`}>
                <Icon name={m.icon} size={15} strokeWidth={2.4} />
              </span>
              <b className="tabular mt-2 block font-display text-[19px] leading-none">{counts[m.value] ?? '–'}</b>
              <span className={`text-xs font-semibold ${on ? 'text-white/85' : 'text-muted'}`}>{m.label}</span>
            </button>
          )
        })}
      </div>

      {mode === 'only' && (
        <>
          <div className="flex items-baseline justify-between px-1 pt-2">
            <span className="text-xs font-semibold tracking-[0.08em] text-muted uppercase">Which ones</span>
            {recurring.length > 0 && (
              <span className="text-[13px] font-semibold text-muted">
                {recurring.filter(picked).length} of {recurring.length}
              </span>
            )}
          </div>
          {recurring.length === 0 ? (
            <p className="rounded-[18px] bg-card px-4 py-5 text-center text-sm text-muted">No recurring payments yet</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {recurring.map((r) => {
                const on = picked(r)
                return (
                  <button
                    key={r.id}
                    onClick={() => toggle(r.id)}
                    aria-pressed={on}
                    className={`relative rounded-[18px] bg-card px-1.5 pt-3 pb-2.5 text-center transition active:scale-[0.97] ${
                      on ? 'ring-2 ring-violet ring-inset' : 'opacity-55'
                    }`}
                  >
                    {on && (
                      <span className="absolute top-2 right-2 grid size-[18px] place-items-center rounded-full bg-violet text-white">
                        <Icon name="check" size={11} strokeWidth={3.2} />
                      </span>
                    )}
                    <MerchantIcon name={r.name} className="mx-auto size-[38px] rounded-xl bg-paper text-lg">
                      {r.icon}
                    </MerchantIcon>
                    <b className="mt-1.5 block truncate text-[13.5px]">{r.name}</b>
                    <span className={`tabular block truncate text-[11.5px] font-semibold ${isIncome(r) ? 'text-gain' : 'text-muted'}`}>
                      {isIncome(r) ? '+' : ''}
                      {formatCents(r.amount_cents).replace(/,00$/, '')}/{PER[r.frequency] ?? 'mo'}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </>
      )}
    </>
  )
}
