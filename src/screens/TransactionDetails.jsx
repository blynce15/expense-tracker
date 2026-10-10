import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import Sheet from '../components/Sheet'
import { fetchAccountsWithBalances } from '../lib/balances'
import { todayISO, shiftDays } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import TransactionSheet from './TransactionSheet'

const TYPE_LABELS = { expense: 'Expense', income: 'Income', transfer: 'Transfer' }

// "Wednesday 7 October 2026"
function longDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

// When it was recorded: "Today at 13:42", "Yesterday at 22:17", "5 Oct at 08:30"
function addedAt(timestamp) {
  const t = new Date(timestamp)
  const pad = (n) => String(n).padStart(2, '0')
  const day = `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`
  const time = `${pad(t.getHours())}:${pad(t.getMinutes())}`
  if (day === todayISO()) return `Today at ${time}`
  if (day === shiftDays(todayISO(), -1)) return `Yesterday at ${time}`
  const sameYear = t.getFullYear() === new Date().getFullYear()
  const date = t.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) }).replace('Sept', 'Sep')
  return `${date} at ${time}`
}

// How each account's balance moves if this transaction is removed: [{ account, before, after }]
function balanceImpact(t, balances) {
  const out = []
  const add = (id, change) => {
    const b = balances.get(id)
    if (b) out.push({ name: b.name, before: b.balance_cents, after: b.balance_cents + change })
  }
  if (t.type === 'expense') add(t.account_id, t.amount_cents)
  else if (t.type === 'income') add(t.account_id, -t.amount_cents)
  else {
    add(t.account_id, t.amount_cents)
    add(t.to_account_id, -t.amount_cents)
  }
  return out
}

