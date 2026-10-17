import { describe, expect, test } from 'vitest'
import { balanceChanges, isInvest, overdraftProblem } from '../src/lib/balances'

const main = { id: 'main', name: 'Main card', type: 'debit', balance_cents: 10000 }
const savings = { id: 'sav', name: 'Savings', type: 'savings', balance_cents: 50000 }
const accounts = [main, savings]
const tx = (type, amount_cents, extra = {}) => ({ type, amount_cents, account_id: 'main', to_account_id: null, ...extra })
const changes = (before, after) => Object.fromEntries(balanceChanges(before, after))

describe('balanceChanges: how a transaction moves each balance', () => {
  test('income and Take out add, expense and Invest take away', () => {
    expect(changes(null, tx('income', 500))).toEqual({ main: 500 })
    expect(changes(null, tx('divest', 500))).toEqual({ main: 500 })
    expect(changes(null, tx('expense', 500))).toEqual({ main: -500 })
    expect(changes(null, tx('invest', 500))).toEqual({ main: -500 })
  })

  test('a transfer takes from one account and adds to the other', () => {
    expect(changes(null, tx('transfer', 2000, { to_account_id: 'sav' }))).toEqual({ main: -2000, sav: 2000 })
  })

  test('deleting undoes it, editing is the difference', () => {
    expect(changes(tx('expense', 500), null)).toEqual({ main: 500 })
    expect(changes(tx('expense', 500), tx('expense', 800))).toEqual({ main: -300 })
    // moved to another account
    expect(changes(tx('expense', 500), tx('expense', 500, { account_id: 'sav' }))).toEqual({ main: 500, sav: -500 })
  })

  test('isInvest spots Invest and Take out only', () => {
    expect(isInvest(tx('invest', 1))).toBe(true)
    expect(isInvest(tx('divest', 1))).toBe(true)
    expect(isInvest(tx('transfer', 1))).toBe(false)
    expect(isInvest(null)).toBe(false)
  })
})

describe('Money rule: no account below €0', () => {
  test('spending up to exactly the balance is fine, one cent more is refused', () => {
    expect(overdraftProblem(accounts, null, tx('expense', 10000))).toBeNull()
    expect(overdraftProblem(accounts, null, tx('expense', 10001))).toBe(
      'Not enough money in Main card: it has €100,00, so this would leave it at −€0,01.',
    )
  })

  test('Invest counts like spending, a transfer checks the account it leaves', () => {
    expect(overdraftProblem(accounts, null, tx('invest', 20000))).toMatch(/Not enough money in Main card/)
    expect(overdraftProblem(accounts, null, tx('transfer', 60000, { account_id: 'sav', to_account_id: 'main' }))).toMatch(
      /Not enough money in Savings/,
    )
    expect(overdraftProblem(accounts, null, tx('transfer', 50000, { account_id: 'sav', to_account_id: 'main' }))).toBeNull()
  })

  test('income, Take out and money arriving are always fine', () => {
    const broke = [{ ...main, balance_cents: -100 }]
    expect(overdraftProblem(broke, null, tx('income', 1))).toBeNull()
    expect(overdraftProblem(broke, null, tx('divest', 1))).toBeNull()
  })

  test('deleting income that the money was already spent from is refused', () => {
    const lowMain = [{ ...main, balance_cents: 300 }]
    expect(overdraftProblem(lowMain, tx('income', 1000), null)).toMatch(/would leave it at −€7,00/)
    expect(overdraftProblem(lowMain, tx('expense', 1000), null)).toBeNull() // deleting an expense gives money back
  })

  test('editing only checks the difference', () => {
    // €100 left; raising an existing €50 expense to €150 lowers it by €100 → exactly €0
    expect(overdraftProblem(accounts, tx('expense', 5000), tx('expense', 15000))).toBeNull()
    expect(overdraftProblem(accounts, tx('expense', 5000), tx('expense', 15001))).not.toBeNull()
  })

  test('a change that does not lower an account is allowed even if it is already below €0', () => {
    const broke = [{ ...main, balance_cents: -5000 }]
    expect(overdraftProblem(broke, tx('expense', 800), tx('expense', 500))).toBeNull()
  })

  test('the message never shows a negative "it has"', () => {
    const broke = [{ ...main, balance_cents: -5000 }]
    expect(overdraftProblem(broke, null, tx('expense', 100))).toBe(
      'Not enough money in Main card: it has €0,00, so this would leave it at −€51,00.',
    )
  })
})
