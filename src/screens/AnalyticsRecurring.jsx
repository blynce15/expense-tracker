import { useEffect, useState } from 'react'
import { BigAmount, NavyPill, NavyTop, Overlap, pct, Section, whole } from '../components/AnalyticsKit'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, currentPeriod, fetchAnalytics, monthShort } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { formatCents } from '../lib/money'
import { monthlyCents } from '../lib/recurring'
import { navigate } from '../lib/useRoute'
import { dueText } from './Recurring'

const VIOLET = '#7c4dff'
const PER = { weekly: 'a week', monthly: 'a month', yearly: 'a year' }
// Days from `iso` to the end of its month, counting both (e.g. 25 Nov → 6)
const daysInMonthLeft = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m, 0).getDate() - d + 1
}
const card = 'rounded-[24px] bg-card shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)]'

// Analytics → Recurring: what your recurring payments cost (a month, a year, share of income), what's coming up,
// everything you pay by size, what changed in the last 12 months, and what you paid on them each month.
// Always today (no Month/Year): the payments as they are now.
export default function AnalyticsRecurring() {
  const [period] = useState(() => currentPeriod('month'))
  const [data, setData] = useState(() => cachedAnalytics(period))
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    fetchAnalytics(period)
      .then((a) => !cancelled && setData(a))
      .catch((e) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [period])

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your recurring payments: {error}</p>
  const a = data && data.period === period ? data : null
  const pay = a ? (a.recurring ?? []).filter((r) => r.active && r.type !== 'income').sort((x, y) => monthlyCents(y) - monthlyCents(x)) : []

  return (
    <div className="pb-6">
      <NavyTop>
        {a ? (
          <>
            <BigAmount cents={a.recurringMonthly} label="Per month" />
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <NavyPill>{whole(a.recurringMonthly * 12)} a year</NavyPill>
              <NavyPill>{pay.length} active</NavyPill>
              {a.avgIn > 0 && a.recurringMonthly > 0 && <NavyPill>{pct(a.recurringMonthly / a.avgIn)} of income</NavyPill>}
            </div>
          </>
        ) : (
          <div className="h-[92px]" />
        )}
      </NavyTop>
      {a && (
        <>
          <Overlap>
            <ComingUp pay={pay} />
          </Overlap>
          {pay.length > 0 && (
            <Section n={1} title="Everything you pay" right="per month">
              <Everything pay={pay} />
            </Section>
          )}
          <Section n={pay.length ? 2 : 1} title="What changed" right="last 12 months">
            <Changes a={a} />
          </Section>
          <Section n={pay.length ? 3 : 2} title="Over time">
            <PaidChart a={a} />
          </Section>
        </>
      )}
    </div>
  )
}

function Row({ r, sub, right, children }) {
  return (
    <button onClick={() => navigate('/recurring')} className="flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-0">
      <MerchantIcon name={r.name} className="size-10 rounded-[13px] bg-tint-from text-lg">
        {r.icon}
      </MerchantIcon>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[15px]">{r.name}</b>
        {sub && <span className="block truncate text-[12.5px] text-muted">{sub}</span>}
        {children}
      </span>
      {right}
    </button>
  )
}

// The next payments due this month (the card on the navy edge)
function ComingUp({ pay }) {
  const today = todayISO()
  const monthEnd = `${today.slice(0, 7)}-31`
  const due = pay.filter((r) => r.next_due >= today && r.next_due <= monthEnd).sort((x, y) => (x.next_due < y.next_due ? -1 : 1))
  // A weekly payment counts once for every week still to come this month
  const times = (r) => (r.frequency === 'weekly' ? 1 + Math.floor((daysInMonthLeft(r.next_due) - 1) / 7) : 1)
  const left = due.reduce((s, r) => s + r.amount_cents * times(r), 0)
  return (
    <div className={`${card} pb-1`}>
      <div className="flex items-baseline justify-between px-4 pt-4 pb-1">
        <b className="font-display text-[17px]">Coming up</b>
        {left > 0 && <span className="tabular text-[12.5px] text-muted">{whole(left)} left this month</span>}
      </div>
      {due.length === 0 ? (
        <p className="px-4 pt-1 pb-3 text-[13.5px] text-muted">{pay.length ? 'Nothing more due this month.' : 'No recurring payments yet.'}</p>
      ) : (
        due.slice(0, 3).map((r) => <Row key={r.id} r={r} sub={dueText(r)} right={<b className="tabular">{formatCents(r.amount_cents)}</b>} />)
      )}
    </div>
  )
}

// Every active payment by what it costs a month, the biggest first
function Everything({ pay }) {
  const [all, setAll] = useState(false)
  const max = monthlyCents(pay[0]) || 1
  const since = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10)
  const shown = all ? pay : pay.slice(0, 7)
  return (
    <div className={card}>
      {shown.map((r) => (
        <Row
          key={r.id}
          r={r}
          right={
            <span className="text-right">
              <b className="tabular block">{formatCents(monthlyCents(r))}</b>
              {r.frequency !== 'monthly' && (
                <span className="tabular text-xs text-muted">
                  {formatCents(r.amount_cents)} {PER[r.frequency]}
                </span>
              )}
            </span>
          }
        >
          <span className="mt-1.5 flex items-center gap-2">
            <span className="relative h-1.5 flex-1 rounded-full bg-line">
              <span className="absolute inset-y-0 left-0 rounded-full bg-violet" style={{ width: `${(monthlyCents(r) / max) * 100}%` }} />
            </span>
            {(r.created_at ?? '') >= since && <span className="rounded-full bg-violet/12 px-1.5 text-[11px] font-bold text-violet">new</span>}
          </span>
        </Row>
      ))}
      {pay.length > 7 && (
        <button onClick={() => setAll(!all)} className="w-full border-t border-line py-3 text-center text-[13.5px] font-semibold text-cobalt">
          {all ? 'Show less' : `Show all ${pay.length}`}
        </button>
      )}
    </div>
  )
}

