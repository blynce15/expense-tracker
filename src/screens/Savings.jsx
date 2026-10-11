import { useCallback, useEffect, useState } from 'react'
import LynxWatermark from '../components/LynxWatermark'
import EmptyLynx from '../components/EmptyLynx'
import AmountPad from '../components/AmountPad'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { MiniCard } from '../components/BankCard'
import { checkOverdraft } from '../lib/balances'
import { todayISO } from '../lib/dates'
import { fetchGoalsState, goalProblem, moveBetweenGoals, savingsAccounts, transactionGoalProblem } from '../lib/goals'
import { centsToPad, formatCents, parseToCents } from '../lib/money'
import { supabase } from '../lib/supabase'

const DEFAULT_ICON = '🐷'

// Emojis to choose from for a goal
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
  const [state, setState] = useState(null) // accounts, goals with their money, General savings (src/lib/goals.js)
  const [flow, setFlow] = useState(undefined) // undefined = loading, null = no savings account
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(undefined) // undefined = closed, null = General savings, else a goal id
  const [editing, setEditing] = useState(null) // null | 'new' | goal

  const load = useCallback(async () => {
    try {
      setState(await fetchGoalsState())
    } catch (e) {
      setError(e.message)
    }
    fetchSavingsFlow()
      .then(setFlow)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your goals: {error}</p>
  if (!state) return null
  const { goals, general } = state
  const hasSavings = savingsAccounts(state.accounts).length > 0

  // Reached goals are listed small at the end
  const active = goals.filter((g) => g.saved_cents < g.target_cents)
  const reachedGoals = goals.filter((g) => g.saved_cents >= g.target_cents)
  // Always the fresh copy after a change
  const openGoal = openId === undefined ? null : openId === null ? general : goals.find((g) => g.id === openId)

  return (
    <div className="space-y-4 px-4 pt-1 pb-6">
      <TotalCard state={state} />

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

      {(hasSavings || general.saved_cents !== 0) && <GeneralCard general={general} onOpen={() => setOpenId(null)} />}

      {goals.length === 0 ? (
        <div className="rounded-[22px] bg-card px-5 py-8 text-center">
          <EmptyLynx />
          <p className="mt-2 font-display text-lg font-bold">Start your first savings goal</p>
          <p className="mt-1 text-muted">A trip, an emergency fund, a new laptop. Set a target and move money into it.</p>
        </div>
      ) : active.length === 0 ? (
        <p className="rounded-[22px] bg-card px-5 py-6 text-center text-muted">Every goal is reached. Tap New goal to start another.</p>
      ) : (
        <ul className="space-y-2.5">
          {active.map((g) => (
            <li key={g.id}>
              <GoalCard goal={g} onOpen={() => setOpenId(g.id)} />
            </li>
          ))}
        </ul>
      )}

      {reachedGoals.length > 0 && (
        <ul className="space-y-2">
          {reachedGoals.map((g) => (
            <li key={g.id}>
              <button onClick={() => setOpenId(g.id)} className="flex w-full items-center gap-3 rounded-[18px] bg-card px-3.5 py-2.5 text-left text-sm text-muted">
                <span className="text-lg">{g.icon || DEFAULT_ICON}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-semibold text-ink">{g.name}</span> reached · <span className="tabular">{whole(g.saved_cents)}</span>
                </span>
                <span>🎉</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openGoal && !editing && (
        <GoalSheet goal={openGoal} state={state} onClose={() => setOpenId(undefined)} onChanged={load} onEdit={() => setEditing(openGoal)} />
      )}

      {editing && (
        <GoalForm
          goal={editing === 'new' ? null : editing}
          general={general}
          onClose={() => setEditing(null)}
          onSaved={(deleted) => {
            setEditing(null)
            if (deleted) setOpenId(undefined)
            load()
          }}
        />
      )}
    </div>
  )
}

// The real money in the savings accounts, split into goals and General savings.
// The ring shows progress towards all goal targets together.
function TotalCard({ state }) {
  const { goals, general, pot } = state
  const inGoals = goals.reduce((s, g) => s + g.saved_cents, 0)
  const target = goals.reduce((s, g) => s + g.target_cents, 0)
  const ratio = target ? Math.min(1, Math.max(0, inGoals / target)) : 0
  const r = 30
  const c = 2 * Math.PI * r
  const [euros, decimals] = formatCents(pot).split(',')
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#2b8ef7] via-cobalt to-cobalt-deep p-[18px] pb-3.5 text-white shadow-[0_18px_30px_-20px_rgba(31,79,224,0.9)]">
      <LynxWatermark className="-bottom-14 -left-10" />
      <div className="relative flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white/80">In savings</p>
          <p className="tabular mt-0.5 truncate font-display leading-none font-bold">
            <span className="text-[38px] tracking-tight">{euros}</span>
            <span className="text-lg text-white/55">,{decimals}</span>
          </p>
        </div>
        {goals.length > 0 && (
          <div className="relative grid size-[74px] shrink-0 place-items-center" aria-label={`Goals ${Math.floor(ratio * 100)}% of their targets`}>
            <svg width="74" height="74" viewBox="0 0 74 74" className="absolute inset-0 -rotate-90" aria-hidden="true">
              <circle cx="37" cy="37" r={r} fill="none" strokeWidth="8" stroke="rgba(255,255,255,0.18)" />
              {ratio > 0 && (
                <circle cx="37" cy="37" r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - ratio)} stroke="#fff" />
              )}
            </svg>
            <span className="tabular relative font-display text-[15px] font-extrabold">{Math.floor(ratio * 100)}%</span>
          </div>
        )}
      </div>
      <div className="relative mt-3.5 grid grid-cols-2 rounded-2xl bg-white/[.12]">
        <HeroFact icon="target" label={goals.length ? `In goals · ${goals.length}` : 'In goals'} value={whole(inGoals)} />
        <HeroFact icon="bank" label="General savings" value={whole(general.saved_cents)} divider />
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
      <section className="rounded-[24px] bg-gradient-to-br from-tint-from to-tint-to p-5 text-sm text-muted">
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
    <section className="rounded-[24px] bg-gradient-to-br from-tint-from to-tint-to px-4 pt-3.5 pb-3 shadow-[0_16px_30px_-22px_rgba(31,79,224,0.7)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-muted">
          <Icon name="coins" size={15} className="shrink-0 text-cobalt" />
          Savings account · last 6 months
        </p>
        <span className={`tabular shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-bold ${net < 0 ? 'text-loss' : 'text-gain'}`}>{signed(net)}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Monthly change of your savings account">
        <line x1="0" x2={W} y1={zero} y2={zero} strokeWidth="1" stroke="var(--color-ink)" strokeOpacity=".15" />
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
                  fill={pos ? 'var(--color-ink)' : 'var(--color-orange-text)'}
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
            <span className={`tabular font-semibold ${p.cents < 0 ? 'text-orange-text' : 'text-ink'}`}>{signed(p.cents)}</span>
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
          <span className="rounded-full bg-warn-bg px-2 py-0.5 font-bold text-warn">No deadline</span>
        )}
      </span>
    </button>
  )
}

