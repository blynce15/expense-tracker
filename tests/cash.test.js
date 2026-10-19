import { describe, expect, test } from 'vitest'
import { cashOn, cashTotal, formatIn, toEuroCents, updatedText, withAmount } from '../src/lib/cash'

const eur = { id: 'a', currency: 'EUR', cents: 174600, history: [{ date: '2026-09-10', cents: 100000 }, { date: '2026-10-16', cents: 174600 }] }
const usd = { id: 'b', currency: 'USD', cents: 120000, history: [{ date: '2026-10-19', cents: 120000 }] }

describe('cash at the brokers in euros', () => {
  test('dollars at the rate, rounded to whole cents', () => {
    expect(toEuroCents(120000, 'USD', 0.92039)).toBe(110447)
    expect(toEuroCents(120000, 'EUR', 0.92)).toBe(120000)
  })
  test('without a rate, dollars count as nothing (never as euros)', () => {
    expect(toEuroCents(120000, 'USD', null)).toBe(0)
    expect(cashTotal([eur, usd], null)).toBe(174600)
  })
  test('total = euros + dollars converted', () => expect(cashTotal([eur, usd], 0.92039)).toBe(174600 + 110447))
  test('no entries = €0', () => expect(cashTotal([], 0.9)).toBe(0))
})

describe('cash on a past day uses what was there then', () => {
  test('before any entry: nothing', () => expect(cashOn([eur, usd], '2026-08-31', 1)).toBe(0))
  test('between two amounts: the older one', () => expect(cashOn([eur, usd], '2026-09-30', 1)).toBe(100000))
  test('on the day of a change: the new one', () => expect(cashOn([eur], '2026-10-16', 1)).toBe(174600))
  test('today: everything', () => expect(cashOn([eur, usd], '2026-10-19', 0.5)).toBe(174600 + 60000))
})

describe('changing an amount', () => {
  test('a new entry starts its history today', () => {
    const e = withAmount(null, { name: ' Trade Republic ', currency: 'EUR', cents: 5000 }, '2026-10-19')
    expect(e).toMatchObject({ name: 'Trade Republic', currency: 'EUR', cents: 5000, history: [{ date: '2026-10-19', cents: 5000 }] })
    expect(e.id).toBeTruthy()
  })
  test('a second change on the same day replaces that day', () => {
    const e = withAmount(eur, { currency: 'EUR', cents: 2000 }, '2026-10-16')
    expect(e.history).toEqual([{ date: '2026-09-10', cents: 100000 }, { date: '2026-10-16', cents: 2000 }])
    expect(e.id).toBe('a')
  })
  test('a later change is added', () => expect(withAmount(eur, { currency: 'EUR', cents: 0 }, '2026-10-19').history).toHaveLength(3))
  test('switching currency starts a fresh history (old amounts were in the other currency)', () =>
    expect(withAmount(eur, { currency: 'USD', cents: 900 }, '2026-10-19').history).toEqual([{ date: '2026-10-19', cents: 900 }]))
  test('empty name = none', () => expect(withAmount(null, { name: '  ', currency: 'EUR', cents: 1 }).name).toBeNull())
})

test('labels', () => {
  expect(formatIn(120000, 'USD')).toBe('$1.200,00')
  expect(formatIn(120000, 'EUR')).toBe('€1.200,00')
  expect(updatedText(eur, '2026-10-19')).toBe('Updated 3 days ago')
  expect(updatedText(usd, '2026-10-19')).toBe('Updated today')
  expect(updatedText(eur, '2026-10-17')).toBe('Updated yesterday')
})