// Added in the last 12 months, price rises (a payment recorded for more than before), and paused ones
function Changes({ a }) {
  const start = a.last12[0]
  const list = []
  for (const r of a.recurring ?? []) {
    if (r.type === 'income') continue
    const created = (r.created_at ?? '').slice(0, 10)
    if (r.active && created.slice(0, 7) >= start) {
      list.push({
        key: `n${r.id}`,
        r,
        mark: '+',
        note: `Added · ${monthShort(created.slice(0, 7))}`,
        cents: monthlyCents(r),
        date: created,
        tone: VIOLET,
      })
    }
    if (!r.active) {
      list.push({
        key: `p${r.id}`,
        r,
        mark: '−',
        note: 'Paused',
        cents: -monthlyCents(r),
        date: '',
        tone: '#0f8a5f',
      })
      continue
    }
    const hist = [...(a.fixedHistory.get(r.name.trim().toLowerCase()) ?? [])].sort((x, y) => (x.date < y.date ? -1 : 1))
    if (hist.length < 2) continue
    const lastPaid = hist.at(-1)
    const earlier = [...hist].reverse().find((h) => h.cents !== lastPaid.cents)
    if (earlier && lastPaid.cents > earlier.cents && lastPaid.date.slice(0, 7) >= start) {
      list.push({
        key: `u${r.id}`,
        r,
        mark: '▲',
        note: `${formatCents(earlier.cents)} → ${formatCents(lastPaid.cents)} · ${monthShort(lastPaid.date.slice(0, 7))}`,
        cents: lastPaid.cents - earlier.cents,
        date: lastPaid.date,
        tone: '#c26b00',
      })
    }
  }
  list.sort((x, y) => (x.date < y.date ? 1 : -1))
  if (!list.length) return <p className={`${card} px-4 py-5 text-center text-sm text-muted`}>Nothing added, paused or pricier lately.</p>
  return (
    <div className={card}>
      {list.slice(0, 8).map((c) => (
        <Row
          key={c.key}
          r={c.r}
          sub={c.note}
          right={
            <b className="tabular" style={{ color: c.tone }}>
              {c.cents < 0 ? '−' : '+'}
              {formatCents(Math.abs(c.cents))}
              <span className="text-[11px] font-medium text-muted">/mo</span>
            </b>
          }
        />
      ))}
    </div>
  )
}

// Recurring payments paid each month (expenses named like one), with what they cost now dashed
function PaidChart({ a }) {
  const now = a.recurringMonthly
  const rows = a.trend
    .filter((t) => !t.future)
    .map((t) => ({
      key: t.key,
      cents: a.fixedBy.get(t.key) ?? 0,
      partial: t.partial,
    }))
  const first = rows.find((r) => !r.partial && r.cents > 0)
  const growth = first ? now - first.cents : null
  const [picked, setPicked] = useState(null)
  if (!now && !rows.some((r) => r.cents)) return <p className={`${card} px-4 py-5 text-center text-sm text-muted`}>No recurring payments yet.</p>
  const W = 300
  const H = 90
  const max = Math.max(1, now, ...rows.map((r) => r.cents)) * 1.1
  const step = W / Math.max(1, rows.length)
  const bw = step * 0.56
  const p = picked === null ? null : rows[picked]
  return (
    <div className={`${card} p-4`}>
      {growth !== null && Math.abs(growth) >= 100 && (
        <span className={`tabular rounded-full px-2 py-0.5 text-xs font-bold ${growth > 0 ? 'bg-violet/12 text-violet' : 'bg-gain/12 text-gain'}`}>
          {growth > 0 ? '▲' : '▼'} {whole(Math.abs(growth))} a month since {monthShort(first.key)}
        </span>
      )}
      <svg viewBox={`0 -4 ${W} ${H + 20}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Recurring payments paid each month">
        {rows.map((r, i) => (
          <g key={r.key} onClick={() => setPicked(i === picked ? null : i)} className="cursor-pointer">
            <rect x={i * step} y="-4" width={step} height={H + 20} fill="transparent" />
            {r.cents > 0 && (
              <rect
                x={i * step + (step - bw) / 2}
                y={H - (r.cents / max) * H}
                width={bw}
                height={(r.cents / max) * H}
                rx="5"
                fill={VIOLET}
                opacity={picked !== null && picked !== i ? 0.3 : r.partial ? 0.45 : 0.85}
              />
            )}
            <text
              x={i * step + step / 2}
              y={H + 14}
              textAnchor="middle"
              fontSize="9.5"
              className={r.partial || picked === i ? 'fill-ink font-bold' : 'fill-muted'}
            >
              {monthShort(r.key)[0]}
            </text>
          </g>
        ))}
        {now > 0 && (
          <line
            x1="0"
            x2={W}
            y1={H - (now / max) * H}
            y2={H - (now / max) * H}
            stroke="var(--color-ink)"
            strokeOpacity=".5"
            strokeWidth="1.4"
            strokeDasharray="4 4"
          />
        )}
      </svg>
      <p className="mt-1 text-center text-[12.5px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' so far'}: paid <b className="tabular text-ink">{whole(p.cents)}</b>
          </>
        ) : (
          <>Dashed = what they cost now · tap a month</>
        )}
      </p>
    </div>
  )
}
