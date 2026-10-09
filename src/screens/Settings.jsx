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
import DeleteAllData from './DeleteAllData'
import { isStandalone, pushSupported, remindersOn, sendTestReminder, turnOffReminders, turnOnReminders } from '../lib/push'
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
  const [reminders, setReminders] = useState(null) // null while checking
  const [reminderNote, setReminderNote] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [pinFlow, setPinFlow] = useState(null) // null | 'enable' | 'change' | 'disable'

  useEffect(() => {
    const refresh = () => setLock(lockSettings())
    window.addEventListener('applock:changed', refresh)
    return () => window.removeEventListener('applock:changed', refresh)
  }, [])

  useEffect(() => {
    if (pushSupported()) remindersOn().then(setReminders).catch(() => setReminders(false))
  }, [])

  async function toggleReminders() {
    setReminderNote(null)
    const wasOn = reminders
    setReminders(!wasOn)
    try {
      if (wasOn) await turnOffReminders()
      else await turnOnReminders()
    } catch (e) {
      setReminders(wasOn)
      setReminderNote(e.message)
    }
  }

  async function testReminder() {
    setReminderNote('Sending…')
    try {
      const { sent } = await sendTestReminder()
      setReminderNote(sent ? 'Sent. It should appear in a few seconds.' : 'No phone is set up for reminders yet.')
    } catch (e) {
      setReminderNote(`Couldn't send: ${e.message}`)
    }
  }

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
    <div className="space-y-4 pt-1 pb-8">
      {/* You: big centered photo (tap to change), name, email, Edit profile */}
      <section className="flex flex-col items-center px-4 pt-1 text-center">
        <PhotoPicker onError={setError}>
          <Avatar name={name} email={session.user.email} photo={photo} size={88} className="shadow-[0_14px_30px_-14px_rgba(11,27,69,0.55)]" />
          <span className="absolute right-0 bottom-0 grid size-7 place-items-center rounded-full bg-card text-cobalt shadow-[0_2px_8px_rgba(11,27,69,0.25)]">
            <Icon name="camera" size={15} strokeWidth={2.2} />
          </span>
        </PhotoPicker>
        <p className={`mt-3 max-w-full truncate font-display text-[22px] leading-tight font-bold ${name ? '' : 'text-muted'}`}>{name || 'Add your name'}</p>
        <p className="max-w-full truncate text-sm text-muted">{session.user.email}</p>
        <button onClick={() => setEditingName(true)} className="mt-2.5 rounded-full bg-cobalt/10 px-4 py-1.5 text-sm font-semibold text-cobalt">
          Edit profile
        </button>
      </section>

      {/* Your money: four tiles */}
      <section className="grid grid-cols-2 gap-2.5 px-4">
        <QuickTile
          onClick={() => navigate('/settings/accounts')}
          icon={<CardStack accounts={o?.accounts ?? []} />}
          iconClass="bg-paper"
          title="Accounts & cards"
          sub={o && (o.accounts.length ? `${o.accounts.length} · ${o.accounts.map((a) => a.name).join(', ')}` : 'Add your first account')}
        />
        <QuickTile
          onClick={() => navigate('/recurring')}
          icon={<Icon name="repeat" size={19} />}
          color="#7b3fe4"
          title="Recurring"
          sub={o && (o.payments ? `${o.payments} · ${formatCents(o.perMonth).replace(/,\d\d$/, '')} a month` : 'Rent, subscriptions')}
        />
        <QuickTile
          onClick={() => navigate('/settings/categories')}
          icon={<Icon name="tag" size={19} />}
          color="#12a150"
          title="Categories"
          sub={o && `${expenses.length} expense · ${income.length} income`}
        />
        <QuickTile
          onClick={() => setPickingAccount(true)}
          icon={pinned ? <MiniCard color={pinned.color} type={pinned.type} className="h-6 w-9 rounded-md" iconSize={12} /> : <Icon name="card" size={19} />}
          color={pinned ? null : '#2b8ef7'}
          iconClass={pinned ? 'bg-paper' : ''}
          title="Default account"
          sub={pinnedId === undefined || !o ? ' ' : pinned ? pinned.name : 'Last used'}
        />
      </section>

      {/* Budget day */}
      <section className="px-4">
        <div className="relative flex items-center gap-3 rounded-[22px] bg-card px-4 py-3">
          <ColorTile color="#f08c00" icon="calendar" />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">Budget starts on</span>
            <span className="block truncate text-xs text-muted">
              {period ? `${formatDayMonth(period.start)} – ${formatDayMonth(period.end)} this time` : ' '}
            </span>
          </span>
          <span className="flex items-center gap-1 text-[15px] font-semibold text-muted">
            {startDay ? ordinal(startDay) : ''}
            <Icon name="chevronRight" size={17} className="text-muted/60" />
          </span>
          {/* The whole row opens the day picker */}
          <select
            id="budget-start-day"
            aria-label="Budget starts on"
            value={startDay ?? ''}
            disabled={startDay == null}
            onChange={(e) => changeStartDay(Number(e.target.value))}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
        </div>
        <p className="px-2 pt-1.5 text-xs text-muted">
          Your payday. The budget is the money in bank and cash accounts.
          {startDay > 28 && ' Short months start on their last day.'}
        </p>
        {error && <p className="px-2 pt-1.5 text-sm text-loss">{error}</p>}
      </section>

      {/* Appearance: three little previews of the app */}
      <TopicCard icon="sun" color="#f08c00" title="Appearance">
        <div className="grid grid-cols-3 gap-2.5" role="radiogroup" aria-label="Theme">
          {[
            ['light', 'Light'],
            ['dark', 'Dark'],
            ['system', 'Auto'],
          ].map(([value, label]) => (
            <button
              key={value}
              role="radio"
              aria-checked={theme === value}
              onClick={() => {
                setTheme(value)
                setThemeState(value)
              }}
              className={`flex flex-col items-center gap-1.5 rounded-2xl p-1.5 text-[13px] font-semibold ring-2 transition-colors ${
                theme === value ? 'text-cobalt ring-cobalt' : 'text-muted ring-transparent'
              }`}
            >
              <ThemePreview kind={value} />
              {label}
            </button>
          ))}
        </div>
      </TopicCard>

      {/* Notifications & security */}
      <TopicCard icon="bell" color="#e64980" title="Notifications & security">
        <ul className="divide-y divide-line overflow-hidden rounded-[18px] bg-paper">
          {pushSupported() ? (
            <>
              <SwitchRow
                color="#e64980"
                icon="bell"
                title="Payment reminders"
                sub={reminders ? 'The morning before it’s due' : 'The day before each payment'}
                on={!!reminders}
                onToggle={toggleReminders}
              />
              {reminders && <Row onClick={testReminder} tile={<ColorTile color="#e64980" icon="bell" soft />} title="Send a test notification" />}
            </>
          ) : (
            <Row
              tile={<ColorTile color="#8892a6" icon="bell" />}
              title="Payment reminders"
              sub={isStandalone() ? 'Needs iOS 16.4 or newer' : 'Open the app from your Home Screen to turn these on'}
            />
          )}
          <SwitchRow
            color="#0c8599"
            icon="lock"
            title="App lock"
            sub={lock ? (lock.credentialId ? 'Face ID or PIN · every time you leave' : 'PIN · every time you leave') : 'Ask for Face ID or a PIN to open'}
            on={!!lock}
            onToggle={() => setPinFlow(lock ? 'disable' : 'enable')}
          />
          {lock && faceIdSupported() && (
            <SwitchRow color="#12a150" faceId title="Face ID" sub={lock.credentialId ? 'On for this iPhone' : 'Unlock with a glance'} on={!!lock.credentialId} onToggle={toggleFaceId} />
          )}
          {lock && <Row onClick={() => setPinFlow('change')} tile={<ColorTile color="#8892a6" icon="pencil" />} title="Change PIN" />}
        </ul>
        {reminderNote && <p className="px-1 text-sm text-muted">{reminderNote}</p>}
      </TopicCard>

      {/* Sign out, Delete all data */}
      <ul className="mx-4 divide-y divide-line overflow-hidden rounded-[22px] bg-card">
        <Row onClick={() => supabase.auth.signOut()} tile={<ColorTile color="#8892a6" icon="logout" />} title="Sign out" plain />
        <Row
          onClick={() => setDeleting(true)}
          tile={<ColorTile color="#d9452b" icon="trash" />}
          title={<span className="text-loss">Delete all data</span>}
          sub="Erase everything and start over"
        />
      </ul>

      <p className="pt-1 text-center text-xs text-muted">LynxOS · your data is private to your login</p>

      {deleting && <DeleteAllData onClose={() => setDeleting(false)} />}

      {pinFlow && <PinSheet flow={pinFlow} canFaceId={faceIdSupported()} onFaceId={toggleFaceId} onClose={() => setPinFlow(null)} />}

      {pickingAccount && o && (
        <DefaultAccountSheet accounts={o.accounts} pinnedId={pinned ? pinnedId : null} onPick={changeDefaultAccount} onClose={() => setPickingAccount(false)} />
      )}

      {editingName && (
        <NameSheet name={name} email={session.user.email} photo={photo} onClose={() => setEditingName(false)} onSaved={() => setEditingName(false)} />
      )}
    </div>
  )
}

