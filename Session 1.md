---
title: Session 1
project: Expense Tracker
dates: 2026-10-04 to 2026-10-06
tags:
  - expense-tracker
  - session-log
status: v1 complete
---

# Session 1: Expense Tracker

Building a personal expense tracker for iPhone, from an empty folder to a live app on the Home Screen.

> [!summary] Where things stand
> - All 5 phases from the project brief are built, and the app is live.
> - Extras added along the way: **recurring payments**, a **transactions filter**, a **new Home design** and **European number formatting**.
> - **Live app:** https://expense-tracker-phi-ivory-98.vercel.app
> - **Design ideas (Home + Savings):** https://claude.ai/artifact/TpopkwWUspENYrbsUuAmLd

---

## 1. Setup

- Created the project brief, `CLAUDE.md`, which holds the rules, stack, data model and build phases. Claude reads it at the start of every session.
- Kept the project folder at `C:\Users\berna\Documents\expense-tracker`. It doesn't need to move for GitHub, and it isn't in a synced folder like OneDrive, which is good.
- Built a React + Vite + Tailwind project skeleton.
- Turned on **git** (version history). Every step is saved as a commit.
- Secrets are protected: the `.env` file (with the Supabase keys) can never be saved to git or uploaded.

### Supabase (database + login)
- Created the Supabase project and connected the app with the **publishable key** only, never the secret key.
- Login is **email + password**. There's no sign-up screen.
- My account was created in the Supabase dashboard, and **public sign-ups are turned off**.
- Every table has **Row Level Security**: only my own rows can be read or changed, and logged-out visitors get nothing. Both were tested.

**Database updates I ran in Supabase → SQL Editor:**
1. `001_initial_schema.sql`: accounts, categories, transactions and savings goals, plus security rules
2. `002_category_sort_order.sql`: lets me choose the order of my categories
3. `003_recurring_payments.sql`: the recurring payments table

These files are in `supabase/migrations/`.

---

## 2. Phase 1: Core

- **Design direction:** taken from my lynx logo, with cobalt blue (`#1F4FE0`) and navy (`#0B1B45`) on a light blue-white background. Fonts are *Bricolage Grotesque* (headings, amounts) and *Figtree* (text).
- **App frame:** a bottom tab bar (Home · Transactions · **+** · Analytics · Savings) with a raised blue **+** button. The top bar has Settings and Account.
- **Accounts & cards** (Settings): add, edit, archive and delete accounts.
  - A credit card's balance is entered as "Owed".
  - Balances are always calculated from transactions, never stored.
  - An account with transactions can't be deleted, only archived.
- **Default categories** are created on first login.
- **Add transaction** (the **+** button), the most important screen:
  - The built-in number pad is ready immediately, so it takes 3 taps: amount → category → Save.
  - Expense / Income / Transfer.
  - The account defaults to the last one used. The date defaults to today.
  - It opens instantly, because accounts and categories are preloaded.
- **Transactions list:** grouped by day (Today, Yesterday, dates), with daily totals. Tap a transaction to edit or delete it.

### Changes I asked for during Phase 1
- **European numbers:** €1.234,56, and the number pad has a **,** key.
- **Date button:** shows a calendar emoji instead of "Today". It opens the app's own **calendar** (Today/Yesterday shortcuts, weeks starting Monday) instead of the browser's date popup.
- **Note field:** fixed, so typing goes into the note instead of the amount. It has an **×** to remove it.
- **Categories editor** (Settings → Categories): add, rename, change the emoji and colour, archive, delete.
- **Reorder categories:** a Reorder mode with ↑ ↓ arrows. This needed a new database field.
  - *A mistake was made and fixed:* the first update sorted categories alphabetically. They were put back in their original order.

---

## 3. Phase 2: Home

The Home screen went through several versions:
1. This month's spending vs income, account cards and recent transactions.
2. A swipeable row of balance cards.
3. **Current version:**
   - **One dark navy card** with the **total balance**: big euros, small faded cents, 👁 to hide amounts, and the change this month.
   - **Coloured card edges on the right**, one per account. Tap one to see that account's balance; "Back to total" returns.
   - **🗓️ Mon, 5 Oct** date centred in the top bar.
   - **Upcoming payments** cards (see recurring payments below).
   - **Recent transactions** (last 8) with See all.

The old "Spent this month" summary was removed from Home. That information now lives in Analytics.

---

## 4. Transactions page upgrades
- **All / Income / Expense** switch at the top. Transfers only show under All.
- **Filter icon** in the top bar to filter by one or more categories. A badge shows how many are selected, with a Clear button.
- Day headers show income (green) and spending.
- The filter is kept when switching tabs.

---

