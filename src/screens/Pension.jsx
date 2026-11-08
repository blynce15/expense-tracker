import { useCallback, useEffect, useState } from 'react'
import AmountPad from '../components/AmountPad'
import FullPage from '../components/FullPage'
import Icon from '../components/Icon'
import MerchantIcon from '../components/MerchantIcon'
import Sheet from '../components/Sheet'
import { todayISO } from '../lib/dates'
import { centsToPad, formatCents, parseToCents } from '../lib/money'
import { createPension, deletePensionEntry, entryForMonth, fetchPension, isPensionDue, pensionSummary, removePension, savePensionEntry } from '../lib/pension'
import { savePensionFund } from '../lib/profile'

// Investments → Pension: a pension fund updated by hand once a month (src/lib/pension.js).
// Not set up: an empty card and a 2-step setup. Then: the fund's card, this month's update, three tiles and
// the history of months. A reminder on the 1st (api/remind.js) opens this page with the update ready.

// ───────── formatting ─────────
const whole = (cents) => formatCents(cents).replace(/,\d\d$/, '')
const signed = (cents, decimals = false) => `${cents < 0 ? '−' : '+'}${decimals ? formatCents(Math.abs(cents)) : whole(Math.abs(cents))}`
const percent = (rate) => `${rate < 0 ? '−' : '+'}${Math.abs(rate * 100).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const arrow = (n) => (n < 0 ? '▼' : '▲')
const units = (n) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 4 })
const perUnit = (cents) => `€${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
const monthOf = (iso, style = 'short') => new Date(`${iso.slice(0, 7)}-15T12:00:00`).toLocaleDateString('en-GB', { month: style }).replace('Sept', 'Sep')
const dayMonth = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
const nextMonthFirst = (iso) => {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 1)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace('Sept', 'Sep')
}

// Units on the number pad: up to 7 whole digits and 6 decimals ("." = decimal point internally)
function pressUnits(text, key) {
  if (key === 'back') return text.slice(0, -1)
  if (key === '.') return text.includes('.') ? text : (text || '0') + '.'
  const [w, d] = text.split('.')
  if (d !== undefined && d.length >= 6) return text
  if (d === undefined && w.length >= 7) return text
  if (text === '0') return key
  return text + key
}
const unitsToPad = (n) => (n ? String(Number(n)) : '')

