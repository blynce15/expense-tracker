import { useCallback, useEffect, useState } from 'react'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { todayISO } from '../lib/dates'
import { centsToInput, formatCents, parseToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

const DEFAULT_ICON = '🐷'

// Quick picks for goals; any emoji can also be typed in the box
const GOAL_EMOJIS = [
  '🐷', '💰', '🛡️', '✈️', '🏖️', '🌍', '🏠', '🛋️', '🚗', '🚲', '💻', '📱',
  '🎓', '💍', '👶', '🐶', '🎁', '🎸', '📷', '⛷️', '🏕️', '🎮', '🩺', '📈',
]

const inputClass ='w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt'

function formatDeadline(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// "Mar 2027"
function formatMonthYear(iso) {
  const [y, m] = iso.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).replace('Sept', 'Sep')
}

// Whole months left until the deadline (at least 1 while it's still ahead)
function monthsLeft(deadline) {
  const [ty, tm, td] = todayISO().split('-').map(Number)
  const [y, m, d] = deadline.split('-').map(Number)
  let months = (y - ty) * 12 + (m - tm)
  if (d > td) months += 1
  return months
}

// e.g. "€125,00 a month to reach it by 31 Dec 2026"
function pace(goal) {
  const left = goal.target_cents - goal.saved_cents
  if (left <= 0 || !goal.deadline) return null
  const months = monthsLeft(goal.deadline)
  if (months <= 0) return { overdue: true, text: `Deadline passed (${formatDeadline(goal.deadline)})` }
  const perMonth = Math.ceil(left / months)
  return { perMonth, text: `${formatCents(perMonth)} a month to reach it by ${formatDeadline(goal.deadline)}` }
}

// "€2.400" (no cents), for compact lines
const whole = (cents) => formatCents(cents).replace(/,\d\d$/, '')

const MONTHS_SHOWN = 6

// "2026-10" style month keys
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shortMonth = (key) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')

// Money in minus money out of the savings accounts, per month (last 6 months).
// Transfers between two savings accounts cancel out. Returns null if there's no savings account.
async function fetchSavingsFlow() {
  const thisMonth = todayISO().slice(0, 7)
  const keys = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftMonth(thisMonth, i - (MONTHS_SHOWN - 1)))

  const accRes = await supabase.from('accounts').select('id').eq('type', 'savings')
  if (accRes.error) throw accRes.error
  const ids = new Set(accRes.data.map((a) => a.id))
  if (ids.size === 0) return null

  const list = [...ids].join(',')
  const txRes = await supabase
    .from('transactions')
    .select('type, amount_cents, date, account_id, to_account_id')
    .or(`account_id.in.(${list}),to_account_id.in.(${list})`)
    .gte('date', `${keys[0]}-01`)
  if (txRes.error) throw txRes.error

  const net = new Map(keys.map((k) => [k, 0]))
  for (const t of txRes.data) {
    const k = t.date.slice(0, 7)
    if (!net.has(k)) continue
    let change = 0
    if (t.type === 'income') change = t.amount_cents
    else if (t.type === 'expense') change = -t.amount_cents
    else if (t.type === 'transfer')
      change = (ids.has(t.to_account_id) ? t.amount_cents : 0) - (ids.has(t.account_id) ? t.amount_cents : 0)
    net.set(k, net.get(k) + change)
  }
  return keys.map((k) => ({ key: k, cents: net.get(k), partial: k === thisMonth }))
}

