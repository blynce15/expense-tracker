import { formatCents } from '../lib/money'
import MerchantIcon from './MerchantIcon'

// One transaction line: shop logo or category icon, title, account, and signed amount.
export default function TransactionRow({ t, category, accountName }) {
  const isTransfer = t.type === 'transfer'
  const title = isTransfer ? 'Transfer' : (category?.name ?? 'No category')
  const subtitle = isTransfer
    ? `${accountName(t.account_id)} → ${accountName(t.to_account_id)}`
    : accountName(t.account_id)

  const amountText =
    t.type === 'expense' ? formatCents(-t.amount_cents) : t.type === 'income' ? `+${formatCents(t.amount_cents)}` : formatCents(t.amount_cents)
  const amountColor = t.type === 'income' ? 'text-gain' : t.type === 'transfer' ? 'text-muted' : 'text-ink'

  return (
    <>
      <MerchantIcon
        name={isTransfer ? null : t.note}
        className="size-10 rounded-xl text-lg"
        style={{ backgroundColor: isTransfer ? 'var(--color-line)' : `${category?.color ?? '#868e96'}22` }}
      >
        {isTransfer ? '⇄' : category?.icon}
      </MerchantIcon>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{t.note || title}</span>
        <span className="block truncate text-sm text-muted">{t.note ? `${title} · ${subtitle}` : subtitle}</span>
      </span>
      <span className={`tabular shrink-0 font-display text-base font-semibold ${amountColor}`}>{amountText}</span>
    </>
  )
}
