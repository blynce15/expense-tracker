import { useEffect } from 'react'
import Icon from './Icon'

// Bottom sheet that slides up over the current screen.
// Optional: onBack shows a back arrow before the title; action is shown before the close button.
export default function Sheet({ title, onClose, onBack, action, tall = false, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className={`relative flex max-h-[92dvh] ${tall ? 'h-[92dvh]' : ''} w-full max-w-lg flex-col rounded-t-3xl bg-paper pb-[env(safe-area-inset-bottom)] motion-safe:animate-[sheet-up_220ms_ease-out]`}>
        <div className={`flex items-center gap-2 pt-4 pb-2 ${onBack ? 'pr-5 pl-2' : 'px-5'}`}>
          {onBack && (
            <button onClick={onBack} className="-mr-1 grid size-11 place-items-center rounded-full text-ink" aria-label="Back">
              <Icon name="chevronLeft" />
            </button>
          )}
          <h2 className="flex-1 font-display text-xl font-bold">{title}</h2>
          {action}
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
      </div>
    </div>
  )
}