// ───────── the page ─────────
export default function Pension() {
  const [data, setData] = useState(null) // { fund, entries }
  const [error, setError] = useState(null)
  const [setup, setSetup] = useState(false)
  const [editing, setEditing] = useState(null) // an entry, 'new' or null
  const [fundOpen, setFundOpen] = useState(false)

  const load = useCallback(
    () =>
      fetchPension()
        .then((d) => {
          setData(d)
          window.dispatchEvent(new Event('pension:changed'))
          return d
        })
        .catch((e) => setError(e.message)),
    [],
  )

  // Opened from the monthly reminder (#/investments/pension?update): the update sheet is ready
  useEffect(() => {
    load().then((d) => {
      if (window.location.hash.includes('update')) {
        window.history.replaceState(null, '', '#/investments/pension')
        if (d?.entries.length) setEditing(entryForMonth(d.entries, todayISO()) ?? 'new')
      }
    })
  }, [load])

  if (error) return <p className="rounded-[22px] bg-card px-4 py-6 text-center text-muted">Couldn’t load your pension: {error}</p>
  if (!data) return null

  if (!data.entries.length) {
    return (
      <>
        <section className="flex min-h-[calc(100dvh-13rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col items-center justify-center rounded-[28px] bg-card px-6 py-8 text-center">
          <div className="relative grid size-[220px] place-items-center">
            <span className="absolute size-[220px] rounded-full border-[1.5px] border-dashed border-bubble" />
            <span className="absolute size-[170px] rounded-full border-[1.5px] border-bubble" />
            <span className="absolute size-[120px] rounded-full border-[1.5px] border-bubble bg-paper" />
            <span className="relative grid size-[78px] place-items-center rounded-[24px] bg-gradient-to-br from-[#2b5cf0] via-[#1638a8] to-[#0b1b45] text-white shadow-[0_16px_28px_-14px_rgba(22,56,168,0.9)]">
              <Icon name="bank" size={34} strokeWidth={1.8} />
            </span>
          </div>
          <h2 className="mt-5 font-display text-2xl font-extrabold">Pension fund</h2>
          <p className="mt-1 mb-5 text-sm font-semibold text-muted">Check in once a month</p>
          <button
            onClick={() => setSetup(true)}
            className="rounded-full bg-cobalt px-7 py-3.5 text-[15px] font-bold text-white shadow-[0_10px_20px_-12px_rgba(31,79,224,0.9)] active:opacity-80"
          >
            Add pension fund
          </button>
        </section>
        {setup && (
          <Setup
            onClose={() => setSetup(false)}
            onDone={() => {
              setSetup(false)
              load()
            }}
          />
        )}
      </>
    )
  }

  const fund = data.fund ?? { name: 'Pension fund', provider: '' }
  const s = pensionSummary(data.entries)
  const due = isPensionDue(data.entries)
  const today = todayISO()

  return (
    <div className="space-y-3.5">
      <PensionCard fund={fund} summary={s} entries={data.entries} onFund={() => setFundOpen(true)} />

      {due ? (
        <button onClick={() => setEditing('new')} className="flex w-full items-center gap-3 rounded-[22px] bg-card p-3 text-left shadow-[inset_0_0_0_1.5px_#ffd79a] active:scale-[.99]">
          <CalendarTile month={monthOf(today).toUpperCase()} day="1" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15.5px] font-bold">{monthOf(today, 'long')} update</span>
            <span className="block text-[12.5px] font-semibold text-muted">Last updated {dayMonth(s.last.date)}</span>
          </span>
          <span className="rounded-full bg-[#f0a020] px-3.5 py-2 text-[13.5px] font-extrabold text-white shadow-[0_8px_16px_-10px_rgba(240,160,32,0.9)]">Update</span>
        </button>
      ) : (
        <div className="flex items-center gap-2 rounded-[18px] bg-card px-3.5 py-3 text-[13.5px] font-semibold text-muted">
          <Icon name="bell" size={16} />
          <span>
            Next update <b className="text-ink">{nextMonthFirst(today)}</b>
          </span>
          <span className="ml-auto flex items-center gap-1 text-[12.5px] font-bold text-gain">
            <Icon name="check" size={14} strokeWidth={2.4} /> {monthOf(today, 'long')} done
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        {s.history.length > 1 ? (
          <Stat label="This year" value={signed(s.year.cents)} sub={percent(s.year.rate)} tone={s.year.cents < 0 ? 'loss' : 'gain'} />
        ) : (
          <Stat label="This year" value="—" sub="After next update" />
        )}
        <Stat
          label="Per unit"
          value={s.perUnit != null ? perUnit(s.perUnit) : '—'}
          sub={s.perUnitChange != null && s.history.length > 1 ? `${percent(s.perUnitChange)} since ${monthOf(s.first.date)}` : 'Starting price'}
          tone={s.perUnitChange != null && s.history.length > 1 ? (s.perUnitChange < 0 ? 'loss' : 'gain') : null}
        />
        <Stat label="Units" value={units(s.units)} sub={s.unitsAdded > 0 ? `+${units(s.unitsAdded)} this year` : 'Units held'} />
      </div>

      <div className="flex items-baseline justify-between px-1 pt-1">
        <h2 className="font-display text-lg font-bold">History</h2>
        <span className="text-[13px] font-semibold text-muted">tap a month to edit</span>
      </div>
      <section className="rounded-[22px] bg-card py-1.5">
        {s.history.map((e, i) => (
          <button key={e.id} onClick={() => setEditing(e)} className="flex w-full items-center gap-2.5 py-2.5 pr-3.5 pl-3 text-left">
            <span className="w-[34px] text-center">
              <span className="block font-display text-[15px] font-extrabold">{monthOf(e.date)}</span>
              <span className="block text-[10.5px] font-bold text-muted/70">{e.date.slice(0, 4)}</span>
            </span>
            <span className="relative flex w-3.5 items-center justify-center self-stretch">
              <span className={`absolute w-0.5 bg-line ${i === 0 ? 'top-1/2' : '-top-2.5'} ${i === s.history.length - 1 ? 'bottom-1/2' : '-bottom-2.5'}`} />
              <span className={`relative rounded-full ${i === 0 ? 'size-[13px] border-[3px] border-bubble bg-cobalt' : 'size-2.5 border-[2.5px] border-[#9fb6f5] bg-card'}`} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="tabular block font-display text-[15.5px] font-bold">{formatCents(e.value_cents)}</span>
              {e.start ? (
                <span className="block text-xs font-semibold text-muted">Starting point</span>
              ) : (
                <span className="tabular flex items-center gap-1 text-xs font-semibold whitespace-nowrap text-muted">
                  <Icon name="user" size={12} strokeWidth={2.4} className="text-cobalt" aria-label="You" />
                  {whole(e.put_in_cents)}
                  <Icon name="building" size={12} strokeWidth={2.4} className="ml-1.5 text-cobalt/60" aria-label="Company" />
                  {whole(e.company)}
                </span>
              )}
            </span>
            {e.start ? (
              <span className="rounded-full bg-bubble px-2.5 py-1 text-[12.5px] font-extrabold text-cobalt">Start</span>
            ) : (
              <span className={`tabular rounded-full px-2.5 py-1 text-[12.5px] font-extrabold ${e.growth < 0 ? 'bg-loss/10 text-loss' : 'bg-gain/12 text-gain'}`}>{signed(e.growth)}</span>
            )}
          </button>
        ))}
      </section>
      {s.history.length > 1 && (
        <div className="flex justify-center gap-3.5 text-xs font-bold text-muted">
          <span className="flex items-center gap-1">
            <Icon name="user" size={12} strokeWidth={2.4} className="text-cobalt" /> You
          </span>
          <span className="flex items-center gap-1">
            <Icon name="building" size={12} strokeWidth={2.4} className="text-cobalt/60" /> Company
          </span>
        </div>
      )}

      {editing && (
        <UpdateSheet
          fund={fund}
          entries={data.entries}
          entry={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {fundOpen && (
        <FundSheet
          fund={fund}
          onClose={() => setFundOpen(false)}
          onSaved={() => {
            setFundOpen(false)
            load()
          }}
        />
      )}
    </div>
  )
}

function Stat({ label, value, sub, tone }) {
  const color = tone === 'gain' ? 'text-gain' : tone === 'loss' ? 'text-loss' : 'text-muted'
  return (
    <div className="min-w-0 rounded-[18px] bg-card px-3 py-3">
      <p className="text-xs font-bold text-muted">{label}</p>
      <p className={`tabular mt-0.5 truncate font-display text-base font-bold ${tone ? color : ''}`}>{value}</p>
      <p className={`tabular truncate text-[11.5px] font-bold ${color}`}>{sub}</p>
    </div>
  )
}

function CalendarTile({ month, day }) {
  return (
    <span className="flex h-[50px] w-[46px] shrink-0 flex-col items-center overflow-hidden rounded-[13px] bg-white shadow-[0_0_0_1px_var(--color-line),0_6px_12px_-8px_rgba(11,27,69,0.4)]">
      <span className="w-full bg-[#f0a020] py-0.5 text-center text-[10.5px] font-extrabold tracking-[.06em] text-white">{month}</span>
      <span className="font-display text-xl leading-[1.35] font-extrabold text-[#0b1b45]">{day}</span>
    </span>
  )
}

// ───────── the fund's card ─────────
// Always the same blue (also in dark mode), white text
export function PensionCard({ fund, summary: s, entries = [], onFund, small = false }) {
  const months = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
  const [euros, decimals] = formatCents(s?.value ?? 0).split(',')
  return (
    <section
      className={`relative overflow-hidden bg-gradient-to-br from-[#2b5cf0] via-[#1638a8] to-[#0b1b45] text-white shadow-[0_18px_34px_-22px_rgba(22,56,168,0.9)] ${
        small ? 'rounded-[24px] p-4' : 'rounded-[28px] p-[18px]'
      }`}
    >
      <span className="pointer-events-none absolute -top-[110px] -right-[90px] size-60 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.22),transparent_65%)]" />
      <button onClick={onFund} disabled={!onFund} className="relative flex w-full items-center gap-2.5 text-left">
        {/* The provider's logo when it's a known name (Ageas, Fidelidade…), else a bank icon */}
        <MerchantIcon
          name={fund.provider || fund.name}
          className="size-10 rounded-[13px]"
          style={{ background: 'rgba(255,255,255,0.15)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.2)' }}
        >
          <Icon name="bank" size={small ? 17 : 20} strokeWidth={1.9} />
        </MerchantIcon>
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[15.5px] font-bold ${fund.name ? '' : 'opacity-45'}`}>{fund.name || 'Fund name'}</span>
          <span className="block truncate text-[12.5px] font-semibold opacity-70">{fund.provider || 'Provider'}</span>
        </span>
        {s && !small && <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-bold">{dayMonth(s.last.date)}</span>}
      </button>
      <p className={`tabular relative font-display leading-none font-bold tracking-tight ${small ? 'mt-3 text-[32px]' : 'mt-4 text-[40px]'}`}>
        {euros}
        <span className="text-[21px] opacity-55">,{decimals}</span>
      </p>
      {s ? (
        <span className={`tabular relative mt-2.5 inline-flex rounded-full bg-white px-2.5 py-1 text-[13px] font-extrabold ${s.gain < 0 ? 'text-[#c23b22]' : 'text-[#0f8a5f]'}`}>
          {arrow(s.gain)} {signed(s.gain, true)} · {percent(s.rate)}
        </span>
      ) : (
        <span className="relative mt-2.5 inline-flex rounded-full bg-white/15 px-2.5 py-1 text-[13px] font-bold opacity-80">Starting value</span>
      )}
      {!small && months.length > 1 && <PensionChart entries={months} />}
      {s && (
        <div className="relative mt-3.5">
          <div className="flex h-2 gap-[3px] overflow-hidden rounded-full">
            <span className="bg-white/85" style={{ flex: s.you || (s.company ? 0 : 1) }} />
            {s.company > 0 && <span className="bg-[#9cc3ff]" style={{ flex: s.company }} />}
            {s.gain > 0 && <span className="bg-[#5eead4]" style={{ flex: s.gain }} />}
          </div>
          <div className="mt-2 flex gap-3 text-xs font-semibold whitespace-nowrap">
            <Legend color="bg-white/85" label="You" value={whole(s.you)} />
            {s.company > 0 && <Legend color="bg-[#9cc3ff]" label="Company" value={whole(s.company)} />}
            <Legend color="bg-[#5eead4]" label="Growth" value={signed(s.gain)} />
          </div>
        </div>
      )}
    </section>
  )
}

function Legend({ color, label, value }) {
  return (
    <span className="flex items-center gap-1.5 opacity-90">
      <span className={`size-2 rounded-full ${color}`} />
      {label} <b className="tabular font-extrabold">{value}</b>
    </span>
  )
}

// Value each month (white) against everything put in so far, yours and the company’s (dashed)
function PensionChart({ entries }) {
  const W = 354
  const H = 96
  let total = 0
  const put = entries.map((e) => (total += e.put_in_cents + (e.company_put_in_cents ?? 0)))
  const all = [...entries.map((e) => e.value_cents), ...put]
  const min = Math.min(...all) * 0.996
  const max = Math.max(...all) * 1.002
  const x = (i) => (i / (entries.length - 1)) * W
  const y = (v) => H - 8 - ((v - min) / (max - min || 1)) * (H - 18)
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const value = path(entries.map((e) => e.value_cents))
  const step = Math.max(1, Math.ceil(entries.length / 6))
  const last = entries.length - 1
  return (
    <svg viewBox={`0 0 ${W} ${H + 16}`} className="relative mx-[-2px] mt-3.5 mb-0.5 block w-full overflow-visible" role="img" aria-label="Pension value each month">
      <defs>
        <linearGradient id="pen-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".22" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${value}L${W},${H}L0,${H}Z`} fill="url(#pen-fill)" />
      <path d={path(put)} fill="none" stroke="rgba(255,255,255,.45)" strokeWidth="1.6" strokeDasharray="3 5" />
      <path d={value} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(entries[last].value_cents)} r="9" fill="#fff" opacity=".2" />
      <circle cx={x(last)} cy={y(entries[last].value_cents)} r="4.5" fill="#fff" />
      {entries.map((e, i) =>
        i % step === 0 || i === last ? (
          <text key={e.id ?? i} x={x(i)} y={H + 14} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} fontSize="11" fontWeight="700" fill="rgba(255,255,255,.55)">
            {monthOf(e.date)}
          </text>
        ) : null,
      )}
    </svg>
  )
}

// ───────── setup (2 steps) ─────────
function Setup({ onClose, onDone }) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [provider, setProvider] = useState('')
  const [value, setValue] = useState('')
  const [putIn, setPutIn] = useState('')
  const [company, setCompany] = useState('')
  const [unitText, setUnitText] = useState('')
  const [pad, setPad] = useState(null) // 'value' | 'putIn' | 'units'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const valueCents = parseToCents(value || '0') ?? 0
  const putCents = parseToCents(putIn || '0') ?? 0
  const companyCents = parseToCents(company || '0') ?? 0
  const unitCount = Number(unitText || 0)
  const preview =
    step === 2 && valueCents > 0
      ? pensionSummary([{ id: 'start', date: todayISO(), value_cents: valueCents, put_in_cents: putCents, company_put_in_cents: companyCents, units: unitCount }])
      : null

  async function finish() {
    setBusy(true)
    setError(null)
    try {
      await createPension({ name, provider, value_cents: valueCents, put_in_cents: putCents, company_put_in_cents: companyCents, units: unitCount })
      onDone()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const dots = (
    <div className="flex flex-1 justify-center gap-1.5 pr-10">
      {[1, 2].map((n) => (
        <span key={n} className={`h-[5px] w-7 rounded-full ${n <= step ? 'bg-cobalt' : 'bg-line'}`} />
      ))}
    </div>
  )

  return (
    <FullPage title="Add pension fund" top={dots} onClose={() => (step === 2 ? setStep(1) : onClose())}>
      <div className="pb-1">
        <h2 className="font-display text-2xl font-extrabold">{step === 1 ? 'Your fund' : 'Where it stands today'}</h2>
        <p className="mt-0.5 text-[13.5px] font-semibold text-muted">{step === 1 ? 'Step 1 of 2' : 'Step 2 of 2 · from your latest statement'}</p>
      </div>
      <PensionCard fund={{ name, provider }} summary={preview} small />

      {step === 1 ? (
        <div className="overflow-hidden rounded-[22px] bg-card">
          <TextRow label="Name" value={name} onChange={setName} placeholder="e.g. PPR Reforma" autoFocus />
          <TextRow label="Provider" value={provider} onChange={setProvider} placeholder="e.g. your bank or insurer" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[22px] bg-card">
          <PadRow label="Value now" value={value ? formatCents(valueCents) : null} on={pad === 'value'} onClick={() => setPad('value')} />
          <PadRow label="You put in so far" hint="Everything since you opened it" value={putIn ? formatCents(putCents) : null} on={pad === 'putIn'} onClick={() => setPad('putIn')} />
          <PadRow label="Company put in so far" hint="Everything your employer added" value={company ? formatCents(companyCents) : null} on={pad === 'company'} onClick={() => setPad('company')} />
          <PadRow label="Units" value={unitText ? units(unitCount) : null} on={pad === 'units'} onClick={() => setPad('units')} />
        </div>
      )}
      {error && <p className="text-sm text-loss">{error}</p>}
      <button
        onClick={() => (step === 1 ? setStep(2) : finish())}
        disabled={busy || (step === 1 ? !name.trim() : !(valueCents > 0 && unitCount > 0))}
        className="w-full rounded-full bg-cobalt py-4 text-base font-bold text-white shadow-[0_10px_20px_-12px_rgba(31,79,224,0.9)] active:opacity-80 disabled:opacity-40"
      >
        {step === 1 ? 'Continue' : 'Add pension fund'}
      </button>

      {pad === 'value' && <AmountPad label="Value now" amount={value} onChange={setValue} onDone={() => setPad(null)} />}
      {pad === 'putIn' && <AmountPad label="You put in so far" amount={putIn} onChange={setPutIn} onDone={() => setPad(null)} />}
      {pad === 'company' && <AmountPad label="Company put in so far" amount={company} onChange={setCompany} onDone={() => setPad(null)} />}
      {pad === 'units' && <AmountPad label="Units" amount={unitText} onChange={setUnitText} onDone={() => setPad(null)} prefix="" press={pressUnits} />}
    </FullPage>
  )
}

function TextRow({ label, value, onChange, placeholder, autoFocus }) {
  return (
    <label className="flex items-center gap-3 border-t border-line px-4 py-3.5 first:border-t-0 focus-within:bg-tint-from">
      <span className="text-[15px] font-semibold">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        maxLength={60}
        className="min-w-0 flex-1 bg-transparent text-right font-display text-[17px] font-bold outline-none placeholder:font-sans placeholder:text-[15px] placeholder:font-medium placeholder:text-muted"
      />
    </label>
  )
}

function PadRow({ label, hint, value, on, onClick }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center justify-between gap-3 border-t border-line px-4 py-3.5 text-left first:border-t-0 ${on ? 'bg-tint-from' : ''}`}>
      <span>
        <span className="block text-[15px] font-semibold">{label}</span>
        {hint && <span className="block text-[12.5px] font-medium text-muted">{hint}</span>}
      </span>
      <span className={`tabular font-display text-[17px] font-bold ${value ? (on ? 'text-cobalt' : '') : 'text-muted/50'}`}>{value ?? 'Add'}</span>
    </button>
  )
}

// ───────── monthly update (or change a past month) ─────────
function UpdateSheet({ fund, entries, entry, onClose, onSaved }) {
  const sorted = [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))
  const date = entry?.date ?? todayISO()
  const prev = sorted.filter((e) => e.date < date).at(-1) ?? null
  const isStart = entry && sorted[0]?.id === entry.id
  const [value, setValue] = useState(entry ? centsToPad(entry.value_cents) : '')
  const last = lastPutIn(sorted, date)
  const [putIn, setPutIn] = useState(entry ? centsToPad(entry.put_in_cents) : last ? centsToPad(last.you) : '')
  const [company, setCompany] = useState(entry ? centsToPad(entry.company_put_in_cents ?? 0) : last ? centsToPad(last.company) : '')
  const [unitText, setUnitText] = useState(entry ? unitsToPad(entry.units) : '')
  const [pad, setPad] = useState(entry ? null : 'value')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const valueCents = parseToCents(value || '0') ?? 0
  const putCents = parseToCents(putIn || '0') ?? 0
  const companyCents = parseToCents(company || '0') ?? 0
  const addedNow = putCents + companyCents
  const unitCount = Number(unitText || 0)
  const before = sorted.filter((e) => e.date < date)
  const putBefore = before.reduce((s, e) => s + e.put_in_cents + (e.company_put_in_cents ?? 0), 0)
  const growth = prev ? valueCents - prev.value_cents - addedNow : null
  const totalGain = valueCents - putBefore - addedNow

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  const title = entry ? `${monthOf(date, 'long')} ${date.slice(0, 4)}` : `${monthOf(date, 'long')} update`
  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3 pb-4">
        <div className="flex items-center gap-3">
          <CalendarTile month={monthOf(date).toUpperCase()} day={entry ? Number(date.slice(8)) : '1'} />
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold">{fund.name}</p>
            <p className="text-[13px] font-semibold text-muted">{entry ? `Entered ${dayMonth(date)}` : 'As of today'}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-[22px] bg-card">
          <PadRow label="Value now" hint={prev ? `Last month ${formatCents(prev.value_cents)}` : null} value={value ? formatCents(valueCents) : null} on={pad === 'value'} onClick={() => setPad('value')} />
          <PadRow
            label={isStart ? 'You put in so far' : 'You put in'}
            hint={isStart ? 'Everything before LynxOS' : last ? `This month · last month ${formatCents(last.you)}` : 'This month'}
            value={putIn ? formatCents(putCents) : null}
            on={pad === 'putIn'}
            onClick={() => setPad('putIn')}
          />
          <PadRow
            label={isStart ? 'Company put in so far' : 'Company put in'}
            hint={isStart ? 'Everything your employer added' : last ? `This month · last month ${formatCents(last.company)}` : 'This month'}
            value={company ? formatCents(companyCents) : null}
            on={pad === 'company'}
            onClick={() => setPad('company')}
          />
          <PadRow label="Units" hint={prev ? `Last month ${units(prev.units)}` : null} value={unitText ? units(unitCount) : null} on={pad === 'units'} onClick={() => setPad('units')} />
        </div>
        {valueCents > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {growth != null && <Result label="Growth" value={signed(growth, true)} tone={growth < 0 ? 'text-loss' : 'text-gain'} />}
            <Result label="Per unit" value={unitCount > 0 ? perUnit(valueCents / unitCount) : '—'} />
            <Result label="Total gain" value={signed(totalGain)} tone={totalGain < 0 ? 'text-loss' : 'text-gain'} />
          </div>
        )}
        {error && <p className="text-sm text-loss">{error}</p>}
        <button
          onClick={() =>
            run(() => {
              const existing = entry ?? entryForMonth(entries, date)
              return savePensionEntry({ id: existing?.id, date, value_cents: valueCents, put_in_cents: putCents, company_put_in_cents: companyCents, units: unitCount })
            })
          }
          disabled={busy || !(valueCents > 0 && unitCount > 0)}
          className="w-full rounded-full bg-cobalt py-4 text-base font-bold text-white shadow-[0_10px_20px_-12px_rgba(31,79,224,0.9)] active:opacity-80 disabled:opacity-40"
        >
          {entry ? 'Save' : `Save ${monthOf(date, 'long')}`}
        </button>
        {entry && !isStart && (
          <button
            onClick={() => (confirmDelete ? run(() => deletePensionEntry(entry.id)) : setConfirmDelete(true))}
            disabled={busy}
            className="w-full py-1.5 text-sm font-semibold text-loss disabled:opacity-50"
          >
            {confirmDelete ? 'Tap again to delete this month' : 'Delete this month'}
          </button>
        )}
      </div>
      {pad === 'value' && <AmountPad label="Value now" amount={value} onChange={setValue} onDone={() => setPad(null)} />}
      {pad === 'putIn' && <AmountPad label={isStart ? 'You put in so far' : 'You put in'} amount={putIn} onChange={setPutIn} onDone={() => setPad(null)} />}
      {pad === 'company' && <AmountPad label={isStart ? 'Company put in so far' : 'Company put in'} amount={company} onChange={setCompany} onDone={() => setPad(null)} />}
      {pad === 'units' && <AmountPad label="Units" amount={unitText} onChange={setUnitText} onDone={() => setPad(null)} prefix="" press={pressUnits} />}
    </Sheet>
  )
}

// What you and the company put in at the last monthly update before `date` (not the starting point),
// as a hint and the default for a new month; null when there's none yet
function lastPutIn(sorted, date = '9999-12-31') {
  const e = sorted
    .slice(1)
    .filter((x) => x.date < date)
    .at(-1)
  return e ? { you: e.put_in_cents, company: e.company_put_in_cents ?? 0 } : null
}

function Result({ label, value, tone = '' }) {
  return (
    <div className="rounded-[14px] bg-card px-2.5 py-2">
      <p className="text-[11.5px] font-bold text-muted">{label}</p>
      <p className={`tabular truncate font-display text-[15px] font-bold ${tone}`}>{value}</p>
    </div>
  )
}

// ───────── the fund: name, provider, remove ─────────
function FundSheet({ fund, onClose, onSaved }) {
  const [name, setName] = useState(fund.name ?? '')
  const [provider, setProvider] = useState(fund.provider ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [confirm, setConfirm] = useState(false)

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      onSaved()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Pension fund" onClose={onClose}>
      <div className="space-y-3 pb-4">
        <div className="overflow-hidden rounded-[22px] bg-card">
          <TextRow label="Name" value={name} onChange={setName} placeholder="e.g. PPR Reforma" />
          <TextRow label="Provider" value={provider} onChange={setProvider} placeholder="e.g. your bank or insurer" />
        </div>
        {error && <p className="text-sm text-loss">{error}</p>}
        <button
          onClick={() => run(() => savePensionFund({ name: name.trim(), provider: provider.trim() }))}
          disabled={busy || !name.trim()}
          className="w-full rounded-full bg-cobalt py-4 text-base font-bold text-white active:opacity-80 disabled:opacity-40"
        >
          Save
        </button>
        <button onClick={() => (confirm ? run(removePension) : setConfirm(true))} disabled={busy} className="w-full py-1.5 text-sm font-semibold text-loss disabled:opacity-50">
          {confirm ? 'Tap again: removes the fund and every month' : 'Remove pension fund'}
        </button>
      </div>
    </Sheet>
  )
}
