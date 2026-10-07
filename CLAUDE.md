# Expense Tracker — Project Brief

## About the user
- The owner is not a programmer. Explain what you're doing in plain language, briefly.
- Never ask the user to write or edit code. You do all technical work.
- Ask before big decisions (new libraries, changing the data model, deleting anything).
- Work in small steps. After each step, make sure the app runs, then commit to git with a clear message.

## What we're building
A personal expense tracker, installed on iPhone as a PWA ("Add to Home Screen").
Single user (the owner). Currency: EUR only.

## Stack
- React + Vite + Tailwind CSS
- Supabase: database + login (email + password, NOT magic links — magic links open in Safari instead of the home-screen app)
- Vercel: hosting, auto-deploys from GitHub
- vite-plugin-pwa for installability

## Navigation
Bottom tab bar: Home · Transactions · [+] · Analytics · Savings
- [+] is a raised center button that opens "Add transaction".
- Top bar: Settings and Account.
- Mobile-first. Respect iPhone safe areas (notch, home indicator). Large tap targets.

## Data model (Supabase tables)
Every table has `user_id uuid default auth.uid()` and `created_at`.
- accounts: name, type (debit | credit | cash | savings), starting_balance_cents, color, archived
- categories: name, icon, color, kind (expense | income), archived, sort_order (owner-chosen order)
- transactions: type (expense | income | transfer), amount_cents (always positive), date, account_id, to_account_id (transfers only), category_id (null for transfers), note
- savings_goals: name, target_cents, saved_cents, deadline (optional)
- recurring_payments: name, icon, amount_cents, frequency (weekly | monthly | yearly), start_date (sets day of month), next_due, account_id, category_id, active. "Paid" creates an expense and moves next_due forward; nothing is created automatically.
- user_settings (one row per user, primary key user_id): budget_start_day (1–31), answers (jsonb, the onboarding "About you" answers, for future AI tips), onboarded_at.

## Rules
- Store money as integer cents. Never floats. Format as € only for display.
- Account balance = starting balance + income − expenses − transfers out + transfers in. Always calculated, never stored.
- Transfers (e.g. paying a credit card, moving money to savings) are NOT spending or income. Exclude them from analytics totals.
- New users (no accounts and no user_settings.onboarded_at) go through onboarding (src/screens/Onboarding.jsx): accounts, budget day, categories (defaults below, pick/add own), recurring payments, About-you questions. Everything is saved at the end (src/lib/onboarding.js). Existing users never see it.
- Default categories: Groceries, Eating out, Transport, Housing, Bills, Shopping, Health, Entertainment, Travel, Other (expense); Salary, Other income (income). Onboarding offers these; ensureDefaultCategories still runs for non-new users with no categories.

## Security (non-negotiable)
- Row Level Security ON for every table, with policies so a user can only read/write rows where user_id = auth.uid().
- Only the Supabase publishable/anon key goes in the app, via .env. Never the service_role/secret key.
- .env must be in .gitignore. Never commit secrets.
- After the owner's account is created, disable public signups in Supabase.

## Add-transaction UX (most important screen)
- Target: 3 taps — amount → category → save.
- Default account = last used. Default date = today. Note is optional.
- Number pad opens immediately on the amount.

## Build phases
1. Core: project setup, login, accounts (cards) CRUD, add/edit/delete transactions, transactions list grouped by day.
2. Home: this month's income vs spending, account balances, recent transactions.
3. Analytics: spending by category, month-over-month, daily spending, monthly budget per category.
4. Savings: goals with progress bars, add money to a goal.
5. PWA polish: app icon, splash, full-screen mode, offline-friendly shell. Deploy to Vercel.
Later (not v1): recurring transactions, CSV export.

## Progress
(Update this section at the end of each work session: what's done, what's next.)

