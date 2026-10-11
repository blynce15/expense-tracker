import { useState } from 'react'
import { canPayFrom, checkOverdraft } from '../lib/balances'
import { checkGoals, savingsEffect } from '../lib/goals'
import { lookupCache } from '../lib/lookups'
import { centsToInput, formatCents, parseToCents } from '../lib/money'
import { dueLabel, isIncome, recordPayment } from '../lib/recurring'
import { AccountMark } from './BankCard'
import GoalPicker from './GoalPicker'
import Sheet from './Sheet'

// Confirms a recurring payment (or income received): the amount can be changed for bills that vary
export default function PaySheet({ payment, onClose, onPaid }) {
  const [amount, setAmount] = useState(centsToInput(payment.amount_cents))
  // Archived accounts can't be paid from; if the payment's own card was archived, start on the first active one
  const accounts = (lookupCache.lookups?.accounts ?? []).filter((a) => !a.archived && canPayFrom(a))
  const [accountId, setAccountId] = useState(() =>
    accounts.some((a) => a.id === payment.account_id) ? payment.account_id : (accounts[0]?.id ?? payment.account_id),
  )
  const [busy, setBusy] = useState(false)
  const [goalId, setGoalId] = useState(null) // when paid from / into savings; null = General savings
  const income = isIncome(payment)
  const type = income ? 'income' : 'expense'
  const fromSavings = savingsEffect(accounts, { type, amount_cents: 1, account_id: accountId }) !== 0
  const [error, setError] = useState(null)

  async function confirm() {
    const cents = parseToCents(amount)
    if (!cents) return setError('Enter the amount you paid, like 30 or 29,99.')
    setBusy(true)
    setError(null)
    try {
      const expense = { type, amount_cents: cents, account_id: accountId, goal_id: fromSavings ? goalId : null }
      const problem = await checkOverdraft(null, expense)
      if (problem) {
        setError(problem)
        setBusy(false)
        return
      }
      const goalIssue = await checkGoals(null, expense)
      if (goalIssue) {
        setError(goalIssue)
        setBusy(false)
        return
      }
      await recordPayment(payment, { amountCents: cents, accountId, goalId: expense.goal_id })
      onPaid()
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet title={`${payment.icon ?? ''} ${payment.name}`.trim()} onClose={onClose}>
        <div className="space-y-5">
          <p className="text-muted">
            {dueLabel(payment.next_due)}. This records it as {income ? 'income' : 'an expense'} and moves the next date forward.
          </p>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-muted">{income ? 'Amount received' : 'Amount paid'}</span>
            <div className="relative">
              <span className="absolute top-1/2 left-4 -translate-y-1/2 text-muted">€</span>
              <input
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="tabular w-full rounded-xl border border-line bg-card py-3 pr-4 pl-9 text-lg outline-none focus:border-cobalt"
              />
            </div>
          </label>

          {accounts.length > 1 && (
            <fieldset>
              <legend className="mb-1.5 text-sm font-medium text-muted">{income ? 'Paid into' : 'Paid from'}</legend>
              <div className="flex flex-wrap gap-2">
                {accounts.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAccountId(a.id)}
                    aria-pressed={accountId === a.id}
                    className={`flex h-10 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ${
                      accountId === a.id ? 'bg-cobalt text-white' : 'bg-card'
                    }`}
                  >
                    <AccountMark account={a} className="size-3 rounded-sm ring-1 ring-white/40" logoClass="size-5" />
                    {a.name}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {fromSavings && <GoalPicker goals={lookupCache.lookups?.goals ?? []} value={goalId} onChange={setGoalId} direction={income ? 1 : -1} />}

          {error && <p className="text-sm text-loss">{error}</p>}

          <button
            onClick={confirm}
            disabled={busy}
            className="w-full rounded-2xl bg-cobalt py-4 text-lg font-semibold text-white active:bg-cobalt-deep disabled:opacity-50"
          >
            Mark {formatCents(parseToCents(amount) ?? 0)} as {income ? 'received' : 'paid'}
          </button>
        </div>
      </Sheet>
    </>
  )
}