// Read-only view of one transaction, with ⋯ → Edit / Delete.
// Balances are always calculated from transactions, so edits and deletes change them right away.
export default function TransactionDetails({ transaction, onClose, onChanged }) {
  const [tx, setTx] = useState(transaction)
  const [lookups, setLookups] = useState(lookupCache.lookups)
  const [balances, setBalances] = useState(null) // Map account id → account with balance_cents
  const [mode, setMode] = useState('view') // 'view' | 'menu' | 'confirm' | 'edit'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const loadBalances = useCallback(async () => {
    try {
      const [data, accounts] = await Promise.all([fetchLookups(), fetchAccountsWithBalances()])
      setLookups(data)
      setBalances(new Map(accounts.map((a) => [a.id, a])))
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    loadBalances()
  }, [loadBalances])

  async function afterEdit() {
    // Fetch the saved version; if it was deleted from the edit screen, close
    const { data, error } = await supabase.from('transactions').select('*').eq('id', tx.id)
    onChanged()
    if (error) return setError(error.message)
    if (!data[0]) return onClose()
    setTx(data[0])
    setMode('view')
    loadBalances()
  }

  async function remove() {
    setBusy(true)
    setError(null)
    const { error } = await supabase.from('transactions').delete().eq('id', tx.id)
    setBusy(false)
    if (error) return setError(error.message)
    onChanged()
    onClose()
  }

  if (mode === 'edit') {
    return <TransactionSheet transaction={tx} onClose={() => setMode('view')} onSaved={afterEdit} />
  }

  const account = (id) => lookups?.accounts.find((a) => a.id === id)
  const category = lookups?.categories.find((c) => c.id === tx.category_id)
  const isTransfer = tx.type === 'transfer'
  const name = tx.note || (isTransfer ? 'Transfer' : (category?.name ?? 'No category'))
  const amountText =
    tx.type === 'expense' ? formatCents(-tx.amount_cents) : tx.type === 'income' ? `+${formatCents(tx.amount_cents)}` : formatCents(tx.amount_cents)
  const amountColor = tx.type === 'income' ? 'text-gain' : isTransfer ? 'text-muted' : 'text-ink'
  const iconBg = isTransfer ? 'var(--color-line)' : `${category?.color ?? '#868e96'}22`

  const accountValue = (id) => (
    <>
      <span className="h-2.5 w-3.5 shrink-0 rounded-sm" style={{ backgroundColor: account(id)?.color }} />
      <span className="truncate">{account(id)?.name ?? 'Unknown account'}</span>
    </>
  )
  const rows = [
    ['Type', <span key="t" className="rounded-full bg-line/70 px-2.5 py-0.5 text-xs font-semibold text-muted">{TYPE_LABELS[tx.type]}</span>],
    isTransfer
      ? ['From', accountValue(tx.account_id)]
      : ['Category', <span key="c" className="truncate">{category ? `${category.icon} ${category.name}` : 'No category'}</span>],
    isTransfer ? ['To', accountValue(tx.to_account_id)] : ['Account', accountValue(tx.account_id)],
    ['Date', <span key="d" className="truncate">{longDate(tx.date)}</span>],
    ['Added', <span key="a" className="font-normal text-muted">{addedAt(tx.created_at)}</span>],
  ]
  const impact = balances ? balanceImpact(tx, balances) : []

  const menuButton = (
    <div className="relative">
      <button
        onClick={() => setMode(mode === 'menu' ? 'view' : 'menu')}
        className={`grid size-10 place-items-center rounded-full ${mode === 'menu' ? 'bg-ink text-paper' : 'bg-card text-ink'}`}
        aria-label="More options"
        aria-expanded={mode === 'menu'}
      >
        <Icon name="dots" size={22} strokeWidth={3.2} />
      </button>
      {mode === 'menu' && (
        <>
          {/* Tapping anywhere else closes the menu */}
          <div className="fixed inset-0 z-10" onClick={() => setMode('view')} />
          <div className="absolute top-12 right-0 z-20 w-52 overflow-hidden rounded-2xl bg-card shadow-[0_14px_34px_-8px_rgba(11,27,69,0.4)] ring-1 ring-line">
            <button onClick={() => setMode('edit')} className="flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left text-base font-semibold">
              <Icon name="pencil" size={20} />
              Edit transaction
            </button>
            <button onClick={() => setMode('confirm')} className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-base font-semibold text-loss">
              <Icon name="trash" size={20} />
              Delete transaction
            </button>
          </div>
        </>
      )}
    </div>
  )

  if (mode === 'confirm') {
    return (
      <Sheet title="" onClose={onClose}>
        <div className="space-y-4 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-loss/10 text-loss">
            <Icon name="trash" size={26} />
          </span>
          <div className="space-y-1">
            <h2 className="font-display text-xl font-bold">Delete this transaction?</h2>
            <p className="text-muted">
              {name}, <span className="tabular font-semibold text-ink">{amountText}</span> on {longDate(tx.date)}. This can’t be undone.
            </p>
          </div>
          {impact.length > 0 && (
            <ul className="overflow-hidden rounded-2xl bg-card text-left">
              {impact.map((i) => (
                <li key={i.name} className="tabular flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-0">
                  <span className="truncate">{i.name} balance</span>
                  <span className="shrink-0">
                    <span className="text-muted line-through">{formatCents(i.before)}</span> →{' '}
                    <span className="font-bold">{formatCents(i.after)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="text-sm text-loss">{error}</p>}
          <div className="space-y-2">
            <button onClick={remove} disabled={busy} className="w-full rounded-2xl bg-loss py-4 text-base font-semibold text-white disabled:opacity-60">
              {busy ? 'Deleting…' : 'Delete'}
            </button>
            <button onClick={() => setMode('view')} disabled={busy} className="w-full rounded-2xl bg-card py-4 text-base font-semibold">
              Cancel
            </button>
          </div>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title="" onClose={onClose} action={menuButton}>
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <MerchantIcon name={isTransfer ? null : tx.note} className="mb-1 size-14 rounded-2xl text-3xl" style={{ backgroundColor: iconBg }}>
            {isTransfer ? '⇄' : category?.icon}
          </MerchantIcon>
          <p className="font-display text-xl font-bold">{name}</p>
          <p className={`tabular font-display text-4xl font-extrabold tracking-tight ${amountColor}`}>{amountText}</p>
        </div>

        <ul className="overflow-hidden rounded-2xl bg-card">
          {rows.map(([label, value]) => (
            <li key={label} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
              <span className="w-20 shrink-0 text-sm text-muted">{label}</span>
              <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-right text-[15px] font-semibold">{value}</span>
            </li>
          ))}
        </ul>

        {impact.length > 0 && (
          <p className="tabular text-center text-sm text-muted">
            {impact.length === 1 ? `${impact[0].name} balance now: ` : 'Balances now: '}
            {impact.map((i, n) => (
              <span key={i.name}>
                {n > 0 && ' · '}
                {impact.length > 1 && `${i.name} `}
                <span className="font-semibold text-ink">{formatCents(i.before)}</span>
              </span>
            ))}
          </p>
        )}
        {error && <p className="text-center text-sm text-loss">{error}</p>}
      </div>
    </Sheet>
  )
}
