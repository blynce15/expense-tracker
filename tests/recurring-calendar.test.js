import { describe, expect, test } from 'vitest'
import { dueDaysInMonth } from '../src/lib/recurring'

describe('which days of a month a recurring entry falls on', () => {
  test('monthly: the start day, the 31st as the last day of a short month', () => {
    expect(dueDaysInMonth({ frequency: 'monthly', start_date: '2026-01-15', next_due: '2026-12-15' }, '2026-11')).toEqual([15])
    expect(dueDaysInMonth({ frequency: 'monthly', start_date: '2026-01-31', next_due: '2026-12-31' }, '2026-11')).toEqual([30])
  })
  test('due this month: on its due date', () => {
    expect(dueDaysInMonth({ frequency: 'monthly', start_date: '2026-01-19', next_due: '2026-11-18' }, '2026-11')).toEqual([18])
  })
  test('weekly: every 7 days in step with the next due date, also before it', () => {
    expect(dueDaysInMonth({ frequency: 'weekly', start_date: '2026-10-07', next_due: '2026-11-11' }, '2026-11')).toEqual([4, 11, 18, 25])
  })
  test('yearly: only in its month', () => {
    const p = { frequency: 'yearly', start_date: '2025-11-27', next_due: '2026-11-27' }
    expect(dueDaysInMonth(p, '2026-11')).toEqual([27])
    expect(dueDaysInMonth(p, '2026-12')).toEqual([])
  })
  test('nothing before the start date', () => {
    expect(dueDaysInMonth({ frequency: 'monthly', start_date: '2026-12-05', next_due: '2026-12-05' }, '2026-11')).toEqual([])
    expect(dueDaysInMonth({ frequency: 'weekly', start_date: '2026-11-11', next_due: '2026-11-11' }, '2026-11')).toEqual([11, 18, 25])
  })
})
