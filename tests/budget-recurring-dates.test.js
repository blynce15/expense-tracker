import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { budgetPeriod, computeBudget, startDayOf } from '../src/lib/budget'
import { monthRange, shiftDays, todayISO } from '../src/lib/dates'
import { dateRange, isRecurring, recurringNameSet } from '../src/lib/filters'
import { daysUntil, dueLabel, monthlyCents, nextDueAfter } from '../src/lib/recurring'

// "Today" is fixed for these tests: Saturday 17 October 2026, midday
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 9, 17, 12, 0))
})
afterEach(() => vi.useRealTimers())

describe('dates', () => {
  test('today, shifting days across months and years, month ranges', () => {
    expect(todayISO()).toBe('2026-10-17')
    expect(shiftDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDays('2028-03-01', -1)).toBe('2028-02-29') // leap year
    expect(shiftDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(monthRange('2026-02-10')).toEqual(['2026-02-01', '2026-02-28'])
    expect(monthRange('2026-10-17')).toEqual(['2026-10-01', '2026-10-31'])
  })

  test('Transactions date filters', () => {
    expect(dateRange({ preset: 'thisMonth' })).toEqual(['2026-10-01', '2026-10-31'])
    expect(dateRange({ preset: 'lastMonth' })).toEqual(['2026-09-01', '2026-09-30'])
    expect(dateRange({ preset: 'last3' })).toEqual(['2026-08-01', '2026-10-31'])
    expect(dateRange({ preset: 'thisYear' })).toEqual(['2026-01-01', '2026-12-31'])
    expect(dateRange({ preset: 'all' })).toBeNull()
  })
})

describe('budget period (starts on payday)', () => {
  test('starts on the chosen day and ends the day before the next one', () => {
    expect(budgetPeriod('2026-10-17', 1)).toMatchObject({ start: '2026-10-01', end: '2026-10-31', days: 31, dayNumber: 17 })
    expect(budgetPeriod('2026-10-17', 25)).toMatchObject({ start: '2026-09-25', end: '2026-10-24', days: 30, dayNumber: 23 })
    expect(budgetPeriod('2026-10-25', 25)).toMatchObject({ start: '2026-10-25', dayNumber: 1 })
  })

  test('a 31st payday falls on the last day of shorter months', () => {
    expect(budgetPeriod('2026-10-17', 31)).toMatchObject({ start: '2026-09-30', end: '2026-10-30' })
    expect(budgetPeriod('2026-02-28', 31)).toMatchObject({ start: '2026-02-28', end: '2026-03-30' })
  })

  test('across the new year', () => {
    expect(budgetPeriod('2027-01-05', 20)).toMatchObject({ start: '2026-12-20', end: '2027-01-19' })
  })

  test('no saved day means the 1st', () => {
    expect(startDayOf(null)).toBe(1)
    expect(startDayOf({ budget_start_day: 25 })).toBe(25)
  })
})

describe('budget: money you can spend', () => {
  const period = budgetPeriod('2026-10-17', 15) // 15 Oct – 14 Nov, day 3
  const accounts = [
    { id: 'main', type: 'debit', balance_cents: 50000 },
    { id: 'cash', type: 'cash', balance_cents: 3000 },
    { id: 'meal', type: 'meal', balance_cents: 7000 },
    { id: 'sav', type: 'savings', balance_cents: 900000 },
    { id: 'old', type: 'debit', balance_cents: 0, archived: true },
  ]
  const spend = (date, amount_cents, account_id = 'main') => ({ date, amount_cents, account_id })

  test('left = bank + cash + meal card; savings are left out', () => {
    expect(computeBudget(accounts, [], period)).toMatchObject({ hasAccounts: true, leftCents: 60000, spentCents: 0, budgetCents: 60000 })
  })

  test('budget = what is left + what was already spent this period, day by day', () => {
    const b = computeBudget(accounts, [spend('2026-10-15', 1000), spend('2026-10-17', 500, 'meal'), spend('2026-10-16', 2000, 'sav')], period)
    expect(b.spentCents).toBe(1500) // the savings expense doesn't count
    expect(b.budgetCents).toBe(61500)
    expect(b.cumulative).toEqual([1000, 1000, 1500])
  })

  test('expenses outside the period are ignored', () => {
    expect(computeBudget(accounts, [spend('2026-10-14', 999)], period).spentCents).toBe(0)
  })
})

describe('recurring payments', () => {
  test('next due date keeps the start day, shortened in short months', () => {
    expect(nextDueAfter('2026-10-17', '2026-01-17', 'monthly')).toBe('2026-11-17')
    expect(nextDueAfter('2026-01-31', '2025-12-31', 'monthly')).toBe('2026-02-28')
    expect(nextDueAfter('2026-02-28', '2025-12-31', 'monthly')).toBe('2026-03-31') // back to the 31st
    expect(nextDueAfter('2026-12-15', '2026-01-15', 'monthly')).toBe('2027-01-15')
    expect(nextDueAfter('2026-12-29', '2026-12-29', 'weekly')).toBe('2027-01-05')
    expect(nextDueAfter('2028-02-29', '2028-02-29', 'yearly')).toBe('2029-02-28')
  })

  test('cost per month', () => {
    expect(monthlyCents({ frequency: 'monthly', amount_cents: 1299 })).toBe(1299)
    expect(monthlyCents({ frequency: 'weekly', amount_cents: 1000 })).toBe(4333) // × 52 / 12
    expect(monthlyCents({ frequency: 'yearly', amount_cents: 12000 })).toBe(1000)
  })

  test('days until due and the label', () => {
    expect(daysUntil('2026-10-17')).toBe(0)
    expect(daysUntil('2026-10-20')).toBe(3)
    expect(dueLabel('2026-10-17')).toBe('Due today')
    expect(dueLabel('2026-10-18')).toBe('Tomorrow')
    expect(dueLabel('2026-10-22')).toBe('5 days left')
    expect(dueLabel('2026-10-16')).toBe('1 day late')
    expect(dueLabel('2026-10-14')).toBe('3 days late')
  })

  test('a transaction is recurring when its name matches, ignoring case and spaces', () => {
    const names = recurringNameSet([{ name: 'Netflix ' }, { name: 'Salary' }])
    expect(isRecurring({ type: 'expense', note: 'netflix' }, names)).toBe(true)
    expect(isRecurring({ type: 'income', note: ' SALARY' }, names)).toBe(true)
    expect(isRecurring({ type: 'transfer', note: 'Netflix' }, names)).toBe(false)
    expect(isRecurring({ type: 'expense', note: 'Netflix gift card' }, names)).toBe(false)
    expect(isRecurring({ type: 'expense', note: null }, names)).toBe(false)
  })
})
