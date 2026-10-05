import { useCallback, useEffect, useState } from 'react'
import DatePicker from '../components/DatePicker'
import PaySheet from '../components/PaySheet'
import Sheet from '../components/Sheet'
import { formatDay, todayISO } from '../lib/dates'
import { EMOJIS } from '../lib/emojis'
import { fetchLookups } from '../lib/lookups'
import { centsToInput, formatCents, parseToCents } from '../lib/money'
import { daysUntil, dueLabel, fetchRecurring, FREQUENCIES, monthlyCents } from '../lib/recurring'
import { supabase } from '../lib/supabase'

const inputClass = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt'
const perLabel = (f) => FREQUENCIES.find((x) => x.value === f)?.per

export default function Recurring() {
  const [payments, setPayments] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | payment
  const [paying, setPaying] = useState(null)

  const load = useCallback(async () => {
    try {
      const [list, data] = await Promise.all([fetchRecurring(), fetchLookups()])
      setPayments(list)
      setLookups(data)
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load recurring payments: {error}</p>
  if (!payments || !lookups) return null

  const active = payments.filter((p) => p.active)
  const paused = payments.filter((p) => !p.active)
  const perMonth = active.reduce((s, p) => s + monthlyCents(p), 0)

  return (
    <div className="space-y-5 px-4 pt-1 pb-6">
      {payments.length === 0 ? (
        <div className="rounded-3xl bg-card px-5 py-8 text-center">
          <p className="text-4xl">🔁</p>
          <p className="mt-2 font-display text-lg font-bold">Add your recurring payments</p>
          <p className="mt-1 text-muted">Rent, subscriptions, the gym. See what's due and record each payment with one tap.</p>
        </div>
      ) : (
        <section className="rounded-3xl bg-card p-5">
          <p className="text-base font-medium text-muted">Recurring costs</p>
          <p className="tabular mt-1 font-display text-[44px] leading-none font-bold tracking-tight">
            {formatCents(perMonth)}
            <span className="ml-1 text-xl font-semibold text-muted">/month</span>
          </p>
          <p className="mt-2 text-sm text-muted">
            About <span className="tabular font-semibold text-ink">{formatCents(perMonth * 12)}</span> a year across {active.length}{' '}
            {active.length === 1 ? 'payment' : 'payments'}
          </p>
        </section>
      )}

      {active.length > 0 && <PaymentList payments={active} onSelect={setEditing} onPay={setPaying} />}

      <button
        onClick={() => setEditing('new')}
        className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep"
      >
        Add recurring payment
      </button>

      {paused.length > 0 && (
        <div>
          <h2 className="px-1 pb-1.5 text-sm font-semibold text-muted">Paused</h2>
          <PaymentList payments={paused} onSelect={setEditing} />
        </div>
      )}

      {editing && (
        <RecurringForm
          payment={editing === 'new' ? null : editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {paying && (
        <PaySheet
          payment={paying}
          onClose={() => setPaying(null)}
          onPaid={() => {
            setPaying(null)
            load()
          }}
        />
      )}
    </div>
  )
}

function PaymentList({ payments, onSelect, onPay }) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-card">
      {payments.map((p) => {
        const days = daysUntil(p.next_due)
        const due = p.active && days <= 0
        return (
          <li key={p.id} className="flex items-center border-b border-line last:border-0">
            <button onClick={() => onSelect(p)} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper text-lg">{p.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-medium">{p.name}</span>
                <span className={`block truncate text-sm ${days < 0 && p.active ? 'font-medium text-loss' : 'text-muted'}`}>
                  {!p.active ? 'Paused' : days === 0 ? 'Due today' : `${dueLabel(p.next_due)}, ${formatDay(p.next_due)}`}
                </span>
              </span>
              <span className="tabular shrink-0 pr-4 text-right text-base font-semibold">
                {formatCents(p.amount_cents)}
                <span className="block text-xs font-normal text-muted">/{perLabel(p.frequency)}</span>
              </span>
            </button>
            {due && onPay && (
              <button
                onClick={() => onPay(p)}
                className="mr-3 shrink-0 rounded-full bg-cobalt px-3.5 py-2 text-sm font-semibold text-white active:bg-cobalt-deep"
              >
                Paid
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}

function RecurringForm({ payment, lookups, onClose, onSaved }) {
  const isNew = !payment
  const categories = lookups.categories.filter((c) => c.kind === 'expense' && (!c.archived || c.id === payment?.category_id))
  const accounts = lookups.accounts.filter((a) => !a.archived || a.id === payment?.account_id)

  const [name, setName] = useState(payment?.name ?? '')
  const [icon, setIcon] = useState(payment?.icon ?? '')
  const [amount, setAmount] = useState(payment ? centsToInput(payment.amount_cents) : '')
  const [frequency, setFrequency] = useState(payment?.frequency ?? 'monthly')
  const [nextDue, setNextDue] = useState(payment?.next_due ?? todayISO())
  const [categoryId, setCategoryId] = useState(payment?.category_id ?? null)
  const [accountId, setAccountId] = useState(payment?.account_id ?? accounts[0]?.id ?? null)
  const [pickingDate, setPickingDate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function pickCategory(c) {
    setCategoryId(c.id)
    // Start from the category's emoji until the user picks their own
    if (!icon || categories.some((x) => x.icon === icon)) setIcon(c.icon)
  }

  async function run(action) {
    setBusy(true)
    setError(null)
    const { error } = await action()
    setBusy(false)
    if (error) return setError(error.message)
    onSaved()
  }

  function save(e) {
    e.preventDefault()
    const cents = parseToCents(amount)
    if (!cents) return setError('Enter the amount, like 9,99 or 650.')
    if (!categoryId) return setError('Choose a category.')
    if (!accountId) return setError('Choose the account it’s paid from.')
    const row = {
      name: name.trim(),
      icon: icon.trim() || '🔁',
      amount_cents: cents,
      frequency,
      next_due: nextDue,
      category_id: categoryId,
      account_id: accountId,
    }
    // The start date sets the day of the month payments fall on
    const dateChanged = isNew || nextDue !== payment.next_due || frequency !== payment.frequency
    if (dateChanged) row.start_date = nextDue
    run(() =>
      isNew ? supabase.from('recurring_payments').insert(row) : supabase.from('recurring_payments').update(row).eq('id', payment.id),
    )
  }

  function remove() {
    if (!window.confirm(`Delete "${payment.name}"? Payments you already recorded stay in your transactions.`)) return
    run(() => supabase.from('recurring_payments').delete().eq('id', payment.id))
  }

  if (pickingDate) {
    return (
      <Sheet title={isNew ? 'First payment date' : 'Next payment date'} onClose={() => setPickingDate(false)} tall>
        <DatePicker
          value={nextDue}
          dimFuture={false}
          onChange={(iso) => {
            setNextDue(iso)
            setPickingDate(false)
          }}
        />
      </Sheet>
    )
  }

  return (
    <Sheet title={isNew ? 'New recurring payment' : 'Edit recurring payment'} onClose={onClose} tall>
      <form onSubmit={save} className="space-y-5">
        <div className="flex gap-2">
          <label className="w-20 shrink-0">
            <span className="mb-1.5 block text-sm font-medium text-muted">Emoji</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={`${inputClass} px-0 text-center text-2xl`} aria-label="Emoji" />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Netflix" className={`${inputClass} py-3.5`} />
          </label>
        </div>

        <div className="flex gap-2">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Amount</span>
            <div className="relative">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted">€</span>
              <input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className={`${inputClass} tabular pl-9`}
              />
            </div>
          </label>
          <div className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">{isNew ? 'First payment' : 'Next payment'}</span>
            <button type="button" onClick={() => setPickingDate(true)} className={`${inputClass} text-left`}>
              🗓️ {formatDay(nextDue)}
            </button>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Repeats</legend>
          <div className="grid grid-cols-3 rounded-xl bg-line/60 p-1">
            {FREQUENCIES.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFrequency(f.value)}
                aria-pressed={frequency === f.value}
                className={`rounded-lg py-2 text-sm font-semibold ${frequency === f.value ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Category</legend>
          <div className="grid grid-cols-4 gap-2">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => pickCategory(c)}
                aria-pressed={categoryId === c.id}
                className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 ${categoryId === c.id ? 'bg-cobalt text-white' : 'bg-card'}`}
              >
                <span className="text-xl leading-none">{c.icon}</span>
                <span className="w-full truncate text-center text-[11px] font-medium">{c.name}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-muted">Paid from</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                aria-pressed={accountId === a.id}
                className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${accountId === a.id ? 'bg-cobalt text-white' : 'bg-card'}`}
              >
                <span className="size-3 rounded-sm ring-1 ring-white/40" style={{ backgroundColor: a.color }} />
                {a.name}
              </button>
            ))}
          </div>
        </fieldset>

        <details className="rounded-xl bg-card px-4 py-3">
          <summary className="cursor-pointer text-sm font-medium text-muted">More emojis</summary>
          <div className="mt-3 grid grid-cols-8 gap-1">
            {EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                aria-pressed={icon === em}
                className={`grid aspect-square place-items-center rounded-lg text-xl ${icon === em ? 'bg-cobalt/15 ring-2 ring-cobalt' : ''}`}
              >
                {em}
              </button>
            ))}
          </div>
        </details>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          {isNew ? 'Add recurring payment' : 'Save changes'}
        </button>

        {!isNew && (
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => supabase.from('recurring_payments').update({ active: !payment.active }).eq('id', payment.id))}
              className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium"
            >
              {payment.active ? 'Pause' : 'Resume'}
            </button>
            <button type="button" disabled={busy} onClick={remove} className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium text-loss">
              Delete
            </button>
          </div>
        )}
      </form>
    </Sheet>
  )
}