// Savings money that isn't set aside for a goal. No target; tap to move it into a goal.
function GeneralCard({ general, onOpen }) {
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-[22px] bg-card p-4 text-left">
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-cobalt/10 text-2xl">{general.icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-base font-bold">{general.name}</span>
        <span className="block truncate text-xs text-muted">Not set aside for a goal</span>
      </span>
      <span className="tabular font-display text-lg font-bold">{whole(general.saved_cents)}</span>
    </button>
  )
}

// Goal details: add money to it or take money out.
// A card as the other side records a real transfer between the card and a savings account (tagged with
// this goal); another goal (or General savings) as the other side only moves money between goals.
function GoalSheet({ goal, state, onClose, onChanged, onEdit }) {
  const isGeneral = goal.id === null
  const savings = savingsAccounts(state.accounts)
  const cards = savings.length ? state.accounts.filter((a) => !a.archived && (a.type === 'debit' || a.type === 'cash')) : []
  const others = [state.general, ...state.goals].filter((g) => g.id !== goal.id)
  const [mode, setMode] = useState('add') // 'add' | 'out'
  const [pick, setPick] = useState(() => defaultPick('add'))
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [message, setMessage] = useState(null)
  const done = !isGeneral && goal.saved_cents >= goal.target_cents
  const p = isGeneral ? null : pace(goal)

  // Adding: from the first card; taking out: back to General savings (or to a card from General)
  function defaultPick(m) {
    if (m === 'add' && cards.length) return { kind: 'card', id: cards[0].id }
    if (!isGeneral) return { kind: 'goal', id: null }
    if (m === 'out' && cards.length) return { kind: 'card', id: cards[0].id }
    return others.length ? { kind: 'goal', id: others[0].id } : null
  }

  function switchMode(m) {
    setMode(m)
    setPick(defaultPick(m))
    setError(null)
    setMessage(null)
  }

  async function submit() {
    const cents = parseToCents(amount)
    if (!cents) return setError('Enter an amount, like 50 or 12,50.')
    if (!pick) return setError(mode === 'add' ? 'Choose where the money comes from.' : 'Choose where the money goes.')
    setBusy(true)
    setError(null)
    try {
      const text = pick.kind === 'goal' ? await moveGoals(cents) : await moveCard(cents)
      if (text) {
        setAmount('')
        setMessage(text)
        onChanged()
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Between this goal and another one: no money leaves the savings accounts
  async function moveGoals(cents) {
    const other = others.find((g) => g.id === pick.id)
    const [from, to] = mode === 'add' ? [other, goal] : [goal, other]
    const move = { from_goal_id: from.id, to_goal_id: to.id, amount_cents: cents }
    const problem = goalProblem(state, { moves: [...state.moves, move] })
    if (problem) return void setError(problem)
    await moveBetweenGoals(from.id, to.id, cents)
    return `Moved ${formatCents(cents)} from ${from.name} to ${to.name}`
  }

  // Between this goal and a card: a transfer to or from a savings account, tagged with this goal
  async function moveCard(cents) {
    const card = cards.find((a) => a.id === pick.id)
    // Taking out comes from the savings account with the most money
    const account = mode === 'add' ? savings[0] : [...savings].sort((a, b) => b.balance_cents - a.balance_cents)[0]
    const [from, to] = mode === 'add' ? [card, account] : [account, card]
    const transfer = { type: 'transfer', amount_cents: cents, date: todayISO(), account_id: from.id, to_account_id: to.id, category_id: null, note: goal.name, goal_id: goal.id }
    const problem = (await checkOverdraft(null, transfer)) ?? transactionGoalProblem(state, null, transfer)
    if (problem) return void setError(problem)
    const { error } = await supabase.from('transactions').insert(transfer)
    if (error) throw error
    return `Moved ${formatCents(cents)} from ${from.name} to ${to.name}`
  }

  const chips = [
    ...cards.map((a) => ({ kind: 'card', id: a.id, label: a.name, cents: a.balance_cents, account: a })),
    ...others.map((g) => ({ kind: 'goal', id: g.id, label: g.name, cents: g.saved_cents, icon: g.icon || DEFAULT_ICON })),
  ]

  return (
    <Sheet title={`${goal.icon || DEFAULT_ICON} ${goal.name}`} onClose={onClose}>
      <div className="space-y-5">
        <div>
          <p className="tabular font-display text-4xl font-bold tracking-tight">
            {formatCents(goal.saved_cents)}
            {!isGeneral && <span className="ml-2 text-lg font-semibold text-muted">of {formatCents(goal.target_cents)}</span>}
          </p>
          {isGeneral ? (
            <p className="mt-2 text-sm text-muted">Savings money that isn&apos;t set aside for a goal. Move it into a goal whenever you like.</p>
          ) : (
            <>
              <div className="mt-3">
                <ProgressBar goal={goal} thick />
              </div>
              <p className={`mt-2 text-sm ${p?.overdue ? 'text-loss' : 'text-muted'}`}>
                {done ? '🎉 Goal reached!' : p ? p.text : `${formatCents(goal.target_cents - goal.saved_cents)} to go`}
              </p>
            </>
          )}
        </div>

        {savings.length === 0 && others.length === 0 ? (
          <p className="rounded-2xl bg-card px-4 py-4 text-sm text-muted">
            Add a savings account first (Profile → Accounts & cards), so the money has somewhere to go.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 rounded-full bg-line/70 p-1">
              {[
                ['add', 'Add money'],
                ['out', 'Take out'],
              ].map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => switchMode(m)}
                  aria-pressed={mode === m}
                  className={`rounded-full py-2 text-sm font-semibold ${mode === m ? 'bg-ink text-paper' : 'text-muted'}`}
                >
                  {label}
                </button>
              ))}
            </div>
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
            <p className="text-sm font-medium text-muted">{mode === 'add' ? 'From' : 'To'}</p>
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {chips.map((c) => (
                <SourceChip
                  key={`${c.kind}-${c.id}`}
                  on={pick?.kind === c.kind && pick?.id === c.id}
                  onClick={() => setPick({ kind: c.kind, id: c.id })}
                  label={c.label}
                  sub={formatCents(Math.max(c.cents, 0))}
                >
                  {c.kind === 'card' ? (
                    <MiniCard color={c.account.color} name={c.account.name} className="h-3.5 w-5 rounded-[4px] ring-0" />
                  ) : (
                    <span className="text-base leading-none">{c.icon}</span>
                  )}
                </SourceChip>
              ))}
            </div>
            <button
              onClick={submit}
              disabled={busy}
              className="w-full rounded-2xl bg-cobalt py-3.5 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
            >
              {mode === 'add' ? 'Add money' : 'Take out'}
            </button>
            {error && <p className="text-sm text-loss">{error}</p>}
            {message && <p className="text-sm font-medium text-gain">{message}</p>}
          </div>
        )}

        {!isGeneral && (
          <button onClick={onEdit} className="flex w-full items-center justify-center gap-1 py-2 text-base font-medium text-cobalt">
            Edit goal
            <Icon name="chevronRight" size={18} />
          </button>
        )}
      </div>
    </Sheet>
  )
}