export default function Savings() {
  const [goals, setGoals] = useState(null)
  const [flow, setFlow] = useState(undefined) // undefined = loading, null = no savings account
  const [error, setError] = useState(null)
  const [openGoal, setOpenGoal] = useState(null)
  const [editing, setEditing] = useState(null) // null | 'new' | goal

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('savings_goals').select('*').order('created_at')
    if (error) return setError(error.message)
    setGoals(data)
    // Keep an open goal in sync after changes
    setOpenGoal((g) => (g ? (data.find((x) => x.id === g.id) ?? null) : null))
  }, [])

  useEffect(() => {
    load()
    fetchSavingsFlow()
      .then(setFlow)
      .catch((e) => setError(e.message))
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your goals: {error}</p>
  if (!goals) return null

  const saved = goals.reduce((s, g) => s + g.saved_cents, 0)
  const target = goals.reduce((s, g) => s + g.target_cents, 0)
  // Reached goals are hidden from the list but still count in the total
  const active = goals.filter((g) => g.saved_cents < g.target_cents)
  const reachedGoals = goals.filter((g) => g.saved_cents >= g.target_cents)

  return (
    <div className="space-y-4 px-4 pt-1 pb-6">
      {goals.length > 0 && <TotalRing saved={saved} target={target} count={goals.length} reached={goals.length - active.length} />}

      {flow !== undefined && <SavingsChart flow={flow} />}

      <div className="flex items-center justify-between px-1 pt-2">
        <h2 className="font-display text-lg font-bold">
          Goals {active.length > 0 && <span className="tabular text-base font-semibold text-muted">· {active.length}</span>}
        </h2>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 rounded-full bg-cobalt py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-white active:bg-cobalt-deep">
          <Icon name="plus" size={16} strokeWidth={2.6} />
          New goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="rounded-[22px] bg-card px-5 py-8 text-center">
          <p className="text-4xl">🐷</p>
          <p className="mt-2 font-display text-lg font-bold">Start your first savings goal</p>
          <p className="mt-1 text-muted">A trip, an emergency fund, a new laptop. Set a target and track your progress.</p>
        </div>
      ) : active.length === 0 ? (
        <p className="rounded-[22px] bg-card px-5 py-6 text-center text-muted">Every goal is reached. Tap New goal to start another.</p>
      ) : (
        <ul className="space-y-2.5">
          {active.map((g) => (
            <li key={g.id}>
              <GoalCard goal={g} onOpen={() => setOpenGoal(g)} />
            </li>
          ))}
        </ul>
      )}

      {reachedGoals.length > 0 && (
        <ul className="space-y-2">
          {reachedGoals.map((g) => (
            <li key={g.id}>
              <button onClick={() => setOpenGoal(g)} className="flex w-full items-center gap-3 rounded-[18px] bg-card px-3.5 py-2.5 text-left text-sm text-muted">
                <span className="text-lg">{g.icon || DEFAULT_ICON}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-ink">{g.name}</span> reached · <span className="tabular">{formatCents(g.target_cents).replace(/,\d\d$/, '')}</span>
                </span>
                <span>🎉</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openGoal && !editing && (
        <GoalSheet
          goal={openGoal}
          onClose={() => setOpenGoal(null)}
          onChanged={load}
          onEdit={() => setEditing(openGoal)}
        />
      )}

      {editing && (
        <GoalForm
          goal={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(deleted) => {
            setEditing(null)
            if (deleted) setOpenGoal(null)
            load()
          }}
        />
      )}
    </div>
  )
}

// Total saved across goals, in the blue of the app's summary cards, with a progress ring
function TotalRing({ saved, target, count, reached }) {
  const ratio = Math.min(1, saved / target)
  const r = 30
  const c = 2 * Math.PI * r
  const [whole, decimals] = formatCents(saved).split(',')
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#2b8ef7] via-cobalt to-cobalt-deep p-[18px] pb-3.5 text-white shadow-[0_18px_30px_-20px_rgba(31,79,224,0.9)]">
      <span className="pointer-events-none absolute -top-20 -right-14 size-48 rounded-full bg-white/10" />
      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white/80">Total saved</p>
          <p className="tabular mt-0.5 truncate font-display leading-none font-bold">
            <span className="text-[38px] tracking-tight">{whole}</span>
            <span className="text-lg text-white/55">,{decimals}</span>
          </p>
        </div>
        <div className="relative grid size-[74px] shrink-0 place-items-center">
          <svg width="74" height="74" viewBox="0 0 74 74" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="37" cy="37" r={r} fill="none" strokeWidth="8" stroke="rgba(255,255,255,0.18)" />
            {saved > 0 && (
              <circle cx="37" cy="37" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} stroke="#fff" />
            )}
          </svg>
          <span className="tabular relative font-display text-[15px] font-extrabold">{Math.floor(ratio * 100)}%</span>
        </div>
      </div>
      <div className="relative mt-3.5 grid grid-cols-2 rounded-2xl bg-white/[.12]">
        <HeroFact icon="target" label="Target" value={formatCents(target).replace(/,\d\d$/, '')} />
        <HeroFact icon="check" label={reached ? `Goals · ${reached} reached` : 'Goals'} value={count} divider />
      </div>
    </section>
  )
}

function HeroFact({ icon, label, value, divider }) {
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

// Bar chart: net money into the savings account(s) each month
function SavingsChart({ flow }) {
  const [picked, setPicked] = useState(null)

  if (!flow) {
    return (
      <section className="rounded-[24px] bg-gradient-to-br from-[#eef3ff] to-[#dce6ff] p-5 text-sm text-muted">
        Mark an account as <span className="font-semibold text-ink">Savings</span> in Settings → Accounts & cards to see how much goes into it
        each month.
      </section>
    )
  }

  const W = 300
  const H = 150
  const top = 18
  const bottom = 22
  const colW = W / flow.length
  const barW = 26
  const max = Math.max(0, ...flow.map((d) => d.cents))
  const min = Math.min(0, ...flow.map((d) => d.cents))
  const span = max - min || 1
  const y = (v) => top + ((max - v) / span) * (H - top - bottom)
  const zero = y(0)
  const net = flow.reduce((s, d) => s + d.cents, 0)
  const label = (cents) => (cents > 0 ? '+' : '−') + Math.round(Math.abs(cents) / 100)
  const signed = (cents) => (cents > 0 ? '+' : '') + formatCents(cents)
  const p = picked === null ? null : flow[picked]

  return (
    <section className="rounded-[24px] bg-gradient-to-br from-[#eef3ff] to-[#dce6ff] px-4 pt-3.5 pb-3 shadow-[0_16px_30px_-22px_rgba(31,79,224,0.7)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-muted">
          <Icon name="coins" size={15} className="shrink-0 text-cobalt" />
          Savings account · last 6 months
        </p>
        <span className={`tabular shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-bold ${net < 0 ? 'text-loss' : 'text-gain'}`}>{signed(net)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Monthly change of your savings account">
        <line x1="0" x2={W} y1={zero} y2={zero} strokeWidth="1" stroke="#0b1b45" strokeOpacity=".15" />
        {flow.map((d, i) => {
          const pos = d.cents >= 0
          const x = i * colW + (colW - barW) / 2
          const h = Math.max(2, Math.abs(y(d.cents) - zero))
          return (
            <g key={d.key} onClick={() => setPicked(i)} className="cursor-pointer">
              <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
              <rect
                x={x}
                y={pos ? zero - h : zero}
                width={barW}
                height={h}
                rx="7"
                fill={pos ? '#1f4fe0' : '#f08c00'}
                opacity={d.partial ? 0.45 : 1}
              />
              {/* Value labels sit above the zero line for negative months, so they never touch the month names */}
              {d.cents !== 0 && (
                <text
                  x={x + barW / 2}
                  y={(pos ? zero - h : zero) - 5}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="600"
                  fill={pos ? '#0b1b45' : '#c26b00'}
                >
                  {label(d.cents)}
                </text>
              )}
              <text
                x={x + barW / 2}
                y={H - 4}
                textAnchor="middle"
                fontSize="11"
                fontWeight={picked === i ? '700' : '400'}
                className={picked === i ? 'fill-ink' : 'fill-muted'}
              >
                {shortMonth(d.key)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="mt-1 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {shortMonth(p.key)}
            {p.partial && ' (so far)'}:{' '}
            <span className={`tabular font-semibold ${p.cents < 0 ? 'text-[#c26b00]' : 'text-ink'}`}>{signed(p.cents)}</span>
          </>
        ) : (
          'Tap a bar for details'
        )}
      </p>
    </section>
  )
}

function ProgressBar({ goal, thick = false }) {
  const pct = Math.min(100, (goal.saved_cents / goal.target_cents) * 100)
  const done = goal.saved_cents >= goal.target_cents
  return (
    <div className={`${thick ? 'h-3.5' : 'h-2.5'} overflow-hidden rounded-full bg-paper`}>
      <div
        className={`h-full rounded-full ${done ? 'bg-gain' : 'bg-gradient-to-r from-[#2b8ef7] to-cobalt'}`}
        style={{ width: `${Math.max(pct, goal.saved_cents > 0 ? 2 : 0)}%` }}
      />
    </div>
  )
}

function GoalCard({ goal, onOpen }) {
  const pct = Math.floor((goal.saved_cents / goal.target_cents) * 100)
  const p = pace(goal)

  return (
    <button onClick={onOpen} className="block w-full rounded-[22px] bg-card p-4 text-left">
      <span className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cobalt/10 text-2xl">{goal.icon || DEFAULT_ICON}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-base font-bold">{goal.name}</span>
          <span className="tabular block truncate text-xs text-muted">
            <span className="font-semibold text-ink">{whole(goal.saved_cents)}</span> of {whole(goal.target_cents)}
            {goal.deadline && ` · by ${formatMonthYear(goal.deadline)}`}
          </span>
        </span>
        <span className="tabular font-display text-lg font-bold text-cobalt">{pct}%</span>
      </span>
      <span className="mt-3 block">
        <ProgressBar goal={goal} />
      </span>
      <span className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="tabular">{formatCents(goal.target_cents - goal.saved_cents).replace(/,\d\d$/, '')} to go</span>
        {p?.overdue ? (
          <span className="rounded-full bg-loss/10 px-2 py-0.5 font-bold text-loss">Deadline passed</span>
        ) : p ? (
          <span className="tabular rounded-full bg-cobalt/10 px-2 py-0.5 font-bold text-cobalt">{formatCents(p.perMonth).replace(/,\d\d$/, '')} / month</span>
        ) : (
          <span className="rounded-full bg-[#fff1d6] px-2 py-0.5 font-bold text-[#a35f00]">No deadline</span>
        )}
      </span>
    </button>
  )
}

// Goal details: add or take out money
function GoalSheet({ goal, onClose, onChanged, onEdit }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const done = goal.saved_cents >= goal.target_cents
  const p = pace(goal)

  async function change(sign) {
    const cents = parseToCents(amount)
    if (!cents) return setError('Enter an amount, like 50 or 12,50.')
    const next = goal.saved_cents + sign * cents
    if (next < 0) return setError(`You can take out at most ${formatCents(goal.saved_cents)}.`)

    setBusy(true)
    setError(null)
    const { error } = await supabase.from('savings_goals').update({ saved_cents: next }).eq('id', goal.id)
    setBusy(false)
    if (error) return setError(error.message)
    setAmount('')
    setMessage(sign > 0 ? `Added ${formatCents(cents)}` : `Took out ${formatCents(cents)}`)
    onChanged()
  }

  return (
    <Sheet title={`${goal.icon || DEFAULT_ICON} ${goal.name}`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="tabular font-display text-4xl font-bold tracking-tight">
            {formatCents(goal.saved_cents)}
            <span className="ml-2 text-lg font-semibold text-muted">of {formatCents(goal.target_cents)}</span>
          </p>
          <div className="mt-3">
            <ProgressBar goal={goal} thick />
          </div>
          <p className={`mt-2 text-sm ${p?.overdue ? 'text-loss' : 'text-muted'}`}>
            {done
              ? '🎉 Goal reached!'
              : p
                ? p.text
                : `${formatCents(goal.target_cents - goal.saved_cents)} to go`}
          </p>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted">€</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value)
                setMessage(null)
              }}
              placeholder="0,00"
              aria-label="Amount"
              className={`${inputClass} tabular pl-9 text-lg`}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => change(-1)}
              disabled={busy || goal.saved_cents === 0}
              className="flex-1 rounded-2xl bg-card py-3.5 text-base font-medium disabled:text-muted"
            >
              Take out
            </button>
            <button
              onClick={() => change(1)}
              disabled={busy}
              className="flex-[2] rounded-2xl bg-cobalt py-3.5 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
            >
              Add money
            </button>
          </div>
          {error && <p className="text-sm text-loss">{error}</p>}
          {message && <p className="text-sm font-medium text-gain">{message}</p>}
        </div>

        <button onClick={onEdit} className="flex w-full items-center justify-center gap-1 py-2 text-base font-medium text-cobalt">
          Edit goal
          <Icon name="chevronRight" size={18} />
        </button>
      </div>
    </Sheet>
  )
}

function GoalForm({ goal, onClose, onSaved }) {
  const isNew = !goal
  const [name, setName] = useState(goal?.name ?? '')
  const [icon, setIcon] = useState(goal?.icon ?? DEFAULT_ICON)
  const [target, setTarget] = useState(goal ? centsToInput(goal.target_cents) : '')
  const [saved, setSaved] = useState(goal ? centsToInput(goal.saved_cents) : '')
  const [deadline, setDeadline] = useState(goal?.deadline ?? null)
  const [pickingDate, setPickingDate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    const targetCents = parseToCents(target)
    const savedCents = saved.trim() === '' ? 0 : parseToCents(saved)
    if (!targetCents) return setError('Enter a target amount, like 1000 or 1500,50.')
    if (savedCents === null) return setError('Enter the amount already saved as a number, or leave it empty.')

    setBusy(true)
    setError(null)
    const row = { name: name.trim(), icon: icon.trim() || DEFAULT_ICON, target_cents: targetCents, saved_cents: savedCents, deadline }
    const { error } = isNew
      ? await supabase.from('savings_goals').insert(row)
      : await supabase.from('savings_goals').update(row).eq('id', goal.id)
    setBusy(false)
    if (error) return setError(error.message)
    onSaved(false)
  }

  async function remove() {
    if (!window.confirm(`Delete the goal "${goal.name}"? This can't be undone.`)) return
    setBusy(true)
    const { error } = await supabase.from('savings_goals').delete().eq('id', goal.id)
    setBusy(false)
    if (error) return setError(error.message)
    onSaved(true)
  }

  if (pickingDate) {
    return (
      <Sheet title="Deadline" onClose={() => setPickingDate(false)}>
        <DatePicker
          value={deadline ?? todayISO()}
          dimFuture={false}
          quickPicks={false}
          onChange={(iso) => {
            setDeadline(iso)
            setPickingDate(false)
          }}
        />
      </Sheet>
    )
  }

  return (
    <Sheet title={isNew ? 'New goal' : 'Edit goal'} onClose={onClose}>
      <form onSubmit={save} className="space-y-5">
        <div className="flex gap-2">
          <label className="w-20 shrink-0">
            <span className="mb-1.5 block text-sm font-medium text-muted">Emoji</span>
            <input value={icon} onChange={(e) => setIcon(e.target.value)} className={`${inputClass} px-0 text-center text-2xl`} aria-label="Emoji" />
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trip to Japan" className={`${inputClass} py-3.5`} />
          </label>
        </div>

        <div className="grid grid-cols-8 gap-1 rounded-xl bg-card p-2">
          {GOAL_EMOJIS.map((em) => (
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

        <div className="flex gap-2">
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Target</span>
            <div className="relative">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted">€</span>
              <input
                required
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="0,00"
                className={`${inputClass} tabular pl-9`}
              />
            </div>
          </label>
          <label className="flex-1">
            <span className="mb-1.5 block text-sm font-medium text-muted">Already saved</span>
            <div className="relative">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted">€</span>
              <input
                inputMode="decimal"
                value={saved}
                onChange={(e) => setSaved(e.target.value)}
                placeholder="0,00"
                className={`${inputClass} tabular pl-9`}
              />
            </div>
          </label>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-muted">Deadline (optional)</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPickingDate(true)} className={`${inputClass} flex-1 text-left`}>
              🗓️ {deadline ? formatDeadline(deadline) : <span className="text-muted">No deadline</span>}
            </button>
            {deadline && (
              <button type="button" onClick={() => setDeadline(null)} className="rounded-xl bg-card px-4 text-base font-medium text-muted">
                Remove
              </button>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          {isNew ? 'Create goal' : 'Save changes'}
        </button>

        {!isNew && (
          <button type="button" onClick={remove} disabled={busy} className="w-full py-2 text-base font-medium text-loss">
            Delete goal
          </button>
        )}
      </form>
    </Sheet>
  )
}
