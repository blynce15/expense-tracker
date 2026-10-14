import { useEffect, useState } from 'react'
import { Card, Chip, Mini, pct, PeriodBar, usePeriod, whole } from '../components/AnalyticsKit'
import { BankLogo } from '../components/BankCard'
import Icon from '../components/Icon'
import { fetchAnalytics, monthShort, periodLabel } from '../lib/analytics'
import { bankFor } from '../lib/banks'
import { formatCents } from '../lib/money'

// Signed whole euros, e.g. "+€200" / "−€50"
const signed = (cents) => (cents < 0 ? `−${whole(-cents)}` : `+${whole(cents)}`)

// Analytics → Saving & investing: how much of your income you keep (saved + invested),
// month by month, your rate over time, year totals and which accounts the money went to.
export default function AnalyticsSaving() {
  const [period, setPeriod] = usePeriod()
  const [data, setData] = useState(null)
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

  if (error) return <p className="px-5 pt-6 text-loss">Couldn't load your saving: {error}</p>
  const a = data && data.period === period ? data : null

  return (
    <div className="space-y-3 px-4 pt-1 pb-6">
      <PeriodBar period={period} onChange={setPeriod} />
      {a && (
        <>
          <Kept a={a} />
          <IncomeVsKept a={a} />
          <RateOverTime a={a} />
          <YearTotals a={a} />
          {a.keepAccounts.length > 0 && <Accounts a={a} />}
        </>
      )}
    </div>
  )
}

// The 12 months up to the period's end: income, saved, invested and the rate (kept ÷ income)
function monthRows(a) {
  const now = new Date()
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return a.last12.map((k) => {
    const m = a.byMonth.get(k) ?? { income: 0, saved: 0, invested: 0 }
    const kept = m.saved + m.invested
    return { key: k, income: m.income, saved: m.saved, invested: m.invested, kept, rate: m.income > 0 ? kept / m.income : null, partial: k === thisMonth, future: k > thisMonth }
  })
}

function Kept({ a }) {
  const { totals, saving } = a
  const income = totals.income
  const r = 34
  const c = 2 * Math.PI * r
  const savedShare = income > 0 ? Math.max(0, Math.min(1, totals.saved / income)) : 0
  const investedShare = income > 0 ? Math.max(0, Math.min(1 - savedShare, totals.invested / income)) : 0
  const [euros, decimals] = formatCents(saving.kept).split(',')
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#14a3b8] via-[#0c8599] to-cobalt-deep p-4 text-white shadow-[0_18px_30px_-20px_rgba(12,133,153,0.9)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white/85">You kept in {periodLabel(a.period)}</p>
        {saving.avgRate !== null && <Chip tone="light">Usual {pct(saving.avgRate)}</Chip>}
      </div>
      <div className="mt-2 flex items-center gap-4">
        <div className="relative grid size-[84px] shrink-0 place-items-center">
          <svg width="84" height="84" viewBox="0 0 84 84" className="absolute inset-0 -rotate-90" aria-hidden="true">
            <circle cx="42" cy="42" r={r} fill="none" strokeWidth="10" stroke="rgba(255,255,255,0.2)" />
            {savedShare > 0 && <circle cx="42" cy="42" r={r} fill="none" strokeWidth="10" stroke="#fff" strokeDasharray={`${savedShare * c} ${c}`} />}
            {investedShare > 0 && (
              <circle cx="42" cy="42" r={r} fill="none" strokeWidth="10" stroke="#7ff0e0" strokeDasharray={`${investedShare * c} ${c}`} strokeDashoffset={-savedShare * c} />
            )}
          </svg>
          <span className="tabular relative font-display text-lg font-extrabold">{saving.rate !== null ? pct(Math.max(0, saving.rate)) : '—'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="tabular truncate font-display leading-tight font-bold">
            <span className="text-[32px] tracking-tight">{euros}</span>
            <span className="text-lg text-white/55">,{decimals}</span>
          </p>
          <p className="text-sm text-white/80">{income > 0 ? `of ${whole(income)} income` : 'No income recorded'}</p>
          <p className="mt-1.5 flex flex-wrap gap-x-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-white" /> Saved {whole(totals.saved)}
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-sm bg-[#7ff0e0]" /> Invested {whole(totals.invested)}
            </span>
          </p>
        </div>
      </div>
      {saving.kept < 0 && <p className="mt-2 text-xs text-white/85">More came out of savings than went in.</p>}
    </section>
  )
}

// Income per month as a light bar, with the saved and invested parts inside it. Tap a month.
function IncomeVsKept({ a }) {
  const rows = monthRows(a)
  const [picked, setPicked] = useState(null)
  const W = 300
  const H = 110
  const colW = W / 12
  const barW = colW - 6
  const max = Math.max(1, ...rows.map((r) => Math.max(r.income, r.kept)))
  const h = (c) => (Math.max(0, c) / max) * H
  const p = picked === null ? null : rows[picked]
  return (
    <Card icon="bars" color="var(--color-teal)" title="Income vs kept">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Income and how much of it you kept, per month">
        {rows.map((r, i) => {
          const x = i * colW + 3
          const hs = h(r.saved)
          const hv = h(r.invested)
          return (
            <g key={r.key} onClick={() => !r.future && setPicked(i)} className="cursor-pointer" opacity={r.future ? 0.3 : picked === null || picked === i ? 1 : 0.45}>
              <rect x={i * colW} y="0" width={colW} height={H} fill="transparent" />
              {r.income > 0 && <rect x={x} y={H - h(r.income)} width={barW} height={h(r.income)} rx="5" fill="var(--color-line)" />}
              {hv > 0 && <rect x={x + 3} y={H - hs - hv} width={barW - 6} height={hv} rx="3" fill="var(--color-teal)" />}
              {hs > 0 && <rect x={x + 3} y={H - hs} width={barW - 6} height={hs} rx="3" fill="var(--color-cobalt)" />}
              <text x={x + barW / 2} y={H + 13} textAnchor="middle" fontSize="9.5" className={picked === i ? 'fill-ink font-bold' : 'fill-muted'}>
                {monthShort(r.key)[0]}
              </text>
            </g>
          )
        })}
      </svg>
      <div className="mt-2 flex flex-wrap justify-center gap-x-3 text-xs text-muted">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-line" /> Income
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-cobalt" /> Saved
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-sm bg-teal" /> Invested
        </span>
      </div>
      <p className="mt-1.5 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {monthShort(p.key)}
            {p.partial && ' (so far)'}: income <b className="tabular text-ink">{whole(p.income)}</b>, kept{' '}
            <b className="tabular text-ink">
              {whole(p.kept)}
              {p.rate !== null && ` (${pct(Math.max(0, p.rate))})`}
            </b>
          </>
        ) : (
          'Tap a month for details'
        )}
      </p>
    </Card>
  )
}

