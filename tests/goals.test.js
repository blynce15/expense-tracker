import { describe, expect, test } from 'vitest'
import { goalProblem, holdings, savingsAccounts, savingsEffect, transactionGoalProblem } from '../src/lib/goals'

// Two savings accounts (€300 + €200 to start, all General savings) and a bank account
const accounts = [
  { id: 'main', name: 'Main card', type: 'debit', starting_balance_cents: 100000 },
  { id: 's1', name: 'Savings', type: 'savings', starting_balance_cents: 30000 },
  { id: 's2', name: 'Holiday pot', type: 'savings', starting_balance_cents: 20000 },
]
const goals = [
  { id: 'trip', name: 'Trip' },
  { id: 'car', name: 'Car' },
]
let n = 0
const tx = (type, amount_cents, account_id, to_account_id = null, goal_id = null) => ({ id: `t${n++}`, type, amount_cents, account_id, to_account_id, goal_id })
const move = (from_goal_id, to_goal_id, amount_cents) => ({ from_goal_id, to_goal_id, amount_cents })

// €400 into Trip, €100 into Car, then €50 taken out of Trip; €80 moved from Trip to General
const transactions = [
  tx('transfer', 40000, 'main', 's1', 'trip'),
  tx('transfer', 10000, 'main', 's2', 'car'),
  tx('transfer', 5000, 's1', 'main', 'trip'),
  tx('expense', 9999, 'main'), // not savings: no goal involved
]
const state = { accounts, goals, transactions, moves: [move('trip', null, 8000)] }

// What a goal holds (null = General savings)
const holds = (s, id) => holdings(s.accounts, s.transactions, s.moves).get(id) ?? 0

describe('savingsEffect: how much a transaction moves money in or out of savings', () => {
  test('in, out, and between two savings accounts', () => {
    expect(savingsEffect(accounts, tx('transfer', 500, 'main', 's1'))).toBe(500)
    expect(savingsEffect(accounts, tx('transfer', 500, 's1', 'main'))).toBe(-500)
    expect(savingsEffect(accounts, tx('transfer', 500, 's1', 's2'))).toBe(0)
    expect(savingsEffect(accounts, tx('expense', 500, 's1'))).toBe(-500)
    expect(savingsEffect(accounts, tx('income', 500, 's2'))).toBe(500)
    expect(savingsEffect(accounts, tx('invest', 500, 'main'))).toBe(0)
  })

  test('savingsAccounts leaves out archived ones', () => {
    expect(savingsAccounts([...accounts, { id: 'old', type: 'savings', archived: true }]).map((a) => a.id)).toEqual(['s1', 's2'])
  })
})

describe('Goals follow the real money', () => {
  test('each goal holds what its tagged transactions and moves put there', () => {
    expect(holds(state, 'trip')).toBe(40000 - 5000 - 8000) // €270
    expect(holds(state, 'car')).toBe(10000)
    // General = starting balances €500 + €80 moved back from Trip
    expect(holds(state, null)).toBe(50000 + 8000)
  })

  test('goals + General always equal the money in the savings accounts', () => {
    const inSavings = 50000 + 40000 + 10000 - 5000
    expect(holds(state, 'trip') + holds(state, 'car') + holds(state, null)).toBe(inSavings)
  })
})

describe('Money rule: no goal (General included) below €0', () => {
  test('taking more out of a goal than it holds is refused, exactly all of it is fine', () => {
    expect(transactionGoalProblem(state, null, tx('transfer', 27000, 's1', 'main', 'trip'))).toBeNull()
    expect(transactionGoalProblem(state, null, tx('transfer', 27001, 's1', 'main', 'trip'))).toBe(
      'Trip has €270,00, so this would leave it at −€0,01.',
    )
  })

  test('an untagged withdrawal comes out of General savings', () => {
    expect(transactionGoalProblem(state, null, tx('expense', 58000, 's1'))).toBeNull()
    expect(transactionGoalProblem(state, null, tx('expense', 58001, 's1'))).toMatch(/^General savings has €580,00/)
  })

  test('deleting the deposit a goal already spent is refused', () => {
    const deposit = state.transactions[1] // the €100 into Car
    const spent = { ...state, transactions: [...state.transactions, tx('transfer', 6000, 's2', 'main', 'car')] }
    expect(transactionGoalProblem(spent, deposit, null)).toMatch(/^Car has €40,00, so this would leave it at −€60,00/)
  })

  test('re-tagging a deposit moves its money to the other goal', () => {
    const deposit = state.transactions[0] // €400 into Trip
    expect(transactionGoalProblem(state, deposit, { ...deposit, goal_id: 'car' })).toMatch(/^Trip has €270,00/)
  })

  test('moves between goals are checked too', () => {
    expect(goalProblem(state, { moves: [...state.moves, move('car', 'trip', 10000)] })).toBeNull()
    expect(goalProblem(state, { moves: [...state.moves, move('car', 'trip', 10001)] })).toMatch(/^Car has €100,00/)
  })

  test('lowering a savings account’s starting balance takes it from General savings', () => {
    const lower = (cents) => accounts.map((a) => (a.id === 's2' ? { ...a, starting_balance_cents: cents } : a))
    expect(goalProblem(state, { accounts: lower(20000 - 58000) })).toBeNull()
    expect(goalProblem(state, { accounts: lower(20000 - 58001) })).toMatch(/^General savings/)
  })

  test('a change that only adds money is always fine', () => {
    expect(transactionGoalProblem(state, null, tx('transfer', 1, 'main', 's1', 'car'))).toBeNull()
  })
})
