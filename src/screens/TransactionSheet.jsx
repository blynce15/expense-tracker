import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { formatDay, todayISO } from '../lib/dates'
import { defaultAccountId, fetchLastUsedAccountId, fetchLookups, lookupCache } from '../lib/lookups'
import { formatTyping, parseToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

const TYPES = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
]

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

// Applies one number-pad key to the amount text, e.g. "12.5" + "0" → "12.50"
function pressKey(amount, key) {
  if (key === 'back') return amount.slice(0, -1)
  if (key === '.') return amount.includes('.') ? amount : (amount || '0') + '.'
  const [whole, decimals] = amount.split('.')
  if (decimals !== undefined && decimals.length >= 2) return amount
  if (decimals === undefined && whole.length >= 7) return amount
  if (amount === '0') return key
  return amount + key
}

// 1250 → "12.5" (number-pad text; dot is the decimal point internally)
function centsToPad(cents) {
  const euros = Math.trunc(cents / 100)
  const rest = cents % 100
  if (rest === 0) return String(euros)
  return `${euros}.${String(rest).padStart(2, '0').replace(/0$/, '')}`
}

// transaction: null to add a new one, or an existing row to edit it
export default function TransactionSheet({ transaction, onClose, onSaved }) {
  const isNew = !transaction
  const [lookups, setLookups] = useState(lookupCache.lookups)
  const [type, setType] = useState(transaction?.type ?? 'expense')
  const [amount, setAmount] = useState(transaction ? centsToPad(transaction.amount_cents) : '')
  const [categoryId, setCategoryId] = useState(transaction?.category_id ?? null)
  const [accountId, setAccountId] = useState(() =>
    transaction ? transaction.account_id : lookupCache.lookups && defaultAccountId(lookupCache.lookups, lookupCache.lastUsedAccountId),
  )
  const [toAccountId, setToAccountId] = useState(transaction?.to_account_id ?? null)
  const [date, setDate] = useState(transaction?.date ?? todayISO())
  const [note, setNote] = useState(transaction?.note ?? '')
  const [showNote, setShowNote] = useState(Boolean(transaction?.note))
  const [picking, setPicking] = useState(null) // null | 'account' | 'toAccount'
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
  }, [isNew])

  // Keyboard typing works too (handy on a computer)
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT') return
      if (/^[0-9]$/.test(e.key)) setAmount((a) => pressKey(a, e.key))
      else if (e.key === '.' || e.key === ',') setAmount((a) => pressKey(a, '.'))
      else if (e.key === 'Backspace') setAmount((a) => pressKey(a, 'back'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function changeType(next) {
    setType(next)
    setError(null)
    // A category belongs to either expenses or income, so clear it when switching
    if (next !== type) setCategoryId(null)
  }

  async function save() {
    const cents = parseToCents(amount)
    if (!cents) return setError('Enter an amount.')
    if (!accountId) return setError('Choose an account.')
    if (type === 'transfer') {
      if (!toAccountId) return setError('Choose the account the money goes to.')
      if (toAccountId === accountId) return setError('Choose two different accounts.')
    } else if (!categoryId) {
      return setError('Choose a category.')
    }

    setBusy(true)
    setError(null)
    const row = {
      type,
      amount_cents: cents,
      date,
      account_id: accountId,
      to_account_id: type === 'transfer' ? toAccountId : null,
      category_id: type === 'transfer' ? null : categoryId,
      note: note.trim() || null,
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

  if (accounts.length === 0) {
    return (
      <Sheet title={title} onClose={onClose} tall>
        <p className="py-6 text-center text-muted">
          Add an account first in Settings → Accounts & cards, then you can record transactions.
        </p>
      </Sheet>
    )
  }

  if (picking) {
    const current = picking === 'account' ? accountId : toAccountId
    return (
      <Sheet title={picking === 'toAccount' ? 'To account' : type === 'transfer' ? 'From account' : 'Account'} onClose={() => setPicking(null)} tall>
        <ul className="overflow-hidden rounded-2xl bg-card">
          {accounts.map((a) => (
            <li key={a.id} className="border-b border-line last:border-0">
              <button
                onClick={() => {
                  if (picking === 'account') setAccountId(a.id)
                  else setToAccountId(a.id)
                  setPicking(null)
                }}
                className="flex w-full items-center gap-3 px-4 py-4 text-left"
              >
                <span className="h-6 w-9 shrink-0 rounded" style={{ backgroundColor: a.color }} />
                <span className="flex-1 text-base font-medium">{a.name}</span>
                {a.id === current && <span className="text-sm font-semibold text-cobalt">Selected</span>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    )
  }

  const chip = 'flex h-10 items-center gap-1.5 rounded-full bg-card px-3.5 text-sm font-medium'

  return (
    <Sheet title={title} onClose={onClose} tall>
      <div className="space-y-4">
        {/* Type */}
        <div className="grid grid-cols-3 rounded-xl bg-line/60 p-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => changeType(t.value)}
              aria-pressed={type === t.value}
              className={`rounded-lg py-2 text-sm font-semibold ${type === t.value ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Amount */}
        <p
          className={`tabular text-center font-display text-5xl font-bold tracking-tight ${amount ? 'text-ink' : 'text-muted/50'}`}
          aria-live="polite"
        >
          <span className="mr-1 text-3xl align-[0.35em] text-muted">€</span>
          {formatTyping(amount)}
        </p>

        {/* Account, date, note */}
        <div className="flex flex-wrap justify-center gap-2">
          <button onClick={() => setPicking('account')} className={chip}>
            <span className="size-3 rounded-sm" style={{ backgroundColor: accountById(accountId)?.color }} />
            {type === 'transfer' ? 'From ' : ''}
            {accountById(accountId)?.name ?? 'Account'}
          </button>
          {type === 'transfer' && (
            <button onClick={() => setPicking('toAccount')} className={`${chip} ${toAccountId ? '' : 'text-cobalt'}`}>
              {toAccountId && <span className="size-3 rounded-sm" style={{ backgroundColor: accountById(toAccountId)?.color }} />}
              To {accountById(toAccountId)?.name ?? 'account…'}
            </button>
          )}
          <label className={`${chip} relative`}>
            <span className="text-base leading-none">📅</span>
            {date !== todayISO() && formatDay(date)}
            <input
              type="date"
              value={date}
              max="2100-12-31"
              onChange={(e) => e.target.value && setDate(e.target.value)}
              // Open the calendar wherever the chip is tapped/clicked
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={`Date: ${formatDay(date)}`}
            />
          </label>
          {!showNote && (
            <button onClick={() => setShowNote(true)} className={`${chip} text-muted`}>
              Add note
            </button>
          )}
        </div>
        {showNote && (
          <input
            // Focus straight away so typing goes into the note, not the amount
            autoFocus={isNew || !transaction.note}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note"
            className="w-full rounded-xl border border-line bg-card px-4 py-2.5 text-base outline-none focus:border-cobalt"
          />
        )}

        {/* Categories */}
        {type !== 'transfer' && (
          <div className="grid grid-cols-4 gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                aria-pressed={categoryId === c.id}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${
                  categoryId === c.id ? 'bg-cobalt text-white' : 'bg-card'
                }`}
              >
                <span className="text-xl leading-none">{c.icon}</span>
                <span className="w-full truncate text-center text-[11px] font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        )}

        {/* Number pad */}
        <div className="grid grid-cols-3 gap-1.5">
          {KEYS.map((k) => (
            <button
              key={k}
              onClick={() => setAmount((a) => pressKey(a, k))}
              className="grid h-13 place-items-center rounded-xl bg-card font-display text-2xl font-semibold active:bg-line"
              aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            >
              {k === 'back' ? <Icon name="chevronLeft" /> : k === '.' ? ',' : k}
            </button>
          ))}
        </div>

        {error && <p className="text-center text-sm text-loss">{error}</p>}

        <button
          onClick={save}
          disabled={busy}
          className="w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          {isNew ? 'Save' : 'Save changes'}
        </button>

        {!isNew && (
          <button onClick={remove} disabled={busy} className="w-full py-2 text-base font-medium text-loss">
            Delete transaction
          </button>
        )}
      </div>
    </Sheet>
  )
}
