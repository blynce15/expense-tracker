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
- categories: name, icon, color, kind (expense | income), archived
- transactions: type (expense | income | transfer), amount_cents (always positive), date, account_id, to_account_id (transfers only), category_id (null for transfers), note
- savings_goals: name, target_cents, saved_cents, deadline (optional)

## Rules
- Store money as integer cents. Never floats. Format as € only for display.
- Account balance = starting balance + income − expenses − transfers out + transfers in. Always calculated, never stored.
- Transfers (e.g. paying a credit card, moving money to savings) are NOT spending or income. Exclude them from analytics totals.
- On first login, create default categories: Groceries, Eating out, Transport, Housing, Bills, Shopping, Health, Entertainment, Travel, Other (expense); Salary, Other income (income).

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
