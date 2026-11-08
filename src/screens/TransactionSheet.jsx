import { useEffect, useMemo, useState } from 'react'
import { MiniCard } from '../components/BankCard'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import GoalPicker from '../components/GoalPicker'
import MerchantIcon from '../components/MerchantIcon'
import Sheet from '../components/Sheet'
import { checkOverdraft, fetchAccountsWithBalances, isInvest } from '../lib/balances'
import { formatDay, monthRange, todayISO } from '../lib/dates'
import { checkGoals, savingsEffect } from '../lib/goals'
import { defaultAccountId, fetchLastUsedAccountId, fetchLookups, lookupCache } from '../lib/lookups'
import { centsToPad, formatCents, formatTyping, PAD_KEYS, parseToCents, pressKey } from '../lib/money'
import { supabase } from '../lib/supabase'

// The four types as tiles. color = the tile and the amount card's wash; button = Next / Save.
const TYPES = [
  { value: 'expense', label: 'Expense', icon: 'moneyOut', color: 'var(--color-orange-text)', button: 'var(--color-cobalt)' },
  { value: 'income', label: 'Income', icon: 'moneyIn', color: 'var(--color-gain)', button: 'var(--color-gain)' },
  { value: 'transfer', label: 'Transfer', icon: 'swap', color: 'var(--color-cobalt)', button: 'var(--color-cobalt)' },
  { value: 'invest', label: 'Invest', icon: 'invest', color: 'var(--color-teal)', button: 'var(--color-teal)' },
]

const tint = (color, pct, base = 'transparent') => `color-mix(in srgb, ${color} ${pct}%, ${base})`
// The big buttons: a gradient in the type's colour with a soft glow
const buttonStyle = (color) => ({
  background: `linear-gradient(135deg, ${color}, ${tint(color, 72, '#000')})`,
  boxShadow: `0 12px 24px -12px ${color}`,
})

// Invest has two directions: put money in ('invest', it leaves the account) or take it out ('divest', it arrives)
const DIRECTIONS = [
  { value: 'in', label: 'Put in', icon: 'invest' },
  { value: 'out', label: 'Take out', icon: 'investOut' },
]

// Invest − Take out so far this month (leaving out the transaction being edited)
async function fetchInvestedThisMonth(exceptId) {
  const [from, to] = monthRange(todayISO())
  const { data, error } = await supabase.from('transactions').select('id, type, amount_cents').in('type', ['invest', 'divest']).gte('date', from).lte('date', to)
  if (error) throw error
  return data.filter((t) => t.id !== exceptId).reduce((s, t) => s + (t.type === 'invest' ? t.amount_cents : -t.amount_cents), 0)
}

// Past names → the category last used with them, to suggest a category while typing a name.
// The name is stored in the transaction's note.
async function fetchNameHistory() {
  const { data, error } = await supabase
    .from('transactions')
    .select('note, type, category_id')
    .not('note', 'is', null)
    .not('category_id', 'is', null)
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) throw error
  const history = new Map()
  for (const t of data) {
    const key = `${t.type}|${t.note.trim().toLowerCase()}`
    if (!history.has(key)) history.set(key, t.category_id) // most recent wins
  }
  return history
}

function suggestCategory(history, type, name) {
  const typed = name.trim().toLowerCase()
  if (!history || typed.length < 2) return null
  const exact = history.get(`${type}|${typed}`)
  if (exact) return exact
  if (typed.length < 3) return null
  for (const [key, categoryId] of history) {
    if (key.startsWith(`${type}|${typed}`)) return categoryId
  }
  return null
}

