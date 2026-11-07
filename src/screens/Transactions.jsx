import { useCallback, useEffect, useRef, useState } from 'react'
import { FullEmpty } from '../components/EmptyLynx'
import { MiniCard } from '../components/BankCard'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import RangeCalendar from '../components/RangeCalendar'
import Sheet from '../components/Sheet'
import TransactionRow from '../components/TransactionRow'
import { formatDay, todayISO } from '../lib/dates'
import {
  activeFilterCount,
  applyFilter,
  describeDate,
  describeRange,
  EMPTY_FILTER,
  isRecurring,
  kindsOf,
  monthStrip,
  recurringNameSet,
  usesCategories,
  usesRecurring,
} from '../lib/filters'
import { fetchLookups } from '../lib/lookups'
import { recall, remember } from '../lib/memory'
import { formatCents } from '../lib/money'
import { fetchRecurring } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import TransactionDetails from './TransactionDetails'

const PAGE_SIZE = 100

// Transaction types in Filters → Type (several can be picked); `on` = a picked tile, `chip` = its chip on the page
const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense', icon: 'arrowUp', tint: 'bg-orange-text/12 text-orange-text', on: 'bg-orange-text text-white', text: 'text-orange-text', chip: 'bg-orange-text/12 text-orange-text', dot: 'bg-orange-text' },
  { value: 'income', label: 'Income', icon: 'arrowDown', tint: 'bg-gain/12 text-gain', on: 'bg-gain text-white', text: 'text-gain', chip: 'bg-gain/12 text-gain', dot: 'bg-gain' },
  { value: 'transfer', label: 'Transfer', icon: 'swap', tint: 'bg-ink/8 text-ink', on: 'bg-ink text-paper', text: 'text-ink', chip: 'bg-ink/8 text-ink', dot: 'bg-ink' },
  { value: 'invest', label: 'Invest', icon: 'invest', tint: 'bg-teal/12 text-teal', on: 'bg-teal text-white', text: 'text-teal', chip: 'bg-teal/12 text-teal', dot: 'bg-teal' },
]

