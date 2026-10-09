import { useCallback, useEffect, useState } from 'react'
import BankCard from '../components/BankCard'
import Icon from '../components/Icon'
import TransactionRow from '../components/TransactionRow'
import { formatDay, monthName, todayISO } from '../lib/dates'
import { formatCents } from '../lib/money'
import { supabase } from '../lib/supabase'
import { navigate } from '../lib/useRoute'
import TransactionDetails from './TransactionDetails'

const LIST_COUNT = 30
const HIDDEN = '€ ••••'

// One account, full screen: dark top with the account's card, then its latest transactions grouped by day.
export default function AccountPage({ account, monthFlow, lookups, hidden, onToggleHidden, onClose, onSeeAll, onChanged }) {
  const [list, setList] = useState(null)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`account_id.eq.${account.id},to_account_id.eq.${account.id}`)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(LIST_COUNT)
    if (error) setError(error.message)
    else setList(data)
  }, [account.id])

  useEffect(() => {
    load()
  }, [load])

  const accountName = (id) => lookups.accounts.find((a) => a.id === id)?.name ?? 'Unknown account'
  const category = (id) => lookups.categories.find((c) => c.id === id)
  const owed = account.type === 'credit'
  const [whole, decimals] = formatCents(account.balance_cents).split(',')

  // [["2026-10-09", [t, t]], ...] — already newest first
  const days = []
  for (const t of list ?? []) {
    const last = days[days.length - 1]
    if (last && last[0] === t.date) last[1].push(t)
    else days.push([t.date, [t]])
  }

  return (
    <div className="fixed inset-0 z-[25] overflow-y-auto bg-navy motion-safe:animate-[page-in_260ms_cubic-bezier(.2,.8,.2,1)]">
      <div className="pt-[env(safe-area-inset-top)]">
        <header className="flex h-14 items-center px-2 text-white">
          <button onClick={onClose} className="grid size-11 place-items-center rounded-full" aria-label="Back">
            <Icon name="chevronLeft" />
          </button>
          <h1 className="flex-1 truncate text-center font-display text-lg font-bold">{account.name}</h1>
          <button
            onClick={() => navigate('/settings/accounts')}
            className="grid size-11 place-items-center rounded-full text-white/80"
            aria-label="Edit accounts"
          >
            <Icon name="pencil" size={20} />
          </button>
        </header>

        <div className="px-5 pt-1">
          <BankCard
            account={account}
            className="h-[200px] rounded-[26px] p-5 text-sm shadow-[0_26px_40px_-22px_rgba(0,0,0,0.9)]"
            corner={
              <button
                onClick={onToggleHidden}
                className="flex items-center gap-1.5 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold text-white"
              >
                <Icon name={hidden ? 'eye' : 'eyeOff'} size={14} />
                {hidden ? 'Show' : 'Hide'}
              </button>
            }
          >
            <p className="mt-9 truncate text-lg font-semibold">{account.name}</p>
            <p className="text-xs text-white/70">{owed ? 'Owed today' : 'Balance today'}</p>
            <p className="tabular font-display leading-tight font-bold">
              {hidden ? (
                <span className="text-[32px]">{HIDDEN}</span>
              ) : (
                <>
                  <span className="text-[32px]">{whole}</span>
                  <span className="text-lg text-white/60">,{decimals}</span>
                </>
              )}
            </p>
          </BankCard>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <Flow label={`In · ${monthName(todayISO())}`} icon="arrowDown" cents={monthFlow.in} hidden={hidden} tone="text-[#5ee39a]" />
            <Flow label={`Out · ${monthName(todayISO())}`} icon="arrowUp" cents={monthFlow.out} hidden={hidden} tone="text-white" />
          </div>
        </div>

        <section className="relative mt-6 min-h-[60dvh] rounded-t-[30px] bg-paper px-4 pt-2 pb-[calc(7rem+max(env(safe-area-inset-bottom),12px))]">
          <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-line" />
          <div className="flex items-baseline justify-between px-1">
            <h2 className="font-display text-xl font-bold">Transactions</h2>
            {list?.length > 0 && (
              <button onClick={onSeeAll} className="text-sm font-semibold text-cobalt">
                See all
              </button>
            )}
          </div>

          {error && <p className="px-1 pt-4 text-loss">Couldn't load transactions: {error}</p>}
          {list?.length === 0 && (
            <p className="px-1 pt-4 text-muted">Nothing recorded on this account yet. Tap + to add the first one.</p>
          )}
          {days.map(([date, items]) => (
            <div key={date}>
              <p className="px-1 pt-4 pb-1.5 text-xs font-bold tracking-wider text-muted uppercase">{formatDay(date)}</p>
              <ul className="overflow-hidden rounded-[20px] bg-card">
                {items.map((t) => (
                  <li key={t.id} className="border-b border-line last:border-0">
                    <button onClick={() => setSelected(t)} className="flex w-full items-center gap-3 px-4 py-2 text-left">
                      <TransactionRow t={t} category={category(t.category_id)} accountName={accountName} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>

      {selected && (
        <TransactionDetails
          transaction={selected}
          onClose={() => setSelected(null)}
          onChanged={() => {
            load()
            onChanged()
          }}
        />
      )}
    </div>
  )
}

function Flow({ label, icon, cents, hidden, tone }) {
  return (
    <div className="rounded-2xl bg-white/[.07] px-3.5 py-2.5">
      <p className="flex items-center gap-1 text-xs text-white/60">
        <Icon name={icon} size={13} strokeWidth={2.4} />
        {label}
      </p>
      <p className={`tabular font-display text-base font-bold ${tone}`}>{hidden ? HIDDEN : formatCents(cents)}</p>
    </div>
  )
}
