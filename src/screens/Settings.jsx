import { useEffect, useRef, useState } from 'react'
import Avatar, { useProfileLook } from '../components/Avatar'
import { cardBackground, MiniCard, TYPE_INFO } from '../components/BankCard'
import Icon from '../components/Icon'
import PinPad, { FaceIdIcon } from '../components/PinPad'
import Sheet from '../components/Sheet'
import { allowLeavingOnce, changePin, checkPin, disableLock, enableLock, faceIdSupported, lockSettings, setUpFaceId, turnOffFaceId } from '../lib/applock'
import { budgetPeriod, startDayOf } from '../lib/budget'
import { formatDayMonth, todayISO } from '../lib/dates'
import { fetchLookups, lookupCache } from '../lib/lookups'
import { formatCents } from '../lib/money'
import { fetchProfile, saveDefaultAccount, saveName, savePhoto, saveProfile, squareJpeg } from '../lib/profile'
import { fetchRecurring, monthlyCents } from '../lib/recurring'
import { supabase } from '../lib/supabase'
import { getTheme, setTheme } from '../lib/theme'
import { navigate } from '../lib/useRoute'

// 1 → "1st", 22 → "22nd"
function ordinal(n) {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix}`
}

export default function Settings({ session }) {
  const [startDay, setStartDay] = useState(null)
  const { name, photo } = useProfileLook()
  const [editingName, setEditingName] = useState(false)
  const [pinnedId, setPinnedId] = useState(undefined) // undefined while loading, null = last used
  const [pickingAccount, setPickingAccount] = useState(false)
  const [lock, setLock] = useState(lockSettings)
  const [theme, setThemeState] = useState(getTheme)
  const [pinFlow, setPinFlow] = useState(null) // null | 'enable' | 'change' | 'disable'

  useEffect(() => {
    const refresh = () => setLock(lockSettings())
    window.addEventListener('applock:changed', refresh)
    return () => window.removeEventListener('applock:changed', refresh)
  }, [])

  async function toggleFaceId() {
    setError(null)
    if (lock?.credentialId) return turnOffFaceId()
    try {
      await setUpFaceId({ email: session.user.email, name })
    } catch (e) {
      setError(e?.name === 'NotAllowedError' ? 'Face ID was cancelled.' : `Couldn't set up Face ID: ${e.message}`)
    }
  }
  const [overview, setOverview] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchProfile()
      .then((p) => {
        setStartDay(startDayOf(p))
        setPinnedId(p?.answers?.defaultAccountId ?? null)
      })
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

  async function changeDefaultAccount(id) {
    const before = pinnedId
    setPinnedId(id)
    setPickingAccount(false)
    lookupCache.pinnedAccountId = id
    setError(null)
    try {
      await saveDefaultAccount(id)
    } catch (e) {
      setPinnedId(before)
      lookupCache.pinnedAccountId = before
      setError(`Couldn't save: ${e.message}`)
    }
  }

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
  const pinned = o?.accounts.find((a) => a.id === pinnedId)

  return (
    <div className="space-y-5 pt-2 pb-8">
      <section className="mx-4 flex items-center gap-3.5 rounded-[24px] bg-card px-4 py-4">
        <PhotoPicker onError={setError}>
          <Avatar name={name} email={session.user.email} photo={photo} size={58} />
          <span className="absolute -right-0.5 -bottom-0.5 grid size-[22px] place-items-center rounded-full bg-card text-cobalt shadow-[0_2px_6px_rgba(11,27,69,0.25)]">
            <Icon name="camera" size={13} strokeWidth={2.2} />
          </span>
        </PhotoPicker>
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-display text-lg font-bold ${name ? '' : 'text-muted'}`}>{name || 'Add your name'}</span>
          <span className="block truncate text-sm text-muted">{session.user.email}</span>
        </span>
        <button onClick={() => setEditingName(true)} className="shrink-0 rounded-full bg-cobalt/10 px-3.5 py-1.5 text-sm font-semibold text-cobalt">
          Edit
        </button>
      </section>

      <Group label="Your money">
        <Row
          onClick={() => navigate('/settings/accounts')}
          tile={<CardStack accounts={o?.accounts ?? []} />}
          tileClass="bg-paper"
          title="Accounts & cards"
          sub={o && (o.accounts.length ? `${o.accounts.length} · ${o.accounts.map((a) => a.name).join(', ')}` : 'Add your first account')}
        />
        <Row
          onClick={() => setPickingAccount(true)}
          tile={pinned ? <MiniCard color={pinned.color} type={pinned.type} className="h-7 w-10 rounded-md" iconSize={13} /> : <Icon name="card" />}
          tileClass={pinned ? 'bg-paper' : undefined}
          title="Default account"
          sub={pinnedId === undefined || !o ? ' ' : pinned ? `${pinned.name} · used for new transactions` : 'Last used · changes as you add'}
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

      <Group label="Appearance">
        <li className="px-4 py-3">
          <div className="flex items-center gap-3">
          <Tile>
            <Icon name={theme === 'dark' ? 'moon' : theme === 'system' ? 'phone' : 'sun'} />
          </Tile>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Theme</span>
            <span className="block truncate text-xs text-muted">{theme === 'system' ? 'Follows your iPhone' : theme === 'dark' ? 'Always dark' : 'Always light'}</span>
          </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-paper p-1" role="radiogroup" aria-label="Theme">
            {[
              ['light', 'Light', 'sun'],
              ['dark', 'Dark', 'moon'],
              ['system', 'Auto', 'phone'],
            ].map(([value, label, icon]) => (
              <button
                key={value}
                role="radio"
                aria-checked={theme === value}
                onClick={() => {
                  setTheme(value)
                  setThemeState(value)
                }}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
                  theme === value ? 'bg-card text-cobalt shadow-[0_4px_12px_-6px_rgba(11,27,69,0.4)]' : 'text-muted'
                }`}
              >
                <Icon name={icon} size={16} strokeWidth={2.2} />
                {label}
              </button>
            ))}
          </div>
        </li>
      </Group>

      <Group label="Security">
        <SwitchRow
          icon="lock"
          title="App lock"
          sub={lock ? (lock.credentialId ? 'Face ID or PIN · locks every time you leave' : 'PIN · locks every time you leave') : 'Ask for Face ID or a PIN to open the app'}
          on={!!lock}
          onToggle={() => setPinFlow(lock ? 'disable' : 'enable')}
        />
        {lock && faceIdSupported() && (
          <SwitchRow faceId title="Face ID" sub={lock.credentialId ? 'On for this iPhone' : 'Unlock with a glance'} on={!!lock.credentialId} onToggle={toggleFaceId} />
        )}
        {lock && <Row onClick={() => setPinFlow('change')} tile={<Icon name="pencil" />} title="Change PIN" />}
      </Group>

      <div className="px-4">
        <button onClick={() => supabase.auth.signOut()} className="w-full rounded-[20px] bg-card py-3.5 text-[15px] font-semibold text-loss">
          Sign out
        </button>
      </div>

      {pinFlow && (
        <PinSheet
          flow={pinFlow}
          canFaceId={faceIdSupported()}
          onFaceId={toggleFaceId}
          onClose={() => setPinFlow(null)}
        />
      )}

      {pickingAccount && o && (
        <DefaultAccountSheet accounts={o.accounts} pinnedId={pinned ? pinnedId : null} onPick={changeDefaultAccount} onClose={() => setPickingAccount(false)} />
      )}

      {editingName && (
        <NameSheet name={name} email={session.user.email} photo={photo} onClose={() => setEditingName(false)} onSaved={() => setEditingName(false)} />
      )}

      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <img src="/logo.png" alt="" className="size-14" />
        <p className="text-sm font-semibold">Expense Tracker</p>
        <p className="text-xs text-muted">Your data is private to your login</p>
      </div>
    </div>
  )
}

