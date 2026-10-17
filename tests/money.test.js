import { describe, expect, test } from 'vitest'
import { centsToInput, centsToPad, formatCents, formatTyping, MAX_CENTS, parseToCents, pressKey } from '../src/lib/money'

describe('formatCents: European style, always from whole cents', () => {
  test.each([
    [0, '€0,00'],
    [5, '€0,05'],
    [123456, '€1.234,56'],
    [100000000, '€1.000.000,00'],
    [-500, '−€5,00'],
    [MAX_CENTS, '€9.999.999,99'],
  ])('%i → %s', (cents, text) => expect(formatCents(cents)).toBe(text))
})

describe('parseToCents: typed amounts → cents', () => {
  test.each([
    ['12,5', 1250],
    ['12.50', 1250],
    ['1.234,56', 123456],
    ['2.100', 210000], // dots in groups of three are thousands
    ['€ 7', 700],
    ['0,01', 1],
    ['9.999.999,99', MAX_CENTS],
  ])('"%s" → %i', (text, cents) => expect(parseToCents(text)).toBe(cents))

  test.each(['', 'abc', '1,234', '-5', '12.345.6', '10.000.000'])('"%s" is refused', (text) =>
    expect(parseToCents(text)).toBeNull(),
  )

  test('never uses floating-point maths (0,29 stays 29 cents)', () => {
    expect(parseToCents('0,29')).toBe(29)
    expect(parseToCents('1,13')).toBe(113)
  })
})

describe('number pad', () => {
  test('typing builds the amount, at most 2 decimals and 7 digits', () => {
    const type = (keys) => keys.reduce(pressKey, '')
    expect(type(['1', '2', '.', '5', '0'])).toBe('12.50')
    expect(type(['1', '.', '2', '3', '4'])).toBe('1.23')
    expect(type(['9', '9', '9', '9', '9', '9', '9', '9'])).toBe('9999999')
    expect(type(['.', '5'])).toBe('0.5')
    expect(type(['0', '7'])).toBe('7')
    expect(type(['1', '2', 'back'])).toBe('1')
  })

  test('shown with European separators while typing', () => {
    expect(formatTyping('1234.5')).toBe('1.234,5')
    expect(formatTyping('')).toBe('0')
  })

  test('cents back to pad text and input text', () => {
    expect(centsToPad(1250)).toBe('12.5')
    expect(centsToPad(1205)).toBe('12.05')
    expect(centsToPad(1200)).toBe('12')
    expect(centsToInput(-1250)).toBe('12,50')
  })
})
