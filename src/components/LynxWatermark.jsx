// A faint white lynx in the corner of the app's blue cards
export default function LynxWatermark({ className = '-top-6 -right-8' }) {
  return <img src="/logo-white.png" alt="" className={`pointer-events-none absolute size-40 opacity-[.13] ${className}`} />
}