function GoalForm({ goal, general, onClose, onSaved }) {
  const isNew = !goal
  const [name, setName] = useState(goal?.name ?? '')
  const [icon, setIcon] = useState(goal?.icon || DEFAULT_ICON)
  const [target, setTarget] = useState(goal ? centsToPad(goal.target_cents) : '') // number-pad text
  const [start, setStart] = useState('') // new goals: money moved in from General savings
  const [deadline, setDeadline] = useState(goal?.deadline ?? null)
  const [picking, setPicking] = useState(null) // 'target' | 'start' | 'date'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const targetCents = parseToCents(target) ?? 0
  const startCents = parseToCents(start) ?? 0
  const canStart = isNew && general.saved_cents > 0
  const emojis = GOAL_EMOJIS.includes(icon) ? GOAL_EMOJIS : [icon, ...GOAL_EMOJIS]

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return setError('Give the goal a name.')
    if (!targetCents) return setError('Set a target amount.')
    if (startCents > Math.max(general.saved_cents, 0)) {
      return setError(`General savings has ${formatCents(general.saved_cents)}. Start with less, then use Add money in the goal to move more from a card.`)
    }

    setBusy(true)
    setError(null)
    const row = { name: name.trim(), icon, target_cents: targetCents, deadline }
    try {
      if (isNew) {
        const { data, error } = await supabase.from('savings_goals').insert(row).select('id').single()
        if (error) throw error
        if (startCents) await moveBetweenGoals(null, data.id, startCents)
      } else {
        const { error } = await supabase.from('savings_goals').update(row).eq('id', goal.id)
        if (error) throw error
      }
    } catch (e) {
      setBusy(false)
      return setError(e.message)
    }
    setBusy(false)
    onSaved(false)
  }

  async function remove() {
    const money = goal.saved_cents > 0 ? ` Its ${formatCents(goal.saved_cents)} goes back to General savings.` : ''
    if (!window.confirm(`Delete the goal "${goal.name}"?${money}`)) return
    setBusy(true)
    // The database hands the goal's transactions and moves to General savings
    const { error } = await supabase.from('savings_goals').delete().eq('id', goal.id)
    setBusy(false)
    if (error) return setError(error.message)
    onSaved(true)
  }

  if (picking === 'date') {
    return (
      <Sheet
        title="Deadline"
        onClose={() => setPicking(null)}
        onBack={() => setPicking(null)}
        action={
          deadline && (
            <button
              type="button"
              onClick={() => {
                setDeadline(null)
                setPicking(null)
              }}
              className="px-2 text-base font-medium text-loss"
            >
              Remove
            </button>
          )
        }
      >
        <DatePicker
          value={deadline ?? todayISO()}
          dimFuture={false}
          quickPicks={false}
          onChange={(iso) => {
            setDeadline(iso)
            setPicking(null)
          }}
        />
      </Sheet>
    )
  }

  // Under the preview: "€1.500 target · by Dec 2026"
  const summary = [targetCents ? `${whole(targetCents)} target` : null, deadline ? `by ${formatMonthYear(deadline)}` : null]
    .filter(Boolean)
    .join(' · ')
  const pct = targetCents ? Math.min(100, (startCents / targetCents) * 100) : 0

  return (
    <Sheet title={isNew ? 'New goal' : 'Edit goal'} onClose={onClose}>
      <form onSubmit={save}>
        {/* How it will look: the icon tile, the name and the target */}
        <div className="flex flex-col items-center pt-1">
          <span className="grid size-[84px] place-items-center rounded-[26px] bg-cobalt/10 text-[44px]">{icon}</span>
          <b className={`mt-3 max-w-full truncate font-display text-2xl ${name.trim() ? '' : 'text-muted/50'}`}>{name.trim() || 'Goal name'}</b>
          <span className="tabular text-sm text-muted">{summary || 'No target yet'}</span>
          {isNew && startCents > 0 && targetCents > 0 && (
            <span className="mt-3 block h-2 w-40 overflow-hidden rounded-full bg-card">
              <span className="block h-full rounded-full bg-gradient-to-r from-[#2b8ef7] to-cobalt" style={{ width: `${Math.max(pct, 2)}%` }} />
            </span>
          )}
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl bg-card">
          <FormRow label="Name">
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                setError(null)
              }}
              placeholder="e.g. Trip to Japan"
              maxLength={30}
              className="w-full bg-transparent text-right text-base font-semibold text-ink outline-none placeholder:font-normal placeholder:text-muted/60"
            />
          </FormRow>
          <FormRow label="Target" onClick={() => setPicking('target')}>
            <RowValue value={targetCents ? formatCents(targetCents) : null} placeholder="€0,00" />
          </FormRow>
          {canStart && (
            <FormRow label="Start with" onClick={() => setPicking('start')}>
              <span className="min-w-0 text-right">
                <RowValue value={startCents ? formatCents(startCents) : null} placeholder="€0,00" />
                <span className="tabular block truncate text-xs text-muted">{whole(general.saved_cents)} in General savings</span>
              </span>
            </FormRow>
          )}
          <FormRow label="Deadline" onClick={() => setPicking('date')}>
            <RowValue value={deadline ? formatDeadline(deadline) : null} placeholder="None" />
          </FormRow>
        </div>

        <div className="mt-3 rounded-2xl bg-card p-3">
          <div className="grid max-h-[136px] grid-cols-8 gap-1 overflow-y-auto [scrollbar-width:none]">
            {emojis.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setIcon(em)}
                aria-label={em}
                aria-pressed={icon === em}
                className={`grid aspect-square place-items-center rounded-xl text-xl transition ${icon === em ? 'bg-cobalt/10 ring-2 ring-cobalt' : ''}`}
              >
                {em}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="mt-3 px-1 text-sm text-loss">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="mt-5 w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_rgba(31,79,224,0.8)] active:bg-cobalt-deep disabled:opacity-50"
        >
          {isNew ? 'Create goal' : 'Save changes'}
        </button>

        {!isNew && (
          <button type="button" onClick={remove} disabled={busy} className="mt-2 w-full py-2 text-base font-medium text-loss">
            Delete goal
          </button>
        )}
      </form>

      {(picking === 'target' || picking === 'start') && (
        <AmountPad
          label={picking === 'target' ? 'Target' : 'Start with'}
          amount={picking === 'target' ? target : start}
          onChange={(v) => {
            if (picking === 'target') setTarget(v)
            else setStart(v)
            setError(null)
          }}
          onDone={() => setPicking(null)}
        />
      )}
    </Sheet>
  )
}

