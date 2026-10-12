import { useCallback, useEffect, useState } from 'react'
import EmptyLynx from '../components/EmptyLynx'
import Icon from '../components/Icon'
import LynxWatermark from '../components/LynxWatermark'
import { BankLogo } from '../components/BankCard'
import { fetchAccountsWithBalances } from '../lib/balances'
import { bankFor } from '../lib/banks'
import { todayISO } from '../lib/dates'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
import TransactionSheet from './TransactionSheet'

const MONTHS_SHOWN = 6

// "2026-10" style month keys
function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const shortMonth = (key) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')

// "€2.400" (no cents)
const whole = (cents) => formatCents(cents).replace(/,\d\d$/, '')

// Investment accounts and the money put into them. Money only goes in (transfers into an investment
// account, src/lib/balances.js), so a balance is how much has been invested, not its market value.
async function fetchInvestments() {
  const accounts = (await fetchAccountsWithBalances()).filter((a) => a.type === 'investment')
  const thisMonth = todayISO().slice(0, 7)
  const months = Array.from({ length: MONTHS_SHOWN }, (_, i) => shiftMonth(thisMonth, i - (MONTHS_SHOWN - 1)))
  const yearStart = `${thisMonth.slice(0, 4)}-01`
  const from = months[0] < yearStart ? months[0] : yearStart

  let moves = []
  if (accounts.length) {
    const { data, error } = await supabase
      .from('transactions')
      .select('amount_cents, date, to_account_id')
      .eq('type', 'transfer')
      .in('to_account_id', accounts.map((a) => a.id))
      .gte('date', `${from}-01`)
    if (error) throw error
    moves = data
  }

  const perMonth = new Map(months.map((k) => [k, 0]))
  const accountMonth = new Map() // account id → put in this month
  let month = 0
  let year = 0
  for (const t of moves) {
    const k = t.date.slice(0, 7)
    if (perMonth.has(k)) perMonth.set(k, perMonth.get(k) + t.amount_cents)
    if (k === thisMonth) {
      month += t.amount_cents
      accountMonth.set(t.to_account_id, (accountMonth.get(t.to_account_id) ?? 0) + t.amount_cents)
    }
    if (k >= yearStart) year += t.amount_cents
  }

  return {
    accounts: accounts.map((a) => ({ ...a, month_cents: accountMonth.get(a.id) ?? 0 })),
    total: accounts.reduce((s, a) => s + a.balance_cents, 0),
    month,
    year,
    flow: months.map((k) => ({ key: k, cents: perMonth.get(k), partial: k === thisMonth })),
  }
}