// filter: see lib/filters.js — kept by App so it survives tab switches
export default function Transactions({ filter, onFilterChange, filterOpen, onFilterClose }) {
  // What this list last showed for the same filter, while a fresh copy loads
  const last = recall('transactions')
  const shown = last?.filterKey === JSON.stringify(filter) ? last : null
  const [rows, setRows] = useState(shown?.rows ?? null)
  const [lookups, setLookups] = useState(shown?.lookups ?? null)
  const [recurring, setRecurring] = useState(shown?.recurring ?? null)
  const [hasMore, setHasMore] = useState(shown?.hasMore ?? false)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null)

  // Rows from `from` on (newest first). id breaks ties so pages never skip or repeat a row.
  // One extra row is asked for, to know whether there are more.
  const page = useCallback(
    (entries, from, count) =>
      applyFilter(supabase.from('transactions').select('*'), filter, entries)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + count),
    [filter],
  )

  // Loads the first `count` matching transactions (newest first)
  const load = useCallback(
    async (count) => {
      try {
        const list = (entries) => page(entries, 0, count)
        // The recurring entries are only needed first when filtering by them; otherwise all at once
        const entriesReq = fetchRecurring()
        const [data, entries, tx] = await Promise.all([fetchLookups(), entriesReq, usesRecurring(filter) ? entriesReq.then(list) : list([])])
        if (tx.error) throw tx.error
        // We ask for one extra row to know whether there are more
        const next = { filterKey: JSON.stringify(filter), lookups: data, recurring: entries, hasMore: tx.data.length > count, rows: tx.data.slice(0, count) }
        remember('transactions', next)
        setLookups(next.lookups)
        setRecurring(next.recurring)
        setHasMore(next.hasMore)
        setRows(next.rows)
      } catch (e) {
        setError(e.message)
      }
    },
    [filter, page],
  )

  useEffect(() => {
    load(PAGE_SIZE)
  }, [load])

  // Older transactions arrive on their own when you scroll near the end: only the next page is downloaded
  const [loadingMore, setLoadingMore] = useState(false)
  const busy = useRef(false)
  const loadMore = useCallback(async () => {
    if (busy.current || !rows || !hasMore) return
    busy.current = true
    setLoadingMore(true)
    const key = JSON.stringify(filter)
    try {
      const tx = await page(recurring ?? [], rows.length, PAGE_SIZE)
      if (tx.error) throw tx.error
      if (key !== JSON.stringify(filter)) return
      const seen = new Set(rows.map((r) => r.id))
      const next = { ...recall('transactions'), hasMore: tx.data.length > PAGE_SIZE, rows: [...rows, ...tx.data.slice(0, PAGE_SIZE).filter((r) => !seen.has(r.id))] }
      remember('transactions', next)
      setHasMore(next.hasMore)
      setRows(next.rows)
    } catch (e) {
      setError(e.message)
    } finally {
      busy.current = false
      setLoadingMore(false)
    }
  }, [filter, hasMore, page, recurring, rows])

  const end = useRef(null)
  useEffect(() => {
    if (!hasMore || !end.current) return
    const watch = new IntersectionObserver((seen) => seen[0].isIntersecting && loadMore(), { rootMargin: '800px 0px' })
    watch.observe(end.current)
    return () => watch.disconnect()
  }, [hasMore, loadMore])

  const filtered = activeFilterCount(filter) > 0

  return (
    <div className="px-4 pt-1 pb-6">
      {filtered && lookups && recurring && (
        <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-10 -mx-4 bg-paper/90 pb-2 backdrop-blur">
          <ActiveFilters filter={filter} lookups={lookups} recurring={recurring} onChange={onFilterChange} />
        </div>
      )}

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

      {hasMore && rows && (
        <div ref={end} className="py-5 text-center text-sm font-medium text-muted">
          {loadingMore ? 'Loading older transactions…' : ' '}
        </div>
      )}

      {filterOpen && lookups && recurring && (
        <FilterSheet
          filter={filter}
          lookups={lookups}
          recurring={recurring}
          onApply={(next) => {
            onFilterChange({ ...next, q: next.q.trim() })
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
  if (filter.q.trim()) {
    chips.push({ key: 'q', label: `“${filter.q.trim()}”`, swatch: <Icon name="search" size={14} strokeWidth={2.6} />, remove: () => onChange({ ...filter, q: '' }) })
  }
  for (const type of TYPE_OPTIONS.filter((t) => filter.types.includes(t.value))) {
    chips.push({
      key: type.value,
      label: type.label,
      swatch: <Icon name={type.icon} size={14} strokeWidth={2.6} />,
      style: type.chip,
      dot: type.dot,
      remove: () => onChange({ ...filter, types: filter.types.filter((x) => x !== type.value) }),
    })
  }
  if (filter.date.preset !== 'all') {
    chips.push({ key: 'date', label: describeDate(filter.date), swatch: <Icon name="calendar" size={14} strokeWidth={2.4} />, remove: () => onChange({ ...filter, date: EMPTY_FILTER.date }) })
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
      style: 'bg-violet/12 text-violet',
      dot: 'bg-violet',
      remove: () => onChange({ ...filter, recurring: false, recurringIds: [] }),
    })
  }

  return (
    <div className="flex gap-1.5 overflow-x-auto px-4 pt-1 [scrollbar-width:none]">
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={c.remove}
          className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full pr-1.5 pl-3 text-[13px] font-semibold whitespace-nowrap ${c.style ?? 'bg-cobalt/10 text-cobalt'}`}
          aria-label={`Remove filter ${c.label}`}
        >
          {c.swatch}
          {c.label}
          <span className={`grid size-[18px] place-items-center rounded-full text-white ${c.dot ?? 'bg-cobalt'}`}>
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

// "Recurring", "Netflix" or "3 recurring"
function recurringText(filter, recurring) {
  const ids = filter.recurringIds ?? []
  if (!ids.length) return 'Recurring'
  if (ids.length === 1) return recurring.find((r) => r.id === ids[0])?.name ?? '1 recurring'
  return `${ids.length} recurring`
}

// Filters: search, type, then fold-out sections (dates, cards, categories) and the Only recurring switch
function FilterSheet({ filter, lookups, recurring, onApply, onClose }) {
  const [draft, setDraft] = useState(filter)
  const [open, setOpen] = useState('date')
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
  }, [draft, recurring])

  // Categories that fit the picked types; picked ones that no longer fit are dropped
  const fits = (d, c) => kindsOf(d).includes(c.kind)
  const update = (patch) =>
    setDraft((d) => {
      const next = { ...d, ...patch }
      return { ...next, categoryIds: next.categoryIds.filter((id) => fits(next, lookups.categories.find((c) => c.id === id) ?? {})) }
    })
  const toggle = (key, id) => setDraft((d) => ({ ...d, [key]: d[key].includes(id) ? d[key].filter((x) => x !== id) : [...d[key], id] }))

  const accounts = lookups.accounts.filter((a) => !a.archived || draft.accountIds.includes(a.id))
  const categories = lookups.categories.filter((c) => fits(draft, c) && (!c.archived || draft.categoryIds.includes(c.id)))
  const hasKinds = kindsOf(draft).length > 0

  const accountText =
    draft.accountIds.length === 0
      ? 'All cards'
      : draft.accountIds.length === 1
        ? (lookups.accounts.find((a) => a.id === draft.accountIds[0])?.name ?? '1 card')
        : `${draft.accountIds.length} cards`
  const pickedCats = draft.categoryIds.map((id) => lookups.categories.find((c) => c.id === id)).filter(Boolean)
  const categoryText =
    pickedCats.length === 0 ? (
      'All'
    ) : pickedCats.length === 1 ? (
      pickedCats[0].name
    ) : (
      <span className="flex">
        {pickedCats.slice(0, 4).map((c) => (
          <span key={c.id} className="-ml-1.5 grid size-[22px] place-items-center rounded-full text-[11px] ring-2 ring-card first:ml-0" style={{ backgroundColor: `${c.color}40` }}>
            {c.icon}
          </span>
        ))}
      </span>
    )

  const fold = (id) => ({ open: open === id, onToggle: () => setOpen((o) => (o === id ? null : id)) })

  return (
    <Sheet
      title="Filters"
      onClose={onClose}
      action={
        activeFilterCount(draft) > 0 && (
          <button onClick={() => setDraft(EMPTY_FILTER)} className="px-2 py-2 text-[15px] font-semibold text-cobalt">
            Reset
          </button>
        )
      }
    >
      <label className="flex h-12 items-center gap-2.5 rounded-2xl border-[1.5px] border-transparent bg-card px-3.5 text-muted focus-within:border-cobalt">
        <Icon name="search" size={19} />
        <input
          value={draft.q}
          onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
          placeholder="Search by name"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-muted"
        />
        {draft.q && (
          <button onClick={() => setDraft((d) => ({ ...d, q: '' }))} className="grid size-5 place-items-center rounded-full bg-muted/60 text-card" aria-label="Clear search">
            <Icon name="close" size={12} strokeWidth={3.4} />
          </button>
        )}
      </label>

      <SectionLabel className="pt-4 pb-2">Type</SectionLabel>
      <TypePicker value={draft.types} onChange={(types) => update({ types })} />

      <div className="mt-3 space-y-2">
        <Fold icon="calendar" tint="bg-cobalt" label="Date range" value={describeDate(draft.date)} set={draft.date.preset !== 'all'} {...fold('date')}>
          <DateTiles date={draft.date} onChange={(date) => setDraft((d) => ({ ...d, date }))} />
        </Fold>

        <Fold icon="card" tint="bg-[#6741d9]" label="Cards" value={accountText} set={draft.accountIds.length > 0} {...fold('cards')}>
          <div className="-mx-3.5 flex gap-2.5 overflow-x-auto px-3.5 py-1 [scrollbar-width:none]">
            {accounts.map((a) => {
              const on = draft.accountIds.includes(a.id)
              return (
                <button key={a.id} onClick={() => toggle('accountIds', a.id)} aria-pressed={on} className="w-[92px] shrink-0 text-center">
                  <span className="relative block">
                    <MiniCard
                      color={a.color}
                      type={a.type}
                      name={a.name}
                      iconSize={20}
                      className={`h-[58px] w-full rounded-xl transition ${on ? 'ring-[2.5px] ring-cobalt ring-offset-[2.5px] ring-offset-card' : draft.accountIds.length ? 'opacity-45' : ''}`}
                    />
                    {on && (
                      <span className="absolute right-1.5 bottom-1.5 grid size-5 place-items-center rounded-full bg-white text-cobalt">
                        <Icon name="check" size={12} strokeWidth={3.4} />
                      </span>
                    )}
                  </span>
                  <span className={`mt-1.5 block truncate text-[12.5px] font-semibold ${a.archived ? 'text-muted' : ''}`}>{a.name}</span>
                </button>
              )
            })}
          </div>
        </Fold>

        {hasKinds && (
          <Fold icon="tag" tint="bg-[#0f9d6b]" label="Categories" value={categoryText} set={pickedCats.length > 0} {...fold('cats')}>
            <CategoryTiles categories={categories} picked={draft.categoryIds} onToggle={(id) => toggle('categoryIds', id)} onClear={() => setDraft((d) => ({ ...d, categoryIds: [] }))} />
          </Fold>
        )}

        {hasKinds && <RecurringSwitch draft={draft} setDraft={setDraft} recurring={recurring} />}
      </div>

      {/* Stays at the bottom while the sections scroll; it also covers the sheet's bottom padding */}
      <div className="sticky -bottom-5 -mx-5 mt-3 -mb-5 bg-gradient-to-t from-paper from-75% to-transparent px-5 pt-4 pb-5">
        <button
          onClick={() => onApply(draft)}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white shadow-[0_12px_24px_-14px_var(--color-cobalt)] active:bg-cobalt-deep"
        >
          {count === null ? 'Show results' : `Show ${count} ${count === 1 ? 'transaction' : 'transactions'}`}
        </button>
      </div>
    </Sheet>
  )
}

function SectionLabel({ children, className = '' }) {
  return <p className={`px-1 text-xs font-semibold tracking-[0.08em] text-muted uppercase ${className}`}>{children}</p>
}

// Filters → Type: All plus the four types; several can be picked (none = All, all four = All again)
function TypePicker({ value, onChange }) {
  const none = value.length === 0
  const pick = (t) => {
    const next = value.includes(t) ? value.filter((x) => x !== t) : [...value, t]
    onChange(next.length === TYPE_OPTIONS.length ? [] : next)
  }
  const tile = (key, on, label, icon, colours, onClick) => (
    <button key={key} aria-pressed={on} onClick={onClick} className="relative flex flex-col items-center gap-1 rounded-[13px] pt-2 pb-1.5 transition active:scale-[0.95]">
      <span className={`grid size-8 place-items-center rounded-[10px] transition ${on ? `${colours.on} shadow-[0_8px_14px_-8px_rgba(11,27,69,0.55)]` : colours.tint}`}>
        <Icon name={icon} size={17} strokeWidth={2.5} />
      </span>
      <span className={`text-xs font-bold ${on ? colours.text : 'text-muted'}`}>{label}</span>
      {on && key !== 'all' && (
        <span className={`absolute top-[3px] right-[7px] grid size-[15px] place-items-center rounded-full ${colours.on}`}>
          <Icon name="check" size={9} strokeWidth={4} />
        </span>
      )}
    </button>
  )
  return (
    <div className="grid grid-cols-5 gap-1 rounded-[18px] bg-card p-1.5">
      {tile('all', none, 'All', 'list', { on: 'bg-cobalt text-white', tint: 'bg-cobalt/10 text-cobalt', text: 'text-cobalt' }, () => onChange([]))}
      {TYPE_OPTIONS.map((t) => tile(t.value, value.includes(t.value), t.label, t.icon, t, () => pick(t.value)))}
    </div>
  )
}

// A section that folds open in place: coloured icon, label, what's picked, then its contents
function Fold({ icon, tint, label, value, set, open, onToggle, children }) {
  return (
    <div className="overflow-hidden rounded-[20px] bg-card">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-3.5 py-3 text-left">
        <span className={`grid size-[34px] shrink-0 place-items-center rounded-[10px] text-white ${tint}`}>
          <Icon name={icon} size={17} strokeWidth={2.2} />
        </span>
        <span className="flex-1 text-base font-bold">{label}</span>
        <span className={`max-w-[50%] truncate text-sm ${set ? 'font-bold text-cobalt' : 'text-muted'}`}>{value}</span>
        <Icon name="chevronRight" size={17} className={`shrink-0 text-muted/70 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-3.5 pb-3.5">{children}</div>}
    </div>
  )
}

const TILE_PRESETS = ['thisMonth', 'lastMonth', 'last3', 'thisYear']
const PRESET_LABEL = { thisMonth: 'This month', lastMonth: 'Last month', last3: 'Last 3 months', thisYear: 'This year' }

// Date range: four tiles (with a strip of the last 12 months showing what each covers), All time and Custom
function DateTiles({ date, onChange }) {
  const custom = date.preset === 'custom'
  const picked = 'bg-gradient-to-br from-cobalt to-cobalt-deep text-white shadow-[0_12px_20px_-14px_var(--color-cobalt)]'
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {TILE_PRESETS.map((p) => {
          const on = date.preset === p
          return (
            <button key={p} onClick={() => onChange({ preset: p })} aria-pressed={on} className={`relative overflow-hidden rounded-2xl px-3 pt-3 pb-2.5 text-left transition-transform active:scale-[0.98] ${on ? picked : 'bg-paper'}`}>
              {on && <span className="pointer-events-none absolute -top-8 -right-6 size-20 rounded-full bg-white/10" />}
              <b className="block font-display text-[15.5px] leading-tight">{PRESET_LABEL[p]}</b>
              <span className={`tabular block text-xs ${on ? 'text-white/80' : 'text-muted'}`}>{describeRange({ preset: p })}</span>
              <span className="mt-2.5 flex h-4 gap-[2.5px]" aria-hidden="true">
                {monthStrip({ preset: p }).map((hit, i) => (
                  <i key={i} className={`flex-1 rounded-[2px] ${hit ? (on ? 'bg-white' : 'bg-cobalt') : on ? 'bg-white/25' : 'bg-line'}`} />
                ))}
              </span>
            </button>
          )
        })}
        <WideTile icon="list" on={date.preset === 'all'} picked={picked} title="All time" text="Every transaction" onClick={() => onChange({ preset: 'all' })} />
        <WideTile
          icon="calendar"
          on={custom}
          picked={picked}
          title="Custom"
          text={custom ? describeDate(date) : 'Pick the days on a calendar'}
          // A new custom range starts at this month so far
          onClick={() => !custom && onChange({ preset: 'custom', from: `${todayISO().slice(0, 8)}01`, to: todayISO() })}
        />
      </div>
      {custom && <RangeCalendar from={date.from} to={date.to} onChange={({ from, to }) => onChange({ preset: 'custom', from, to })} />}
    </>
  )
}

function WideTile({ icon, on, picked, title, text, onClick }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`col-span-2 flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-transform active:scale-[0.99] ${on ? picked : 'bg-paper'}`}>
      <span className={`grid size-9 shrink-0 place-items-center rounded-[11px] ${on ? 'bg-white/20' : 'bg-cobalt/12 text-cobalt'}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <b className="block font-display text-[15.5px] leading-tight">{title}</b>
        <span className={`tabular block truncate text-xs ${on ? 'text-white/80' : 'text-muted'}`}>{text}</span>
      </span>
      {on && <Icon name="check" size={18} strokeWidth={3} />}
    </button>
  )
}

// Categories as tiles, four per row, grouped Expenses / Income; picked ones tinted in their colour with a tick
function CategoryTiles({ categories, picked, onToggle, onClear }) {
  const groups = [
    { kind: 'expense', label: 'Expenses' },
    { kind: 'income', label: 'Income' },
  ]
    .map((g) => ({ ...g, items: categories.filter((c) => c.kind === g.kind) }))
    .filter((g) => g.items.length > 0)
  return groups.map((g, i) => (
    <div key={g.kind} className={i ? 'pt-3.5' : ''}>
      <div className="flex justify-between px-0.5 pb-2">
        <span className="text-[11px] font-bold tracking-[0.09em] text-muted uppercase">{g.label}</span>
        {i === 0 && picked.length > 0 && (
          <button onClick={onClear} className="text-[13px] font-semibold text-cobalt">
            Clear
          </button>
        )}
      </div>
      <div className="grid grid-cols-4 gap-[7px]">
        {g.items.map((c) => {
          const on = picked.includes(c.id)
          return (
            <button
              key={c.id}
              onClick={() => onToggle(c.id)}
              aria-pressed={on}
              className={`relative rounded-[15px] border-2 px-0.5 pt-2.5 pb-2 text-center transition active:scale-[0.96] ${on ? '' : 'border-transparent bg-paper'} ${picked.length && !on ? 'opacity-45' : ''}`}
              style={on ? { borderColor: c.color, backgroundColor: `${c.color}21` } : undefined}
            >
              <span className="mx-auto mb-1 grid size-[38px] place-items-center rounded-xl text-[19px]" style={{ backgroundColor: `${c.color}${on ? '4d' : '2e'}` }}>
                {c.icon}
              </span>
              <b className={`block truncate text-[11.5px] ${c.archived ? 'text-muted' : ''}`}>{c.name}</b>
              {on && (
                <span className="absolute top-1 right-1 grid size-[17px] place-items-center rounded-full text-white" style={{ backgroundColor: c.color }}>
                  <Icon name="check" size={10} strokeWidth={4} />
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  ))
}

// Only recurring: a switch on the row; when on, the recurring entries to narrow it down (none picked = all of them)
function RecurringSwitch({ draft, setDraft, recurring }) {
  const on = !!draft.recurring
  const ids = draft.recurringIds ?? []
  const toggle = (id) => setDraft((d) => ({ ...d, recurringIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }))
  return (
    <div className="overflow-hidden rounded-[20px] bg-card">
      <button
        role="switch"
        aria-checked={on}
        onClick={() => setDraft((d) => ({ ...d, recurring: !on, recurringIds: [] }))}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="grid size-[34px] shrink-0 place-items-center rounded-[10px] bg-violet text-white">
          <Icon name="repeat" size={17} strokeWidth={2.2} />
        </span>
        <span className="flex-1 text-base font-bold">Only recurring</span>
        <span className={`relative h-[29px] w-12 shrink-0 rounded-full transition-colors ${on ? 'bg-violet' : 'bg-line'}`}>
          <span className={`absolute top-[3px] size-[23px] rounded-full bg-white shadow transition-[left] ${on ? 'left-[22px]' : 'left-[3px]'}`} />
        </span>
      </button>
      {on && (
        <div className="px-3.5 pb-3.5">
          {recurring.length === 0 ? (
            <p className="text-sm text-muted">No recurring payments yet</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {recurring.map((r) => {
                  const picked = ids.includes(r.id)
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggle(r.id)}
                      aria-pressed={picked}
                      className={`flex h-10 items-center gap-2 rounded-full border-[1.5px] pr-3.5 pl-[7px] text-sm font-semibold transition ${picked ? 'border-violet bg-violet/14' : 'border-transparent bg-paper'}`}
                    >
                      <MerchantIcon name={r.name} className="size-[26px] rounded-lg bg-white text-sm shadow-[inset_0_0_0_1px_var(--color-line)]">
                        {r.icon}
                      </MerchantIcon>
                      {r.name}
                    </button>
                  )
                })}
              </div>
              <p className="pt-2 text-[12.5px] text-muted">{ids.length ? `${ids.length} of ${recurring.length} picked` : 'All recurring · tap to pick some'}</p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
