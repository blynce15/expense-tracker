# Investments: Portfolio + Pension — design

Approved by the owner through the clickable mockup `.harness/invest-v2.html` (5 rounds, 2026-11-06).

## Goal
The Investments tab gets two parts, switched at the top: **Portfolio** (getquin, redesigned) and
**Pension** (a pension fund updated by hand once a month). The pension counts in net worth; the
"Put in" chart moves to Analytics.

## Portfolio (getquin)
- White value card: value (positions + broker cash), gain € · % for the chosen period, line chart with
  1D · 1M · YTD · 1Y · ALL (getquin periods intraday, month, ytd, year, all), drag to read a point.
  Gain for a period = value now − value at the start − money put in during the period (ALL = getquin's gain).
- Four tiles (line icons on solid squares): Dividends · Cash (opens cash sheet) · Realized profit (opens Closed) · Positions.
- Today: total move, 3 best and 3 worst positions (price now vs yesterday's close: lastValue / eodValue).
- Allocation: donut by ETF / Stocks / Crypto / Cash with legend; tapping a type opens its positions
  (Cash: currency cards with Edit, bar, ECB rate line).
- Positions · Activity · Closed switch showing 10, "See all N" opens a full page:
  Positions sortable (Value, Gain, Today); Activity filter (All, Buys, Sells, Rewards, Dividends), grouped
  by month, 50 at a time while scrolling; Closed with total realized profit.
- Tapping a position opens its page: value, gain, today, units, share, average buy price, price now,
  invested, realized, its trades.
- No footer notes. Refresh pill in the top bar on Portfolio only.

## Pension
- Not set up: empty card (bank icon in rings, "Pension fund", "Check in once a month", Add pension fund).
- Setup, 2 steps on a full page with live card preview: 1 name + provider; 2 value now, put in so far, units.
- Page: blue gradient card (name, provider, last update date, value, gain vs put in, value line with dashed
  put-in line, Put in / Growth bar); update card when this month has no entry ("Last updated 31 Oct"),
  else "Next update 1 Dec · November done"; tiles This year (growth excl. money added, %), Per unit
  (value ÷ units, % since first entry), Units (+ this year); History timeline (tap = edit, delete except the first).
- Update sheet: three amounts on the number pad (value now, put in this month, units) with last month's
  numbers as hints and live Growth / Per unit / Total gain. One entry per calendar month (saving again edits it).
- Tapping the card's top opens Edit fund (name, provider, Remove pension fund).

## Data
- New table `pension_entries` (migration 020): id, user_id default auth.uid(), created_at, date,
  value_cents, put_in_cents (money added since the previous entry; the first = everything so far),
  units numeric. RLS own rows; service_role may select (reminder). delete_my_data clears it.
- Fund name/provider: `user_settings.answers.pension = { name, provider }`.

## Elsewhere
- Net worth (Home, Analytics) + pension's latest value; Analytics' 12-month line uses the latest entry on
  or before each month end.
- Analytics → What you keep: new section "Put into investments" (12 months: getquin trades before
  getquinSince, Invest − Take out after, + pension money put in; dashed average).
- Reminder (api/remind.js, daily cron): on the 1st (Lisbon) to users with a pension and no entry this month:
  "Update due · 🏛️ Pension" / "Last updated 31 Oct", opens #/investments/pension.

## Tests
Pure calculations in src/lib/portfolio.js and src/lib/pension.js with Vitest tests.
