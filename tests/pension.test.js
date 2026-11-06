import { describe, expect, test, vi } from 'vitest'

vi.mock('../src/lib/profile', () => ({ fetchProfile: async () => null, savePensionFund: async () => {} }))
const { entryForMonth, isPensionDue, pensionSummary, pensionValueOn } = await import('../src/lib/pension')

// Starting point in June (everything put in before LynxOS), then monthly updates
const entries = [
  { id: 'oct', date: '2026-10-31', value_cents: 1262400, put_in_cents: 15000, units: '2512.4' },
  { id: 'jun', date: '2026-06-30', value_cents: 1180000, put_in_cents: 1150000, units: '2391.2' },
  { id: 'jul', date: '2026-07-31', value_cents: 1214000, put_in_cents: 15000, units: '2421.5' },
  { id: 'aug', date: '2026-08-31', value_cents: 1209500, put_in_cents: 15000, units: '2451.9' },
  { id: 'sep', date: '2026-09-30', value_cents: 1238000, put_in_cents: 15000, units: '2482.0' },
]

describe('pension summary', () => {
  const s = pensionSummary(entries, '2026-11-06')
  test('value, money put in and gain', () => {
    expect(s.value).toBe(1262400)
    expect(s.putIn).toBe(1210000)
    expect(s.gain).toBe(52400)
    expect(s.rate).toBeCloseTo(52400 / 1210000)
  })
  test('this year leaves out the money added (base = first entry when none before 1 January)', () => {
    // 1.262.400 − 1.180.000 − 60.000 added = 22.400
    expect(s.year.cents).toBe(22400)
    expect(s.year.rate).toBeCloseTo(22400 / 1240000)
  })
  test('this year starts from the last entry of the year before', () => {
    const t = pensionSummary([...entries, { date: '2025-12-31', value_cents: 1000000, put_in_cents: 0, units: '2100' }], '2026-11-06')
    // from 1.000.000: 1.262.400 − 1.000.000 − (1.150.000 + 4 × 15.000) is negative: the June entry counts as money added
    expect(t.year.since).toBe('2025-12-31')
    expect(t.unitsAdded).toBeCloseTo(412.4)
  })
  test('price per unit and its change since the first entry', () => {
    expect(s.perUnit).toBeCloseTo(1262400 / 2512.4)
    expect(s.perUnitChange).toBeCloseTo(1262400 / 2512.4 / (1180000 / 2391.2) - 1)
    expect(s.units).toBe(2512.4)
    expect(s.unitsAdded).toBeCloseTo(121.2)
  })
  test('history newest first with each month’s growth (change − money added)', () => {
    expect(s.history.map((h) => h.id)).toEqual(['oct', 'sep', 'aug', 'jul', 'jun'])
    expect(s.history[0].growth).toBe(1262400 - 1238000 - 15000)
    expect(s.history[2].growth).toBe(1209500 - 1214000 - 15000) // a month that lost value
    expect(s.history.at(-1)).toMatchObject({ start: true, growth: null })
  })
  test('no entries = no pension', () => expect(pensionSummary([])).toBeNull())
})

describe('monthly update', () => {
  test('due when this month has no entry', () => {
    expect(isPensionDue(entries, '2026-11-01')).toBe(true)
    expect(isPensionDue(entries, '2026-10-15')).toBe(false)
  })
  test('never due without a pension', () => expect(isPensionDue([], '2026-11-01')).toBe(false))
  test('one entry per month: the month’s entry is found to change it', () => {
    expect(entryForMonth(entries, '2026-09-02').id).toBe('sep')
    expect(entryForMonth(entries, '2026-11-02')).toBeNull()
  })
})

describe('pension in net worth', () => {
  test('the latest value on or before the day', () => {
    expect(pensionValueOn(entries, '2026-09-30')).toBe(1238000)
    expect(pensionValueOn(entries, '2026-10-15')).toBe(1238000)
    expect(pensionValueOn(entries, '2026-12-31')).toBe(1262400)
  })
  test('nothing before the first entry', () => expect(pensionValueOn(entries, '2026-05-31')).toBe(0))
})