## 5. Phase 3: Analytics
- **Month picker** (‹ October 2026 ›).
- **Spent**, with the change vs last month, plus that month's income and what's left over.
- **By category:** bars, largest first, with % of the total.
- **Month by month:** the last 6 months. Tap a bar to jump to that month.
- **Daily spending:** a bar per day, with a dotted average line. Tap a day for its amount.
- Transfers are excluded everywhere.

> [!note] Not built: monthly budgets per category
> I decided not to do this for now. It would need a database change. The option was one budget per category that repeats every month.

---

## 6. Phase 4: Savings goals
- **Total saved** across goals.
- **A card per goal:** progress bar, € saved of target, %. If there's a deadline, it shows how much to save per month to make it.
- **Tap a goal:** add money, take money out, edit it or delete it.
- **New goal:** name, target, already saved, optional deadline.

Adding money to a goal only updates its progress. It doesn't move money between accounts. If money really moves, record a transfer too.

---

## 7. Extra feature: Recurring payments
Planned together first. The decisions:
- **Option B:** an overview plus a one-tap **"Paid"**. Nothing is recorded automatically.
- **Expenses only**, no income.
- Upcoming cards on **Home**, with the full list on its own screen.

What was built:
- **Home → Upcoming payments:** cards scroll sideways, soonest first in cobalt. When a payment is due or late, the card shows a **Paid** button.
- **Paid:** confirm or adjust the amount (for bills that vary) and the account. This records the expense and moves the next due date forward.
- **Recurring payments screen** (See all, or Settings): the total per month and per year, the list sorted by due date, and add / edit / pause / delete.
- Due dates keep the same day of the month. A payment on the 31st falls on the 30th or 28th in shorter months.
- Tested with **YouTube Premium (€14/month)**. Paid recorded the expense and moved the next date to 5 Nov.

---

## 8. Phase 5: App polish and going live

### Putting it online (Vercel)
- Signed in to Vercel from my phone with a one-time code. No password was shared.
- The app is uploaded with Vercel's tool. Supabase settings are stored in Vercel.
- **Address:** https://expense-tracker-phi-ivory-98.vercel.app
- Claude republishes after every change.

### Making it feel like a real app
- **App icons** in every size, from the lynx logo.
- **Launch screens:** the logo on white, for every iPhone size from the iPhone 8 to the 16 Pro Max.
- **Full-screen app mode** (no Safari bar), portrait only.
- **Works offline:** the app opens without internet and shows a "You're offline" notice. Data is never stored out of date; it always comes fresh.
- **Automatic updates:** the phone picks up new versions the next time the app is opened.

> [!important] To do on my iPhone (once)
> Remove the Expenses icon from the Home Screen, re-add it from Safari (Share → Add to Home Screen), and sign in again. This is needed to get the new icon and launch screen.

---

## 9. Working remotely
- **Remote Control** was turned on, so I could keep chatting with Claude from the Claude app on my phone while it worked on my computer.
- **Keep-awake** has to be turned on by me in the Claude app's settings. The computer must stay on and plugged in.

---

## 10. Design exploration (in progress)
I wasn't happy with the Home design, so Claude made mockups to compare:
**https://claude.ai/artifact/TpopkwWUspENYrbsUuAmLd**

**Home: four directions**
- **A · Ledger:** minimal and typographic, like a bank statement
- **B · Wallet:** dark top half with accounts stacked like Apple Wallet
- **C · Bento:** a grid of tiles (total, one per account, next payment, recent)
- **D · Timeline:** upcoming payments above a "Today" marker, history below

**Savings: four directions** (using example goals)
- **A · Jars:** goals as jars filling up
- **B · Rings:** a big overall ring, plus small rings per goal
- **C · Milestones:** quarter-segmented bars with one-tap +€50 / +€100 buttons
- **D · Focus:** one goal at a time in a big card, with quick-add buttons

**Next decision:** pick a direction (or a mix) for Home and Savings, and then Claude builds it.

---

## 11. Things to remember
- **My data on 6 Oct:**
  - Revolut −€119,88 (after a €150 Shopping expense). I should check whether its starting balance was right.
  - Bleap €12,32
  - Total −€107,56
- Revolut's colour is navy, which is almost invisible on the dark Home card. I can change it in Settings → Accounts & cards.
- The Vercel deploy sometimes fails on the first try; Claude retries it.
- My first income (salary) hasn't been recorded yet, so Analytics shows "overspent".

## 12. Next steps
- [ ] Choose the Home and Savings designs, then have them built
- [ ] Re-add the app to the iPhone Home Screen (new icon and launch screen)
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Optionally: a nicer web address (e.g. `lynce-expenses.vercel.app`)
- [ ] Later: monthly budgets per category, CSV export
