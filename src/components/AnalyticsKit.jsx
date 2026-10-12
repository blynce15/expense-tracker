import { useState } from 'react'
import Icon from './Icon'
import { currentPeriod, isCurrentPeriod, periodLabel, shiftPeriod } from '../lib/analytics'
import { formatCents } from '../lib/money'

// Pieces shared by the Analytics page and its details pages

// The chosen Month/Year period, kept while the app is open so a details page and the main
// page show the same one
let rememberedPeriod = null
export function usePeriod() {
  const [period, setPeriod] = useState(() => rememberedPeriod ?? currentPeriod('month'))
  const set = (next) => {
    rememberedPeriod = next
    setPeriod(next)
  }
  return [period, set]
}

// "€2.400" (no cents), for compact numbers
export const whole = (cents) => formatCents(Math.round(cents)).replace(/,\d\d$/, '')
export const pct = (ratio) => `${Math.round(ratio * 100)}%`
export const ORANGE = '#f08c00'

export function PeriodBar({ period, onChange }) {
  const atNow = isCurrentPeriod(period)
  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center rounded-2xl bg-card p-1">
        <button onClick={() => onChange(shiftPeriod(period, -1))} className="grid h-10 w-9 place-items-center rounded-xl text-ink" aria-label="Previous">
          <Icon name="chevronLeft" />
        </button>
        <p className="flex-1 truncate text-center font-display text-base font-bold">{periodLabel(period)}</p>
        <button onClick={() => onChange(shiftPeriod(period, 1))} disabled={atNow} className="grid h-10 w-9 place-items-center rounded-xl disabled:text-line" aria-label="Next">
          <Icon name="chevronRight" />
        </button>
      </div>
      <div className="flex shrink-0 rounded-2xl bg-line/60 p-1" role="tablist">
        {['month', 'year'].map((kind) => (
          <button
            key={kind}
            role="tab"
            aria-selected={period.kind === kind}
            onClick={() => period.kind !== kind && onChange(currentPeriod(kind))}
            className={`rounded-xl px-2.5 py-2 text-[13px] font-semibold ${period.kind === kind ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
          >
            {kind === 'month' ? 'Month' : 'Year'}
          </button>
        ))}
      </div>
    </div>
  )
}

// Change against the previous period. `goodWhenDown`: for spending, less is good.
export function ChangeChip({ now, before, goodWhenDown = false, suffix, light = false }) {
  if (!before) return null
  const diff = now - before
  const share = Math.round((Math.abs(diff) / Math.abs(before)) * 100)
  if (share === 0) return <Chip tone={light ? 'light' : 'blue'}>= {suffix}</Chip>
  const good = goodWhenDown ? diff < 0 : diff > 0
  // Big rises read better as "3×" than "200%"
  const amount = share >= 200 ? `${Math.round(now / before)}×` : `${share}%`
  return (
    <Chip tone={light ? 'light' : good ? 'good' : 'bad'}>
      {diff > 0 ? '▲' : '▼'} {amount}
      {suffix && ` ${suffix}`}
    </Chip>
  )
}

export function Chip({ tone, children, className = '' }) {
  const tones = {
    good: 'bg-gain/12 text-gain',
    bad: 'bg-loss/10 text-loss',
    blue: 'bg-cobalt/10 text-cobalt',
    light: 'bg-white/18 text-white',
  }
  return <span className={`tabular inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap ${tones[tone]} ${className}`}>{children}</span>
}

export function Card({ icon, color, title, onMore, children }) {
  const head = (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: color }}>
        <Icon name={icon} size={17} strokeWidth={2.2} />
      </span>
      <h2 className="flex-1 text-left font-display text-lg font-bold">{title}</h2>
      {onMore && (
        <span className="flex items-center text-sm font-bold text-cobalt">
          More
          <Icon name="chevronRight" size={16} strokeWidth={2.6} />
        </span>
      )}
    </div>
  )
  // With onMore the whole card opens the details page
  return onMore ? (
    <button onClick={onMore} className="block w-full rounded-[22px] bg-card p-4 text-left active:scale-[.99]">
      {head}
      {children}
    </button>
  ) : (
    <section className="rounded-[22px] bg-card p-4">
      {head}
      {children}
    </section>
  )
}

// `onPage`: standing on the page background instead of inside a card
export function Mini({ label, value, onPage = false }) {
  return (
    <div className={`min-w-0 flex-1 rounded-2xl px-3 py-2 ${onPage ? 'bg-card py-2.5' : 'bg-paper'}`}>
      <p className="truncate text-[11px] text-muted">{label}</p>
      <p className="tabular truncate font-display text-[15px] font-bold">{value}</p>
    </div>
  )
}

// A line through `values`, scaled to the box (used for net worth and spending pace)
export function linePath(values, W, H, max, min = 0, length = values.length) {
  const span = max - min || 1
  const step = W / Math.max(1, length - 1)
  return values.map((v, i) => `${i ? 'L' : 'M'}${(i * step).toFixed(1)} ${(H - ((v - min) / span) * H).toFixed(1)}`).join(' ')
}
