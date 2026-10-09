import { useState } from 'react'
import Icon from '../components/Icon'
import PinPad, { FaceIdIcon } from '../components/PinPad'
import Sheet from '../components/Sheet'
import { checkPin, lockSettings, unlockWithFaceId } from '../lib/applock'
import { supabase } from '../lib/supabase'

const WHAT_GOES = [
  ['card', 'Accounts & cards'],
  ['list', 'All transactions'],
  ['tag', 'Categories'],
  ['repeat', 'Recurring payments and reminders'],
  ['target', 'Savings goals'],
  ['user', 'Name, photo and settings'],
]

// Profile → Danger zone: lists what goes, asks to type DELETE (and Face ID / PIN when the lock is on),
// then deletes everything in one go and restarts onboarding. The login itself stays.
export default function DeleteAllData({ onClose }) {
  const lock = lockSettings()
  const [step, setStep] = useState('confirm') // confirm → verify (lock on) → deleting
  const [typed, setTyped] = useState('')
  const [wrong, setWrong] = useState(0)
  const [error, setError] = useState(null)
  const ready = typed.trim().toUpperCase() === 'DELETE'

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

  function next() {
    if (!ready) return
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

  if (step === 'deleting') {
    return (
      <Sheet title="Deleting…" onClose={() => {}}>
        <p className="pb-6 text-center text-muted">Deleting your data. The app will restart in a moment.</p>
      </Sheet>
    )
  }

  return (
    <Sheet title="Delete all data" onClose={onClose}>
      <div className="space-y-4 pb-2">
        <div className="flex items-start gap-3 rounded-[20px] bg-loss/10 px-4 py-3.5 text-loss">
          <Icon name="trash" size={22} className="mt-0.5 shrink-0" />
          <p className="text-sm font-medium">
            This permanently deletes everything you've recorded. It can't be undone. You stay signed in and the app starts over from the
            beginning.
          </p>
        </div>

        <ul className="overflow-hidden rounded-[20px] bg-card">
          {WHAT_GOES.map(([icon, label]) => (
            <li key={label} className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-0">
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-paper text-muted">
                <Icon name={icon} size={16} />
              </span>
              <span className="text-[15px]">{label}</span>
            </li>
          ))}
        </ul>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-muted">
            Type <b className="text-ink">DELETE</b> to confirm
          </span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="DELETE"
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base font-semibold tracking-widest outline-none focus:border-loss"
          />
        </label>

        {error && <p className="text-sm text-loss">{error}</p>}

        <button
          onClick={next}
          disabled={!ready}
          className="w-full rounded-2xl bg-loss py-4 text-base font-semibold text-white transition-opacity disabled:opacity-40"
        >
          Delete all my data
        </button>
        <button onClick={onClose} className="w-full py-2 text-[15px] font-semibold text-muted">
          Cancel
        </button>
      </div>
    </Sheet>
  )
}
