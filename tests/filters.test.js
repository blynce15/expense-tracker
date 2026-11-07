import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { activeFilterCount, applyFilter, describeDate, EMPTY_FILTER, kindsOf, monthStrip, usesCategories, usesRecurring } from '../src/lib/filters'

// "Today" is fixed: Saturday 7 November 2026
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 7, 12, 0))
})
afterEach(() => vi.useRealTimers())

// A tiny stand-in for a Supabase query: it runs the conditions applyFilter adds on rows in memory
// (in, ilike with % and _, is, gte, lte, and or(...) with nested and(...), the way PostgREST reads them)
function fakeQuery(rows) {
  const tests = []
  const like = (pattern) =>
    new RegExp(`^${pattern.replace(/\\(.)|([%_])|([^\\%_]+)/g, (m, esc, wild, lit) => (esc ?? lit ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&') || (wild === '%' ? '.*' : '.'))}$`, 'is')
  const split = (s) => {
    const out = []
    let depth = 0, quoted = false, cur = ''
    for (let i = 0; i < s.length; i++) {
      const c = s[i]
      if (c === '\\' && quoted) { cur += c + s[++i]; continue }
      if (c === '"') quoted = !quoted
      if (!quoted && c === '(') depth++
      if (!quoted && c === ')') depth--
      if (!quoted && !depth && c === ',') { out.push(cur); cur = '' } else cur += c
    }
    return cur ? [...out, cur] : out
  }
  const cond = (r, c) => {
    const group = c.match(/^(and|or)\((.*)\)$/)
    if (group) return group[1] === 'and' ? split(group[2]).every((p) => cond(r, p)) : split(group[2]).some((p) => cond(r, p))
    const [key, op, ...rest] = c.split('.')
    let v = rest.join('.')
    if (v.startsWith('"')) v = v.slice(1, -1).replace(/\\(.)/g, '$1')
    if (op === 'in') return v.slice(1, -1).split(',').includes(String(r[key]))
    if (op === 'ilike') return r[key] != null && like(v).test(r[key])
    throw new Error(`unknown ${op}`)
  }
  const q = {
    in: (k, v) => (tests.push((r) => v.includes(r[k])), q),
    ilike: (k, p) => (tests.push((r) => r[k] != null && like(p).test(r[k])), q),
    is: (k, v) => (tests.push((r) => r[k] === v), q),
    gte: (k, v) => (tests.push((r) => r[k] >= v), q),
    lte: (k, v) => (tests.push((r) => r[k] <= v), q),
    or: (expr) => (tests.push((r) => split(expr).some((c) => cond(r, c))), q),
    ids: () => rows.filter((r) => tests.every((t) => t(r))).map((r) => r.id),
  }
  return q
}

const ROWS = [
  { id: 'lidl', type: 'expense', note: 'Lidl', category_id: 'groceries', account_id: 'main', date: '2026-11-06' },
  { id: 'netflix', type: 'expense', note: 'netflix', category_id: 'fun', account_id: 'main', date: '2026-11-02' },
  { id: 'rent', type: 'expense', note: 'Rent', category_id: 'home', account_id: 'main', date: '2026-10-01' },
  { id: 'lunch', type: 'expense', note: null, category_id: 'food', account_id: 'meal', date: '2026-10-20' },
  { id: 'salary', type: 'income', note: 'Salary', category_id: 'salary', account_id: 'main', date: '2026-10-31' },
  { id: 'move', type: 'transfer', note: null, category_id: null, account_id: 'main', to_account_id: 'savings', date: '2026-11-03' },
  { id: 'put', type: 'invest', note: '50% Lidl', category_id: null, account_id: 'main', date: '2026-09-15' },
  { id: 'out', type: 'divest', note: null, category_id: null, account_id: 'main', date: '2026-08-15' },
]
const RECURRING = [
  { id: 'r1', name: 'Netflix' },
  { id: 'r2', name: 'Rent' },
  { id: 'r3', name: 'Salary' },
]
const run = (patch) => applyFilter(fakeQuery(ROWS), { ...EMPTY_FILTER, ...patch }, RECURRING).ids()

