import { useCallback, useEffect, useState } from 'react'
import AmountPad from '../components/AmountPad'
import DatePicker from '../components/DatePicker'
import Icon from '../components/Icon'
import Sheet from '../components/Sheet'
import { MiniCard } from '../components/BankCard'
import { checkOverdraft } from '../lib/balances'
import { todayISO } from '../lib/dates'
import { goalColor, goalTextColor } from '../lib/goalColors'
import { fetchGoalsState, goalProblem, moveBetweenGoals, savingsAccounts, transactionGoalProblem } from '../lib/goals'
import { centsToPad, formatCents, parseToCents } from '../lib/money'
import { recall, remember } from '../lib/memory'
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
    if (t.type === 'income' || t.type === 'divest') change = ids.has(t.account_id) ? t.amount_cents : 0
    else if (t.type === 'expense' || t.type === 'invest') change = ids.has(t.account_id) ? -t.amount_cents : 0
    else if (t.type === 'transfer')
      change = (ids.has(t.to_account_id) ? t.amount_cents : 0) - (ids.has(t.account_id) ? t.amount_cents : 0)
    net.set(k, net.get(k) + change)
  }
  return keys.map((k) => ({ key: k, cents: net.get(k), partial: k === thisMonth }))
}

// Navy top: reaches up behind the top bar (same as Home); the "Saved this month" card overlaps its bottom edge
const HERO = 'radial-gradient(120% 90% at 85% 0%, #22408f 0%, #0b1b45 55%, #070d24 100%)'