// Share of income kept each month, with the usual (average) rate dashed
function RateOverTime({ a }) {
  const rows = monthRows(a).filter((r) => !r.future)
  const points = rows.map((r, i) => ({ ...r, i })).filter((r) => r.rate !== null)
  const avg = a.saving.avgRate
  if (points.length < 2) return null
  const W = 300
  const H = 80
  const top = Math.max(0.05, ...points.map((p) => p.rate), avg ?? 0) * 1.15
  const bottom = Math.min(0, ...points.map((p) => p.rate))
  const x = (i) => (i / Math.max(1, rows.length - 1)) * W
  const y = (v) => H - ((v - bottom) / (top - bottom)) * H
  const d = points.map((p, n) => `${n ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.rate).toFixed(1)}`).join(' ')
  const last = points.at(-1)
  return (
    <Card icon="invest" color="var(--color-cobalt)" title="Savings rate">
      <svg viewBox={`0 0 ${W} ${H + 16}`} className="block h-auto w-full overflow-visible" role="img" aria-label="Share of income kept each month">
        {bottom < 0 && <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />}
        {avg !== null && <line x1="0" x2={W} y1={y(avg)} y2={y(avg)} stroke="var(--color-gain)" strokeOpacity=".7" strokeDasharray="4 4" />}
        <path d={d} fill="none" stroke="var(--color-cobalt)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p) => (
          <circle key={p.key} cx={x(p.i)} cy={y(p.rate)} r={p === last ? 4.5 : 2.5} fill="var(--color-cobalt)" stroke="var(--color-card)" strokeWidth={p === last ? 2 : 0} />
        ))}
        <text x="0" y={H + 14} fontSize="10" className="fill-muted">
          {monthShort(rows[0].key)}
        </text>
        <text x={W} y={H + 14} textAnchor="end" fontSize="10" className="fill-muted">
          {monthShort(rows.at(-1).key)}
        </text>
      </svg>
      <p className="mt-1.5 text-center text-[13px] text-muted">
        {monthShort(last.key)}
        {last.partial && ' so far'}: <b className="tabular text-ink">{pct(Math.max(0, last.rate))}</b> of income kept
        {avg !== null && (
          <>
            {' · '}
            <span className="text-gain">usual {pct(avg)}</span> (dashed)
          </>
        )}
      </p>
    </Card>
  )
}

function YearTotals({ a }) {
  const year = a.saving.year
  const keys = a.last12.filter((k) => k.slice(0, 4) === year)
  const sum = (f) => keys.reduce((s, k) => s + (a.byMonth.get(k)?.[f] ?? 0), 0)
  const best = a.saving.best
  return (
    <div className="grid grid-cols-2 gap-2">
      <Mini onPage label={`Kept in ${year}`} value={whole(a.saving.yearKept)} />
      <Mini onPage label={best ? `Best month · ${monthShort(best.key)}` : 'Best month'} value={best ? whole(best.cents) : '—'} />
      <Mini onPage label={`Saved in ${year}`} value={whole(sum('saved'))} />
      <Mini onPage label={`Invested in ${year}`} value={whole(sum('invested'))} />
    </div>
  )
}

// Each savings and investment account: money in (or out) this period, and today's balance
function Accounts({ a }) {
  return (
    <Card icon="coins" color="var(--color-teal)" title="Where it went">
      <ul>
        {a.keepAccounts.map((acc) => {
          const bank = bankFor(acc.name)
          return (
            <li key={acc.id} className="flex items-center gap-3 border-b border-line py-2.5 last:border-0">
              {bank ? (
                <BankLogo bank={bank} className="size-10 rounded-xl shadow-[0_0_0_1px_var(--color-line)]" />
              ) : (
                <span className="grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: acc.color }}>
                  <Icon name={acc.type === 'investment' ? 'invest' : 'coins'} size={19} strokeWidth={2.1} />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <b className="block truncate">{acc.name}</b>
                <span className="block truncate text-xs text-muted">
                  {acc.type === 'investment' ? 'Investment' : 'Savings'} · {whole(acc.balance)} today
                </span>
              </span>
              <b className={`tabular font-display ${acc.flow > 0 ? 'text-gain' : acc.flow < 0 ? 'text-loss' : 'text-muted'}`}>{acc.flow ? signed(acc.flow) : '€0'}</b>
            </li>
          )
        })}
      </ul>
      <p className="mt-1 text-xs text-muted">Money in minus money out during {periodLabel(a.period)}.</p>
    </Card>
  )
}
