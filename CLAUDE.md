# LynxOS (expense tracker) — Project Brief

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
- Top bar: one profile avatar that opens Profile (settings live there).
- Mobile-first. Respect iPhone safe areas (notch, home indicator). Large tap targets.

## Data model (Supabase tables)
Every table has `user_id uuid default auth.uid()` and `created_at`.
- accounts: name, type (debit | credit | cash | savings | meal; meal = meal card, migration 013), starting_balance_cents, color, archived
- categories: name, icon, color, kind (expense | income), archived, sort_order (owner-chosen order)
- transactions: type (expense | income | transfer), amount_cents (always positive), date, account_id, to_account_id (transfers only), category_id (null for transfers), note, goal_id (savings goal, only when it moves savings money; null = General savings)
- savings_goals: name, icon, target_cents, deadline (optional). saved_cents is no longer used (migration 011): a goal's money is calculated.
- goal_moves: from_goal_id, to_goal_id (null = General savings), amount_cents, date. Money moved between goals inside savings.
- recurring_payments: type (expense | income, migration 012), name, icon, amount_cents, frequency (weekly | monthly | yearly), start_date (sets day of month), next_due, account_id, category_id, active. "Paid" creates an expense (income entries: "Received" creates income) and moves next_due forward; nothing is created automatically.
- user_settings (one row per user, primary key user_id): budget_start_day (1–31), answers (jsonb, the onboarding "About you" answers, for future AI tips), onboarded_at.

