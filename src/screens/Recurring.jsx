import { useCallback, useEffect, useState } from 'react'
import LynxWatermark from '../components/LynxWatermark'
import { FullEmpty } from '../components/EmptyLynx'
import { AccountMark } from '../components/BankCard'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import PaySheet from '../components/PaySheet'
import Sheet from '../components/Sheet'
import { formatDay, todayISO } from '../lib/dates'
import { EMOJIS } from '../lib/emojis'
import { fetchLookups } from '../lib/lookups'
import { centsToInput, formatCents, parseToCents } from '../lib/money'
import { daysUntil, fetchRecurring, FREQUENCIES, isIncome, monthlyCents } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import RecurringDetails from './RecurringDetails'

const inputClass = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt'
const perLabel = (f) => FREQUENCIES.find((x) => x.value === f)?.per
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
const pad = (n) => String(n).padStart(2, '0')
const toISO = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}` // m is 0-11
const shiftISO = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(y, m - 1, d + days)
  return toISO(t.getFullYear(), t.getMonth(), t.getDate())
}
// "Thu 15 Oct"
const shortDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
}

// The dates in month y/m (0-11) a payment falls on, following its schedule backwards and forwards from next_due
function datesInMonth(p, y, m) {
  const first = toISO(y, m, 1)
  const last = toISO(y, m, new Date(y, m + 1, 0).getDate())
  const out = []
  if (p.frequency === 'weekly') {
    let iso = p.next_due
    while (iso > last) iso = shiftISO(iso, -7)
    while (iso >= first) {
      out.push(iso)
      iso = shiftISO(iso, -7)
    }
    for (let next = shiftISO(p.next_due, 7); next <= last; next = shiftISO(next, 7)) if (next >= first) out.push(next)
    if (p.next_due >= first && p.next_due <= last && !out.includes(p.next_due)) out.push(p.next_due)
    return out
  }
  const anchor = Number((p.start_date ?? p.next_due).slice(8))
  const day = Math.min(anchor, new Date(y, m + 1, 0).getDate())
  if (p.frequency === 'yearly') return Number(p.next_due.slice(5, 7)) - 1 === m ? [toISO(y, m, day)] : []
  // Monthly: the next due date wins in its own month (it can differ from the anchor after an edit)
  if (p.next_due.slice(0, 7) === first.slice(0, 7)) return [p.next_due]
  return [toISO(y, m, day)]
}

export default function Recurring() {
  const [payments, setPayments] = useState(null)
  const [lookups, setLookups] = useState(null)
  const [error, setError] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | payment
  const [paying, setPaying] = useState(null)
  const [openId, setOpenId] = useState(null)

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

  // The + in the top bar
  useEffect(() => {
    const add = () => setEditing('new')
    window.addEventListener('recurring:add', add)
    return () => window.removeEventListener('recurring:add', add)
  }, [])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load recurring payments: {error}</p>
  if (!payments || !lookups) return null

  const active = payments.filter((p) => p.active)
  const paused = payments.filter((p) => !p.active)
  // Costs and income are counted apart: income never lowers the costs
  const perMonth = active.filter((p) => !isIncome(p)).reduce((s, p) => s + monthlyCents(p), 0)
  const incomePerMonth = active.filter(isIncome).reduce((s, p) => s + monthlyCents(p), 0)
  const monthEnd = toISO(new Date().getFullYear(), new Date().getMonth(), new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate())
  const thisMonth = active.filter((p) => p.next_due <= monthEnd)
  const later = active.filter((p) => p.next_due > monthEnd)
  const open = payments.find((p) => p.id === openId)

  return (
    <div className="space-y-4 px-4 pt-1 pb-6">
      {payments.length === 0 ? (
        <FullEmpty title="Add recurring payments and income" text="Rent, subscriptions, your salary. See what's due and record each one with one tap.">
          <button onClick={() => setEditing('new')} className="rounded-full bg-cobalt px-6 py-3 text-[15px] font-semibold text-white active:bg-cobalt-deep">
            Add a payment
          </button>
        </FullEmpty>
      ) : (
        <>
          <Summary perMonth={perMonth} incomePerMonth={incomePerMonth} count={active.length} />
          <MonthCalendar payments={active} onOpen={(p) => setOpenId(p.id)} onPay={setPaying} />
        </>
      )}

      {thisMonth.length > 0 && <Group title="This month" payments={thisMonth} onOpen={(p) => setOpenId(p.id)} onPay={setPaying} />}
      {later.length > 0 && <Group title="Later" payments={later} onOpen={(p) => setOpenId(p.id)} onPay={setPaying} />}
      {paused.length > 0 && <Group title="Paused" payments={paused} onOpen={(p) => setOpenId(p.id)} />}

      {open && !editing && !paying && (
        <RecurringDetails
          payment={open}
          lookups={lookups}
          onClose={() => setOpenId(null)}
          onPay={() => setPaying(open)}
          onEdit={() => setEditing(open)}
          onChanged={() => {
            setOpenId(null)
            load()
          }}
        />
      )}

      {editing && (
        <RecurringForm
          payment={editing === 'new' ? null : editing}
          lookups={lookups}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            setOpenId(null)
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

function Summary({ perMonth, incomePerMonth, count }) {
  const [whole] = formatCents(perMonth).split(',')
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#2b8ef7] via-cobalt to-cobalt-deep p-[18px] pb-3.5 text-white shadow-[0_18px_30px_-20px_rgba(31,79,224,0.9)]">
      <LynxWatermark />
      <p className="relative flex items-center gap-1.5 text-sm font-semibold text-white/80">
        <Icon name="repeat" size={15} />
        Recurring costs
      </p>
      <p className="tabular relative mt-1 font-display leading-none font-bold">
        <span className="text-[40px] tracking-tight">{whole}</span>
        <span className="ml-1 text-base font-semibold text-white/65">/ month</span>
      </p>
      <div className="relative mt-3.5 grid grid-cols-2 rounded-2xl bg-white/[.12]">
        <SummaryFact icon="calendar" label="Per year" value={formatCents(perMonth * 12).split(',')[0]} />
        {incomePerMonth > 0 ? (
          <SummaryFact icon="arrowDown" label="Income / month" value={`+${formatCents(incomePerMonth).split(',')[0]}`} divider />
        ) : (
          <SummaryFact icon="check" label={count === 1 ? 'Active payment' : 'Active payments'} value={count} divider />
        )}
      </div>
    </section>
  )
}

function SummaryFact({ icon, label, value, divider }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 ${divider ? 'border-l border-white/15' : ''}`}>
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-white/15">
        <Icon name={icon} size={16} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold text-white/70">{label}</span>
        <span className="tabular block truncate font-display text-[15px] font-bold">{value}</span>
      </span>
    </div>
  )
}

