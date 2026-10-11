import { useEffect, useMemo, useState } from 'react'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import GoalPicker from '../components/GoalPicker'
import Sheet from '../components/Sheet'
import { checkOverdraft } from '../lib/balances'
import { formatDay, todayISO } from '../lib/dates'
import { checkGoals, savingsEffect } from '../lib/goals'
import { defaultAccountId, fetchLastUsedAccountId, fetchLookups, lookupCache } from '../lib/lookups'
import { centsToPad, formatCents, formatTyping, PAD_KEYS, parseToCents, pressKey } from '../lib/money'
import { supabase } from '../lib/supabase'

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

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

// transaction: null to add a new one, or an existing row to edit it
// Step 1: amount (number pad). Step 2: a sheet with the name and categories, then Save.
export default function TransactionSheet({ transaction, onClose, onSaved }) {
  const isNew = !transaction
  const [lookups, setLookups] = useState(lookupCache.lookups)
  const [history, setHistory] = useState(null)
  const [step, setStep] = useState(1)
  const [type, setType] = useState(transaction?.type ?? 'expense')
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

  const suggested = useMemo(() => (type === 'transfer' ? null : suggestCategory(history, type, name)), [history, type, name])

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
    const pick = type === 'transfer' ? toAccountId : (categoryId ?? suggested)
    if (!pick) return setError(type === 'transfer' ? 'Choose the account the money goes to.' : 'Choose a category.')
    const toId = type === 'transfer' ? pick : null
    if (type === 'transfer' && toId === accountId) return setError('Choose a different account than the one the money comes from.')

    setBusy(true)
    setError(null)
    const row = {
      type,
      amount_cents: cents,
      date,
      account_id: accountId,
      to_account_id: toId,
      category_id: type === 'transfer' ? null : pick,
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
  // The selected choice in step 2: what was tapped, else the suggestion
  const highlighted = type === 'transfer' ? toAccountId : (categoryId ?? suggested)
  // Into savings (+) or out of it (−): then the money belongs to a goal
  const goalDirection = Math.sign(
    savingsEffect(lookups.accounts, { type, amount_cents: 1, account_id: accountId, to_account_id: type === 'transfer' ? toAccountId : null }),
  )

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-paper motion-safe:animate-[sheet-up_220ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative flex h-full w-full max-w-lg flex-col px-4 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {/* Step 1: amount */}
        <div className="flex h-14 shrink-0 items-center">
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Close">
            <Icon name="close" />
          </button>
          <div className="flex flex-1 justify-center gap-1.5" aria-hidden="true">
            <span className="h-1 w-6 rounded-full bg-cobalt" />
            <span className={`h-1 w-6 rounded-full ${step === 2 ? 'bg-cobalt' : 'bg-line'}`} />
          </div>
          <span className="w-11" />
        </div>

        <div className="flex justify-center">
          <div className="flex rounded-full bg-line/70 p-1">
            {TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => changeType(t.value)}
                aria-pressed={type === t.value}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${type === t.value ? 'bg-ink text-paper' : 'text-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-11">
          <p
            className={`tabular text-center font-display text-[64px] leading-none font-extrabold tracking-tight ${amount ? 'text-ink' : 'text-muted/40'}`}
            aria-live="polite"
          >
            <span className="mr-1 align-[0.55em] text-[28px] font-bold text-muted">€</span>
            {formatTyping(amount)}
          </p>
          <div className="flex items-center rounded-full bg-card text-sm text-muted">
            <button onClick={() => setPicking('account')} className="flex h-10 items-center gap-1.5 pr-1.5 pl-4">
              <span className="size-2.5 rounded-sm" style={{ backgroundColor: account?.color }} />
              From <span className="font-semibold text-ink">{account?.name ?? 'Account'}</span>
            </button>
            <span aria-hidden="true">·</span>
            <button onClick={() => setPicking('date')} className="flex h-10 items-center gap-1 pr-3.5 pl-1.5">
              <span className="font-semibold text-ink">{dayLabel}</span>
              <Icon name="chevronDown" size={16} />
            </button>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-3 gap-1.5">
          {PAD_KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setAmount((a) => pressKey(a, k))}
              className={`grid h-14 place-items-center rounded-2xl font-display text-[26px] font-semibold active:bg-line ${
                k === '.' || k === 'back' ? '' : 'bg-card'
              }`}
              aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            >
              {k === 'back' ? <Icon name="backspace" size={26} /> : k === '.' ? ',' : k}
            </button>
          ))}
        </div>

        {step === 1 && error && <p className="pt-2 text-center text-sm text-loss">{error}</p>}

        <button
          onClick={next}
          className="mt-3 flex w-full shrink-0 items-center justify-center gap-1 rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep"
        >
          {type === 'transfer' ? 'Next: to which account' : 'Next: name and category'}
          <Icon name="chevronRight" size={18} strokeWidth={2.4} />
        </button>

        {/* Step 2: name + category, then Save */}
        {step === 2 && (
          <>
            <div className="absolute inset-0 bg-navy/50" onClick={() => setStep(1)} />
            <div className="absolute inset-x-0 bottom-0 flex max-h-[88%] flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] motion-safe:animate-[sheet-up_200ms_ease-out]">
              <div className="flex items-center px-3 pt-3">
                <button onClick={() => setStep(1)} className="grid size-11 place-items-center rounded-full text-ink" aria-label="Back to amount">
                  <Icon name="chevronLeft" />
                </button>
                <div className="flex-1 text-center">
                  <p className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">{type}</p>
                  <p className="tabular font-display text-3xl font-extrabold tracking-tight">
                    {sign}
                    {formatCents(parseToCents(amount))}
                  </p>
                  <p className="text-sm text-muted">
                    {account?.name} · {dayLabel}
                  </p>
                </div>
                <span className="w-11" />
              </div>

              <div className="space-y-4 overflow-y-auto px-4 pt-4 pb-5">
                <label className="block rounded-2xl border-[1.5px] border-line bg-card px-4 py-2 focus-within:border-cobalt">
                  <span className="block text-xs font-medium text-muted">Name (optional)</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={type === 'income' ? 'Salary' : type === 'transfer' ? 'To savings' : 'Pingo Doce'}
                    autoComplete="off"
                    enterKeyHint="done"
                    onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                    className="w-full bg-transparent font-display text-xl font-bold outline-none placeholder:font-semibold placeholder:text-muted/40"
                  />
                </label>

                <div className="flex items-baseline justify-between px-1">
                  <h3 className="font-display text-base font-bold">{type === 'transfer' ? 'To account' : 'Category'}</h3>
                  <span className="text-xs text-muted">
                    {type !== 'transfer' && suggested && !categoryId ? 'Suggested from the name' : ''}
                  </span>
                </div>

                {type === 'transfer' && accounts.filter((a) => a.id !== accountId && !a.archived).length === 0 ? (
                  <p className="rounded-2xl bg-card px-4 py-5 text-center text-sm text-muted">
                    Add a second account in Settings → Accounts & cards to move money between them.
                  </p>
                ) : type === 'transfer' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {accounts
                      .filter((a) => a.id !== accountId && (!a.archived || a.id === toAccountId))
                      .map((a) => (
                        <button
                          key={a.id}
                          onClick={() => {
                            setToAccountId(a.id)
                            setError(null)
                          }}
                          aria-pressed={highlighted === a.id}
                          className={`flex items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-3.5 text-left ${
                            highlighted === a.id ? 'border-cobalt bg-cobalt/10' : 'border-transparent bg-card'
                          }`}
                        >
                          <span className="h-5 w-7 shrink-0 rounded" style={{ backgroundColor: a.color }} />
                          <span className="truncate text-sm font-semibold">{a.name}</span>
                        </button>
                      ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => {
                          setCategoryId(c.id)
                          setError(null)
                        }}
                        aria-pressed={highlighted === c.id}
                        className={`flex flex-col items-center gap-1.5 rounded-2xl border-[1.5px] px-1 pt-2.5 pb-2 ${
                          highlighted === c.id ? 'border-cobalt bg-cobalt/10' : 'border-transparent bg-card'
                        }`}
                      >
                        <span className="grid size-10 place-items-center rounded-full text-xl" style={{ backgroundColor: `${c.color}26` }}>
                          {c.icon}
                        </span>
                        <span className="w-full truncate text-center text-[11px] font-semibold">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}

                {goalDirection !== 0 && (
                  <GoalPicker goals={lookups.goals ?? []} value={goalId} onChange={setGoalId} direction={goalDirection} />
                )}

                {error && <p className="text-center text-sm text-loss">{error}</p>}

                <button
                  onClick={save}
                  disabled={busy}
                  className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep"
                >
                  Save
                </button>

                {!isNew && (
                  <button onClick={remove} disabled={busy} className="w-full py-2 text-base font-medium text-loss">
                    Delete transaction
                  </button>
                )}
              </div>
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
        <Sheet title={type === 'transfer' ? 'From account' : 'Account'} onClose={() => setPicking(null)} tall>
          <ul className="overflow-hidden rounded-2xl bg-card">
            {accounts.map((a) => (
              <li key={a.id} className="border-b border-line last:border-0">
                <button
                  onClick={() => {
                    setAccountId(a.id)
                    setPicking(null)
                  }}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left"
                >
                  <span className="h-6 w-9 shrink-0 rounded" style={{ backgroundColor: a.color }} />
                  <span className="flex-1 text-base font-medium">{a.name}</span>
                  {a.id === accountId && <span className="text-sm font-semibold text-cobalt">Selected</span>}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

    </div>
  )
}
