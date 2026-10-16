import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon'
import PinPad, { FaceIdIcon } from '../components/PinPad'
import Sheet from '../components/Sheet'
import { checkPin, lockSettings, unlockWithFaceId } from '../lib/applock'
import { supabase } from '../lib/supabase'

// What goes, as tiles with how many of each there are (counted when the sheet opens)
const WHAT_GOES = [
  ['accounts', 'card', 'Accounts', '#1f4fe0'],
  ['transactions', 'list', 'Transactions', '#0f8a5f'],
  ['categories', 'tag', 'Categories', '#f08c00'],
  ['recurring_payments', 'repeat', 'Recurring', '#7c4dff'],
  ['savings_goals', 'target', 'Goals', '#e0457b'],
]
const HOLD_MS = 2000

// Profile → Delete all data: what goes as count tiles, then press and hold the button for 2 seconds
// (and Face ID / PIN when the lock is on); deletes everything in one go and restarts onboarding. The login stays.
export default function DeleteAllData({ onClose }) {
  const lock = lockSettings()
  const [step, setStep] = useState('confirm') // confirm → verify (lock on) → deleting
  const [counts, setCounts] = useState({})
  const [wrong, setWrong] = useState(0)
  const [error, setError] = useState(null)

  useEffect(() => {
    WHAT_GOES.forEach(([table]) =>
      supabase
        .from(table)
        .select('id', { count: 'exact', head: true })
        .then(({ count }) => setCounts((c) => ({ ...c, [table]: count ?? 0 }))),
    )
  }, [])

  async function deleteEverything() {
    setStep('deleting')
    setError(null)
    const { error } = await supabase.rpc('delete_my_data')
    if (error) {
      setStep('confirm')
      return setError(
        error.code === 'PGRST202' || /delete_my_data/.test(error.message)
          ? 'This isn’t set up yet: run supabase/migrations/009_delete_my_data.sql in Supabase first.'
          : `Nothing was deleted: ${error.message}`,
      )
    }
    // Start over: back to Home, and the app reloads into onboarding
    window.location.replace('/#/home')
    window.location.reload()
  }

  function held() {
    if (lock) setStep('verify')
    else deleteEverything()
  }

  async function faceId() {
    try {
      if (await unlockWithFaceId()) deleteEverything()
    } catch {
      // Cancelled: stay on the PIN pad
    }
  }

  if (step === 'verify') {
    return (
      <Sheet title="Confirm it's you" onBack={() => setStep('confirm')} onClose={onClose}>
        <div className="flex flex-col items-center pb-3">
          <p className="mb-5 text-center text-sm text-muted">Enter your PIN to delete all your data.</p>
          <PinPad
            error={wrong}
            onComplete={async (pin) => ((await checkPin(pin)) ? deleteEverything() : setWrong((w) => w + 1))}
            leftKey={
              lock.credentialId && (
                <button onClick={faceId} className="grid size-full place-items-center rounded-full text-cobalt" aria-label="Use Face ID">
                  <FaceIdIcon size={32} strokeWidth={2.6} />
                </button>
              )
            }
          />
        </div>
      </Sheet>
    )
  }

  const deleting = step === 'deleting'

  return (
    <Sheet title="" onClose={deleting ? () => {} : onClose}>
      <div className="pb-1">
        <div className="pt-2.5 text-center">
          <span className="relative inline-grid size-[84px] place-items-center rounded-full bg-loss/12">
            <span className="absolute -inset-2.5 rounded-full border-[1.5px] border-loss/20" />
            <span className="grid size-[58px] place-items-center rounded-full bg-loss text-white shadow-[0_10px_20px_-8px_rgba(214,58,31,0.7)]">
              <Icon name="trash" size={26} />
            </span>
          </span>
          <h2 className="mt-4 font-display text-[25px] font-bold">{deleting ? 'Deleting…' : 'Delete all data?'}</h2>
          <p className="mt-1 text-sm text-muted">
            {deleting ? 'The app will restart in a moment.' : 'This can’t be undone. You stay signed in.'}
          </p>
        </div>

        <ul className={`mt-5 grid grid-cols-3 gap-2 transition-opacity ${deleting ? 'opacity-40' : ''}`}>
          {WHAT_GOES.map(([table, icon, label, color]) => (
            <li key={table} className="rounded-[18px] bg-card px-2 py-3 text-center">
              <span className="mx-auto mb-1.5 grid size-[34px] place-items-center rounded-[11px]" style={{ background: `${color}1f`, color }}>
                <Icon name={icon} size={17} />
              </span>
              <b className="tabular block font-display text-lg leading-tight">{counts[table] ?? '–'}</b>
              <span className="text-[11.5px] text-muted">{label}</span>
            </li>
          ))}
          <li className="rounded-[18px] bg-card px-2 py-3 text-center">
            <span className="mx-auto mb-1.5 grid size-[34px] place-items-center rounded-[11px] bg-muted/12 text-muted">
              <Icon name="user" size={17} />
            </span>
            <b className="block pt-0.5 text-[13px] leading-tight font-bold">Name, photo</b>
            <span className="text-[11.5px] text-muted">Profile</span>
          </li>
        </ul>

        {error && <p className="mt-4 text-center text-sm text-loss">{error}</p>}

        <HoldButton onDone={held} disabled={deleting} />
        <p className="mt-2 flex items-center justify-center gap-1 text-center text-[12.5px] text-muted">
          Press and hold for 2 seconds
          {lock && (
            <>
              {' '}
              · then {lock.credentialId ? <FaceIdIcon size={13} strokeWidth={2.4} /> : null}
              {lock.credentialId ? 'Face ID' : 'your PIN'}
            </>
          )}
        </p>
        <button onClick={onClose} disabled={deleting} className="mt-1 w-full py-3 text-[15px] font-semibold text-muted disabled:opacity-40">
          Cancel
        </button>
      </div>
    </Sheet>
  )
}