### 2026-10-05
Done:
- Phase 1: login, accounts, categories (editor + owner-chosen order), add/edit/delete transactions, transactions list with All/Income/Expense switch and category filter.
- Phase 2: Home with dark total-balance card (tappable account edges, hide amounts) and recent transactions.
- Phase 3 (partial): Analytics tab with month picker, spending by category, last 6 months, daily spending.
- Phase 4: Savings goals (progress, add/take out money, deadlines).
- Deployed to Vercel via CLI: https://expense-tracker-phi-ivory-98.vercel.app (publish with `npx vercel deploy --prod --yes`; env vars set in Vercel).
- Display style: European numbers (€1.234,56), comma key on the number pad.

Also done (same day):
- Recurring payments (expenses only): table recurring_payments, full list screen (#/recurring), Upcoming payments cards on Home with a Paid confirmation.
- Phase 5: vite-plugin-pwa manifest + service worker (app shell offline, data never cached, auto-update on next open), icons and iPhone launch screens in public/icons and public/splash, offline notice.

### 2026-10-06
Done:
- Savings goals have an emoji icon (column savings_goals.icon, migration 004, run by owner).
- Savings page redesign: total saved with progress ring; bar chart of net money in/out of savings-type accounts over the last 6 months (from transactions, no new table); goal cards without status tags; reached goals hidden from the list (still counted in the total); "+ New" next to the Goals heading.

### 2026-10-07
Done:
- Add-transaction redesign (design C): full-screen amount step, then a sheet with Name + categories and a Save button (owner wants an explicit Save, not save-on-tap). The Name is stored in transactions.note (no data-model change). Category is suggested from past transactions with the same name. Transfers pick the destination account in step 2.

- Transactions page: tabs All · Income · Expense · Transfer; sliders icon opens a filter sheet (list of Date range / Cards / Categories, each opens its own page) with a live "Show N transactions" count; active filters show as removable chips. Filter logic in src/lib/filters.js. A transfer matches a card if money left or arrived there; categories don't apply on the Transfer tab.
- Transaction details: tapping a transaction (Transactions page or Home) opens a details sheet (src/screens/TransactionDetails.jsx) with ⋯ → Edit (opens the add/edit flow) or Delete (confirmation shows each affected account's balance before → after). Balances stay calculated, so edits/deletes update them immediately.
- Testing without the owner's login: a temporary harness (vite config that swaps src/lib/supabase.js for an in-memory mock) runs the real app with sample data; it is deleted after each test and never committed.

- Home redesign (option "N + V", chosen after several rounds of mockups): balance with a tilted card on the right that opens a list of all accounts (pick one to show its balance); blue budget card with a line chart of spending through the budget period vs even spending (touch/drag to read a day); "Coming up" = next 2 recurring payments with calendar-style date and Paid; last 3 transactions. Designed to fit on one iPhone screen without scrolling.
- Budget = money you can spend = balance of debit + cash accounts (savings and credit cards left out entirely). Period budget = that balance + expenses from those accounts since the period started. No new table: logic in src/lib/budget.js. The period start day (owner's payday) is set in Settings → Budget and kept on the device (localStorage key budgetStartDay, default 1st).

- Onboarding (design "C", app logo in public/logo.png and the app's blues): Welcome, 1 Accounts (live card preview), 2 Budget day (period preview), 3 Categories (Expenses/Income switch, ideas, create own with emoji + color and a live preview), 4 Regular payments (popular tiles, live "Coming up" preview), 5 About you (5 questions), Finish summary. Only for new users.
- New table user_settings (migration 005, run by owner and published 2026-10-07; named so because an older unused "profiles" table with id/full_name/currency already exists in the project and is left untouched). The budget start day now lives there; until the profile has one, the old on-device value (localStorage budgetStartDay) is used. Settings saves it to the profile.
- Amounts like "2.100" are now read as 2100 (dots in groups of three = thousands) everywhere.

Next:
- Polish Transactions, Analytics, Savings, Settings in the new style: mockups shared, waiting for owner feedback.
- Connect GitHub repo to Vercel for automatic deploys (needs owner at the computer).
- Monthly budget per category: owner declined for now (would need a data-model change).
- Later: CSV export.