## Rules
- Store money as integer cents. Never floats. Format as € only for display.
- Account balance = starting balance + income − expenses − transfers out + transfers in. Always calculated, never stored.
- Transfers (e.g. paying a credit card, moving money to savings) are NOT spending or income. Exclude them from analytics totals.
- Money rules (enforced in the app): debit, cash, savings and meal card accounts can't go below €0. Every add/edit/delete of a transaction and every recurring "Paid" is checked against today's balances (overdraftProblem/checkOverdraft in src/lib/balances.js); a change that doesn't lower an account is always allowed. Only credit cards can have a negative (owed) starting balance; an account can only be archived at exactly €0; archived accounts can't be paid from; amounts are capped at €9.999.999,99 (MAX_CENTS in src/lib/money.js). Not enforced (owner's choice for later): credit cards can be overpaid, no credit limit.
- Savings goals follow the real money (migration 011, src/lib/goals.js): every euro in savings belongs to a goal. A goal's money = how much its tagged transactions (transactions.goal_id) move the savings accounts + goal_moves in − out. General savings is the built-in goal for everything untagged (goal_id null): savings accounts' starting balances, untagged transactions, moves to/from null. It has no row, no target and can't be deleted. So goals + General always equal the savings accounts' balance. Any transaction that moves money into or out of savings shows a goal choice (src/components/GoalPicker.jsx; default General savings): Add transaction, Paid. No goal (General included) can go below €0: checked on transaction add/edit/delete, Paid, goal moves and account edits/deletes (goalProblem; only goals the change lowers). Goal sheet: Add money / Take out, the other side is a card (a real transfer card ↔ savings account tagged with the goal; in = first savings account, out = the one with most money) or another goal (a goal_move, no money moves). New goal can start with money from General savings. Deleting a goal hands its money to General savings (on delete set null).
- New users (no accounts and no user_settings.onboarded_at) go through onboarding (src/screens/Onboarding.jsx): accounts, budget day, categories (defaults below, pick/add own), recurring payments, About-you questions. Everything is saved at the end (src/lib/onboarding.js). Existing users never see it.
- Default categories: Groceries, Eating out, Transport, Housing, Bills, Shopping, Health, Entertainment, Other (expense); Salary, Other income (income). Travel moved to the onboarding ideas (2026-10-11). Onboarding offers these; ensureDefaultCategories still runs for non-new users with no categories.

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
- Budget = money you can spend = balance of debit + cash + meal card accounts (savings and credit cards left out entirely). Period budget = that balance + expenses from those accounts since the period started. No new table: logic in src/lib/budget.js. The period start day (owner's payday) is set in Settings → Budget and kept on the device (localStorage key budgetStartDay, default 1st).

- Onboarding (design "C", app logo in public/logo.png and the app's blues): Welcome, 1 Accounts (live card preview), 2 Budget day (period preview), 3 Categories (Expenses/Income switch, ideas, create own with emoji + color and a live preview), 4 Regular payments (popular tiles, live "Coming up" preview), 5 About you (5 questions), Finish summary. Only for new users.
- New table user_settings (migration 005, run by owner and published 2026-10-07; named so because an older unused "profiles" table with id/full_name/currency already exists in the project and is left untouched). The budget start day now lives there; until the profile has one, the old on-device value (localStorage budgetStartDay) is used. Settings saves it to the profile.
- Amounts like "2.100" are now read as 2100 (dots in groups of three = thousands) everywhere.

- Polished Transactions (soft tabs, filter chips, uppercase day headers with total pills), Analytics (blue summary card with Income/Left over, category colors + split bar, rounded month bars), Savings (navy total card with yellow ring, net tag, goal cards with gradient bar and monthly pace), Settings (grouped rows with live summaries, budget day, email + Sign out, logo). Account page still exists behind the top-bar person icon.
- Home polish: change shown as a small pill; account list (tap the card) with type icons, check, "Manage accounts"; budget card with glow, circle and calendar icon (pace tag beside the label so big amounts aren't cut); rounder lists; friendly empty states.

### 2026-10-09
Done:
- New bottom bar (chosen from mockups): floating frosted white pill with icons only (Home: house, Transactions: list, Analytics: three rounded bars "bars", Revolut style, Savings: target), a light-blue bubble slides behind the active tab; the bright blue round + button floats separately on the right. Published.
- Home top ("Card fan", chosen from mockups): monthly change pill removed, bigger total balance, fan of onboarding-style cards (src/components/BankCard.jsx). Tapping the fan still opens the accounts list; picking an account opens its page (src/screens/AccountPage.jsx, full-screen overlay styled after the owner's reference picture): dark navy top with the big card + Hide, money in/out this month, latest 30 transactions grouped by day, "See all" opens Transactions filtered to that account. Published.
- Same card style everywhere: Settings accounts row (gradient mini stack), Accounts & cards page (each account is a full card, tap to edit), Edit account sheet (live card preview at the top), Transactions Cards filter (mini cards with type icon) and the card filter chip. Shared pieces: BankCard, MiniCard, cardBackground in src/components/BankCard.jsx. Published.
- Home budget card redesigned ("Daily bars", chosen from mockups, in app colours): light blue card, one bar per day of the budget period (blue, orange above the daily budget, faint for future days), dashed daily-budget line, pace tag; touch a bar to read that day's spending. Very big days are capped at the top of the chart. Published.
- Transactions filter: "Custom" date range opens a calendar right away (src/components/RangeCalendar.jsx): tap the first day, then the last day; the range is highlighted. Calendar only, no From/To boxes or hint (owner's choice). Published.
- Removed helper text the owner found unnecessary: the Filters sheet instructions line and the transfers note on the Cards filter page. Published.
- Recurring payments page redesigned (design "C", chosen from mockups): blue summary card (per month, per year, active count), big month calendar with each payment's icon on its day (tap a day for a panel with that day's payments; arrows change month), list grouped This month / Later / Paused, + in the top bar. Tapping a payment opens a details sheet (src/screens/RecurringDetails.jsx, adapted from the owner's reference picture): status tag, Mark paid, amount, Next payment / Repeats / Total paid / Category boxes, Paid from card, Pause/Resume and Delete, pencil to edit. No auto-renew or reminders (owner: not for now). "Total paid" = expenses with the payment's name as note and its category. Published.
- Home "Coming up": tapping a payment opens the same details sheet (edit via the exported RecurringForm). Published.
- Savings page redesigned (design "A", chosen from mockups): blue total card with white progress ring and Target / Goals boxes; savings-account chart as a light blue card (blue months in, orange months out, current month faded, tap a bar); goal cards with whole-euro amounts, "€X to go" and a pace tag (€/month, No deadline, Deadline passed); reached goals listed as small rows at the end. Published.
- Settings + Account merged into Profile (design "A"): the top bar has one round avatar (photo, or first letter of name/email) on every tab, opening #/profile (#/settings and #/account still work). Profile: name card (avatar with camera badge, name, email, Edit profile sheet with name + Add/Change/Remove photo), Your money rows, Budget start day, Sign out. Old Account page deleted. Name and photo live in user_settings.answers (answers.name, answers.photo = 256px square JPEG data URL); no schema change. Back buttons return to the previous screen (useRoute goBack), falling back to the parent page. "About you" answers not shown (owner: not now). Published.
- Profile → Default account: pin the account new transactions start on, or "Last used" (the old behaviour). Saved as user_settings.answers.defaultAccountId; lookups.js defaultAccountId() prefers it. Published.
- App lock (design "A", blue): Profile → Security → App lock switch (choose PIN twice, then offer Face ID), Face ID switch, Change PIN; turning off needs the PIN. Locks on start and every time the app is hidden (photo picker excepted). Lock screen src/components/LockScreen.jsx, keypad src/components/PinPad.jsx, logic src/lib/applock.js. Stored on the device only (localStorage appLock: salted SHA-256 PIN hash + passkey credential id). Face ID = a WebAuthn platform passkey (rp = the app's hostname), needs a tap to start; checked locally (UV flag), it's a privacy lock, not encryption. "Forgot PIN" signs out and removes the lock. Face ID not yet confirmed on the owner's iPhone. Published.
- Profile ideas still open (owner picks next): hide amounts on open, change password, first day of week, CSV export, app info/what's new, dark mode, change email, stats; bigger: per-category budgets, bank CSV import.
- Deploy note: `npx vercel deploy --prod --yes` sometimes fails once with "Not authorized"; running it again works.
- Dark mode: Profile → Appearance (Light / Dark / Auto = follow iPhone), stored on the device (localStorage theme, default light) and applied by an inline script in index.html before the app draws. Colours are Tailwind theme tokens in src/index.css with dark values under [data-theme=dark] and the system media query; extra tokens: tint-from/tint-to (light-blue cards), bubble, warn-bg/warn, orange-text, navy (always-dark surfaces: account page, sheet backdrops). Inverted chips use bg-ink text-paper. Rule for new code: use the tokens, never fixed hex for surfaces/text. Checked every screen, sheet, dropdown and onboarding step in dark mode.
- App icon and launch screen stay light (owner's choice). A home-screen web app can't switch its icon with the iPhone's dark/tinted icon setting; a dark icon and dark launch screens were made and then discarded.
- Payment reminders (phone notifications, Web Push): Profile → Notifications → Payment reminders (asks iPhone permission; saves this phone in table push_subscriptions, migration 006, run by owner) + "Send a test notification". Vercel Cron (vercel.json, 08:00 UTC daily ≈ 9–10 summer / 8–9 winter in Lisbon) calls api/remind.js, which sends a note for active recurring payments with next_due = tomorrow (Europe/Lisbon), several combined into one; tapping opens #/recurring. Service worker push code: public/push-sw.js (workbox importScripts). Vercel env (production): VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (added by owner, server only), VITE_VAPID_PUBLIC_KEY (also in local .env), VAPID_PRIVATE_KEY, CRON_SECRET. New dependency: web-push. Migration 007 grants service_role access (select/delete push_subscriptions, select recurring_payments): this project's tables have no automatic service_role grants, so any new server-side job needs explicit grants. Published; test notification confirmed on the owner's iPhone (2026-10-09). Wording is "calendar style" (owner's choice): title "Due tomorrow · 🎬 Netflix", body "€12,99 · Main card · Sat 10 Oct"; several payments: "Due tomorrow · 2 payments" with one line each. Card names need migration 008 (grant select on accounts to service_role); without it the card is left out. App icon badge offered, not built.
- Delete all data: Profile → Danger zone (src/screens/DeleteAllData.jsx). Type DELETE, plus PIN/Face ID when the app lock is on; calls rpc delete_my_data (migration 009, security invoker, one transaction) which deletes transactions, recurring payments, goals, push subscriptions, accounts, categories and resets user_settings (answers {}, onboarded_at null, budget day 1); then the app reloads into onboarding. Login, theme and app lock (device settings) stay. Published.
- Profile redesigned (owner's mix of mockups B and C): centered 88px photo + Edit profile; four tiles (Accounts & cards, Recurring, Categories, Default account); compact Budget row (invisible native select over the row); Appearance card with three mini theme previews; Notifications & security card (reminders + test, app lock, Face ID, Change PIN) with solid coloured icon tiles; Sign out / Delete all data list; one-line footer. Published.
- App renamed LynxOS in everything the user sees (Home Screen name/short_name, title, Login wordmark "Lynx" + blue "OS" via .brand-text, lock screen tag, Profile footer, notification fallback title, Face ID passkey rp name). Vercel/GitHub/repo names unchanged. Home Screen label only updates when the app is re-added.
- Lynx logo (public/logo.png; white version public/logo-white.png): before the title of the main tabs (TopBar, pages without a back arrow), Login, Profile footer, faded on empty screens (EmptyLynx), faint white watermark on blue cards (LynxWatermark: Recurring, Analytics, Savings bottom-left, onboarding budget card), and the lock screen (white lynx with "LynxOS" under it at the top, rings centred on the photo, same top on the PIN view; owner rejected a bigger lock screen redesign). The white status-bar strip in light mode is iOS's own (status-bar-style default) and is left as is. Published.
- Test harness note: the in-memory mock (kept between tests in the session scratchpad) supports `.or()` with eq/in and `{ count: 'exact' }`; data resets on every reload. Screenshots fail when the Claude window is minimized; then check through page content instead. Background screenshots (when the Claude window is minimized): headless Chrome with a 390×844 iframe page (.harness/frame.html?u=…) and URL flags ?empty, ?signedOut, ?lock=face|pin, ?scroll=bottom handled by the mock; crop to 780×1688.

### 2026-10-10
Done:
- Shop logos (style "A", chosen from mockups): transactions and recurring payments whose name matches a known shop show its full-colour logo in a white rounded tile instead of the emoji (Home, Transactions, transaction details, account page, Recurring list/calendar/details, Home "Coming up"). Built-in list of ~115 shops/services (global + Portugal) in src/lib/merchants.js (website first, then names; whole-word matching, short names and everyday words marked ^ only count at the start, e.g. "Dinner with Max" is not HBO Max). Tile: src/components/MerchantIcon.jsx; falls back to the emoji if the logo can't load. Logos come from Google's free website-icon service (no key; it sees only the shop's website, never amounts) and are kept on the phone for 30 days (workbox cache shop-logos) so they show offline. Every website in the list was checked visually; sites with no logo were left out. No "Change icon" option and no new table (owner's choice): new shops are added to the list on request.
- Home "Coming up" now uses the same rows as the Recurring payments page (PaymentRow + dueText exported from src/screens/Recurring.jsx): big icon/logo on the left, name, "In 3 days · Tue 13 Oct" / "Due today", amount per month or a Paid button. The calendar-style date tile is gone. On Home the rows use PaymentRow's `home` size, identical to the recent transaction rows (40px icon, 16px name, 14px detail, 60px row), so Home fits one screen again.

- Money rules audit + fixes (see Rules → Money rules). Recurring "Paid" now saves the expense and the new due date in one step via rpc record_recurring_payment (migration 010, run by owner 2026-10-10, confirmed: exists and is closed to signed-out callers; refuses a second payment for the same due date). The app still falls back to the old two-step save if the function is ever missing (PGRST202).

- Text boxes: the global keyboard focus ring (:focus-visible in src/index.css) now skips input/textarea/select, so no rectangle appears inside a box while typing; buttons keep it. Every text box was checked.
- Add transaction: 44px (gap-11) between the amount and the "From card · date" pill instead of 20px (owner chose "more space" over moving the pill above the keys). Checked on a normal and a small iPhone. Published 2026-10-11.

### 2026-10-11
Done:
- Savings rebuilt so goals follow the real money (owner found it disconnected: €2.000 in a savings account showed as €0 on Savings). Chosen: goals tied to transactions; every euro in savings belongs to a goal, with a built-in General savings (see Rules). Savings page: top card shows the real total in savings, split In goals / General savings; General savings card above the goals. Migration 011 (transactions.goal_id, goal_moves table, record_recurring_payment with p_goal_id, delete_my_data clears goal_moves) (run by owner 2026-10-11). Published 2026-10-11. Old stored goal amounts are ignored; the owner plans to start fresh (Delete all data).
- Onboarding welcome page redesigned (owner's mix of mockups C "Brand" + B "Checklist"; owner dislikes motivational/AI-sounding lines): centred logo, "LynxOS" wordmark, "Expense tracker", then the steps as a timeline: coloured round icons (blue, orange, purple, green, grey) joined by a thin line, no card, no captions (owner chose timeline C with colours from mockups); "Set up" button with "Sign out" under it. Tighter on short screens. Published.
- Onboarding step headers: no "STEP X OF 5" label, no small logo, plain title (no blue gradient word); a step's subtitle is optional.
- Onboarding Accounts step (owner chose from mockups): title "Accounts" only; "Your bank" grid of logo tiles, 4 per row (owner chose the grid over a sideways row; src/lib/banks.js: Revolut, Millennium, CGD, Santander, Novo Banco, ActivoBank, BPI, Wise, N26, Bybit, Trade Republic, Bleap), tapping one fills in the bank's name and picks its colour (owner's request; that colour moves to the front of the colour row); the card shows the bank's logo when the name matches; example names as placeholders ("e.g. Revolut"); balance entered with the same number pad as Add transaction (pressKey/PAD_KEYS now in src/lib/money.js); 16 colours in a sideways-scrolling row; credit cards say "Owed" with the amount in red. The budget help line under the form and the "Money to spend right now" box under the added accounts are gone.
- Bank logos across the app (owner's request): an account whose name contains a bank's name as a whole word (bankFor in src/lib/banks.js, e.g. "Revolut Savings") shows that bank's logo on a white tile: BankCard (Home fan, account page, Accounts & cards, edit preview), MiniCard (pass `name`), and AccountMark (small markers in Add transaction, transaction details, Paid and Recurring chips). Nothing is stored; renaming the account changes the logo.
- Big account cards (onboarding preview, Accounts & cards, edit preview, account page; BankCard `named`): logo (or type icon on a translucent tile) at the top left with the account name beside it and the type ("Bank") under the name (owner's request); balance below. The small Home fan cards keep the old top line.
- Onboarding Categories step (owner chose tiles "B" from mockups): title "Categories" only; Expenses/Income switch without counts; a 3-per-row grid of tiles: selected ones tinted in the category colour with a coloured border, unselected ones faded and grey; the ideas (Pets, Kids, Gym…) are faded tiles in the same grid (tap adds them); last tile "+ New". No counter, Select all or separate Ideas section. New category form: big centred icon tile with the name and Expense/Income under it, Name row, colour row, emoji grid (no typing your own emoji; no "How it will look" label or sample transaction row).
- Expense category ideas (owner's choice, onboarding only): Travel, Subscriptions, Car, Coffee, Going out, Personal care, Gym, Education, Insurance, Gifts, Pets, Kids, Donations, Fees.
- Income category ideas (owner's choice, onboarding only): defaults stay Salary + Other income; ideas: Bonus, Freelance, Refunds, Tax refund, Investments, Interest, Sales (selling second-hand things), Gifts, Rent received, Cashback.
- Recurring income (owner's request): a recurring entry is a payment or income (recurring_payments.type, migration 012, which also makes record_recurring_payment insert the entry's type). Income shows "+€…" in green and "Received" instead of "Paid" everywhere (Recurring page, details, PaySheet "Paid into", Home "Coming up" mixed with payments by date). Recurring costs per month/year, calendar and group totals count payments only; the summary card shows "Income / month" when there is any. RecurringForm has a Payment / Income switch. Reminders: income due tomorrow gets its own note "Payday tomorrow · 💼 Salary" with "+€…" (owner's choice). Meal card providers (Coverflex, Edenred, Pluxee) added to the logo list. Migration 012 run by owner and published 2026-10-11.
- Meal card account type (owner's choice): type 'meal' (migration 013 widens the accounts type check), icon fork and knife; shortcuts Coverflex, Edenred, Pluxee (MEAL_CARDS in src/lib/banks.js, logos everywhere via bankFor) shown instead of banks when the type is Meal card. Can't go below €0, and its money counts in the budget / Left to spend (owner's choice; BUDGET_ACCOUNT_TYPES). Migration 013 run by owner and published 2026-10-11.
- Onboarding Regular payments step (owner approved the mockup): title only; Payments / Income switch; a 4-per-row grid of shortcuts with logos (Payments: Rent, Netflix, Spotify, Disney+, HBO Max, Prime Video, YouTube, iCloud, ChatGPT, Claude, MEO, NOS, Vodafone, EDP, Gym; Income: Salary, Coverflex, Edenred, Pluxee, Rent received, Freelance) and "+ Other"; the amount starts empty (owner's choice); form: big logo, name and "€13,99 a month", Name / Amount (number pad) / Repeats / Next payment (calendar), Paid from (or Paid into) and Category as wrapping chips; added ones show as rows like the Recurring page ("In 5 days · Thu 16 Oct", per month) with "Add more" below. The "On your Home" preview, guessed prices and the "Roughly, per month" box are gone.

Next:
- Connect GitHub repo to Vercel for automatic deploys (needs owner at the computer).
- Monthly budget per category: owner declined for now (would need a data-model change).
- Later: CSV export.