// This month as a calendar: each payment's icon on its day; tap a day to see what's due
function MonthCalendar({ payments, onOpen, onPay }) {
  const today = todayISO()
  const [view, setView] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }))
  const [selected, setSelected] = useState(null)

  const byDay = new Map()
  for (const p of payments) {
    for (const iso of datesInMonth(p, view.y, view.m)) byDay.set(iso, [...(byDay.get(iso) ?? []), p])
  }
  const costs = (list) => list.filter((p) => !isIncome(p)).reduce((s, p) => s + p.amount_cents, 0)
  const monthTotal = costs([...byDay.values()].flat())
  const leading = (new Date(view.y, view.m, 1).getDay() + 6) % 7 // Monday = 0
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const dayItems = selected ? (byDay.get(selected) ?? []) : []

  function move(delta) {
    const d = new Date(view.y, view.m + delta, 1)
    setView({ y: d.getFullYear(), m: d.getMonth() })
    setSelected(null)
  }

  return (
    <section className="rounded-[26px] bg-card px-3 pt-3.5 pb-3 shadow-[0_10px_24px_-20px_rgba(11,27,69,0.5)]">
      <div className="flex items-center gap-1.5 px-1 pb-2.5">
        <p className="flex-1 font-display text-lg font-bold">
          {MONTH_NAMES[view.m]}
          {view.y !== Number(today.slice(0, 4)) && ` ${view.y}`}
          <span className="tabular ml-1.5 text-sm font-semibold text-muted">{formatCents(monthTotal).split(',')[0]}</span>
        </p>
        <button onClick={() => move(-1)} className="grid size-9 place-items-center rounded-full bg-paper" aria-label="Previous month">
          <Icon name="chevronLeft" size={18} />
        </button>
        <button onClick={() => move(1)} className="grid size-9 place-items-center rounded-full bg-paper" aria-label="Next month">
          <Icon name="chevronRight" size={18} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <span key={w} className="pb-1 text-center text-[11px] font-bold tracking-wide text-muted uppercase">
            {w}
          </span>
        ))}
        {Array.from({ length: leading }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const iso = toISO(view.y, view.m, i + 1)
          const items = byDay.get(iso) ?? []
          const isToday = iso === today
          return (
            <button
              key={iso}
              onClick={() => setSelected((s) => (s === iso ? null : iso))}
              aria-pressed={selected === iso}
              aria-label={`${i + 1} ${MONTH_NAMES[view.m]}${items.length ? `, ${items.map((p) => p.name).join(', ')}` : ''}`}
              className={`grid h-[52px] grid-rows-[20px_1fr] justify-items-center rounded-[14px] pt-1.5 text-[13px] font-bold ${
                selected === iso ? 'bg-cobalt/10 ring-2 ring-cobalt ring-inset' : items.length ? 'bg-paper' : ''
              } ${iso < today && !isToday ? 'text-muted/50' : ''}`}
            >
              <span className={`tabular ${isToday ? 'rounded-full bg-cobalt px-[7px] text-white' : ''}`}>{i + 1}</span>
              {items.length > 0 && (
                <span className="flex items-center gap-px text-sm leading-none">
                  <MerchantIcon name={items[0].name} className="size-4 rounded-[5px]">
                    {items[0].icon}
                  </MerchantIcon>
                  {items.length > 1 && <span className="text-[9px] font-extrabold text-muted">+{items.length - 1}</span>}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="mt-2.5 rounded-[18px] bg-paper px-3 py-2.5">
          <p className="flex justify-between text-xs font-bold text-muted">
            <span>{shortDay(selected)}</span>
            {costs(dayItems) > 0 && <span className="tabular">{formatCents(costs(dayItems))}</span>}
          </p>
          {dayItems.length === 0 ? (
            <p className="pt-1 text-sm text-muted">Nothing due this day.</p>
          ) : (
            <ul>
              {dayItems.map((p) => (
                <li key={p.id} className="border-b border-line last:border-0">
                  <PaymentRow p={p} sub={`Every ${perLabel(p.frequency)}`} due={p.next_due === selected && daysUntil(p.next_due) <= 0} onOpen={onOpen} onPay={onPay} compact />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function Group({ title, payments, onOpen, onPay }) {
  const costs = payments.filter((p) => !isIncome(p)).reduce((s, p) => s + p.amount_cents, 0)
  return (
    <section>
      <p className="flex justify-between px-1.5 pb-1.5 text-xs font-bold tracking-wider text-muted uppercase">
        <span>{title}</span>
        {onPay && costs > 0 && <span className="tabular">{formatCents(costs)}</span>}
      </p>
      <ul className="overflow-hidden rounded-[22px] bg-card">
        {payments.map((p) => {
          const days = daysUntil(p.next_due)
          return (
            <li key={p.id} className={`border-b border-line last:border-0 ${p.active ? '' : 'opacity-55'}`}>
              <PaymentRow p={p} sub={dueText(p)} due={p.active && days <= 0} late={p.active && days < 0} onOpen={onOpen} onPay={onPay} />
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// When a payment is due, in words: "Due today", "2 days late", "In 3 days · Tue 13 Oct"
export function dueText(p) {
  const days = daysUntil(p.next_due)
  if (!p.active) return 'Paused'
  if (days === 0) return 'Due today'
  if (days < 0) return `${-days} ${days === -1 ? 'day' : 'days'} late`
  return `${days === 1 ? 'Tomorrow' : `In ${days} days`} · ${shortDay(p.next_due)}`
}

// One payment: icon or shop logo, name, when it's due, amount (or a Paid button when due).
// Income shows its amount in green with a plus, and "Received" instead of "Paid".
// `home`: Home's "Coming up", sized exactly like the recent transaction rows below it.
export function PaymentRow({ p, sub, due, late, onOpen, onPay, compact, home }) {
  const icon = compact ? 'size-9 rounded-[14px] bg-card text-lg' : home ? 'size-10 rounded-xl bg-paper text-lg' : 'size-11 rounded-[14px] bg-paper text-xl'
  return (
    <div className={`flex items-center gap-3 ${compact ? 'py-2' : home ? 'pr-4' : 'pr-3.5'}`}>
      <button onClick={() => onOpen(p)} className={`flex min-w-0 flex-1 items-center gap-3 text-left ${compact ? '' : home ? 'py-2 pl-4' : 'py-3 pl-3.5'}`}>
        <MerchantIcon name={p.name} className={icon}>
          {p.icon}
        </MerchantIcon>
        <span className="min-w-0 flex-1">
          <span className={`block truncate ${home ? 'text-base font-medium' : 'text-[15px] font-semibold'}`}>{p.name}</span>
          <span className={`block truncate ${home ? 'text-sm' : 'text-xs'} ${late ? 'font-semibold text-loss' : due ? 'font-semibold text-cobalt' : 'text-muted'}`}>{sub}</span>
        </span>
        {!(due && onPay) && (
          <span className={`tabular shrink-0 text-right ${home ? 'font-display text-base leading-5 font-semibold' : 'text-[15px] font-bold'} ${isIncome(p) ? 'text-gain' : ''}`}>
            {isIncome(p) && '+'}
            {formatCents(p.amount_cents)}
            <span className="block text-[11px] font-semibold text-muted">/{perLabel(p.frequency)}</span>
          </span>
        )}
      </button>
      {due && onPay && (
        <button onClick={() => onPay(p)} className="shrink-0 rounded-full bg-cobalt px-3.5 py-1.5 text-sm font-semibold text-white active:bg-cobalt-deep">
          {isIncome(p) ? 'Received' : 'Paid'}
        </button>
      )}
    </div>
  )
}

export function RecurringForm({ payment, lookups, onClose, onSaved }) {
  const isNew = !payment
  const [type, setType] = useState(payment?.type ?? 'expense')
  const income = type === 'income'
  const categories = lookups.categories.filter((c) => c.kind === type && (!c.archived || c.id === payment?.category_id))
  const accounts = lookups.accounts.filter((a) => (!a.archived && a.type !== 'investment') || a.id === payment?.account_id)

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
    if (!accountId) return setError(income ? 'Choose the account it’s paid into.' : 'Choose the account it’s paid from.')
    const row = {
      type,
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
    <Sheet title={`${isNew ? 'New' : 'Edit'} recurring ${income ? 'income' : 'payment'}`} onClose={onClose} tall>
      <form onSubmit={save} className="space-y-5">
        <div className="grid grid-cols-2 rounded-xl bg-line/60 p-1">
          {[
            ['expense', 'Payment'],
            ['income', 'Income'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                if (value === type) return
                setType(value)
                setCategoryId(null) // categories belong to either expenses or income
              }}
              aria-pressed={type === value}
              className={`rounded-lg py-2 text-sm font-semibold ${type === value ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <label className="w-20 shrink-0">
            <span className="mb-1.5 block text-sm font-medium text-muted">Emoji</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={`${inputClass} px-0 text-center text-2xl`} aria-label="Emoji" />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={income ? 'e.g. Salary' : 'e.g. Netflix'} className={`${inputClass} py-3.5`} />
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
            <span className="mb-1.5 block text-sm font-medium text-muted">{isNew ? 'First date' : 'Next date'}</span>
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
          <legend className="mb-1.5 text-sm font-medium text-muted">{income ? 'Paid into' : 'Paid from'}</legend>
          <div className="flex flex-wrap gap-2">
            {accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccountId(a.id)}
                aria-pressed={accountId === a.id}
                className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${accountId === a.id ? 'bg-cobalt text-white' : 'bg-card'}`}
              >
                <AccountMark account={a} className="size-3 rounded-sm ring-1 ring-white/40" logoClass="size-5" />
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
          {isNew ? `Add recurring ${income ? 'income' : 'payment'}` : 'Save changes'}
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
