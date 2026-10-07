import { formatCents } from '../lib/money'

// One transaction line: category icon, title, account, and signed amount.
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
      <span
        className="grid size-10 shrink-0 place-items-center rounded-xl text-lg"
        style={{ backgroundColor: isTransfer ? '#dce4f5' : `${category?.color ?? '#868e96'}22` }}
      >
        {isTransfer ? '⇄' : category?.icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{t.note || title}</span>
        <span className="block truncate text-sm text-muted">{t.note ? `${title} · ${subtitle}` : subtitle}</span>
      </span>
      <span className={`tabular shrink-0 font-display text-base font-semibold ${amountColor}`}>{amountText}</span>
    </>
  )
}
