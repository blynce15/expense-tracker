import { useLayoutEffect, useRef, useState } from 'react'

// The LynxOS lynx, soft and faded, above an empty-screen message
export default function EmptyLynx({ className = '' }) {
  return <img src="/logo.png" alt="" className={`mx-auto size-16 opacity-30 grayscale-[30%] ${className}`} />
}

// A page with nothing to show yet: one card that fills the rest of the screen down to the tab bar,
// with the lynx, a title, a line of text and an optional button, all centred.
export function FullEmpty({ title, text, children, className = '' }) {
  const ref = useRef(null)
  const [top, setTop] = useState(null)
  useLayoutEffect(() => {
    if (ref.current) setTop(ref.current.getBoundingClientRect().top + window.scrollY)
  }, [])
  return (
    <div
      ref={ref}
      className={`flex flex-col items-center justify-center rounded-[26px] bg-card px-7 py-10 text-center ${className}`}
      // Room for the floating tab bar and its gap: 6rem + the home-indicator area (see App.jsx)
      style={{ minHeight: top === null ? 320 : `max(320px, calc(100dvh - ${top}px - 7rem - max(env(safe-area-inset-bottom), 12px)))` }}
    >
      <EmptyLynx className="size-20" />
      <p className="mt-4 font-display text-xl font-bold text-balance">{title}</p>
      {text && <p className="mt-1.5 max-w-[280px] text-[15px] leading-snug text-muted text-balance">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}