export default function Investments() {
  const [state, setState] = useState(null)
  const [error, setError] = useState(null)
  const [investing, setInvesting] = useState(false)

  const load = useCallback(() => {
    fetchInvestments()
      .then(setState)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your investments: {error}</p>
  if (!state) return null

  const active = state.accounts.filter((a) => !a.archived || a.balance_cents !== 0)

  if (state.accounts.length === 0) {
    return (
      <div className="px-4 pt-1 pb-6">
        <div className="rounded-[22px] bg-card px-5 py-8 text-center">
          <EmptyLynx />
          <p className="mt-2 font-display text-lg font-bold">Track what you invest</p>
          <p className="mt-1 text-muted">Add your broker (like Trade Republic) as an Investment account, then move money into it.</p>
          <button
            onClick={() => navigate('/settings/accounts')}
            className="mt-4 rounded-full bg-teal px-5 py-2.5 text-sm font-semibold text-card active:opacity-80"
          >
            Add an investment account
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-4 pt-1 pb-6">
      <TotalCard state={state} />
      <InvestChart flow={state.flow} />

      <div className="flex items-center justify-between px-1 pt-2">
        <h2 className="font-display text-lg font-bold">
          Where it is <span className="tabular text-base font-semibold text-muted">· {active.length}</span>
        </h2>
        <button
          onClick={() => setInvesting(true)}
          className="flex items-center gap-1 rounded-full bg-teal py-1.5 pr-3.5 pl-2.5 text-sm font-semibold text-card active:opacity-80"
        >
          <Icon name="plus" size={16} strokeWidth={2.6} />
          Invest
        </button>
      </div>

      <ul className="space-y-2.5">
        {active.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-[22px] bg-card p-4">
            <PlatformMark account={a} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-bold">{a.name}</span>
              <span className="tabular block truncate text-xs text-muted">
                {a.archived ? 'Archived' : a.month_cents ? `+${whole(a.month_cents)} this month` : 'Nothing this month'}
              </span>
            </span>
            <span className="tabular font-display text-lg font-bold">{whole(a.balance_cents)}</span>
          </li>
        ))}
      </ul>

      {investing && (
        <TransactionSheet
          transaction={null}
          draft={{ type: 'transfer', to_account_id: active.find((a) => !a.archived)?.id ?? null }}
          onClose={() => setInvesting(false)}
          onSaved={() => {
            setInvesting(false)
            load()
          }}
        />
      )}
    </div>
  )
}

// The broker's logo on a white tile, else the investment icon in the account's colour
function PlatformMark({ account }) {
  const bank = bankFor(account.name)
  if (bank) return <BankLogo bank={bank} className="size-12 rounded-2xl shadow-[0_0_0_1px_var(--color-line)]" />
  return (
    <span className="grid size-12 shrink-0 place-items-center rounded-2xl text-white" style={{ background: account.color }}>
      <Icon name="invest" size={22} strokeWidth={2.2} />
    </span>
  )
}

function TotalCard({ state }) {
  const [euros, decimals] = formatCents(state.total).split(',')
  return (
    <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#14a3b8] via-[#0c8599] to-[#08606f] p-[18px] pb-3.5 text-white shadow-[0_18px_30px_-20px_rgba(12,133,153,0.9)]">
      <LynxWatermark className="-bottom-14 -left-10" />
      <p className="relative text-sm font-semibold text-white/80">Invested so far</p>
      <p className="tabular relative mt-0.5 truncate font-display leading-none font-bold">
        <span className="text-[38px] tracking-tight">{euros}</span>
        <span className="text-lg text-white/55">,{decimals}</span>
      </p>
      <div className="relative mt-3.5 grid grid-cols-2 rounded-2xl bg-white/[.12]">
        <Fact label="This month" value={`+${whole(state.month)}`} />
        <Fact label="This year" value={`+${whole(state.year)}`} divider />
      </div>
    </section>
  )
}

function Fact({ label, value, divider }) {
  return (
    <div className={`px-3.5 py-2.5 ${divider ? 'border-l border-white/15' : ''}`}>
      <span className="block text-[11px] font-semibold text-white/70">{label}</span>
      <span className="tabular block truncate font-display text-[17px] font-bold">{value}</span>
    </div>
  )
}

// One bar per month: how much went into the investment accounts
function InvestChart({ flow }) {
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 150
  const top = 18
  const bottom = 22
  const colW = W / flow.length
  const barW = 26
  const max = Math.max(1, ...flow.map((d) => d.cents))
  const base = H - bottom
  const done = flow.filter((d) => !d.partial)
  const average = done.length ? done.reduce((s, d) => s + d.cents, 0) / done.length : 0
  const p = picked === null ? null : flow[picked]

  return (
    <section className="rounded-[24px] bg-gradient-to-br from-teal-from to-teal-to px-4 pt-3.5 pb-3 shadow-[0_16px_30px_-22px_rgba(12,133,153,0.7)]">
      <div className="flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 truncate text-sm font-medium text-muted">
          <Icon name="invest" size={15} strokeWidth={2.2} className="shrink-0 text-teal" />
          Put in · last 6 months
        </p>
        {average > 0 && (
          <span className="tabular shrink-0 rounded-full bg-card px-2 py-0.5 text-xs font-bold text-teal">avg {whole(Math.round(average))} / month</span>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full overflow-visible" role="img" aria-label="Money invested each month">
        <line x1="0" x2={W} y1={base} y2={base} strokeWidth="1" stroke="var(--color-ink)" strokeOpacity=".15" />
        {flow.map((d, i) => {
          const x = i * colW + (colW - barW) / 2
          const h = d.cents ? Math.max(4, (d.cents / max) * (base - top)) : 0
          return (
            <g key={d.key} onClick={() => setPicked(i)} className="cursor-pointer">
              <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
              {h > 0 && <rect x={x} y={base - h} width={barW} height={h} rx="7" fill="var(--color-teal)" opacity={d.partial ? 0.45 : 1} />}
              {d.cents > 0 && (
                <text x={x + barW / 2} y={base - h - 5} textAnchor="middle" fontSize="10.5" fontWeight="600" fill="var(--color-ink)">
                  {Math.round(d.cents / 100)}
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
            {p.partial && ' (so far)'}: <span className="tabular font-semibold text-ink">{formatCents(p.cents)}</span>
          </>
        ) : (
          'Tap a bar for details'
        )}
      </p>
    </section>
  )
}
