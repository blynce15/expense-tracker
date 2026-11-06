import { describe, expect, test } from 'vitest'
import { allocation, periodChange, putInMonths, seriesFor, todayMoves } from '../src/lib/portfolio'

const portfolio = {
  value_cents: 110000,
  invested_cents: 100000,
  updated_at: '2026-11-06T18:00:00Z',
  series: {
    intraday: [['2026-11-05T23:00:00Z', 108000], ['2026-11-06T17:00:00Z', 109500]],
    month: [['2026-10-07T00:00:00Z', 95000], ['2026-10-20T00:00:00Z', 100000]],
    ytd: [['2026-01-01T00:00:00Z', 50000]],
    year: null,
    all: [['2025-09-29T00:00:00Z', 10000]],
  },
  days: [
    { date: '2026-09-15', cents: 40000 },
    { date: '2026-10-20', cents: 10000 },
    { date: '2026-11-06', cents: 500 },
  ],
}

describe('portfolio gain over a period', () => {
  test('ALL = value − what the positions cost', () => {
    expect(periodChange(portfolio, 'ALL')).toEqual({ cents: 10000, rate: 0.1 })
  })
  test('a period leaves out money put in during it', () => {
    // 110.000 − 95.000 − (10.000 + 500 put in after 7 Oct) = 4.500
    const c = periodChange(portfolio, '1M', '2026-11-06')
    expect(c.cents).toBe(4500)
    expect(c.rate).toBeCloseTo(4500 / 105500)
  })
  test('1D counts only money put in today', () => {
    // 110.000 − 108.000 − 500 = 1.500
    expect(periodChange(portfolio, '1D', '2026-11-06').cents).toBe(1500)
  })
  test('no chart data for a period = nothing to show', () => {
    expect(periodChange(portfolio, '1Y')).toBeNull()
    expect(seriesFor(portfolio, '1Y')).toBeNull()
  })
  test('the chart ends at today’s value', () => {
    expect(seriesFor(portfolio, 'YTD').at(-1)[1]).toBe(110000)
    expect(seriesFor(portfolio, '1D')).toHaveLength(2)
  })
})

const positions = [
  { ticker: 'A', kind: 'etf', value_cents: 6000, day_cents: 100, day_rate: 0.02 },
  { ticker: 'B', kind: 'stock', value_cents: 3000, day_cents: -60, day_rate: -0.02 },
  { ticker: 'C', kind: 'crypto', value_cents: 1000, day_cents: 40, day_rate: 0.04 },
  { ticker: 'D', kind: 'stock', value_cents: 2000, day_cents: 0, day_rate: 0 },
  { ticker: 'E', kind: 'warrant', value_cents: 500, day_cents: 10, day_rate: 0.01 },
]

describe('today', () => {
  test('total move and its % of yesterday’s value', () => {
    const t = todayMoves(positions)
    expect(t.cents).toBe(90)
    expect(t.rate).toBeCloseTo(90 / (12500 - 90))
  })
  test('best and worst three by %', () => {
    const t = todayMoves(positions)
    expect(t.best.map((p) => p.ticker)).toEqual(['C', 'A', 'E'])
    expect(t.worst.map((p) => p.ticker)).toEqual(['B', 'D', 'E'])
  })
})

describe('allocation', () => {
  test('grouped by kind, biggest first, unknown kinds as Other, cash last', () => {
    const a = allocation(positions, 500)
    expect(a.map((g) => [g.kind, g.cents])).toEqual([
      ['etf', 6000],
      ['stock', 5000],
      ['crypto', 1000],
      ['other', 500],
      ['cash', 500],
    ])
    expect(a.reduce((s, g) => s + g.share, 0)).toBeCloseTo(1)
    expect(a[1].positions.map((p) => p.ticker)).toEqual(['B', 'D'])
  })
  test('no cash = no cash slice', () => expect(allocation(positions, 0).some((g) => g.kind === 'cash')).toBe(false))
})

describe('money put into investments per month', () => {
  test('getquin before connecting, your Invest after, plus the pension (not its starting point)', () => {
    const months = putInMonths({
      portfolio,
      since: '2026-10-15',
      own: [
        { type: 'invest', amount_cents: 20000, date: '2026-10-20' },
        { type: 'divest', amount_cents: 5000, date: '2026-11-02' },
        { type: 'invest', amount_cents: 999, date: '2026-10-01' }, // before connecting: getquin covers it
      ],
      pension: [
        { date: '2026-11-03', put_in_cents: 15000 },
        { date: '2026-10-01', put_in_cents: 1210000 }, // starting point
      ],
      count: 3,
      today: '2026-11-06',
    })
    expect(months.map((m) => m.key)).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(months[0]).toMatchObject({ portfolio: 40000, pension: 0, fromGetquin: true })
    // October: getquin's 20 Oct trade is after connecting, so it doesn't count; your Invest does
    expect(months[1]).toMatchObject({ portfolio: 20000, pension: 0, cents: 20000, fromGetquin: false })
    expect(months[2]).toMatchObject({ portfolio: -5000, pension: 15000, cents: 10000, partial: true })
  })
  test('without getquin: only the pension', () => {
    const months = putInMonths({ pension: [{ date: '2026-10-31', put_in_cents: 100 }, { date: '2026-11-30', put_in_cents: 150 }], count: 2, today: '2026-11-30' })
    expect(months.map((m) => m.cents)).toEqual([0, 150])
  })
})