// A button that fills with red while pressed; letting go early drains it back. Full after HOLD_MS.
function HoldButton({ onDone, disabled }) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const frame = useRef(0)
  const start = useRef(0)
  const value = useRef(0)

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  function animate(pressing) {
    cancelAnimationFrame(frame.current)
    const from = value.current
    start.current = performance.now()
    const tick = (now) => {
      const elapsed = now - start.current
      // Filling takes the full 2 seconds; draining back is quicker
      const next = pressing ? Math.min(1, from + elapsed / HOLD_MS) : Math.max(0, from - elapsed / 350)
      value.current = next
      setProgress(next)
      if (pressing && next >= 1) {
        setHolding(false)
        onDone()
        return
      }
      if (pressing ? next < 1 : next > 0) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  function press(e) {
    if (disabled || value.current >= 1) return
    e.preventDefault()
    setHolding(true)
    animate(true)
  }

  function release() {
    if (!holding) return
    setHolding(false)
    if (value.current < 1) animate(false)
  }

  const done = progress >= 1
  const label = disabled || done ? 'Deleting…' : holding ? 'Keep holding…' : 'Hold to delete everything'
  const content = (
    <span className="flex items-center gap-2 text-base font-bold">
      <Icon name="trash" size={19} />
      {label}
    </span>
  )

  return (
    <button
      type="button"
      onPointerDown={press}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && !e.repeat && press(e)}
      onKeyUp={(e) => (e.key === ' ' || e.key === 'Enter') && release()}
      onContextMenu={(e) => e.preventDefault()}
      disabled={disabled}
      style={{ WebkitTouchCallout: 'none' }}
      className={`relative mt-6 grid h-[62px] w-full touch-none place-items-center overflow-hidden rounded-[20px] bg-loss/12 text-loss select-none transition-transform ${
        holding ? 'scale-[0.98]' : ''
      }`}
      aria-label="Press and hold to delete all data"
    >
      {content}
      {/* The red fill, with white text, clipped to how far you've held */}
      <span
        aria-hidden="true"
        className="absolute inset-0 grid place-items-center bg-gradient-to-r from-[#f0603f] to-loss text-white"
        style={{ clipPath: `inset(0 ${(1 - (disabled ? 1 : progress)) * 100}% 0 0)` }}
      >
        {content}
      </span>
    </button>
  )
}