// One of the four "Your money" tiles
function QuickTile({ onClick, icon, color, iconClass = '', title, sub }) {
  return (
    <button onClick={onClick} className="flex min-w-0 flex-col items-start gap-2.5 rounded-[22px] bg-card p-3.5 text-left active:scale-[.98]">
      <span
        className={`grid size-9 place-items-center rounded-xl ${iconClass}`}
        style={color ? { backgroundColor: `${color}1f`, color } : undefined}
      >
        {icon}
      </span>
      <span className="w-full min-w-0">
        <span className="block truncate text-[15px] font-semibold">{title}</span>
        <span className="block min-h-4 truncate text-xs text-muted">{sub}</span>
      </span>
    </button>
  )
}

// A card for one topic, with a small coloured header
function TopicCard({ icon, color, title, children }) {
  return (
    <section className="mx-4 space-y-3 rounded-[24px] bg-card p-3.5">
      <p className="flex items-center gap-2 px-0.5 text-[15px] font-bold">
        <span className="grid size-7 place-items-center rounded-lg" style={{ backgroundColor: `${color}1f`, color }}>
          <Icon name={icon} size={15} strokeWidth={2.2} />
        </span>
        {title}
      </p>
      {children}
    </section>
  )
}

// Tiny picture of the app in light, dark, or half and half (Auto)
function ThemePreview({ kind }) {
  const light = { bg: '#f4f7fd', bar: '#1f4fe0', line: '#dce4f5', card: '#ffffff' }
  const dark = { bg: '#0a1022', bar: '#4c7dff', line: '#26325a', card: '#151e3b' }
  const page = (c) => (
    <span className="flex h-full flex-1 flex-col gap-1 p-1.5" style={{ background: c.bg }}>
      <span className="h-2 w-3/5 rounded-sm" style={{ background: c.bar }} />
      <span className="h-4 rounded" style={{ background: c.card }} />
      <span className="h-1.5 w-4/5 rounded-sm" style={{ background: c.line }} />
    </span>
  )
  return (
    <span className="flex h-16 w-full overflow-hidden rounded-xl ring-1 ring-line">
      {kind === 'dark' ? page(dark) : page(light)}
      {kind === 'system' && page(dark)}
    </span>
  )
}

