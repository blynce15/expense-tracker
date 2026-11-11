import { describe, expect, it } from 'vitest'
import { buildEmailHtml, emailSubject } from '../scripts/email-report.mjs'
import { dueDatesBetween, summarizeMonth } from '../scripts/monthly-report.mjs'

const tables = {
  accounts: [
    { id: 'main', name: 'Main card', type: 'debit', starting_balance_cents: '100000', color: '#1f4fe0', archived: false },
    { id: 'save', name: 'Savings', type: 'savings', starting_balance_cents: '0', color: '#2b8a3e', archived: false },
  ],
  categories: [
    { id: 'food', name: 'Groceries', icon: '🛒', color: '#1f9d55', kind: 'expense' },
    { id: 'fun', name: 'Fun & games', icon: '🎮', color: '#7c4dff', kind: 'expense' },
    { id: 'pay', name: 'Salary', icon: '💼', color: '#2b8a3e', kind: 'income' },
  ],
  recurring_payments: [
    { name: 'Netflix', icon: '🎬', type: 'expense', amount_cents: '1299', frequency: 'monthly', start_date: '2026-09-10', next_due: '2026-11-10', active: true },
    { name: 'Salary', icon: '💼', type: 'income', amount_cents: '200000', frequency: 'monthly', start_date: '2026-01-31', next_due: '2026-11-30', active: true },
    { name: 'Gym', icon: '🏋️', type: 'expense', amount_cents: '1000', frequency: 'weekly', start_date: '2026-10-05', next_due: '2026-11-02', active: true },
    { name: 'Old', icon: '❌', type: 'expense', amount_cents: '500', frequency: 'monthly', start_date: '2026-01-01', next_due: '2026-11-01', active: false },
  ],
  savings_goals: [],
  goal_moves: [],
  pension_entries: [],
  transactions: [
    { type: 'income', amount_cents: '200000', date: '2026-10-31', account_id: 'main', category_id: 'pay', note: 'Salary' },
    { type: 'expense', amount_cents: '4000', date: '2026-10-03', account_id: 'main', category_id: 'food', note: 'Continente' },
    { type: 'expense', amount_cents: '1299', date: '2026-10-10', account_id: 'main', category_id: 'fun', note: 'Netflix' },
    { type: 'transfer', amount_cents: '50000', date: '2026-10-31', account_id: 'main', to_account_id: 'save' },
  ],
}

describe('email report', () => {
  it('finds next month’s due dates for monthly, weekly and end-of-month entries', () => {
    const [netflix, salary, gym] = tables.recurring_payments
    expect(dueDatesBetween(netflix, '2026-11-01', '2026-11-30')).toEqual(['2026-11-10'])
    expect(dueDatesBetween(salary, '2026-12-01', '2026-12-31')).toEqual(['2026-12-31'])
    expect(dueDatesBetween({ ...salary, next_due: '2026-01-31' }, '2026-02-01', '2026-02-28')).toEqual(['2026-02-28'])
    expect(dueDatesBetween(gym, '2026-11-01', '2026-11-30')).toEqual(['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'])
  })

  it('summarizes money in, recurring paid and coming up', () => {
    const s = summarizeMonth(tables, '2026-10')
    expect(s.incomeSources).toEqual([expect.objectContaining({ name: 'Salary', cents: 200000, accounts: ['Main card'] })])
    expect(s.recurring.paid).toEqual([expect.objectContaining({ name: 'Netflix', cents: 1299 })])
    expect(s.recurring.comingUp.map((c) => `${c.date} ${c.name}`)).toEqual([
      '2026-11-02 Gym',
      '2026-11-09 Gym',
      '2026-11-10 Netflix',
      '2026-11-16 Gym',
      '2026-11-23 Gym',
      '2026-11-30 Gym',
      '2026-11-30 Salary',
    ]) // same day: by name
    // Netflix €12,99 + Gym €10 × 52 / 12 = €43,33; inactive and income entries left out
    expect(s.recurring.monthlyCents).toBe(1299 + 4333)
    expect(s.savedInto).toEqual(['Savings'])
  })

  it('builds the subject and the email', () => {
    const s = summarizeMonth(tables, '2026-10')
    expect(emailSubject(s)).toBe('October 2026 · You kept €500 (25%)')
    const { subject, html } = buildEmailHtml(tables, '2026-10')
    expect(subject).toBe(emailSubject(s))
    expect(html).toContain('cid:logo-white')
    expect(html).toContain('October 2026')
    expect(html).toContain('Where your income went')
    expect(html).toContain('Every day of October')
    expect(html).toContain('Fun &amp; games') // names are escaped
    expect(html).toContain('Coming up in November')
    expect(html).toContain('On 31 October')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('NaN')
  })

  it('says what was spent when there was no income', () => {
    const noIncome = { ...tables, transactions: tables.transactions.filter((t) => t.type !== 'income') }
    expect(emailSubject(summarizeMonth(noIncome, '2026-10'))).toBe('October 2026 · You spent €52,99')
    const { html } = buildEmailHtml(noIncome, '2026-10')
    expect(html).not.toContain('Where your income went')
    expect(html).not.toContain('NaN')
  })
})
