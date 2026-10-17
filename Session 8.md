---
title: Session 8
project: Expense Tracker
dates: 2026-10-14 – 2026-10-17
tags:
  - expense-tracker
  - session-log
  - ai-generated
status: getquin connected, onboarding finished, Invest transactions, Analytics fully redesigned, all live
---

# Session 8: getquin, onboarding, Invest and the new Analytics

The longest session so far. It started with connecting my **getquin** portfolio to the Investments tab, then went step by step through the whole **onboarding** again, which got new **Savings goals** and **Investments** steps. **Credit cards and investment accounts were removed**, and instead there is now an **Invest** transaction type. Home shows my **Net worth**, and the **budget card** was redesigned. Finally I rethought **Analytics** around five questions and rebuilt the overview and every page behind it. As always, I saw mockups (usually 3 options) before anything was built.

> [!summary] Where things stand
> - **Investments** come from my **getquin** share link: portfolio value, gain, positions and money put in per month.
> - **Invest** is a new transaction type (tab in Add transaction): **Put in** or **Take out**. Never counted as spending.
> - **Home** top shows **Net worth** = accounts + savings + getquin. New **ring + pace** budget card.
> - **Analytics** always shows this month: Where you stand · October so far · Worth noticing · Explore (**Where it goes**, **What you keep**, **Better or worse**). Every page behind it was rebuilt.
> - **Onboarding** has 7 steps: Profile, Accounts, Budget day, Categories, Regular payments, Savings goals, Investments.
> - Database script **015** was run by me in Supabase.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - Earlier sessions: [[Session 1]], [[Session 2]], [[Session 3]], [[Session 4]], [[Session 5]], [[Session 6]], [[Session 7]].

---