describe('Transactions filters', () => {
  test('no filter shows everything', () => {
    expect(run({})).toHaveLength(ROWS.length)
    expect(activeFilterCount(EMPTY_FILTER)).toBe(0)
  })

  test('several types at once; Invest = put in and take out', () => {
    expect(run({ types: ['income'] })).toEqual(['salary'])
    expect(run({ types: ['expense', 'income'] })).toEqual(['lidl', 'netflix', 'rent', 'lunch', 'salary'])
    expect(run({ types: ['transfer', 'invest'] })).toEqual(['move', 'put', 'out'])
    expect(activeFilterCount({ ...EMPTY_FILTER, types: ['expense', 'income'] })).toBe(1)
  })

  test('search: the name contains the text, any case; % and _ are plain characters', () => {
    expect(run({ q: 'lid' })).toEqual(['lidl', 'put'])
    expect(run({ q: 'NETFLIX' })).toEqual(['netflix'])
    expect(run({ q: '50%' })).toEqual(['put'])
    expect(run({ q: '_' })).toEqual([])
    expect(run({ q: '  ' })).toHaveLength(ROWS.length) // spaces only = no search
    expect(activeFilterCount({ ...EMPTY_FILTER, q: 'x' })).toBe(1)
  })

  test('categories narrow expenses and income; picked transfers and investing still show', () => {
    expect(run({ categoryIds: ['groceries'] })).toEqual(['lidl'])
    expect(run({ types: ['expense', 'transfer'], categoryIds: ['groceries'] })).toEqual(['lidl', 'move'])
    // only transfers picked: categories don't apply at all
    expect(usesCategories({ ...EMPTY_FILTER, types: ['transfer'], categoryIds: ['groceries'] })).toBe(false)
    expect(run({ types: ['transfer'], categoryIds: ['groceries'] })).toEqual(['move'])
  })

  test('only recurring: all of them, or the picked ones', () => {
    expect(run({ recurring: true })).toEqual(['netflix', 'rent', 'salary'])
    expect(run({ recurring: true, recurringIds: ['r1'] })).toEqual(['netflix'])
    expect(run({ recurring: true, types: ['expense'] })).toEqual(['netflix', 'rent'])
    expect(run({ recurring: true, types: ['expense', 'transfer'] })).toEqual(['netflix', 'rent', 'move'])
    expect(usesRecurring({ ...EMPTY_FILTER, recurring: true, types: ['invest'] })).toBe(false)
    // no recurring entries at all: nothing is recurring
    expect(applyFilter(fakeQuery(ROWS), { ...EMPTY_FILTER, recurring: true }, []).ids()).toEqual([])
  })

  test('cards and dates', () => {
    expect(run({ accountIds: ['savings'] })).toEqual(['move']) // money arrived there
    expect(run({ accountIds: ['meal'] })).toEqual(['lunch'])
    expect(run({ date: { preset: 'thisMonth' } })).toEqual(['lidl', 'netflix', 'move'])
    expect(run({ date: { preset: 'custom', from: '2026-10-01', to: '2026-10-20' } })).toEqual(['rent', 'lunch'])
  })

  test('which category kinds the picked types have', () => {
    expect(kindsOf(EMPTY_FILTER)).toEqual(['expense', 'income'])
    expect(kindsOf({ ...EMPTY_FILTER, types: ['income', 'transfer'] })).toEqual(['income'])
    expect(kindsOf({ ...EMPTY_FILTER, types: ['invest'] })).toEqual([])
  })

  test('date labels and the 12-month strip on the tiles', () => {
    expect(describeDate({ preset: 'custom', from: '2026-11-03', to: '2026-11-07' })).toBe('3 Nov – 7 Nov')
    expect(describeDate({ preset: 'custom', from: '2026-11-03', to: '2026-11-03' })).toBe('3 Nov')
    const on = (date) => monthStrip(date).map((x) => (x ? 1 : 0)).join('')
    expect(on({ preset: 'thisMonth' })).toBe('000000000001')
    expect(on({ preset: 'lastMonth' })).toBe('000000000010')
    expect(on({ preset: 'last3' })).toBe('000000000111')
    expect(on({ preset: 'thisYear' })).toBe('011111111111') // Dec 2025 is last year
    expect(on({ preset: 'all' })).toBe('111111111111')
  })
})