// Wraps its children in a button that opens the photo library / camera and saves the picked picture
function PhotoPicker({ onError, className = 'relative shrink-0 rounded-full', children }) {
  const input = useRef(null)
  async function picked(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      await savePhoto(await squareJpeg(file))
    } catch (err) {
      onError(`Couldn't save the photo: ${err.message}`)
    }
  }
  return (
    <button
      type="button"
      onClick={() => {
        allowLeavingOnce()
        input.current.click()
      }}
      className={className}
      aria-label="Change profile photo"
    >
      {children}
      <input ref={input} type="file" accept="image/*" onChange={picked} className="hidden" />
    </button>
  )
}

// A row with an on/off switch on the right
function SwitchRow({ icon, faceId, title, sub, on, onToggle }) {
  return (
    <li>
      <button onClick={onToggle} role="switch" aria-checked={on} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <Tile>{faceId ? <FaceIdIcon size={22} strokeWidth={3} /> : <Icon name={icon} />}</Tile>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        <span className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors ${on ? 'bg-cobalt' : 'bg-line'}`}>
          <span className={`absolute top-[3px] size-6 rounded-full bg-white shadow transition-[left] ${on ? 'left-[23px]' : 'left-[3px]'}`} />
        </span>
      </button>
    </li>
  )
}

// Turning the lock on (choose + confirm a PIN, then offer Face ID), changing the PIN, or turning it off
function PinSheet({ flow, canFaceId, onFaceId, onClose }) {
  const first = flow === 'enable' ? 'new' : 'current'
  const [step, setStep] = useState(first) // current → new → confirm → faceid
  const [chosen, setChosen] = useState(null)
  const [wrong, setWrong] = useState(0)
  const [note, setNote] = useState(null)

  const titles = {
    current: flow === 'disable' ? 'Enter your PIN to turn off the lock' : 'Enter your current PIN',
    new: flow === 'change' ? 'Choose a new PIN' : 'Choose a 4-digit PIN',
    confirm: 'Enter it again',
  }

  async function complete(pin) {
    setNote(null)
    if (step === 'current') {
      if (!(await checkPin(pin))) return setWrong((w) => w + 1)
      if (flow === 'disable') {
        disableLock()
        return onClose()
      }
      return setStep('new')
    }
    if (step === 'new') {
      setChosen(pin)
      return setStep('confirm')
    }
    if (pin !== chosen) {
      setNote("Those didn't match. Choose your PIN again.")
      setWrong((w) => w + 1)
      setChosen(null)
      return setStep('new')
    }
    if (flow === 'change') {
      await changePin(pin)
      return onClose()
    }
    await enableLock(pin)
    if (canFaceId) setStep('faceid')
    else onClose()
  }

  if (step === 'faceid') {
    return (
      <Sheet title="App lock is on" onClose={onClose}>
        <div className="flex flex-col items-center pb-2 text-center">
          <span className="grid size-20 place-items-center rounded-[26px] bg-card text-cobalt shadow-[0_16px_30px_-18px_rgba(11,27,69,0.6)]">
            <FaceIdIcon size={44} strokeWidth={2.6} />
          </span>
          <p className="mt-4 font-display text-lg font-bold">Also unlock with Face ID?</p>
          <p className="mt-1 text-sm text-muted">Your iPhone will ask for Face ID once to set it up. Your PIN always works too.</p>
          <button
            onClick={async () => {
              await onFaceId()
              onClose()
            }}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-cobalt py-4 font-semibold text-white active:bg-cobalt-deep"
          >
            <FaceIdIcon size={20} strokeWidth={3.4} />
            Set up Face ID
          </button>
          <button onClick={onClose} className="mt-2 w-full py-3 font-semibold text-muted">
            Not now
          </button>
        </div>
      </Sheet>
    )
  }

  return (
    <Sheet title={flow === 'disable' ? 'Turn off app lock' : flow === 'change' ? 'Change PIN' : 'Turn on app lock'} onClose={onClose}>
      <div className="flex flex-col items-center pb-3">
        <p className="mb-1 font-display text-lg font-bold">{titles[step]}</p>
        <p className="mb-5 min-h-5 text-sm text-loss">{note}</p>
        <PinPad key={step} onComplete={complete} error={wrong} />
      </div>
    </Sheet>
  )
}

// Choose the account new transactions start on, or keep "Last used"
function DefaultAccountSheet({ accounts, pinnedId, onPick, onClose }) {
  const option = (id, swatch, title, sub) => (
    <li key={id ?? 'last'} className="border-b border-line last:border-0">
      <button onClick={() => onPick(id)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        {swatch}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted">{sub}</span>
        </span>
        <span className={`grid size-5 shrink-0 place-items-center rounded-full ${pinnedId === id ? 'bg-cobalt text-white' : 'ring-2 ring-line'}`}>
          {pinnedId === id && <Icon name="check" size={12} strokeWidth={3.2} />}
        </span>
      </button>
    </li>
  )
  return (
    <Sheet title="Default account" onClose={onClose}>
      <p className="pb-3 text-sm text-muted">New transactions start on this account. You can still switch while adding one.</p>
      <ul className="overflow-hidden rounded-[20px] bg-card">
        {option(
          null,
          <span className="grid h-8 w-11 shrink-0 place-items-center rounded-lg bg-paper text-cobalt">
            <Icon name="repeat" size={16} />
          </span>,
          'Last used',
          'Whichever account you used most recently',
        )}
        {accounts.map((a) =>
          option(a.id, <MiniCard color={a.color} type={a.type} className="h-8 w-11 rounded-lg" />, a.name, TYPE_INFO[a.type]?.label ?? a.type),
        )}
      </ul>
    </Sheet>
  )
}

function NameSheet({ name, email, photo, onClose, onSaved }) {
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await saveName(value)
      onSaved()
    } catch (err) {
      setError(`Couldn't save: ${err.message}`)
      setBusy(false)
    }
  }

  return (
    <Sheet title="Edit profile" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-3.5">
          <Avatar name={value || name} email={email} photo={photo} size={64} />
          <div className="flex flex-wrap gap-2">
            <PhotoPicker onError={setError} className="rounded-full bg-cobalt/10 px-3.5 py-2 text-sm font-semibold text-cobalt">
              {photo ? 'Change photo' : 'Add photo'}
            </PhotoPicker>
            {photo && (
              <button
                type="button"
                onClick={() => savePhoto(null).catch((err) => setError(`Couldn't remove the photo: ${err.message}`))}
                className="rounded-full bg-loss/10 px-3.5 py-2 text-sm font-semibold text-loss"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">Name</span>
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Your first name"
          autoComplete="given-name"
          className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt"
        />
        </label>
        {error && <p className="text-sm text-loss">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-2xl bg-cobalt py-4 text-base font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </Sheet>
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
          style={{ background: cardBackground(a.color), transform: `rotate(${-14 + (i + 3 - shown.length) * 8}deg) translateX(${(i + 3 - shown.length) * 2 - 2}px)` }}
        />
      ))}
    </span>
  )
}