// A row in the goal form: label on the left, value on the right (a button when onClick is set)
function FormRow({ label, onClick, children }) {
  const cls = 'flex min-h-[52px] w-full items-center gap-3 border-b border-line px-4 py-2 text-left last:border-0'
  const inner = (
    <>
      <span className="w-24 shrink-0 text-sm text-muted">{label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1">
        {children}
        {onClick && <Icon name="chevronRight" size={16} className="shrink-0 text-muted" />}
      </span>
    </>
  )
  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  ) : (
    <div className={cls}>{inner}</div>
  )
}

function RowValue({ value, placeholder }) {
  return value ? (
    <b className="tabular block truncate text-base font-semibold">{value}</b>
  ) : (
    <span className="block text-base text-muted/60">{placeholder}</span>
  )
}

// One "From" / "To" choice in a goal: a card or another goal
function SourceChip({ on, onClick, label, sub, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex shrink-0 items-center gap-2 rounded-2xl border-2 px-3 py-2 text-left ${on ? 'border-cobalt bg-bubble' : 'border-transparent bg-card'}`}
    >
      {children}
      <span>
        <span className="block text-sm font-semibold whitespace-nowrap">{label}</span>
        <span className="tabular block text-xs whitespace-nowrap text-muted">{sub}</span>
      </span>
    </button>
  )
}