// Solid coloured icon square (soft = pale version)
function ColorTile({ color, icon, faceId, soft }) {
  return (
    <span
      className="grid size-8 shrink-0 place-items-center rounded-[10px]"
      style={soft ? { backgroundColor: `${color}1f`, color } : { backgroundColor: color, color: '#fff' }}
    >
      {faceId ? <FaceIdIcon size={18} strokeWidth={3} /> : <Icon name={icon} size={17} strokeWidth={2.1} />}
    </span>
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
function SwitchRow({ color, icon, faceId, title, sub, on, onToggle }) {
  return (
    <li>
      <button onClick={onToggle} role="switch" aria-checked={on} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <ColorTile color={color} icon={icon} faceId={faceId} />
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

// A settings row; tappable when it has onClick (plain = no arrow)
function Row({ onClick, tile, title, sub, plain }) {
  const inner = (
    <>
      {tile}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{title}</span>
        {sub !== undefined && <span className="block min-h-4 truncate text-xs text-muted">{sub}</span>}
      </span>
      {onClick && !plain && <Icon name="chevronRight" size={18} className="shrink-0 text-muted/60" />}
    </>
  )
  return (
    <li>
      {onClick ? (
        <button onClick={onClick} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left">
          {inner}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-3.5 py-2.5">{inner}</div>
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
