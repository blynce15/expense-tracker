import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildAnalytics } from '../src/lib/analytics'
import { netWorthOf } from '../src/lib/networth'

// "Today" is 17 October 2026
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0))
})
afterEach(() => vi.useRealTimers())

const accounts = [
  { id: 'main', name: 'Main card', type: 'debit', balance_cents: 100000 },
  { id: 'sav', name: 'Savings', type: 'savings', balance_cents: 50000 },
]
const t = (date, type, amount_cents, extra = {}) => ({
  date,
  type,
  amount_cents,
  account_id: 'main',
  to_account_id: null,
  category_id: null,
  note: null,
  goal_id: null,
  ...extra,
})
const rows = [
  t('2026-09-01', 'income', 200000),
  t('2026-10-01', 'income', 100000),
  t('2026-10-02', 'transfer', 20000, { to_account_id: 'sav' }),
  t('2026-10-03', 'invest', 30000),
]
const a = () => buildAnalytics({ kind: 'month', key: '2026-10' }, accounts, [], rows)
const portfolio = {
  value_cents: 80000,
  history: [{ date: '2026-09-30', cents: 45000 }],
}
const pension = [
  { date: '2026-08-31', value_cents: 10000 },
  { date: '2026-09-30', value_cents: 12000 },
]

describe('net worth with investments and pension', () => {
  test('today: accounts, savings, investments (getquin + broker cash), pension', () => {
    const cash = [
      {
        id: 'c',
        currency: 'EUR',
        cents: 5000,
        history: [{ date: '2026-10-05', cents: 5000 }],
      },
    ]
    const w = netWorthOf(a(), { portfolio, since: '2026-09-01', cash, rate: null }, pension)
    expect(w.parts).toEqual({
      accounts: 100000,
      savings: 50000,
      investments: 85000,
      pension: 12000,
    })
    expect(w.end).toBe(100000 + 50000 + 85000 + 12000)
    expect(w.hasInvestments).toBe(true)
  })

  test('back in time: savings without later transfers, getquin history, cash entered by then, last pension entry', () => {
    const cash = [
      {
        id: 'c',
        currency: 'EUR',
        cents: 5000,
        history: [{ date: '2026-10-05', cents: 5000 }],
      },
    ]
    const w = netWorthOf(a(), { portfolio, since: '2026-09-01', cash, rate: null }, pension)
    const sep = w.line.find((p) => p.key === '2026-09')
    // End of September: total accounts = 150.000 − (100.000 income − 30.000 invested in October) = 80.000,
    // of which savings = 50.000 − 20.000 moved in during October = 30.000
    expect(sep.parts).toEqual({
      accounts: 50000,
      savings: 30000,
      investments: 45000,
      pension: 12000,
    })
    expect(sep.cents).toBe(137000)
    const aug = w.line.find((p) => p.key === '2026-08')
    expect(aug.parts).toEqual({
      accounts: -150000,
      savings: 30000,
      investments: 0,
      pension: 10000,
    })
  })

  test('change this month and over the line, per part', () => {
    const w = netWorthOf(a(), {}, [])
    expect(w.change).toBe(100000 - 30000)
    expect(w.partChange.savings).toBe(50000 - 30000)
    expect(w.hasInvestments).toBe(false)
  })
})
