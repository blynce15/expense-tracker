// The LynxOS lynx, soft and faded, above an empty-screen message
export default function EmptyLynx({ className = '' }) {
  return <img src="/logo.png" alt="" className={`mx-auto size-16 opacity-30 grayscale-[30%] ${className}`} />
}
