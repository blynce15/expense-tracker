import { useEffect, useState } from 'react'
import Icon from './Icon'

const LETTERS = ['', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ']
export const PIN_LENGTH = 4

// Face ID symbol (corners, eyes, nose, smile)
export function FaceIdIcon({ size = 24, strokeWidth = 3, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M7 17V12a5 5 0 0 1 5-5h5M31 7h5a5 5 0 0 1 5 5v5M41 31v5a5 5 0 0 1-5 5h-5M17 41h-5a5 5 0 0 1-5-5v-5M17.5 18.5v3M30.5 18.5v3M24 18.5v9.5h-2.2M18.5 32.5c3.2 2.7 7.8 2.7 11 0" />
    </svg>
  )
}

// iPhone-style keypad with four dots. Calls onComplete(pin) once 4 digits are in;
// `error` (any changing value) shakes the dots and clears them.
export default function PinPad({ onComplete, error, dark = false, leftKey = null }) {
  const [pin, setPin] = useState('')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    if (!error) return
    setShake(true)
    const t = setTimeout(() => {
      setShake(false)
      setPin('')
    }, 450)
    return () => clearTimeout(t)
  }, [error])

  function press(d) {
    if (pin.length >= PIN_LENGTH) return
    const next = pin + d
    setPin(next)
    if (next.length === PIN_LENGTH) setTimeout(() => onComplete(next), 120)
  }

  const key = dark
    ? 'bg-white/[.14] text-white ring-1 ring-white/[.12] active:bg-white/30'
    : 'bg-card text-ink shadow-[0_8px_16px_-12px_rgba(11,27,69,0.55)] ring-1 ring-line/80 active:bg-cobalt/10'

  return (
    <div className="flex flex-col items-center">
      <div className={`mb-7 flex gap-4 ${dark ? 'text-white' : 'text-cobalt'} ${shake ? 'motion-safe:animate-[shake_400ms_ease-in-out]' : ''}`} aria-live="polite" aria-label={`${pin.length} of ${PIN_LENGTH} digits`}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <span key={i} className={`size-[13px] rounded-full border-[1.8px] border-current ${i < pin.length ? 'bg-current' : ''}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-[clamp(8px,1.6svh,14px)]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <button key={n} onClick={() => press(String(n))} className={`grid size-[clamp(54px,8.4svh,70px)] place-content-center rounded-full leading-none ${key}`}>
            <span className="text-[28px] font-medium">{n}</span>
            <span className="mt-0.5 text-[8px] font-extrabold tracking-[0.18em] opacity-70">{LETTERS[n - 1] || ' '}</span>
          </button>
        ))}
        <span className="grid size-[clamp(54px,8.4svh,70px)] place-items-center">{leftKey}</span>
        <button onClick={() => press('0')} className={`grid size-[clamp(54px,8.4svh,70px)] place-content-center rounded-full leading-none ${key}`}>
          <span className="text-[28px] font-medium">0</span>
        </button>
        <button
          onClick={() => setPin((p) => p.slice(0, -1))}
          className={`grid size-[clamp(54px,8.4svh,70px)] place-items-center rounded-full ${dark ? 'text-white' : 'text-cobalt'}`}
          aria-label="Delete"
        >
          <Icon name="backspace" size={28} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  )
}
