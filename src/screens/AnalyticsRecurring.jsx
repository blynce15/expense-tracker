import { useEffect, useState } from 'react'
import { BigAmount, NavyPill, NavyTop, Overlap, pct, Section, whole } from '../components/AnalyticsKit'
import MerchantIcon from '../components/MerchantIcon'
import { cachedAnalytics, currentPeriod, fetchAnalytics, monthShort } from '../lib/analytics'
import { todayISO } from '../lib/dates'
import { formatCents } from '../lib/money'
import { daysUntil, dueDaysInMonth, monthlyCents } from '../lib/recurring'
import { navigate } from '../lib/useRoute'

const VIOLET = '#7c4dff'
// The Recurring card's violet (Analytics → Explore), as the top of this page
const VIOLET_TOP = 'radial-gradient(120% 90% at 85% 0%, #a58bff 0%, #6d3ff0 45%, #3a1aa8 100%)'
const card = 'rounded-[24px] bg-card shadow-[0_14px_30px_-24px_rgba(11,27,69,0.45)]'

// Analytics → Recurring (owner chose "A · Donut + tiles" with the calendar on the edge, violet like its card, and
// "W1 · Change cards", .harness/analytics-v5c-recurring.html): what your recurring payments cost (a month, a year,
// share of income, a donut of what you pay), this month as a calendar with the next payment, everything you pay as
// logo tiles, what changed in the last 12 months, and what you paid on them each month. Always today: no Month/Year.
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn&apos;t load your recurring payments: {error}</p>
  const a = data && data.period === period ? data : null
  const pay = a ? (a.recurring ?? []).filter((r) => r.active && r.type !== 'income').sort((x, y) => monthlyCents(y) - monthlyCents(x)) : []

  return (
    <div className="pb-6">
      <NavyTop background={VIOLET_TOP}>{a ? <Top a={a} pay={pay} /> : <div className="h-[116px]" />}</NavyTop>
      {a && (
        <>
          <Overlap>
            <Calendar pay={pay} />
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

// ---------- The violet top: cost a month, a year, share of income, and a donut of what you pay ----------
const WHITES = ['#fff', 'rgba(255,255,255,.78)', 'rgba(255,255,255,.6)', 'rgba(255,255,255,.46)', 'rgba(255,255,255,.34)', 'rgba(255,255,255,.24)']

function Top({ a, pay }) {
  const size = 112
  const r = 46
  const C = 2 * Math.PI * r
  const total = pay.reduce((s, p) => s + monthlyCents(p), 0)
  // The 5 biggest, then the rest together
  const slices = [...pay.slice(0, 5).map((p) => monthlyCents(p)), pay.slice(5).reduce((s, p) => s + monthlyCents(p), 0)].filter((c) => c > 0)
  const gap = slices.length > 1 ? 3 : 0
  let at = 0
  return (
    <div className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <BigAmount cents={a.recurringMonthly} label="Per month" />
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <NavyPill>{whole(a.recurringMonthly * 12)} a year</NavyPill>
          {a.avgIn > 0 && a.recurringMonthly > 0 && <NavyPill>{pct(a.recurringMonthly / a.avgIn)} of income</NavyPill>}
        </div>
      </div>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true">
          <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.14)" strokeWidth="14" />
            {total > 0 &&
              slices.map((c, i) => {
                const len = (c / total) * C
                const el = (
                  <circle
                    key={i}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    fill="none"
                    stroke={WHITES[i]}
                    strokeWidth="14"
                    strokeDasharray={`${Math.max(0.5, len - gap)} ${C}`}
                    strokeDashoffset={-at}
                  />
                )
                at += len
                return el
              })}
          </g>
        </svg>
        <span className="absolute inset-0 grid place-items-center text-center">
          <span>
            <b className="block font-display text-xl leading-none">{pay.length}</b>
            <span className="text-[11px] text-white/75">active</span>
          </span>
        </span>
      </div>
    </div>
  )
}

// ---------- This month as a calendar, with the next payment (the card on the violet edge) ----------
function Calendar({ pay }) {
  const today = todayISO()
  const key = today.slice(0, 7)
  const [y, m] = key.split('-').map(Number)
  const days = new Date(y, m, 0).getDate()
  const blank = (new Date(y, m - 1, 1).getDay() + 6) % 7 // Monday first
  const todayDay = Number(today.slice(8, 10))
  const byDay = new Map()
  for (const p of pay) for (const d of dueDaysInMonth(p, key)) byDay.set(d, [...(byDay.get(d) ?? []), p])
  // Still to pay this month: every day from today on
  let left = 0
  for (const [d, list] of byDay) if (d >= todayDay) left += list.reduce((s, p) => s + p.amount_cents, 0)
  const next = pay.filter((p) => p.next_due >= today).sort((x, y2) => (x.next_due < y2.next_due ? -1 : 1))[0]
  const monthName = new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' })

  return (
    <div className={`${card} p-3.5`}>
      <div className="flex items-baseline justify-between px-0.5">
        <b className="font-display text-[17px]">{monthName}</b>
        {left > 0 && <span className="tabular text-[12.5px] text-muted">{whole(left)} left this month</span>}
      </div>
      <div className="mt-2.5 grid grid-cols-7 gap-1">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-center text-[10px] font-bold text-muted">
            {d}
          </span>
        ))}
        {Array.from({ length: blank }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1
          const list = byDay.get(d)
          const past = d < todayDay
          return (
            <span
              key={d}
              className={`relative flex h-10 flex-col items-center justify-center gap-px rounded-xl ${list ? 'bg-violet/10' : ''} ${past && list ? 'opacity-50' : ''} ${
                d === todayDay ? 'ring-2 ring-violet ring-inset' : ''
              }`}
            >
              <span className={`text-[9.5px] font-bold ${d === todayDay ? 'text-violet' : 'text-muted'}`}>{d}</span>
              {list && (
                <MerchantIcon name={list[0].name} className="size-[18px] rounded-md text-[13px] leading-none">
                  {list[0].icon}
                </MerchantIcon>
              )}
              {list?.length > 1 && (
                <span className="absolute -top-1 -right-0.5 grid size-4 place-items-center rounded-full bg-violet text-[9px] font-bold text-white">
                  {list.length}
                </span>
              )}
            </span>
          )
        })}
      </div>
      {next ? (
        <NextCard p={next} />
      ) : (
        <p className="mt-3 text-center text-[13px] text-muted">{pay.length ? 'Nothing more due this month.' : 'No recurring payments yet.'}</p>
      )}
    </div>
  )
}