// transaction: null to add a new one, or an existing row to edit it.
// Step 1: amount (number pad). Step 2: a sheet with the name and categories, then Save.
// Invest (teal): step 1 also has Put in / Take out; step 2 has only the name and this month's total.
export default function TransactionSheet({ transaction, onClose, onSaved }) {
  const isNew = !transaction
  const [lookups, setLookups] = useState(lookupCache.lookups)
  const [history, setHistory] = useState(null)
  const [step, setStep] = useState(1)
  // The tab: 'divest' (Take out) is shown on the Invest tab
  const [type, setType] = useState(isInvest(transaction) ? 'invest' : (transaction?.type ?? 'expense'))
  const [direction, setDirection] = useState(transaction?.type === 'divest' ? 'out' : 'in')
  const [investedSoFar, setInvestedSoFar] = useState(null)
  const [amount, setAmount] = useState(transaction ? centsToPad(transaction.amount_cents) : '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? null)
  const [accountId, setAccountId] = useState(() =>
    transaction ? transaction.account_id : lookupCache.lookups && defaultAccountId(lookupCache.lookups, lookupCache.lastUsedAccountId),
  )
  const [toAccountId, setToAccountId] = useState(transaction?.to_account_id ?? null)
  const [date, setDate] = useState(transaction?.date ?? todayISO())
  const [name, setName] = useState(transaction?.note ?? '')
  const [goalId, setGoalId] = useState(transaction?.goal_id ?? null) // null = General savings
  const [picking, setPicking] = useState(null) // null | 'account' | 'date'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [balances, setBalances] = useState(null) // account id → cents, shown next to the cards (a nice extra)

  useEffect(() => {
    Promise.all([fetchLookups(), isNew ? fetchLastUsedAccountId() : null])
      .then(([data, lastUsed]) => {
        setLookups(data)
        // Only fill in the default if nothing was chosen yet
        if (isNew) setAccountId((current) => current ?? defaultAccountId(data, lastUsed))
      })
      .catch((e) => setError(e.message))
    // Suggestions are a nice extra; the screen works without them
    fetchNameHistory()
      .then(setHistory)
      .catch(() => {})
    fetchAccountsWithBalances()
      .then((list) => setBalances(new Map(list.map((a) => [a.id, a.balance_cents]))))
      .catch(() => {})
  }, [isNew])

  // Full-screen: stop the page behind from scrolling; Escape goes back or closes
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  // Keyboard typing works too on the amount step (handy on a computer)
  useEffect(() => {
    if (step !== 1 || picking) return
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return
      if (/^[0-9]$/.test(e.key)) setAmount((a) => pressKey(a, e.key))
      else if (e.key === '.' || e.key === ',') setAmount((a) => pressKey(a, '.'))
      else if (e.key === 'Backspace') setAmount((a) => pressKey(a, 'back'))
      else if (e.key === 'Enter') next()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const suggested = useMemo(() => (type === 'transfer' || type === 'invest' ? null : suggestCategory(history, type, name)), [history, type, name])
  const investing = type === 'invest'
  // What gets saved: invest / divest for the Invest tab
  const rowType = investing ? (direction === 'out' ? 'divest' : 'invest') : type

  // This month's invested total, for step 2 of Invest
  useEffect(() => {
    if (!investing) return
    fetchInvestedThisMonth(transaction?.id)
      .then(setInvestedSoFar)
      .catch(() => setInvestedSoFar(null))
  }, [investing, transaction?.id])

  function changeType(nextType) {
    setType(nextType)
    setError(null)
    // A category belongs to either expenses or income, so clear it when switching
    if (nextType !== type) setCategoryId(null)
  }

  function next() {
    if (!parseToCents(amount)) return setError('Enter an amount.')
    if (!accountId) return setError('Choose an account.')
    setError(null)
    setStep(2)
  }

  async function save() {
    if (busy) return
    const cents = parseToCents(amount)
    // A suggested category counts as chosen until another one is tapped
    const pick = investing ? null : type === 'transfer' ? toAccountId : (categoryId ?? suggested)
    if (!pick && !investing) return setError(type === 'transfer' ? 'Choose the account the money goes to.' : 'Choose a category.')
    const toId = type === 'transfer' ? pick : null
    if (type === 'transfer' && toId === accountId) return setError('Choose a different account than the one the money comes from.')

    setBusy(true)
    setError(null)
    const row = {
      type: rowType,
      amount_cents: cents,
      date,
      account_id: accountId,
      to_account_id: toId,
      category_id: type === 'transfer' || investing ? null : pick,
      note: name.trim() || null,
    }
    // Money into or out of savings belongs to a goal (General savings when none is picked)
    row.goal_id = savingsEffect(lookups.accounts, row) ? goalId : null
    try {
      const problem = await checkOverdraft(transaction, row)
      if (problem) {
        setBusy(false)
        return setError(problem)
      }
      const goalIssue = await checkGoals(transaction, row)
      if (goalIssue) {
        setBusy(false)
        return setError(goalIssue)
      }
    } catch (e) {
      setBusy(false)
      return setError(e.message)
    }
    const { error } = isNew
      ? await supabase.from('transactions').insert(row)
      : await supabase.from('transactions').update(row).eq('id', transaction.id)
    setBusy(false)
    if (error) return setError(error.message)
    if (isNew) lookupCache.lastUsedAccountId = accountId
    onSaved()
  }

  async function remove() {
    if (!window.confirm('Delete this transaction? This can’t be undone.')) return
    setBusy(true)
    try {
      const problem = await checkOverdraft(transaction, null)
      if (problem) {
        setBusy(false)
        return setError(problem)
      }
      const goalIssue = await checkGoals(transaction, null)
      if (goalIssue) {
        setBusy(false)
        return setError(goalIssue)
      }
    } catch (e) {
      setBusy(false)
      return setError(e.message)
    }
    const { error } = await supabase.from('transactions').delete().eq('id', transaction.id)
    setBusy(false)
    if (error) return setError(error.message)
    onSaved()
  }

  const title = isNew ? 'Add transaction' : 'Edit transaction'

  if (!lookups) {
    return (
      <Sheet title={title} onClose={onClose} tall>
        {error ? <p className="py-6 text-loss">{error}</p> : <div className="h-96" />}
      </Sheet>
    )
  }

  // Keep showing an archived account/category if an existing transaction uses it
  const accounts = lookups.accounts.filter((a) => !a.archived || a.id === accountId || a.id === toAccountId)
  const categories = lookups.categories.filter((c) => c.kind === type && (!c.archived || c.id === categoryId))
  const accountById = (id) => lookups.accounts.find((a) => a.id === id)
  const account = accountById(accountId)

  if (accounts.length === 0) {
    return (
      <Sheet title={title} onClose={onClose} tall>
        <p className="py-6 text-center text-muted">
          Add an account first in Settings → Accounts & cards, then you can record transactions.
        </p>
      </Sheet>
    )
  }

  const dayLabel = date === todayISO() ? 'Today' : formatDay(date)
  const sign = type === 'expense' ? '−' : type === 'income' ? '+' : ''
  // Invest: this month's total after saving this one
  const thisMonth = date.slice(0, 7) === todayISO().slice(0, 7)
  const investedAfter =
    investedSoFar === null ? null : investedSoFar + (thisMonth ? (direction === 'out' ? -1 : 1) * (parseToCents(amount) ?? 0) : 0)
  // The selected choice in step 2: what was tapped, else the suggestion
  const highlighted = type === 'transfer' ? toAccountId : (categoryId ?? suggested)
  // Into savings (+) or out of it (−): then the money belongs to a goal
  const goalDirection = Math.sign(
    savingsEffect(lookups.accounts, { type: rowType, amount_cents: 1, account_id: accountId, to_account_id: type === 'transfer' ? toAccountId : null }),
  )

  const T = TYPES.find((t) => t.value === type)
  const fromWord = (investing && direction === 'out') || type === 'income' ? 'Into' : 'From'
  const amountText = `${sign}${formatCents(parseToCents(amount) ?? 0)}`
  const toAccount = type === 'transfer' ? accountById(toAccountId) : null
  const pickedCategory = type === 'transfer' || investing ? null : categories.find((c) => c.id === highlighted)
  const otherAccounts = accounts.filter((a) => a.id !== accountId && (!a.archived || a.id === toAccountId))

  // Step 2's preview: the row as it will look in Transactions
  const previewLine =
    type === 'transfer'
      ? toAccount
        ? `${account?.name} → ${toAccount.name}`
        : `From ${account?.name}`
      : investing
        ? direction === 'out'
          ? `Taken out · to ${account?.name}`
          : `Invested · ${account?.name}`
        : `${pickedCategory?.name ?? 'No category yet'} · ${account?.name}`
  const previewColor = type === 'transfer' ? 'var(--color-cobalt)' : investing ? 'var(--color-teal)' : (pickedCategory?.color ?? '#868e96')
  const previewGlyph =
    type === 'transfer' ? (
      <Icon name="swap" size={22} strokeWidth={2.2} />
    ) : investing ? (
      <Icon name={direction === 'out' ? 'investOut' : 'invest'} size={22} strokeWidth={2.2} />
    ) : pickedCategory ? (
      pickedCategory.icon
    ) : name.trim() ? (
      <span className="font-display font-extrabold">{name.trim()[0].toUpperCase()}</span>
    ) : (
      <Icon name="pencil" size={20} strokeWidth={2} />
    )
  const placeholder = investing ? 'Investing' : type === 'income' ? 'Salary' : type === 'transfer' ? 'To savings' : 'Pingo Doce'
  const label = 'px-1 pb-2 text-xs font-bold tracking-[0.07em] text-muted uppercase'

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-paper motion-safe:animate-[sheet-up_220ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative flex h-full w-full max-w-lg flex-col pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {step === 1 ? (
          <>
            {/* Step 1: type, the amount on its card with the card and date under it, number pad */}
            <div className="flex h-14 shrink-0 items-center px-3.5">
              <button onClick={onClose} className="grid size-10 place-items-center rounded-full bg-card text-muted" aria-label="Close">
                <Icon name="close" size={20} />
              </button>
              <h2 className="flex-1 text-center font-display text-[17px] font-bold">{title}</h2>
              <span className="w-10" />
            </div>

            <div className="grid shrink-0 grid-cols-4 gap-2 px-4" role="radiogroup" aria-label="Type">
              {TYPES.map((t) => {
                const on = type === t.value
                return (
                  <button
                    key={t.value}
                    role="radio"
                    aria-checked={on}
                    onClick={() => changeType(t.value)}
                    className="flex flex-col items-center gap-1.5 rounded-[18px] pt-2.5 pb-2 transition-colors"
                    style={{ background: on ? tint(t.color, 10, 'var(--color-card)') : 'var(--color-card)', boxShadow: on ? `inset 0 0 0 2px ${t.color}` : undefined }}
                  >
                    <span
                      className="grid size-8 place-items-center rounded-full"
                      style={{ background: on ? t.color : tint(t.color, 14), color: on ? '#fff' : t.color }}
                    >
                      <Icon name={t.icon} size={16} strokeWidth={2.4} />
                    </span>
                    <span className="text-[12.5px] font-bold" style={{ color: on ? t.color : 'var(--color-muted)' }}>
                      {t.label}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="relative mx-4 mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-card">
              <span
                className="pointer-events-none absolute -top-16 -right-12 size-[190px] rounded-full transition-colors"
                style={{ background: tint(T.color, 12) }}
              />
              <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center px-4">
                <span className="text-xs font-bold tracking-[0.07em] uppercase" style={{ color: T.color }}>
                  {investing ? (direction === 'out' ? 'Take out' : 'Put in') : T.label}
                </span>
                <p
                  className={`tabular font-display leading-[1.1] font-extrabold tracking-tight ${!amount ? 'text-muted/40' : ''} ${
                    // Long amounts get smaller so €9.999.999,99 still fits a small phone
                    formatTyping(amount).length > 9 ? 'text-[42px]' : formatTyping(amount).length > 6 ? 'text-[52px]' : 'text-[62px]'
                  }`}
                  aria-live="polite"
                >
                  <span className="mr-1 align-[0.95em] text-[28px] text-muted">{amount ? sign : ''}€</span>
                  {formatTyping(amount)}
                </p>
                {investing && (
                  <div className="mt-3 flex gap-0.5 rounded-[14px] p-[3px]" style={{ background: tint('var(--color-teal)', 12) }} role="radiogroup" aria-label="Direction">
                    {DIRECTIONS.map((d) => (
                      <button
                        key={d.value}
                        role="radio"
                        aria-checked={direction === d.value}
                        onClick={() => setDirection(d.value)}
                        className={`flex items-center gap-1.5 rounded-[11px] px-3.5 py-[7px] text-[13.5px] font-bold text-teal ${
                          direction === d.value ? 'bg-card shadow-[0_2px_8px_-4px_rgba(11,27,69,0.3)]' : 'opacity-70'
                        }`}
                      >
                        <Icon name={d.icon} size={15} strokeWidth={2.4} />
                        {d.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative grid shrink-0 grid-cols-[1.3fr_1fr] border-t border-line">
                <button onClick={() => setPicking('account')} className="flex min-w-0 items-center gap-2.5 border-r border-line px-4 py-3 text-left">
                  {account && <MiniCard color={account.color} name={account.name} className="h-5 w-[30px] rounded-[5px]" />}
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-semibold text-muted">{fromWord}</span>
                    <span className="block truncate text-[14.5px] font-bold">{account?.name ?? 'Account'}</span>
                  </span>
                </button>
                <button onClick={() => setPicking('date')} className="flex min-w-0 items-center gap-2.5 px-4 py-3 text-left">
                  <span className="grid size-[30px] shrink-0 place-items-center rounded-[10px] bg-bubble text-cobalt">
                    <Icon name="calendar" size={16} strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-semibold text-muted">Date</span>
                    <span className="block truncate text-[14.5px] font-bold">{dayLabel}</span>
                  </span>
                </button>
              </div>
            </div>

            <div className="shrink-0 px-4 pt-3">
              <div className="grid grid-cols-3 gap-[7px]">
                {PAD_KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => setAmount((a) => pressKey(a, k))}
                    className={`grid h-[clamp(42px,6.2dvh,52px)] place-items-center rounded-2xl font-display text-[25px] font-semibold active:bg-line ${
                      k === '.' || k === 'back' ? '' : 'bg-card'
                    }`}
                    aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
                  >
                    {k === 'back' ? <Icon name="backspace" size={25} /> : k === '.' ? ',' : k}
                  </button>
                ))}
              </div>
              {error && <p className="pt-2 text-center text-sm font-semibold text-loss">{error}</p>}
              <button
                onClick={next}
                className="mt-2.5 flex w-full items-center justify-center gap-1 rounded-[18px] py-4 text-base font-semibold text-white active:opacity-90"
                style={buttonStyle(T.button)}
              >
                Next
                <Icon name="chevronRight" size={18} strokeWidth={2.4} />
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Step 2: a preview of the row, the name, then category / to card / goal, and Save */}
            <div className="flex h-14 shrink-0 items-center px-3.5">
              <button onClick={() => setStep(1)} className="grid size-10 place-items-center rounded-full bg-card text-ink" aria-label="Back to amount">
                <Icon name="chevronLeft" size={20} />
              </button>
              <h2 className="flex-1 text-center font-display text-[17px] font-bold">
                {T.label} · {dayLabel}
              </h2>
              <span className="w-10" />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3 motion-safe:animate-[step-in_240ms_ease-out]">
              <div className="relative flex items-center gap-3 overflow-hidden rounded-[22px] bg-card p-3.5 shadow-[0_14px_30px_-24px_rgba(11,27,69,0.6)]">
                <span className="pointer-events-none absolute -top-10 -right-8 size-[120px] rounded-full" style={{ background: tint(previewColor, 12) }} />
                <MerchantIcon
                  name={type === 'transfer' || investing ? '' : name}
                  className="relative size-12 rounded-[15px] text-[23px]"
                  style={{ background: tint(previewColor, 18), color: previewColor }}
                >
                  {previewGlyph}
                </MerchantIcon>
                <span className="relative min-w-0 flex-1">
                  <span className={`block truncate text-[16.5px] font-bold ${name.trim() ? '' : 'text-muted/60'}`}>{name.trim() || placeholder}</span>
                  <span className="block truncate text-[13px] text-muted">{previewLine}</span>
                </span>
                <span className={`tabular relative font-display text-[19px] font-extrabold ${type === 'income' ? 'text-gain' : investing ? 'text-teal' : ''}`}>
                  {amountText}
                </span>
              </div>

              <h3 className={`${label} pt-[18px]`}>Name</h3>
              <label className="flex items-center gap-2.5 rounded-[18px] bg-card px-4 py-3.5 text-muted">
                <Icon name="pencil" size={18} strokeWidth={2} />
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={`${placeholder} (optional)`}
                  autoComplete="off"
                  enterKeyHint="done"
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className="w-full bg-transparent text-[16.5px] font-semibold text-ink outline-none placeholder:font-medium placeholder:text-muted/55"
                />
              </label>

              <div className="space-y-4 pt-[18px]">
                {investing ? (
                  <div className="flex items-center gap-3 rounded-[18px] px-3.5 py-3.5" style={{ background: tint('var(--color-teal)', 13) }}>
                    <span className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-card text-teal">
                      <Icon name={direction === 'out' ? 'investOut' : 'invest'} size={20} strokeWidth={2.4} />
                    </span>
                    <span className="min-w-0 flex-1 text-[13.5px] text-muted">
                      {investedAfter !== null && thisMonth && (
                        <b className="tabular block text-[15px] text-teal">
                          {investedAfter >= 0
                            ? `${formatCents(investedAfter).replace(/,00$/, '')} put in this month`
                            : `${formatCents(-investedAfter).replace(/,00$/, '')} taken out this month`}
                        </b>
                      )}
                      Not counted as spending
                    </span>
                  </div>
                ) : type === 'transfer' ? (
                  <div>
                    <h3 className={label}>To card</h3>
                    {otherAccounts.filter((a) => !a.archived).length === 0 ? (
                      <p className="rounded-[18px] bg-card px-4 py-5 text-center text-sm text-muted">
                        Add a second account in Profile → Accounts & cards to move money between them.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {otherAccounts.map((a) => {
                          const on = highlighted === a.id
                          return (
                            <button
                              key={a.id}
                              onClick={() => {
                                setToAccountId(a.id)
                                setError(null)
                              }}
                              aria-pressed={on}
                              className="flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-[11px] text-left transition-colors"
                              style={{
                                background: on ? tint(a.color, 12, 'var(--color-card)') : 'var(--color-card)',
                                boxShadow: on ? `inset 0 0 0 2px ${a.color}` : undefined,
                              }}
                            >
                              <MiniCard color={a.color} name={a.name} className="h-[22px] w-8 rounded-[5px]" />
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-bold">{a.name}</span>
                                {balances?.has(a.id) && <span className="tabular block text-xs text-muted">{formatCents(balances.get(a.id))}</span>}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <div className="flex items-baseline justify-between">
                      <h3 className={label}>Category</h3>
                      {suggested && !categoryId && (
                        <span className="flex items-center gap-1 pr-1 text-xs font-semibold text-violet">
                          <Icon name="sparkles" size={13} strokeWidth={2} />
                          Suggested from the name
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {categories.map((c) => {
                        const on = highlighted === c.id
                        return (
                          <button
                            key={c.id}
                            onClick={() => {
                              setCategoryId(c.id)
                              setError(null)
                            }}
                            aria-pressed={on}
                            className="relative flex flex-col items-center gap-[7px] rounded-[18px] px-1 pt-3 pb-2.5 transition-colors"
                            style={{
                              background: on ? tint(c.color, 15, 'var(--color-card)') : 'var(--color-card)',
                              boxShadow: on ? `inset 0 0 0 2px ${c.color}` : undefined,
                            }}
                          >
                            <span
                              className="grid size-11 place-items-center rounded-full text-[22px] transition-colors"
                              style={{ background: on ? c.color : tint(c.color, 16) }}
                            >
                              {c.icon}
                            </span>
                            <span
                              className={`w-full truncate text-center text-xs ${on ? 'font-bold' : 'font-semibold'}`}
                              style={on ? { color: tint(c.color, 70, 'var(--color-ink)') } : undefined}
                            >
                              {c.name}
                            </span>
                            {on && (
                              <span className="absolute top-1.5 right-1.5 grid size-[18px] place-items-center rounded-full text-white" style={{ background: c.color }}>
                                <Icon name={categoryId ? 'check' : 'sparkles'} size={11} strokeWidth={categoryId ? 3.4 : 2.4} />
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {goalDirection !== 0 && <GoalPicker goals={lookups.goals ?? []} value={goalId} onChange={setGoalId} direction={goalDirection} />}
              </div>
            </div>

            <div className="shrink-0 px-4 pt-2">
              {error && <p className="pb-2.5 text-center text-sm font-semibold text-loss">{error}</p>}
              <button
                onClick={save}
                disabled={busy}
                className="w-full rounded-[18px] py-4 text-base font-semibold text-white active:opacity-90 disabled:opacity-60"
                style={buttonStyle(T.button)}
              >
                Save
              </button>
              {!isNew && (
                <button onClick={remove} disabled={busy} className="w-full pt-3 pb-1 text-base font-semibold text-loss">
                  Delete transaction
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {picking === 'date' && (
        <Sheet title="Date" onClose={() => setPicking(null)} tall>
          <DatePicker
            value={date}
            quickPicks={false}
            onChange={(iso) => {
              setDate(iso)
              setPicking(null)
            }}
          />
        </Sheet>
      )}

      {picking === 'account' && (
        <Sheet title={fromWord === 'Into' ? 'Into which card' : 'From which card'} onClose={() => setPicking(null)}>
          <ul className="overflow-hidden rounded-[20px] bg-card">
            {accounts.map((a) => (
              <li key={a.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => {
                    setAccountId(a.id)
                    setPicking(null)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
                >
                  <MiniCard color={a.color} name={a.name} className="h-6 w-9 rounded-md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-semibold">{a.name}</span>
                    {balances?.has(a.id) && <span className="tabular block text-[13px] text-muted">{formatCents(balances.get(a.id))}</span>}
                  </span>
                  {a.id === accountId && (
                    <span className="text-cobalt">
                      <Icon name="check" size={20} strokeWidth={2.6} />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}
    </div>
  )
}
