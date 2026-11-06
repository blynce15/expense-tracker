import { useEffect, useState } from 'react'
import { todayISO } from '../lib/dates'
import { cachedPortfolio } from '../lib/getquin'
import { formatCents } from '../lib/money'
import { fetchPension } from '../lib/pension'
import { putInMonths, shiftMonth } from '../lib/portfolio'
import { fetchProfile } from '../lib/profile'
import { supabase } from '../lib/supabase'

// Analytics → What you keep → Put into investments: money put in each of the last 12 months.
// Portfolio = getquin's trades before you connected it, your Invest − Take out after (src/lib/portfolio.js);
// Pension = what you entered as put in each month. Dashed line = the average full month.
const whole = (cents) => formatCents(cents).replace(/,\d\d$/, '')
const short = (key) => new Date(`${key}-15T12:00:00`).toLocaleDateString('en-GB', { month: 'short' }).replace('Sept', 'Sep')
const PORTFOLIO = '#0c8599'
const PENSION = '#7c4dff'

// `wrap` puts the chart in its section; nothing is shown when nothing was put in
export default function PutInChart({ wrap = (chart) => chart }) {
  const [months, setMonths] = useState(null)
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    const from = `${shiftMonth(todayISO().slice(0, 7), -11)}-01`
    Promise.all([
      fetchProfile(),
      fetchPension().catch(() => ({ entries: [] })),
      supabase.from('transactions').select('type, amount_cents, date').in('type', ['invest', 'divest']).gte('date', from),
    ])
      .then(([profile, pension, own]) => {
        const link = profile?.answers?.getquinUrl
        setMonths(
          putInMonths({
            portfolio: link ? cachedPortfolio(link) : null,
            since: link ? (profile?.answers?.getquinSince ?? todayISO()) : null,
            own: own.data ?? [],
            pension: pension.entries,
          }),
        )
      })
      .catch(() => setMonths([]))
  }, [])

  if (!months?.some((m) => m.cents !== 0)) return null

  const W = 300
  const H = 130
  const base = H - 20
  const top = 8
  const col = W / months.length
  const barW = 15
  const max = Math.max(1, ...months.map((m) => Math.max(0, m.portfolio) + Math.max(0, m.pension)))
  const done = months.filter((m) => !m.partial)
  const average = done.length ? done.reduce((s, m) => s + m.cents, 0) / done.length : 0
  const y = (cents) => base - (Math.max(0, cents) / max) * (base - top)
  const p = picked != null ? months[picked] : null
  const hasPension = months.some((m) => m.pension)

  return wrap(
    <div className="rounded-[22px] bg-card p-4">
      <div className="flex justify-between">
        <div>
          <p className="text-[13px] font-semibold text-muted">This month</p>
          <p className="tabular font-display text-[22px] font-bold">{whole(months.at(-1).cents)}</p>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-semibold text-muted">Average month</p>
          <p className="tabular font-display text-[22px] font-bold">{whole(Math.round(average))}</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 block h-auto w-full overflow-visible" role="img" aria-label="Money put into investments each month">
        {months.map((m, i) => {
          const x = i * col + (col - barW) / 2
          const yPortfolio = y(m.portfolio)
          const yTop = y(Math.max(0, m.portfolio) + Math.max(0, m.pension))
          return (
            <g key={m.key} onClick={() => setPicked(i === picked ? null : i)} className="cursor-pointer" opacity={m.partial ? 0.5 : 1}>
              <rect x={i * col} y="0" width={col} height={H} fill="transparent" />
              {m.pension > 0 && <rect x={x} y={yTop} width={barW} height={Math.max(2, yPortfolio - yTop)} rx="5" fill={PENSION} />}
              {m.portfolio > 0 && <rect x={x} y={yPortfolio} width={barW} height={Math.max(2, base - yPortfolio)} rx="5" fill={PORTFOLIO} />}
              <text x={x + barW / 2} y={H - 4} textAnchor="middle" fontSize="10" fontWeight={picked === i ? 800 : 700} className={picked === i ? 'fill-ink' : 'fill-muted'}>
                {short(m.key)[0]}
              </text>
            </g>
          )
        })}
        {average > 0 && <line x1="0" x2={W} y1={y(average)} y2={y(average)} stroke="#f0a020" strokeWidth="1.5" strokeDasharray="4 5" />}
      </svg>
      <p className="tabular mt-1 min-h-5 text-center text-[13px] text-muted">
        {p ? (
          <>
            {short(p.key)}
            {p.partial && ' (so far)'}: <b className="text-ink">{formatCents(p.cents)}</b>
            {hasPension && ` · portfolio ${whole(p.portfolio)}, pension ${whole(p.pension)}`}
          </>
        ) : (
          <span className="inline-flex flex-wrap justify-center gap-x-3.5">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-[3px]" style={{ background: PORTFOLIO }} />
              Portfolio
            </span>
            {hasPension && (
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-[3px]" style={{ background: PENSION }} />
                Pension
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <span className="w-3 border-t-2 border-dashed border-[#f0a020]" />
              Average
            </span>
          </span>
        )}
      </p>
    </div>,
  )
}
