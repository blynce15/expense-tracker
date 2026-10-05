import { useCallback, useEffect, useState } from 'react'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { todayISO } from '../lib/dates'
import { centsToInput, formatCents, parseToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

const inputClass = 'w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt'

function formatDeadline(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
  return { text: `${formatCents(perMonth)} a month to reach it by ${formatDeadline(goal.deadline)}` }
}

export default function Savings() {
  const [goals, setGoals] = useState(null)
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
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your goals: {error}</p>
  if (!goals) return null

  const saved = goals.reduce((s, g) => s + g.saved_cents, 0)
  const target = goals.reduce((s, g) => s + g.target_cents, 0)

  return (
    <div className="space-y-5 px-4 pt-1 pb-6">
      {goals.length === 0 ? (
        <div className="rounded-3xl bg-card px-5 py-8 text-center">
          <p className="text-4xl">🐷</p>
          <p className="mt-2 font-display text-lg font-bold">Start your first savings goal</p>
          <p className="mt-1 text-muted">A trip, an emergency fund, a new laptop. Set a target and track your progress.</p>
        </div>
      ) : (
        <>
          <section className="rounded-3xl bg-card p-5">
            <p className="text-base font-medium text-muted">Saved in total</p>
            <p className="tabular mt-1 font-display text-[44px] leading-none font-bold tracking-tight">{formatCents(saved)}</p>
            <p className="mt-2 text-sm text-muted">
              of <span className="tabular font-semibold text-ink">{formatCents(target)}</span> across {goals.length}{' '}
              {goals.length === 1 ? 'goal' : 'goals'}
            </p>
          </section>

          <ul className="space-y-3">
            {goals.map((g) => (
              <li key={g.id}>
                <GoalCard goal={g} onOpen={() => setOpenGoal(g)} />
              </li>
            ))}
          </ul>
        </>
      )}

      <button
        onClick={() => setEditing('new')}
        className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep"
      >
        New goal
      </button>

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

function ProgressBar({ goal, thick = false }) {
  const pct = Math.min(100, (goal.saved_cents / goal.target_cents) * 100)
  const done = goal.saved_cents >= goal.target_cents
  return (
    <div className={`${thick ? 'h-3.5' : 'h-2.5'} overflow-hidden rounded-full bg-paper`}>
      <div className={`h-full rounded-full ${done ? 'bg-gain' : 'bg-cobalt'}`} style={{ width: `${Math.max(pct, goal.saved_cents > 0 ? 2 : 0)}%` }} />
    </div>
  )
}

function GoalCard({ goal, onOpen }) {
  const pct = Math.floor((goal.saved_cents / goal.target_cents) * 100)
  const done = goal.saved_cents >= goal.target_cents
  const p = pace(goal)

  return (
    <button onClick={onOpen} className="w-full rounded-3xl bg-card p-5 text-left">
      <div className="flex items-baseline gap-2">
        <span className="flex-1 truncate font-display text-lg font-bold">{goal.name}</span>
        <span className={`tabular text-base font-semibold ${done ? 'text-gain' : 'text-cobalt'}`}>{done ? '🎉 Done' : `${pct}%`}</span>
      </div>
      <p className="mt-1 text-sm text-muted">
        <span className="tabular font-semibold text-ink">{formatCents(goal.saved_cents)}</span> of {formatCents(goal.target_cents)}
      </p>
      <div className="mt-3">
        <ProgressBar goal={goal} />
      </div>
      {p && <p className={`mt-2.5 text-sm ${p.overdue ? 'text-loss' : 'text-muted'}`}>{p.text}</p>}
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
    <Sheet title={goal.name} onClose={onClose}>
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
    const row = { name: name.trim(), target_cents: targetCents, saved_cents: savedCents, deadline }
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
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Trip to Japan" className={inputClass} />
        </label>

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
              📅 {deadline ? formatDeadline(deadline) : <span className="text-muted">No deadline</span>}
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
