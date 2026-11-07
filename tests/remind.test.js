import { describe, expect, test } from 'vitest'
import { reminderText } from '../api/remind.js'

// The wording of the morning-before payment reminders (owner chose "Simple 1")
describe('payment reminder text', () => {
  const netflix = { name: 'Netflix', icon: '🎬', amount_cents: 1299 }
  const spotify = { name: 'Spotify', icon: '🎵', amount_cents: 1099 }
  const uber = { name: 'Uber', icon: '🚕', amount_cents: 1850 }

  test('one payment: emoji, name and amount, then "Tomorrow"', () => {
    expect(reminderText([netflix], false)).toEqual({ title: '🎬 Netflix · €12,99', body: 'Tomorrow' })
    expect(reminderText([{ name: 'Rent', icon: null, amount_cents: 85000 }], false)).toEqual({ title: 'Rent · €850', body: 'Tomorrow' })
  })

  test('several on one day: count and total, then the names', () => {
    expect(reminderText([netflix, spotify, uber], false)).toEqual({ title: '3 payments · €42,48', body: 'Tomorrow: Netflix, Spotify, Uber' })
  })

  test('income gets a plus, round amounts lose ",00"', () => {
    expect(reminderText([{ name: 'Salary', icon: '💼', amount_cents: 210000 }], true)).toEqual({ title: '💼 Salary · +€2.100', body: 'Tomorrow' })
    expect(reminderText([{ name: 'Salary', amount_cents: 210000 }, { name: 'Rent received', amount_cents: 50050 }], true)).toEqual({
      title: '2 incomes · +€2.600,50',
      body: 'Tomorrow: Salary, Rent received',
    })
  })
})
