import Icon from './Icon'
import { formatTyping, PAD_KEYS, pressKey } from '../lib/money'

// The same number pad as Add transaction, in a sheet over the bottom of the screen (above other sheets)
export default function AmountPad({ label, amount, onChange, onDone }) {
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-navy/50" onClick={onDone} />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-lg rounded-t-[28px] bg-card px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] motion-safe:animate-[sheet-up_200ms_ease-out]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{label}</span>
          <span className="tabular truncate font-display text-[32px] font-extrabold">€{formatTyping(amount)}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {PAD_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange(pressKey(amount, k))}
              className={`grid h-13 place-items-center rounded-2xl font-display text-[24px] font-semibold active:bg-line ${k === '.' || k === 'back' ? '' : 'bg-paper'}`}
              aria-label={k === 'back' ? 'Delete digit' : k === '.' ? 'Decimal point' : k}
            >
              {k === 'back' ? <Icon name="backspace" size={24} /> : k === '.' ? ',' : k}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="mt-3 w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_rgba(31,79,224,0.8)] active:bg-cobalt-deep"
        >
          Done
        </button>
      </div>
    </>
  )
}
