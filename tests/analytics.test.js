import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { buildAnalytics, placesFrom, shiftMonth, shiftPeriod, verdictOf } from '../src/lib/analytics'

// "Today" is Saturday 17 October 2026: October is still running, September is a full month
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0))
})
afterEach(() => vi.useRealTimers())

const accounts = [
  { id: 'main', name: 'Main card', type: 'debit', balance_cents: 100000 },
  { id: 'sav', name: 'Savings', type: 'savings', balance_cents: 20000 },
]
const recurring = [
  { id: 'r1', name: 'Netflix', type: 'expense', frequency: 'monthly', amount_cents: 1299, active: true },
  { id: 'r2', name: 'Salary', type: 'income', frequency: 'monthly', amount_cents: 200000, active: true },
]
const t = (date, type, amount_cents, extra = {}) => ({ date, type, amount_cents, account_id: 'main', to_account_id: null, category_id: null, note: null, goal_id: null, ...extra })
const rows = [
  // September (a full month)
  t('2026-09-01', 'income', 200000, { note: 'Salary', category_id: 'pay' }),
  t('2026-09-02', 'transfer', 30000, { to_account_id: 'sav', goal_id: 'trip' }),
  t('2026-09-03', 'invest', 10000),
  t('2026-09-05', 'expense', 50000, { category_id: 'food', note: 'Continente' }),
  t('2026-09-10', 'expense', 1299, { category_id: 'fun', note: 'Netflix' }),
  t('2026-09-25', 'expense', 7000, { category_id: 'food', note: 'Lidl' }), // after the 17th: not in "Sep by then"
  // October so far
  t('2026-10-01', 'income', 200000, { note: 'Salary', category_id: 'pay' }),
  t('2026-10-05', 'expense', 20000, { category_id: 'food', note: 'Continente' }),
  t('2026-10-06', 'transfer', 10000, { account_id: 'sav', to_account_id: 'main' }), // out of General savings
  t('2026-10-07', 'divest', 4000),
  t('2026-10-10', 'expense', 1299, { category_id: 'fun', note: 'netflix ' }),
]
const october = { kind: 'month', key: '2026-10' }
const a = () => buildAnalytics(october, accounts, recurring, rows)

describe('periods', () => {
  test('months and years step correctly across the new year', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', -12)).toBe('2025-10')
    expect(shiftPeriod({ kind: 'year', key: '2026' }, -1)).toEqual({ kind: 'year', key: '2025' })
  })
})

describe('Analytics: this month', () => {
  test('income and spending; transfers and investing are neither', () => {
    expect(a().totals).toEqual({ income: 200000, spent: 21299, saved: -10000, invested: -4000 })
  })

  test('kept = net money into savings + net invested, as a share of income', () => {
    expect(a().saving.kept).toBe(-14000)
    expect(a().saving.rate).toBeCloseTo(-0.07)
    // usual rate: full months with income only (September: €300 saved + €100 invested of €2.000)
    expect(a().saving.avgRate).toBeCloseTo(0.2)
  })

  test('the month before is compared only up to the same day', () => {
    expect(a().compare.spent).toBe(51299) // 5 and 10 Sep, not the 25th
  })

  test('per day, on track, fixed bills (named like a recurring payment, any case)', () => {
    const s = a().spending
    expect(s.perDay).toBeCloseTo(21299 / 17)
    expect(s.onTrack).toBe(Math.round((21299 / 17) * 31))
    expect(s.fixed).toBe(1299)
    expect(s.biggestDay).toEqual({ date: '2026-10-05', cents: 20000 })
  })

  test('categories with the month before by the same day', () => {
    expect(a().categories).toEqual([
      { id: 'food', cents: 20000, prev: 50000 },
      { id: 'fun', cents: 1299, prev: 1299 },
    ])
  })

  test('usual month = average of full months with activity', () => {
    expect(a().avgIn).toBe(200000)
    expect(a().avgOut).toBe(58299)
    expect(a().activeMonths).toEqual(['2026-09'])
  })

  test('net worth: change this month = income − spending − money invested', () => {
    const w = a().worth
    expect(w.now).toBe(120000)
    expect(w.end).toBe(120000)
    expect(w.change).toBe(200000 - 21299 + 4000)
    expect(w.bank).toBe(100000)
    expect(w.savings).toBe(20000)
    expect(w.line.at(-1)).toEqual({ key: '2026-10', cents: 120000 })
    expect(w.line.at(-2)).toEqual({ key: '2026-09', cents: 120000 - (200000 - 21299 + 4000) })
  })

  test('where kept money went, by savings goal (untagged = General savings)', () => {
    expect(Object.fromEntries(a().flowByGoal)).toEqual({ general: -10000 })
    const sep = buildAnalytics({ kind: 'month', key: '2026-09' }, accounts, recurring, rows)
    expect(Object.fromEntries(sep.flowByGoal)).toEqual({ trip: 30000 })
    expect(sep.keepAccounts).toMatchObject([{ id: 'sav', flow: 30000, balance: 20000 }])
  })

  test('what recurring payments cost per month (income left out)', () => {
    expect(a().recurringMonthly).toBe(1299)
  })

  test('the verdict compares with the usual month scaled to the days passed', () => {
    const v = verdictOf(a())
    expect(v.spending.usual).toBe(Math.round(58299 * (17 / 31)))
    expect(v.kept.change).toBeCloseTo(-0.27)
    expect(v.sentence).toBe('A lighter month: you spent less than usual.')
  })
})

describe('Analytics: the year', () => {
  test('adds up the months so far, compares with last year by the same day', () => {
    const y = buildAnalytics({ kind: 'year', key: '2026' }, accounts, recurring, rows)
    expect(y.totals).toEqual({ income: 400000, spent: 79598, saved: 20000, invested: 6000 })
    expect(y.compare.spent).toBe(0)
    expect(y.days).toEqual({ total: 365, passed: 290 })
  })
})

describe('places', () => {
  test('grouped by name ignoring case and spaces, biggest first', () => {
    const p = placesFrom(rows.filter((r) => r.type === 'expense'))
    expect(p[0]).toMatchObject({ name: 'Continente', cents: 70000, count: 2 })
    expect(p.find((x) => x.name === 'Netflix')).toMatchObject({ cents: 2598, count: 2 })
  })
})
