import { useEffect } from 'react'
import Icon from './Icon'

// A page that slides in over the current screen (back arrow + title), e.g. Investments → See all, a position,
// the pension setup. `top` replaces the title row's right side (e.g. step dots).
export default function FullPage({ title, onClose, top, children }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper motion-safe:animate-[page-in_220ms_ease-out]" role="dialog" aria-modal="true" aria-label={title}>
      <div className="mx-auto flex w-full max-w-lg items-center gap-2.5 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-2">
        <button onClick={onClose} className="grid size-10 shrink-0 place-items-center rounded-full bg-card shadow-[0_3px_10px_-6px_rgba(0,0,0,0.3)]" aria-label="Back">
          <Icon name="chevronLeft" size={20} />
        </button>
        {top ?? <h2 className="truncate font-display text-xl font-extrabold">{title}</h2>}
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-lg space-y-3 px-4 pt-1 pb-[calc(env(safe-area-inset-bottom)+2rem)]">{children}</div>
      </div>
    </div>
  )
}
