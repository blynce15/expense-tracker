import { useEffect, useState } from 'react'
import { MiniCard, TYPE_INFO } from '../components/BankCard'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import Sheet from '../components/Sheet'
import { formatCents } from '../lib/money'
import { daysUntil, dueLabel, FREQUENCIES } from '../lib/recurring'
import { supabase } from '../lib/supabase'

const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const ordinal = (n) => n + (n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th')

// "on the 18th" / "every Thursday" / "every 14 Mar"
function cycleDetail(p) {
  const d = parse(p.start_date ?? p.next_due)
  if (p.frequency === 'weekly') return `Every ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`
  if (p.frequency === 'yearly') return `Every ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')}`
  return `On the ${ordinal(d.getDate())}`
}

// One recurring payment: what it costs, when it's next due, what's been paid so far, and actions
export default function RecurringDetails({ payment: p, lookups, onClose, onPay, onEdit, onChanged }) {
  const [paid, setPaid] = useState(null) // { cents, count }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const category = lookups.categories.find((c) => c.id === p.category_id)
  const account = lookups.accounts.find((a) => a.id === p.account_id)
  const freq = FREQUENCIES.find((f) => f.value === p.frequency)
  const days = daysUntil(p.next_due)

  // Payments recorded with "Paid" are expenses named after the payment, in its category
  useEffect(() => {
    let cancelled = false
    supabase
      .from('transactions')
      .select('amount_cents')
      .eq('type', 'expense')
      .eq('note', p.name)
      .eq('category_id', p.category_id)
      .then(({ data, error }) => {
        if (cancelled || error) return
        setPaid({ cents: data.reduce((s, t) => s + t.amount_cents, 0), count: data.length })
      })
    return () => {
      cancelled = true
    }
  }, [p.name, p.category_id])

  async function run(action) {
    setBusy(true)
    setError(null)
    const { error } = await action()
    setBusy(false)
    if (error) return setError(error.message)
    onChanged()
  }

  function remove() {
    if (!window.confirm(`Delete "${p.name}"? Payments you already recorded stay in your transactions.`)) return
    run(() => supabase.from('recurring_payments').delete().eq('id', p.id))
  }

  const status = !p.active
    ? { text: 'Paused', cls: 'bg-line text-muted' }
    : days < 0
      ? { text: dueLabel(p.next_due), cls: 'bg-loss/10 text-loss' }
      : days === 0
        ? { text: 'Due today', cls: 'bg-cobalt/10 text-cobalt' }
        : { text: days === 1 ? 'Tomorrow' : `In ${days} days`, cls: 'bg-warn-bg text-warn' }
  const [whole, decimals] = formatCents(p.amount_cents).split(',')
  const sameYear = p.next_due.slice(0, 4) === String(new Date().getFullYear())
  const nextDate = parse(p.next_due)
    .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
    .replace('Sept', 'Sep')
    .replace(',', '')

  return (
    <Sheet
      title="Recurring payment"
      onClose={onClose}
      action={
        <button onClick={onEdit} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Edit">
          <Icon name="pencil" size={20} />
        </button>
      }
    >
      <div className="space-y-3">
        {/* Hero: what it is and what it costs */}
        <section className="rounded-[26px] bg-card p-4 shadow-[0_14px_30px_-22px_rgba(11,27,69,0.5)]">
          <div className="flex items-start justify-between gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.cls}`}>{status.text}</span>
            {p.active && (
              <button
                onClick={onPay}
                className="flex items-center gap-1 rounded-full bg-cobalt px-3.5 py-1.5 text-sm font-semibold text-white shadow-[0_8px_16px_-8px_rgba(31,79,224,0.8)] active:bg-cobalt-deep"
              >
                <Icon name="check" size={15} strokeWidth={2.6} />
                Mark paid
              </button>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <MerchantIcon name={p.name} className="size-14 rounded-[18px] text-[28px]" style={{ backgroundColor: `${category?.color ?? '#868e96'}22` }}>
              {p.icon}
            </MerchantIcon>
            <span className="min-w-0">
              <span className="block truncate font-display text-xl font-bold">{p.name}</span>
              <span className="block truncate text-sm text-muted">
                {category?.name ?? 'No category'} · {freq?.label ?? p.frequency}
              </span>
            </span>
          </div>
          <p className="tabular mt-3 font-display leading-none font-bold">
            <span className="text-[34px] tracking-tight">{whole}</span>
            <span className="text-lg text-muted/70">,{decimals}</span>
            <span className="ml-1 text-sm font-semibold text-muted">/ {freq?.per ?? 'time'}</span>
          </p>
        </section>

        {/* Four facts */}
        <div className="grid grid-cols-2 gap-2.5">
          <Fact icon="calendar" label="Next payment" value={p.active ? nextDate : '—'} sub={p.active ? dueLabel(p.next_due) : 'Paused'} />
          <Fact icon="repeat" label="Repeats" value={freq?.label ?? p.frequency} sub={cycleDetail(p)} />
          <Fact
            icon="coins"
            label="Total paid"
            value={paid ? formatCents(paid.cents) : '…'}
            sub={paid ? (paid.count ? `Over ${paid.count} ${paid.count === 1 ? 'payment' : 'payments'}` : 'Nothing recorded yet') : ''}
          />
          <Fact emoji={category?.icon} icon="tag" label="Category" value={category?.name ?? 'None'} sub="Expense" />
        </div>

        {/* Paid from */}
        <button onClick={onEdit} className="flex w-full items-center gap-3 rounded-[20px] bg-card px-4 py-3 text-left">
          {account ? (
            <MiniCard color={account.color} type={account.type} name={account.name} className="h-8 w-11 rounded-lg" />
          ) : (
            <span className="h-8 w-11 rounded-lg bg-line" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-muted">Paid from</span>
            <span className="block truncate font-semibold">
              {account?.name ?? 'No account'}
              {account && <span className="font-normal text-muted"> · {TYPE_INFO[account.type]?.label}</span>}
            </span>
          </span>
          <span className="rounded-full bg-cobalt/10 px-3 py-1 text-sm font-semibold text-cobalt">Change</span>
        </button>

        {error && <p className="text-sm text-loss">{error}</p>}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            disabled={busy}
            onClick={() => run(() => supabase.from('recurring_payments').update({ active: !p.active }).eq('id', p.id))}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-warn-bg py-3.5 font-semibold text-warn disabled:opacity-50"
          >
            {p.active ? 'Pause' : 'Resume'}
          </button>
          <button
            disabled={busy}
            onClick={remove}
            className="flex items-center justify-center gap-1.5 rounded-2xl bg-loss/10 py-3.5 font-semibold text-loss disabled:opacity-50"
          >
            <Icon name="trash" size={17} />
            Delete
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function Fact({ icon, emoji, label, value, sub }) {
  return (
    <div className="rounded-[20px] bg-card px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-muted uppercase">
        {emoji ? <span className="text-sm leading-none">{emoji}</span> : <Icon name={icon} size={14} strokeWidth={2.2} />}
        {label}
      </p>
      <p className="tabular mt-1 truncate font-display text-[17px] leading-tight font-bold">{value}</p>
      <p className="truncate text-xs text-muted">{sub}</p>
    </div>
  )
}
