import { useCallback, useEffect, useState } from 'react'
import Sheet from '../components/Sheet'
import { fetchAccountsWithBalances } from '../lib/balances'
import { centsToInput, formatCents, parseToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

const ACCOUNT_TYPES = [
  { value: 'debit', label: 'Debit card' },
  { value: 'credit', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
  { value: 'savings', label: 'Savings' },
]

const ACCOUNT_COLORS = ['#1f4fe0', '#0b1b45', '#0f8a5f', '#c23b22', '#e8590c', '#6741d9', '#d6336c', '#0c8599']

const typeLabel = (type) => ACCOUNT_TYPES.find((t) => t.value === type)?.label

export default function Accounts() {
  const [accounts, setAccounts] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | account
  const [showArchived, setShowArchived] = useState(false)

  const load = useCallback(() => {
    fetchAccountsWithBalances()
      .then(setAccounts)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(load, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load accounts: {error}</p>
  if (!accounts) return null

  const active = accounts.filter((a) => !a.archived)
  const archived = accounts.filter((a) => a.archived)

  return (
    <div className="px-4 pt-2 pb-6">
      {active.length === 0 ? (
        <div className="rounded-2xl bg-card px-5 py-8 text-center">
          <p className="font-display text-lg font-bold">Add your first account</p>
          <p className="mt-1 text-muted">Add each card, cash wallet or savings account you want to track.</p>
        </div>
      ) : (
        <AccountList accounts={active} onSelect={setEditing} />
      )}

      <button
        onClick={() => setEditing('new')}
        className="mt-4 w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep"
      >
        Add account
      </button>

      {archived.length > 0 && (
        <div className="mt-8">
          <button onClick={() => setShowArchived((s) => !s)} className="py-2 text-sm font-medium text-muted">
            {showArchived ? 'Hide' : 'Show'} archived ({archived.length})
          </button>
          {showArchived && <AccountList accounts={archived} onSelect={setEditing} />}
        </div>
      )}

      {editing && (
        <AccountForm
          account={editing === 'new' ? null : editing}
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

function AccountList({ accounts, onSelect }) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-card">
      {accounts.map((a) => (
        <li key={a.id} className="border-b border-line last:border-0">
          <button onClick={() => onSelect(a)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
            <span className="h-8 w-12 shrink-0 rounded-md" style={{ backgroundColor: a.color ?? ACCOUNT_COLORS[0] }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-base font-medium">{a.name}</span>
              <span className="block text-sm text-muted">{typeLabel(a.type)}</span>
            </span>
            <span className={`tabular font-display text-lg font-semibold ${a.balance_cents < 0 ? 'text-loss' : ''}`}>
              {formatCents(a.balance_cents)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function AccountForm({ account, onClose, onSaved }) {
  const isNew = !account
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState(account?.type ?? 'debit')
  const [color, setColor] = useState(account?.color ?? ACCOUNT_COLORS[0])
  // Credit cards: the user enters how much they owe; we store it as a negative balance.
  const [balance, setBalance] = useState(account ? centsToInput(account.starting_balance_cents) : '')
  const [negative, setNegative] = useState(account ? account.starting_balance_cents < 0 : false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const isCredit = type === 'credit'

  function changeType(next) {
    setType(next)
    if (isNew) setNegative(next === 'credit')
  }

  async function save(e) {
    e.preventDefault()
    const cents = balance.trim() === '' ? 0 : parseToCents(balance)
    if (cents === null) return setError('Enter the balance as a number, like 250 or 1250.50.')

    setBusy(true)
    setError(null)
    const row = {
      name: name.trim(),
      type,
      color,
      starting_balance_cents: negative ? -cents : cents,
    }
    const { error } = isNew
      ? await supabase.from('accounts').insert(row)
      : await supabase.from('accounts').update(row).eq('id', account.id)
    setBusy(false)
    if (error) return setError(error.message)
    onSaved()
  }

  async function setArchived(archived) {
    setBusy(true)
    const { error } = await supabase.from('accounts').update({ archived }).eq('id', account.id)
    setBusy(false)
    if (error) return setError(error.message)
    onSaved()
  }

  async function remove() {
    if (!window.confirm(`Delete "${account.name}"? This can't be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('accounts').delete().eq('id', account.id)
    setBusy(false)
    if (error) {
      return setError(
        error.code === '23503'
          ? 'This account has transactions, so it can’t be deleted. Archive it instead.'
          : error.message,
      )
    }
    onSaved()
  }

  const inputClass = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt'

  return (
    <Sheet title={isNew ? 'New account' : 'Edit account'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Revolut, Visa, Wallet"
            className={inputClass}
          />
        </label>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Type</legend>
          <div className="grid grid-cols-2 gap-2">
            {ACCOUNT_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => changeType(t.value)}
                aria-pressed={type === t.value}
                className={`rounded-xl border py-3 text-base font-medium ${
                  type === t.value ? 'border-cobalt bg-cobalt text-white' : 'border-line bg-card'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">
            {isNew ? 'Balance right now' : 'Starting balance'}
          </span>
          <div className="flex gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-xl border border-line bg-card">
              {[false, true].map((neg) => (
                <button
                  key={String(neg)}
                  type="button"
                  onClick={() => setNegative(neg)}
                  aria-pressed={negative === neg}
                  className={`w-16 text-sm font-medium ${negative === neg ? 'bg-ink text-white' : 'text-muted'}`}
                >
                  {neg ? (isCredit ? 'Owed' : '−') : isCredit ? 'Credit' : '+'}
                </button>
              ))}
            </div>
            <div className="relative flex-1">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted">€</span>
              <input
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                className={`${inputClass} tabular pl-9`}
              />
            </div>
          </div>
          {isCredit && (
            <p className="mt-1.5 text-sm text-muted">For a credit card, choose “Owed” and enter what you currently owe.</p>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Color</legend>
          <div className="flex flex-wrap gap-3">
            {ACCOUNT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Color ${c}`}
                aria-pressed={color === c}
                className={`size-10 rounded-full ${color === c ? 'ring-2 ring-ink ring-offset-2 ring-offset-paper' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </fieldset>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          {isNew ? 'Add account' : 'Save changes'}
        </button>

        {!isNew && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setArchived(!account.archived)}
              className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium"
            >
              {account.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium text-loss"
            >
              Delete
            </button>
          </div>
        )}
      </form>
    </Sheet>
  )
}
