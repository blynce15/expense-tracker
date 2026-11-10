import { describe, expect, it } from 'vitest'
import { buildMonthlyReport, isoDate, monthStats, monthsToReport, normalize, reportFileName } from '../scripts/monthly-report.mjs'

const tables = {
  accounts: [
    { id: 'main', name: 'Main card', type: 'debit', starting_balance_cents: '100000', archived: false },
    { id: 'save', name: 'Savings', type: 'savings', starting_balance_cents: '50000', archived: false },
  ],
  categories: [
    { id: 'food', name: 'Groceries', icon: '🛒', kind: 'expense' },
    { id: 'fun', name: 'Entertainment', icon: '🎬', kind: 'expense' },
    { id: 'pay', name: 'Salary', icon: '💼', kind: 'income' },
  ],
  recurring_payments: [{ name: 'Netflix', type: 'expense' }],
  savings_goals: [{ id: 'trip', name: 'Trip', icon: '✈️', target_cents: '100000', created_at: '2026-09-01T10:00:00Z' }],
  goal_moves: [{ from_goal_id: null, to_goal_id: 'trip', amount_cents: '20000', date: '2026-10-05' }],
  pension_entries: [{ date: '2026-10-31', value_cents: '500000', put_in_cents: '10000', company_put_in_cents: '5000' }],
  transactions: [
    // September
    { type: 'income', amount_cents: '200000', date: '2026-09-01', account_id: 'main', category_id: 'pay', note: 'Salary' },
    { type: 'expense', amount_cents: '100000', date: '2026-09-10', account_id: 'main', category_id: 'food', note: 'Continente' },
    // October
    { type: 'income', amount_cents: '200000', date: '2026-10-01', account_id: 'main', category_id: 'pay', note: 'Salary' },
    { type: 'expense', amount_cents: '30000', date: '2026-10-03', account_id: 'main', category_id: 'food', note: 'Continente' },
    { type: 'expense', amount_cents: '20000', date: '2026-10-10', account_id: 'main', category_id: 'food', note: 'continente ' },
    { type: 'expense', amount_cents: '1299', date: '2026-10-10', account_id: 'main', category_id: 'fun', note: 'Netflix' },
    { type: 'transfer', amount_cents: '40000', date: '2026-10-15', account_id: 'main', to_account_id: 'save', goal_id: 'trip' },
    { type: 'invest', amount_cents: '10000', date: '2026-10-20', account_id: 'main' },
    // November (not in October's report)
    { type: 'expense', amount_cents: '99999', date: '2026-11-02', account_id: 'main', category_id: 'fun', note: 'Cinema' },
  ],
}

describe('monthly report', () => {
  it('keeps the calendar day of dates from the database', () => {
    expect(isoDate(new Date(2026, 9, 1))).toBe('2026-10-01')
    expect(isoDate('2026-10-01')).toBe('2026-10-01')
  })

  it('adds up a month like the app: transfers and investing are not spending, kept = saved + invested', () => {
    const s = monthStats(normalize(tables), '2026-10')
    expect(s.income).toBe(200000)
    expect(s.spent).toBe(51299)
    expect(s.saved).toBe(40000)
    expect(s.invested).toBe(10000)
    expect(s.kept).toBe(50000)
    expect(s.rate).toBe(0.25)
  })

  it('writes the overview, categories, stats and month-end figures', () => {
    const md = buildMonthlyReport(tables, '2026-10', { createdOn: '2026-11-01' })
    expect(md).toContain('month: 2026-10')
    expect(md).toContain('spent: 512.99')
    expect(md).toContain('kept_rate: 25')
    expect(md).toContain('# October 2026')
    expect(md).toContain('A good month: you spent less and kept more than in September.')
    expect(md).toContain('| Spending | €512,99 | ▼ 49% |')
    expect(md).toContain('| Kept | €500,00 (25%) | ▲ 25 pts |')
    expect(md).toContain('| 🛒 Groceries | €500,00 | 97% | ▼ 50% |')
    expect(md).toContain('| 🎬 Entertainment | €12,99 | 3% | new |')
    expect(md).toContain('**No-spend days:** 29 of 31')
    expect(md).toContain('**Most visited:** Continente · 2 times, €500,00')
    expect(md).toContain('**Recurring payments:** 1 paid · €12,99')
    // Main: 1000 + 2000 − 1000 (Sep) + 2000 − 512,99 − 400 − 100 = 2987,01; Savings 500 + 400
    expect(md).toContain('Main card €2.987,01 · Savings €900,00')
    // Trip: 200 moved from General + 400 transfer tagged with it; General: 500 − 200
    expect(md).toContain('✈️ Trip €600,00 of €1.000,00 (60%) · General savings €300,00')
    expect(md).toContain('**Pension:** €5.000,00 (updated Sat 31 Oct, €150,00 put in)')
    expect(md).not.toContain('Cinema')
  })

  it('has no comparison column for the first month', () => {
    const md = buildMonthlyReport(tables, '2026-09')
    expect(md).not.toContain(' vs ')
    expect(md).toContain('> You spent €1.000,00 and kept 0% of your income.')
  })

  it('only reports finished months that have no note yet', () => {
    expect(monthsToReport(tables, [], '2026-11-10')).toEqual(['2026-09', '2026-10'])
    expect(monthsToReport(tables, [reportFileName('2026-09')], '2026-11-10')).toEqual(['2026-10'])
    expect(reportFileName('2026-10')).toBe('2026-10 October.md')
  })
})