## 1. getquin on the Investments tab
- I gave Claude my getquin share link (https://getqu.in/WO8FIo/). getquin has **no official API**, so LynxOS reads the **public share page** through a small helper on Vercel. It's unofficial and could stop working if getquin changes their site.
- I chose **"fetch when the page opens"**. The last answer is kept on the phone, so it shows instantly and also offline.
- **Investments page:** teal **Portfolio value** card with the gain (green ▲ / red ▼ pill), **Invested**, **Put in this month**, a **Put in · last 6 months** chart and all my **positions** with logos and gains.
- The value first came back in **dollars** (getquin guesses the currency from the visitor's location). Fixed by running the helper in **Frankfurt** and refusing anything that isn't EUR.
- **Monthly amounts** come from getquin's own trade list (buys − sales). Dollar trades are converted at the **ECB rate of that day**. Checked: it adds up to getquin's invested total.
- Later: the **Link** button left the page (the link is now in **Profile → Investments**), and **Refresh** became a small pill with the time **next to my profile photo**.

## 2. Onboarding, step by step
- **Welcome:** just the big logo, "LynxOS", "Expense tracker", **Let's start** and Sign out.
- **Profile:** "Spotlight" design: big photo in soft rings, my name, email in a pill, one name box. Safari's **yellow autofill** colour is turned off everywhere.
- **Accounts:** the **card itself is the form** (type the name and balance right on it, no lines), then type tabs (**Bank · Meal card · Cash · Savings**), a bank grid, card styles and a **"Card colour" sheet** with named colour groups.
- **Categories:** **Bills** moved to the ideas; **Subscriptions** removed (I'll rethink subscriptions later).
- **Regular payments:** new form with a **summary card + rows**, and I can pick any category I chose.
- **Savings goals** (new step): goals as a **wallet of cards**. Goals can start with money from my savings, but **never more than the savings hold**.
- **Investments** (new step, last): connect getquin with my share link, with getquin's official icon.

## 3. Credit cards and investment accounts removed
- I don't have a credit card, so **Credit card** is gone everywhere (no "Owed" amounts).
- **Investment accounts** are gone too: investments come from getquin, and money going there is an **Invest** transaction (section 6).
- The database still allows both, so nothing old breaks.

## 4. Home
- **Net worth** at the top = all my accounts + the getquin portfolio. The accounts list shows an "Investments · getquin" row.
- **Budget card** (chose "ring + pace below", then polished): a ring of what's **left to spend**, "€X / day · N days left", and a **Spending vs pace** line I can touch to read a day.
- **AI button** removed from the top bar.
- **Full-size empty states** with short text (Transactions, Investments, Recurring).

## 5. Smaller features
- **Profile → Investments:** connect or change the getquin link.
- **Delete all data** redesigned: big icon, tiles with how many accounts/transactions/etc. will go, and **press and hold for 2 seconds** to delete (instead of typing DELETE). PIN / Face ID still asked if the app lock is on.
- **Recurring in Transactions:**
  - A small **violet ↻ badge** on recurring transactions (name matches a recurring payment).
  - A **Recurring filter** with three cards (All / Recurring / Not recurring) and logo tiles to pick which ones.

## 6. Invest transactions (script 015)
- **Add transaction** has a 4th tab, **Invest**, with **Put in** (money leaves the card) or **Take out** (money comes back).
- Step 2 is just an optional name and "€X put in this month · Not counted as spending". No broker, no ETF/stock details (my choice).
- In lists: teal ↗ / ↘ icon, teal amount, never in the day's spending. **Invest** tab and filter in Transactions.
- **Investments chart:** months **before I connected getquin** come from getquin (striped); from that day on, from my **Invest transactions** (solid).
- **Analytics** counts it as **Invested**: kept = saved + invested.

## 7. Analytics, rethought
- I framed Analytics around **five questions**: Where do I stand? Where does my money go? Am I keeping enough? Am I getting better or worse? What should I notice?
- **Overview** (always this month; the Month/Year switch only lives on the detail pages):
  - **Where you stand:** net worth with a 12-month line and Accounts / Savings / Investments. Investments use **getquin's real value history**, so past months are exact.
  - **October so far:** a one-line verdict ("A good month…") with Spending, Kept and Income against my usual.
  - **Worth noticing:** swipeable cards (a category above usual, a new recurring payment, priciest week, investing streak…).
  - **Explore:** orange **Where it goes**, teal **What you keep**, navy **Better or worse**.
- **What you keep** (6 sections): how much I kept · where it went (investments, each goal, General savings) · getting better? · how consistent (streak, best/lowest month) · what it adds up to this year (on pace for…) · what it's for (goals with "reached around…").
- **Where it goes** (6 sections, month in days / year in months): how much · what it went on (donut + categories vs usual) · where exactly (top places) · fixed or not (+ subscriptions) · when (calendar heatmap, weekdays) · the big ones.
- **Categories** and **one category** redesigned to match: orange total, biggest moves, and each category in its own colour with 12 months, where, when and biggest purchases.
- **Better or worse** (6 sections): overall verdict vs usual and vs same month last year · last 12 months in/out · is spending creeping up (trend) · which categories are changing · are fixed costs growing · my records.

---

## 8. Things to remember
- After each update, **close and reopen the app**.
- **Investing:** use the **Invest** tab in Add transaction, never an expense. Taking money out = **Take out**.
- getquin is read through an **unofficial** way. If numbers stop updating, that's the likely reason.
- Many Analytics sections ("usual", trends, records, last year) need **a few months of history** before they fill in.
- For bills to count as **fixed**, they need the **same name** as the recurring payment.

## 9. Missing steps (Claude's review at the end)
- **The code only exists on my computer**: no GitHub copy yet. Most urgent.
- No automatic **data backups** of Supabase on the free plan.
- Confirm **public signups are disabled** in Supabase.
- No **automated tests** for the money rules and Analytics maths.
- No **error tracking** if something breaks on my iPhone.
- No **offline adding** of transactions.

## 10. Next steps
- [ ] **Put the code on GitHub** and connect it to Vercel (auto-deploys); I only need to sign in once
- [ ] Set up a **monthly data backup** (export)
- [ ] Check **public signups are off** in Supabase
- [ ] **Delete all data** and go through the new setup for real (from [[Session 6]])
- [ ] Add a few **automated tests** for the money rules and Analytics
- [ ] Try Face ID on my iPhone (still not confirmed from [[Session 4]])
- [ ] Rethink **subscriptions**
- [ ] Maybe later: AI assistant, CSV export, budgets per category, Net worth details page
