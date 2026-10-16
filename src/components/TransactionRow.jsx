import { formatCents } from '../lib/money'
import Icon from './Icon'
import MerchantIcon from './MerchantIcon'

// One transaction line: shop logo or category icon, title, account, and signed amount.
// `recurring`: a small violet ↻ badge on the icon (the name matches a recurring payment or income).
// Invest rows: teal ↗ (put in) or ↘ (taken out) tile, teal amount without a sign (it isn't spending or income).
export default function TransactionRow({ t, category, accountName, recurring = false }) {
  const isTransfer = t.type === 'transfer'
  const investing = t.type === 'invest' || t.type === 'divest'
  if (investing) {
    return (
      <>
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-teal/12 text-teal">
          <Icon name={t.type === 'divest' ? 'investOut' : 'invest'} size={20} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-medium">{t.note || 'Investing'}</span>
          <span className="block truncate text-sm text-muted">
            {t.type === 'divest' ? `Taken out · to ${accountName(t.account_id)}` : `Invested · ${accountName(t.account_id)}`}
          </span>
        </span>
        <span className="tabular shrink-0 font-display text-base font-semibold text-teal">{formatCents(t.amount_cents)}</span>
      </>
    )
  }
  const title = isTransfer ? 'Transfer' : (category?.name ?? 'No category')
  const subtitle = isTransfer
    ? `${accountName(t.account_id)} → ${accountName(t.to_account_id)}`
    : accountName(t.account_id)

  const amountText =
    t.type === 'expense' ? formatCents(-t.amount_cents) : t.type === 'income' ? `+${formatCents(t.amount_cents)}` : formatCents(t.amount_cents)
  const amountColor = t.type === 'income' ? 'text-gain' : t.type === 'transfer' ? 'text-muted' : 'text-ink'

  return (
    <>
      <span className="relative shrink-0">
        <MerchantIcon
          name={isTransfer ? null : t.note}
          className="size-10 rounded-xl text-lg"
          style={{ backgroundColor: isTransfer ? 'var(--color-line)' : `${category?.color ?? '#868e96'}22` }}
        >
          {isTransfer ? '⇄' : category?.icon}
        </MerchantIcon>
        {recurring && (
          <span className="absolute -right-1.5 -bottom-1.5 grid size-[19px] place-items-center rounded-full bg-violet text-white ring-[2.5px] ring-card" title="Recurring">
            <Icon name="repeat" size={10} strokeWidth={3} />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-medium">{t.note || title}</span>
        <span className="block truncate text-sm text-muted">{t.note ? `${title} · ${subtitle}` : subtitle}</span>
      </span>
      <span className={`tabular shrink-0 font-display text-base font-semibold ${amountColor}`}>{amountText}</span>
    </>
  )
}
