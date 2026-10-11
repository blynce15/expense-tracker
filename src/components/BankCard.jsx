import { useState } from 'react'
import { bankFor, bankLogo } from '../lib/banks'
import Icon from './Icon'

export const TYPE_INFO = {
  debit: { label: 'Bank', icon: 'bank' },
  savings: { label: 'Savings', icon: 'coins' },
  credit: { label: 'Credit card', icon: 'card' },
  cash: { label: 'Cash', icon: 'cash' },
}

// Darker version of a #rrggbb color, for card gradients
export const shade = (hex, f) =>
  '#' + hex.slice(1).match(/../g).map((h) => Math.round(parseInt(h, 16) * f).toString(16).padStart(2, '0')).join('')

export const cardBackground = (color) => `linear-gradient(140deg, ${color} 0%, ${shade(color, 0.62)} 100%)`

// A bank's logo on a small white tile (src/lib/banks.js). Shows an empty tile if the logo can't load.
export function BankLogo({ bank, className = 'size-6' }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-[24%] bg-white ${className}`}>
      {!failed && <img src={bankLogo(bank)} alt="" className="size-[78%] rounded-[18%]" onError={() => setFailed(true)} />}
    </span>
  )
}

// A tiny marker for an account in lists and chips: its bank's logo, else a swatch in its color
export function AccountMark({ account, className, logoClass = 'size-5' }) {
  const bank = account && bankFor(account.name)
  if (bank) return <BankLogo bank={bank} className={logoClass} />
  return <span className={`shrink-0 ${className}`} style={{ backgroundColor: account?.color }} />
}

// A small card in an account's color, with its bank's logo (from `name`) or the account type's icon when given
export function MiniCard({ color, type, name, className = '', iconSize = 15, style }) {
  const bank = bankFor(name)
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden text-white shadow-sm ring-1 ring-white/40 ${className}`}
      style={{ background: cardBackground(color), ...style }}
    >
      <span className="pointer-events-none absolute -top-[30%] -right-[18%] aspect-square w-[70%] rounded-full bg-white/[.14]" />
      {bank ? (
        <BankLogo bank={bank} className="relative aspect-square h-[68%]" />
      ) : (
        type && <Icon name={TYPE_INFO[type]?.icon ?? 'card'} size={iconSize} strokeWidth={2} className="relative" />
      )}
    </span>
  )
}

// An account drawn as a bank card, in the onboarding style: color gradient, soft circles,
// type label at the top. `children` fills the card body; `corner` replaces the two dots.
export default function BankCard({ account, className = '', style, corner, children }) {
  const info = TYPE_INFO[account.type] ?? TYPE_INFO.debit
  const bank = bankFor(account.name)
  return (
    <div
      className={`relative overflow-hidden text-white ${className}`}
      style={{ background: cardBackground(account.color), ...style }}
    >
      <span className="pointer-events-none absolute -top-[35%] -right-[12%] aspect-square w-[60%] rounded-full bg-white/10" />
      <span className="pointer-events-none absolute -right-[18%] -bottom-[55%] aspect-square w-[70%] rounded-full bg-white/[.06]" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 font-semibold text-white/85">
          {bank ? (
            <BankLogo bank={bank} className="size-[1.9em]" />
          ) : (
            <Icon name={info.icon} size="1.15em" strokeWidth={2} className="shrink-0" />
          )}
          <span className="truncate">{info.label}</span>
        </span>
        {corner ?? (
          <span className="flex shrink-0">
            <span className="size-[1.5em] rounded-full bg-white/35" />
            <span className="-ml-[0.6em] size-[1.5em] rounded-full bg-white/20" />
          </span>
        )}
      </div>
      {children && <div className="relative">{children}</div>}
    </div>
  )
}
