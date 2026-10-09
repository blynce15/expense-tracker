import { useState } from 'react'
import { checkPin, disableLock, lockSettings, unlockWithFaceId } from '../lib/applock'
import { supabase } from '../lib/supabase'
import Avatar, { useProfileLook } from './Avatar'
import PinPad, { FaceIdIcon } from './PinPad'

// Full-screen lock in the app's blue: Face ID (one tap) or the 4-digit PIN
export default function LockScreen({ email, onUnlock }) {
  const { name, photo } = useProfileLook()
  const hasFaceId = !!lockSettings()?.credentialId
  const [mode, setMode] = useState(hasFaceId ? 'face' : 'pin')
  const [wrong, setWrong] = useState(0)
  const [message, setMessage] = useState(null)

  async function faceId() {
    setMessage(null)
    try {
      if (await unlockWithFaceId()) onUnlock()
      else setMessage("Face ID didn't work. Try again or use your PIN.")
    } catch {
      setMessage("Face ID didn't work. Try again or use your PIN.")
    }
  }

  async function pin(value) {
    if (await checkPin(value)) onUnlock()
    else setWrong((w) => w + 1)
  }

  // Forgetting the PIN: sign out and remove the lock; signing in again gets you back in
  async function forgot() {
    if (!window.confirm('Sign out and remove the app lock? You can sign in again with your email and password.')) return
    disableLock()
    await supabase.auth.signOut()
    onUnlock()
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col items-center overflow-hidden text-white"
      style={{
        background:
          'radial-gradient(120% 70% at 85% 5%, #46a4ff 0%, transparent 55%), radial-gradient(90% 60% at 0% 100%, #0f2a8c 0%, transparent 60%), linear-gradient(170deg, #2b8ef7 0%, #1f4fe0 45%, #142e96 100%)',
      }}
      role="dialog"
      aria-modal="true"
      aria-label="App locked"
    >
      <span className="pointer-events-none absolute top-[12%] left-1/2 size-[420px] -translate-x-1/2 rounded-full border border-white/[.12]" />
      <span className="pointer-events-none absolute top-[calc(12%+60px)] left-1/2 size-[300px] -translate-x-1/2 rounded-full border border-white/[.18]" />

      {mode === 'face' ? (
        <div className="relative flex w-full max-w-sm flex-1 flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+20px)] pb-[calc(env(safe-area-inset-bottom)+28px)]">
          <span className="flex items-center gap-1.5 rounded-full bg-white/[.14] px-3 py-1.5 text-xs font-bold">
            <LockGlyph /> Expense Tracker
          </span>
          <div className="flex-1" />
          <Avatar
            name={name}
            email={email}
            photo={photo}
            size={110}
            className="shadow-[0_0_0_6px_rgba(255,255,255,0.22),0_24px_44px_-16px_rgba(5,20,80,0.8)]"
          />
          <p className="mt-5 font-display text-[28px] font-extrabold tracking-tight">Welcome back</p>
          {name && <p className="text-base text-white/75">{name}</p>}
          <div className="flex-[1.3]" />
          {message && <p className="mb-3 text-center text-sm text-white/85">{message}</p>}
          <button
            onClick={faceId}
            className="flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-white text-base font-extrabold text-cobalt shadow-[0_16px_30px_-14px_rgba(5,20,80,0.9)] active:scale-[.98]"
          >
            <FaceIdIcon size={22} strokeWidth={3.4} />
            Unlock with Face ID
          </button>
          <button onClick={() => setMode('pin')} className="mt-4 px-4 py-2 text-[15px] font-bold text-white/85">
            Use PIN
          </button>
        </div>
      ) : (
        <div className="relative flex w-full max-w-sm flex-1 flex-col items-center px-6 pt-[calc(env(safe-area-inset-top)+28px)] pb-[calc(env(safe-area-inset-bottom)+20px)]">
          <Avatar name={name} email={email} photo={photo} size={64} className="shadow-[0_0_0_4px_rgba(255,255,255,0.2)]" />
          <p className="mt-3 mb-5 font-display text-lg font-extrabold">Enter your PIN</p>
          <PinPad
            dark
            error={wrong}
            onComplete={pin}
            leftKey={
              hasFaceId && (
                <button onClick={() => setMode('face')} className="grid size-[70px] place-items-center rounded-full" aria-label="Use Face ID">
                  <FaceIdIcon size={32} strokeWidth={2.6} />
                </button>
              )
            }
          />
          <div className="flex-1" />
          <button onClick={forgot} className="mt-6 px-4 py-2 text-sm font-bold text-white/80">
            Forgot PIN? Sign in again
          </button>
        </div>
      )}
    </div>
  )
}

function LockGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
