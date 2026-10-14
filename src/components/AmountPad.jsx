import Icon from './Icon'
import { centsToPad, formatCents, formatTyping, PAD_KEYS, parseToCents, pressKey } from '../lib/money'

// The same number pad as Add transaction, in a sheet over the bottom of the screen (above other sheets).
// Optional `max` (cents): above it the amount turns red, `maxText` says why, Done is blocked and a
// button sets the amount to the most allowed (e.g. a goal can't start with more than is free in savings).
export default function AmountPad({ label, amount, onChange, onDone, max = null, maxText }) {
  const over = max !== null && (parseToCents(amount) ?? 0) > max
  return (
    <>
      <div className="fixed inset-0 z-[60] bg-navy/50" onClick={() => !over && onDone()} />
      <div className="fixed inset-x-0 bottom-0 z-[70] mx-auto max-w-lg rounded-t-[28px] bg-card px-5 pt-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] motion-safe:animate-[sheet-up_200ms_ease-out]">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-muted">{label}</span>
          <span className={`tabular truncate font-display text-[32px] font-extrabold ${over ? 'text-loss' : ''}`}>€{formatTyping(amount)}</span>
        </div>
        {over && (
          <div className="mt-2.5 flex items-center justify-between gap-3 rounded-2xl bg-loss/10 px-3 py-2.5">
            <span className="text-[13px] font-semibold text-loss">{maxText ?? `The most allowed is ${formatCents(max)}`}</span>
            <button
              type="button"
              onClick={() => onChange(centsToPad(max))}
              className="tabular shrink-0 rounded-full bg-loss px-3 py-1.5 text-[13px] font-bold text-white"
            >
              Use {formatCents(max).replace(/,00$/, '')}
            </button>
          </div>
        )}
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
          disabled={over}
          className="mt-3 w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white shadow-[0_10px_24px_-10px_rgba(31,79,224,0.8)] active:bg-cobalt-deep disabled:opacity-35"
        >
          Done
        </button>
      </div>
    </>
  )
}
