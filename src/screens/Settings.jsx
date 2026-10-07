import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { budgetPeriod, startDayOf } from '../lib/budget'
import { formatDayMonth, todayISO } from '../lib/dates'
import { fetchLookups } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { fetchProfile, saveProfile } from '../lib/profile'
import { fetchRecurring, monthlyCents } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'

// 1 → "1st", 22 → "22nd"
function ordinal(n) {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix}`
}

export default function Settings({ session }) {
  const [startDay, setStartDay] = useState(null)
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchProfile()
      .then((p) => setStartDay(startDayOf(p)))
      .catch((e) => setError(e.message))
    // A short summary under each row; the rows work without it
    Promise.all([fetchLookups(), fetchRecurring()])
      .then(([lookups, recurring]) => {
        const active = recurring.filter((p) => p.active)
        setOverview({
          accounts: lookups.accounts.filter((a) => !a.archived),
          categories: lookups.categories.filter((c) => !c.archived),
          payments: active.length,
          perMonth: active.reduce((t, p) => t + monthlyCents(p), 0),
        })
      })
      .catch(() => {})
  }, [])

  async function changeStartDay(day) {
    const before = startDay
    setStartDay(day)
    setError(null)
    try {
      await saveProfile({ budget_start_day: day })
    } catch (e) {
      setStartDay(before)
      setError(`Couldn't save: ${e.message}`)
    }
  }

  const o = overview
  const expenses = o?.categories.filter((c) => c.kind === 'expense') ?? []
  const income = o?.categories.filter((c) => c.kind === 'income') ?? []
  const period = startDay ? budgetPeriod(todayISO(), startDay) : null

  return (
    <div className="space-y-5 pt-2 pb-8">
      <Group label="Your money">
        <Row
          onClick={() => navigate('/settings/accounts')}
          tile={<CardStack accounts={o?.accounts ?? []} />}
          tileClass="bg-paper"
          title="Accounts & cards"
          sub={o && (o.accounts.length ? `${o.accounts.length} · ${o.accounts.map((a) => a.name).join(', ')}` : 'Add your first account')}
        />
        <Row
          onClick={() => navigate('/settings/categories')}
          tile={<Icon name="tag" />}
          title="Categories"
          sub={o && `${expenses.length} expense · ${income.length} income  ${expenses.slice(0, 5).map((c) => c.icon).join(' ')}`}
        />
        <Row
          onClick={() => navigate('/recurring')}
          tile={<Icon name="repeat" />}
          title="Recurring payments"
          sub={o && (o.payments ? `${o.payments} active · about ${formatCents(o.perMonth).replace(/,\d\d$/, '')} a month` : 'Rent, subscriptions, bills')}
        />
      </Group>

      <section>
        <Group label="Budget">
          <li>
            <label className="flex items-center gap-3 px-4 py-3">
              <Tile>
                <Icon name="calendar" />
              </Tile>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">Period starts on</span>
                <span className="block truncate text-xs text-muted">
                  {period ? `${formatDayMonth(period.start)} – ${formatDayMonth(period.end)} this time` : ' '}
                </span>
              </span>
              <span className="relative">
                <select
                  id="budget-start-day"
                  value={startDay ?? ''}
                  disabled={startDay == null}
                  onChange={(e) => changeStartDay(Number(e.target.value))}
                  className="appearance-none rounded-xl bg-paper py-2 pr-8 pl-3 text-sm font-bold text-cobalt outline-none"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {ordinal(d)}
                    </option>
                  ))}
                </select>
                <Icon name="chevronDown" size={16} strokeWidth={2.4} className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-cobalt" />
              </span>
            </label>
          </li>
        </Group>
        {error && <p className="px-5 pt-2 text-sm text-loss">{error}</p>}
        <p className="px-5 pt-2 text-xs text-muted">
          Set this to your payday. Your budget is the money in bank and cash accounts, so moving money to savings lowers it. Savings and
          credit cards are left out.
          {startDay > 28 && ' In shorter months the period starts on the last day of the month.'}
        </p>
      </section>

      <Group label="Account">
        <Row tile={<Icon name="mail" />} tileClass="bg-paper text-muted" title="Signed in as" sub={session.user.email} />
        <Row
          onClick={() => supabase.auth.signOut()}
          tile={<Icon name="logout" />}
          tileClass="bg-loss/10 text-loss"
          title={<span className="text-loss">Sign out</span>}
        />
      </Group>

      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <img src="/logo.png" alt="" className="size-14" />
        <p className="text-sm font-semibold">Expense Tracker</p>
        <p className="text-xs text-muted">Your data is private to your login</p>
      </div>
    </div>
  )
}

function Group({ label, children }) {
  return (
    <section>
      <h2 className="px-5 pb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">{label}</h2>
      <ul className="mx-4 divide-y divide-line overflow-hidden rounded-[22px] bg-card">{children}</ul>
    </section>
  )
}

function Tile({ className = 'bg-cobalt/10 text-cobalt', children }) {
  return <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${className}`}>{children}</span>
}

// A settings row; tappable when it has onClick
function Row({ onClick, tile, tileClass, title, sub }) {
  const inner = (
    <>
      <Tile className={tileClass}>{tile}</Tile>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {sub !== undefined && <span className="block min-h-4 truncate text-xs text-muted">{sub}</span>}
      </span>
      {onClick && <Icon name="chevronRight" size={18} className="shrink-0 text-muted/60" />}
    </>
  )
  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3 text-left">
          {inner}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
      )}
    </li>
  )
}

// Up to three small cards in the accounts' colors
function CardStack({ accounts }) {
  const shown = accounts.slice(0, 3)
  if (!shown.length) return <Icon name="card" className="text-cobalt" />
  return (
    <span className="relative block h-6 w-8">
      {shown.map((a, i) => (
        <span
          key={a.id}
          className="absolute inset-0 rounded-md ring-1 ring-white"
          style={{ backgroundColor: a.color, transform: `rotate(${-14 + (i + 3 - shown.length) * 8}deg) translateX(${(i + 3 - shown.length) * 2 - 2}px)` }}
        />
      ))}
    </span>
  )
}