// The next payment: logo, name, date and amount, and a ring counting the days down
function NextCard({ p }) {
  const days = daysUntil(p.next_due)
  const [y, m, d] = p.next_due.split('-').map(Number)
  const date = new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
  const size = 54
  const r = 23
  const C = 2 * Math.PI * r
  const fill = Math.max(0.04, 1 - Math.min(days, 30) / 30)
  return (
    <button
      onClick={() => navigate('/recurring')}
      className="mt-3 flex w-full items-center gap-3 rounded-[20px] bg-gradient-to-br from-violet/15 to-violet/[.04] p-3.5 text-left ring-1 ring-violet/20 ring-inset"
    >
      <MerchantIcon name={p.name} className="size-12 rounded-2xl bg-card text-[23px]">
        {p.icon}
      </MerchantIcon>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-extrabold tracking-[0.08em] text-violet">NEXT PAYMENT</span>
        <b className="block truncate font-display text-lg leading-tight">{p.name}</b>
        <span className="tabular text-[12.5px] text-muted">
          {date} · <b className="text-ink">{formatCents(p.amount_cents)}</b>
        </span>
      </span>
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} aria-hidden="true" className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={VIOLET} strokeOpacity=".16" strokeWidth="6" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={VIOLET} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${fill * C} ${C}`} />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-center leading-none">
          {days === 0 ? (
            <b className="text-[12px] text-violet">Today</b>
          ) : (
            <span>
              <b className="block font-display text-lg text-violet">{days}</b>
              <span className="text-[9.5px] font-bold text-muted">{days === 1 ? 'day' : 'days'}</span>
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

// ---------- Everything you pay: logo tiles, the biggest first ----------
function Everything({ pay }) {
  const [all, setAll] = useState(false)
  const max = monthlyCents(pay[0]) || 1
  const since = new Date(Date.now() - 31 * 86400000).toISOString().slice(0, 10)
  const shown = all ? pay : pay.slice(0, 6)
  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        {shown.map((r) => (
          <button key={r.id} onClick={() => navigate('/recurring')} className={`${card} relative overflow-hidden p-3.5 text-left`}>
            <span className="pointer-events-none absolute -top-6 -right-6 size-[70px] rounded-full bg-violet/[.08]" />
            <span className="relative flex items-start justify-between">
              <MerchantIcon name={r.name} className="size-10 rounded-[13px] bg-tint-from text-lg">
                {r.icon}
              </MerchantIcon>
              {(r.created_at ?? '') >= since && <span className="rounded-full bg-violet/12 px-2 py-0.5 text-[11px] font-bold text-violet">new</span>}
            </span>
            <b className="relative mt-2.5 block truncate text-[14.5px]">{r.name}</b>
            <span className="relative block">
              <b className="tabular font-display text-[19px]">{formatCents(monthlyCents(r)).replace(/,00$/, '')}</b>
              <span className="text-xs text-muted"> /mo</span>
            </span>
            <span className="relative mt-2 block h-[5px] rounded-full bg-line">
              <span className="absolute inset-y-0 left-0 rounded-full bg-violet" style={{ width: `${(monthlyCents(r) / max) * 100}%` }} />
            </span>
          </button>
        ))}
      </div>
      {pay.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-2.5 w-full py-1.5 text-center text-[13.5px] font-semibold text-cobalt">
          {all ? 'Show less' : `Show all ${pay.length}`}
        </button>
      )}
    </>
  )
}

// ---------- What changed: added in the last 12 months, price rises, paused ----------
// Price rise = a payment recorded for more than before (expenses named like the recurring entry)
function Changes({ a }) {
  const start = a.last12[0]
  const list = []
  for (const r of a.recurring ?? []) {
    if (r.type === 'income') continue
    const created = (r.created_at ?? '').slice(0, 10)
    if (!r.active) {
      list.push({
        key: `p${r.id}`,
        r,
        tag: 'Paused',
        from: formatCents(r.amount_cents),
        to: null,
        when: null,
        cents: -monthlyCents(r),
        date: '',
        tone: '#0f8a5f',
      })
      continue
    }
    if (created.slice(0, 7) >= start) {
      list.push({
        key: `n${r.id}`,
        r,
        tag: 'Added',
        from: null,
        to: formatCents(r.amount_cents),
        when: shortDate(created),
        cents: monthlyCents(r),
        date: created,
        tone: VIOLET,
      })
    }
    const hist = [...(a.fixedHistory.get(r.name.trim().toLowerCase()) ?? [])].sort((x, y) => (x.date < y.date ? -1 : 1))
    if (hist.length < 2) continue
    const lastPaid = hist.at(-1)
    const earlier = [...hist].reverse().find((h) => h.cents !== lastPaid.cents)
    if (earlier && lastPaid.cents > earlier.cents && lastPaid.date.slice(0, 7) >= start) {
      list.push({
        key: `u${r.id}`,
        r,
        tag: 'Price up',
        from: formatCents(earlier.cents),
        to: formatCents(lastPaid.cents),
        when: monthShort(lastPaid.date.slice(0, 7)),
        cents: lastPaid.cents - earlier.cents,
        date: lastPaid.date,
        tone: '#e8590c',
      })
    }
  }
  list.sort((x, y) => (x.date < y.date ? 1 : -1))
  if (!list.length) return <p className={`${card} px-4 py-5 text-center text-sm text-muted`}>Nothing added, paused or pricier lately.</p>
  return (
    <div className="grid gap-2.5">
      {list.slice(0, 8).map((c) => (
        <button
          key={c.key}
          onClick={() => navigate('/recurring')}
          className={`${card} relative flex items-center gap-3 overflow-hidden p-3.5 pl-[18px] text-left`}
        >
          <span className="absolute inset-y-3.5 left-0 w-1 rounded-r" style={{ background: c.tone }} />
          <MerchantIcon name={c.r.name} className="size-11 rounded-[14px] text-[21px]" style={{ background: `${c.tone}1f` }}>
            {c.r.icon}
          </MerchantIcon>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <b className="truncate text-[15px]">{c.r.name}</b>
              <span className="shrink-0 rounded-full px-2 py-px text-[11px] font-bold" style={{ background: `${c.tone}1f`, color: c.tone }}>
                {c.tag}
              </span>
            </span>
            <span className="tabular mt-1 flex items-center gap-1.5 text-[13px]">
              {c.from && <span className={`text-muted ${c.to ? '' : 'line-through'}`}>{c.from}</span>}
              {c.from && c.to && <span style={{ color: c.tone }}>→</span>}
              {c.to && <b>{c.to}</b>}
              {c.when && <span className="text-muted">· {c.when}</span>}
            </span>
          </span>
          <b className="tabular shrink-0 font-display text-[17px]" style={{ color: c.tone }}>
            {c.cents < 0 ? '−' : '+'}
            {whole(Math.abs(c.cents))}
            <span className="font-sans text-[11px] font-medium text-muted">/mo</span>
          </b>
        </button>
      ))}
    </div>
  )
}

const shortDate = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
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