export default function Savings() {
  // accounts, goals with their money, General savings (src/lib/goals.js)
  const [state, setStateNow] = useState(() => recall('savings'))
  const setState = (value) => setStateNow(remember('savings', value))
  // undefined = loading, null = no savings account
  const [flow, setFlowNow] = useState(() => recall('savings:flow') ?? undefined)
  const setFlow = (value) => setFlowNow(remember('savings:flow', value))
  const [error, setError] = useState(null)
  const [openId, setOpenId] = useState(undefined) // undefined = closed, null = General savings, else a goal id
  const [editing, setEditing] = useState(null) // null | 'new' | goal

  // Both at once (the chart doesn't wait for the goals)
  const load = useCallback(async () => {
    fetchSavingsFlow()
      .then(setFlow)
      .catch((e) => setError(e.message))
    try {
      setState(await fetchGoalsState())
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your goals: {error}</p>
  if (!state) return null
  const { goals, general } = state
  const hasSavings = savingsAccounts(state.accounts).length > 0

  // Reached goals are listed small at the end
  const active = goals.filter((g) => g.saved_cents < g.target_cents)
  const reachedGoals = goals.filter((g) => g.saved_cents >= g.target_cents)
  const showGeneral = hasSavings || general.saved_cents !== 0
  // Always the fresh copy after a change
  const openGoal = openId === undefined ? null : openId === null ? general : goals.find((g) => g.id === openId)

  return (
    <div className="pb-6">
      <div
        className="-mt-[calc(3.5rem+env(safe-area-inset-top))] rounded-b-[34px] px-5 pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[88px] text-white"
        style={{ background: HERO }}
      >
        <TotalHero state={state} />
      </div>

      <section className="relative z-10 -mt-[72px] px-4">
        <SavedCard flow={flow} />
      </section>

      <div className="flex items-center justify-between px-5 pt-6 pb-2.5">
        <h2 className="font-display text-lg font-bold">
          Goals {active.length > 0 && <span className="tabular text-base font-semibold text-muted">· {active.length}</span>}
        </h2>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-1 rounded-full bg-cobalt py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-white active:bg-cobalt-deep"
        >
          <Icon name="plus" size={16} strokeWidth={2.6} />
          New goal
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-4">
        {showGeneral && <GeneralTile general={general} onOpen={() => setOpenId(null)} />}
        {active.map((g) => (
          <GoalTile key={g.id} goal={g} onOpen={() => setOpenId(g.id)} />
        ))}
        {active.length === 0 && <NewGoalTile first={goals.length === 0} onClick={() => setEditing('new')} />}
      </div>

      {reachedGoals.length > 0 && (
        <ul className="mt-3.5 space-y-2 px-4">
          {reachedGoals.map((g) => (
            <li key={g.id}>
              <button onClick={() => setOpenId(g.id)} className="flex w-full items-center gap-2.5 rounded-[20px] bg-card px-4 py-3 text-left">
                <span className="text-xl leading-none">{g.icon || DEFAULT_ICON}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {g.name} <span className="font-medium text-muted">reached</span>
                </span>
                <b className="tabular font-display">{whole(g.saved_cents)}</b>
                <span className="rounded-full bg-gain/12 px-2 py-0.5 text-xs font-bold text-gain">Done</span>
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

// A ring with something in the middle. `track` and `color` are stroke colours.
function Ring({ ratio, size, stroke, color, track, children, label }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const shown = Math.min(1, Math.max(0, ratio))
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={track} />
        {shown > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - shown)}
            stroke={color}
          />
        )}
      </svg>
      <span className="relative">{children}</span>
    </span>
  )
}

// The real money in the savings accounts; the ring shows progress towards all goal targets together.
function TotalHero({ state }) {
  const { goals, pot } = state
  const inGoals = goals.reduce((s, g) => s + g.saved_cents, 0)
  const target = goals.reduce((s, g) => s + g.target_cents, 0)
  const ratio = target ? inGoals / target : 0
  const pct = Math.floor(Math.min(1, ratio) * 100)
  const [euros, decimals] = formatCents(pot).split(',')
  return (
    <div className="flex items-center gap-3.5 pt-1">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white/75">In savings</p>
        <p className="tabular mt-1 truncate font-display leading-none font-bold tracking-tight">
          <span className="text-[44px]">{euros}</span>
          <span className="text-xl text-white/50">,{decimals}</span>
        </p>
        {goals.length > 0 && (
          <span className="tabular mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-2.5 py-1 text-[13px] font-semibold">
            <Icon name="target" size={14} />
            {whole(inGoals)} in goals
          </span>
        )}
      </div>
      {goals.length > 0 && (
        <Ring ratio={ratio} size={104} stroke={9} color="#fff" track="rgba(255,255,255,0.14)" label={`Goals ${pct}% of their targets`}>
          <span className="block text-center">
            <b className="tabular block font-display text-2xl leading-none">{pct}%</b>
            <span className="text-[11px] text-white/70">of targets</span>
          </span>
        </Ring>
      )}
    </div>
  )
}

const CARD_SHADOW = 'shadow-[0_24px_40px_-24px_rgba(11,27,69,0.6)]'

// Net money into the savings accounts this month, with the last 6 months as bars (tap one to read it)
function SavedCard({ flow }) {
  const [picked, setPicked] = useState(null)

  if (flow === null) {
    return (
      <div className={`rounded-[24px] bg-card p-4 text-sm text-muted ${CARD_SHADOW}`}>
        <p className="font-display text-base font-bold text-ink">Saved this month</p>
        <p className="mt-1">
          Mark an account as <span className="font-semibold text-ink">Savings</span> in Profile → Accounts & cards to see how much goes into it each
          month.
        </p>
      </div>
    )
  }
  if (flow === undefined) return <div className={`h-[150px] rounded-[24px] bg-card ${CARD_SHADOW}`} />

  const W = 300
  const H = 64 // bar area; month names go under it
  const colW = W / flow.length
  const barW = 24
  const max = Math.max(0, ...flow.map((d) => d.cents))
  const min = Math.min(0, ...flow.map((d) => d.cents))
  const span = max - min || 1
  const y = (v) => ((max - v) / span) * H
  const zero = y(0)
  const current = flow[flow.length - 1]
  const shown = picked === null ? current : flow[picked]
  const full = flow.filter((d) => !d.partial)
  const usual = full.length ? Math.round(full.reduce((s, d) => s + d.cents, 0) / full.length) : 0
  const signed = (cents) => (cents < 0 ? '−' : cents > 0 ? '+' : '') + whole(Math.abs(cents))
  const ahead = current.cents >= usual

  return (
    <div className={`rounded-[24px] bg-card px-4 pt-3.5 pb-2.5 ${CARD_SHADOW}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-muted">{shown === current ? 'Saved this month' : `Saved in ${longMonth(shown.key)}`}</p>
          <p className={`tabular mt-0.5 font-display text-[26px] leading-tight font-bold ${shown.cents < 0 ? 'text-orange-text' : ''}`}>{signed(shown.cents)}</p>
        </div>
        {usual !== 0 && (
          <span
            className={`tabular mt-0.5 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${ahead ? 'bg-gain/12 text-gain' : 'bg-warn-bg text-orange-text'}`}
          >
            <Icon name={ahead ? 'arrowUp' : 'arrowDown'} size={12} strokeWidth={2.8} />
            {usual < 0 ? '−' : ''}
            {whole(Math.abs(usual))} avg
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Money into your savings each month">
        <line x1="0" x2={W} y1={zero} y2={zero} strokeWidth="1" stroke="var(--color-ink)" strokeOpacity=".12" />
        {flow.map((d, i) => {
          const pos = d.cents >= 0
          const x = i * colW + (colW - barW) / 2
          const h = d.cents === 0 ? 0 : Math.max(3, Math.abs(y(d.cents) - zero))
          const on = shown === d
          return (
            <g key={d.key} onClick={() => setPicked(i === flow.length - 1 ? null : i)} className="cursor-pointer">
              <rect x={i * colW} y="0" width={colW} height={H + 20} fill="transparent" />
              {h > 0 && (
                <rect
                  x={x}
                  y={pos ? zero - h : zero}
                  width={barW}
                  height={h}
                  rx="7"
                  className={pos ? 'fill-cobalt' : 'fill-orange-text'}
                  opacity={d.partial ? 0.45 : on || picked === null ? 1 : 0.55}
                />
              )}
              <text x={x + barW / 2} y={H + 16} textAnchor="middle" fontSize="11" fontWeight={on ? '700' : '400'} className={on ? 'fill-ink' : 'fill-muted'}>
                {shortMonth(d.key)}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const longMonth = (key) => new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'long' })

// "Jun ’27", short enough for a half-width tile on a small phone
const shortMonthYear = (iso) => `${shortMonth(iso.slice(0, 7))} ’${iso.slice(2, 4)}`

// Soft circle in the corner of a tile
function Corner({ color }) {
  return <span className="pointer-events-none absolute -top-7 -right-7 size-24 rounded-full" style={{ backgroundColor: color }} />
}

const TILE = 'relative overflow-hidden rounded-[24px] p-3.5 text-left'

// A goal: ring in its colour around the emoji, %, name, money of target, then the pace
function GoalTile({ goal, onOpen }) {
  const color = goalColor(goal.icon)
  const text = goalTextColor(goal.icon)
  const pct = Math.floor((goal.saved_cents / goal.target_cents) * 100)
  const p = pace(goal)
  return (
    <button onClick={onOpen} className={`${TILE} bg-card shadow-[0_14px_30px_-24px_rgba(11,27,69,0.5)]`}>
      <Corner color={`color-mix(in srgb, ${color} 11%, transparent)`} />
      <span className="relative flex items-start justify-between">
        <Ring ratio={goal.saved_cents / goal.target_cents} size={46} stroke={4.5} color={color} track={`color-mix(in srgb, ${color} 16%, transparent)`}>
          <span className="text-xl leading-none">{goal.icon || DEFAULT_ICON}</span>
        </Ring>
        <b className="tabular font-display text-[15px]" style={{ color: text }}>
          {pct}%
        </b>
      </span>
      <b className="relative mt-3 block truncate font-display text-[15.5px]">{goal.name}</b>
      <b className="tabular relative mt-0.5 block font-display text-[21px] leading-tight">{whole(goal.saved_cents)}</b>
      <span className="tabular relative block text-[12.5px] text-muted">of {whole(goal.target_cents)}</span>
      <span
        className={`tabular relative mt-2.5 flex items-center gap-1 text-xs font-semibold ${p?.overdue ? 'text-loss' : p ? '' : 'text-muted'}`}
        style={p && !p.overdue ? { color: text } : undefined}
      >
        {p?.overdue ? (
          'Deadline passed'
        ) : p ? (
          <>
            <Icon name="calendar" size={13} className="shrink-0" />
            <span className="truncate">
              {whole(p.perMonth)}/mo · {shortMonthYear(goal.deadline)}
            </span>
          </>
        ) : (
          'No deadline'
        )}
      </span>
    </button>
  )
}

// Savings money that isn't in a goal: the first tile, light blue
function GeneralTile({ general, onOpen }) {
  return (
    <button onClick={onOpen} className={`${TILE} bg-gradient-to-br from-tint-from to-tint-to`}>
      <Corner color="color-mix(in srgb, var(--color-cobalt) 10%, transparent)" />
      <span className="relative grid size-[46px] place-items-center rounded-full bg-card text-cobalt">
        <Icon name="bank" size={20} />
      </span>
      <b className="relative mt-3 block truncate font-display text-[15.5px]">{general.name}</b>
      <b className="tabular relative mt-0.5 block font-display text-[21px] leading-tight">{whole(general.saved_cents)}</b>
      <span className="relative block text-[12.5px] text-muted">Not in a goal yet</span>
      <span className="relative mt-2.5 flex items-center gap-0.5 text-xs font-bold text-cobalt">
        Give it a goal
        <Icon name="chevronRight" size={13} strokeWidth={2.6} />
      </span>
    </button>
  )
}

// Shown when there's no goal in progress
function NewGoalTile({ first, onClick }) {
  return (
    <button onClick={onClick} className="grid min-h-[176px] place-items-center rounded-[24px] border-2 border-dashed border-line p-3 text-center font-bold text-cobalt">
      <span>
        <span className="mx-auto mb-2 grid size-11 place-items-center rounded-full bg-bubble">
          <Icon name="plus" size={20} strokeWidth={2.6} />
        </span>
        {first ? 'First goal' : 'New goal'}
      </span>
    </button>
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
