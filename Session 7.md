---
title: Session 7
project: Expense Tracker
dates: 2026-10-11 – 2026-10-14
tags:
  - expense-tracker
  - session-log
  - ai-generated
status: Investments added, Analytics rebuilt with detail pages, new bottom bar, all live
---

# Session 7: Investments and Analytics

This session had three parts. First, small polish: the **account types order** in onboarding and a nicer **New goal** sheet. Then I added **investments**: a new account type and its own page. Most of the session went into **rebuilding Analytics** into one overview page with a detailed page behind each card. Along the way I moved things around in the **bottom bar** a few times and added a placeholder **AI button**. As always, I saw mockups or screenshots before anything was built.

> [!summary] Where things stand
> - **Bottom bar:** Home · Transactions · **Analytics** · Savings · **Investments**, with the + on its own at the right.
> - **Top bar:** an **AI button** (says "Coming soon" for now) and my profile photo.
> - **Investment** is a new account type. Money only goes **in**, and it's **not counted** in my total balance or budget.
> - **Investments page:** total invested, this month / this year, a bar per month and my platforms, with **+ Invest**.
> - **Analytics** is one page of summary cards. **Spending, Categories, Saving & investing and Trends** each open a detailed page. Only **Net worth** is still to build.
> - Database script **014** was run by me in Supabase.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - Earlier sessions: [[Session 1]], [[Session 2]], [[Session 3]], [[Session 4]], [[Session 5]], [[Session 6]].

---

## 1. Small polish
- **Onboarding account types** are now in this order: **Bank, Meal card, Cash, Savings, Credit card** (later also **Investment**, in two rows of three).
- Claude explained **how savings work** from onboarding onwards (see [[Session 6]]): savings accounts start in **General savings**, every euro belongs to a goal, and no goal can go below €0.
- **New goal / Edit goal** sheet redesigned like the onboarding forms:
  - A big **emoji tile** with the name and "€2.500 target · by Oct 2026" updating as I type.
  - Tidy rows: **Name, Target, Start with** (money from General savings, showing how much is there) and **Deadline**.
  - Amounts use the **number pad**. Only the emoji grid, no typing my own emoji.
  - "Remove" for the deadline is in the calendar's top bar.

## 2. Investments (script 014)
- I set money aside for investments too, but I **don't want to track performance**, only **how much I've put in**.
- Claude suggested a new **Investment account type** instead of a category (which would count as spending) or a savings goal (which would mix with savings). I agreed.
- **How it works:**
  - I add my broker (e.g. **Trade Republic**) as an **Investment** account, with what I've invested so far.
  - Investing is a **transfer** from my bank to that account. It's not spending, but it does lower "Left to spend".
  - **Money only goes in.** The account isn't offered as a "from" account anywhere, and the app blocks taking money out. Deleting a wrong transfer still works.
  - It's **not part of the total balance** on Home ("Investments not included").
  - It can be archived with money in it.
- I ran database script **014**.
- **Investments page** (I picked layout A from 3 mockups):
  - Teal **"Invested so far"** card with **This month** and **This year**.
  - A **bar per month** for the last 6 months, with my monthly average.
  - **"Where it is":** each platform with its logo, total and how much went in this month.
  - **+ Invest** opens Add transaction already set as a transfer into my investment account.
- It first lived as a tab next to the Savings title ("Savings  Investments"). Later it became **its own tab** in the bottom bar.

## 3. Analytics rebuilt
- I wanted Analytics to be a **comprehensive overview** of my finances. After a few rounds of mockups (one long page, then 5 tabs), I chose **one page of summary cards, each opening a detailed page**.
- **Month / Year** switch with arrows on every Analytics page. The choice carries over between pages.
- **Fair comparisons:** in the middle of a month, it compares with last month **up to the same day**, not the full month. Big jumps show as **"3×"** instead of huge percentages.
- **Main page cards:**
  - **Net worth:** everything I own (incl. savings and investments) minus card debt, with a 12-month line and In / Spent / Saved / Invested.
  - **Spending:** total, change, a pace line against last month, per day, on track for, fixed bills.
  - **Categories:** split bar and my top 3, with their change.
  - **Saving & investing:** how much of my income I **kept** (saved + invested), in a ring. Kept this year, my **average rate** (I chose no goal, just the average) and best month.
  - **Trends:** 12 months in and out.
  - **Highlights:** short facts, e.g. *"You've spent €326 less than by this time in September"*.

### Detail pages (tap a card, "More ›")
- **Spending:**
  - Bigger pace chart ("Sep by then €453").
  - A bar per day, orange above average, tap to read.
  - Fixed vs everyday spending.
  - Quick facts: transactions, average each, no-spend days, biggest day.
  - **Where you spend most**, with logos, and the **biggest expenses**.
  - "Fixed" means expenses with the same name as a recurring payment (Paid does that automatically).
- **Categories:**
  - Every category with its share, times, a 6-month mini chart and its change.
  - **Tap a category** for its own page:
    - Spent, my **usual month** (average of past full months), share, per visit.
    - A "so far vs usual" bar, which turns orange once I pass my usual month.
    - 12 months of bars, where I buy, and the biggest purchases.
- **Saving & investing:**
  - "You kept" ring and my usual rate.
  - **Income vs kept** per month (saved and invested inside my income).
  - **Savings rate** line over 12 months.
  - Year totals.
  - **Where it went:** money in or out per savings and investment account.
- **Trends:**
  - **In and out** per month with averages.
  - **Net each month** (green above zero, red below).
  - Most and least spent month.
  - **Fixed bills over time** and what my recurring payments cost now.
  - **By weekday**.
  - A **month calendar** shaded by spending (Year view: one square per month). "Stronger blue = more spent".
- **Net worth** detail page: not built yet.

## 4. Navigation changes
- I tried **Analytics in the top bar** (next to the profile photo) with **Investments** as a bottom tab, to the right of Savings.
- Then I moved **Analytics back to the bottom bar, in the middle**. Final bottom bar: **Home · Transactions · Analytics · Savings · Investments**.
- **AI button** (sparkle icon) in the top bar, left of my profile photo. **For later:** it only says "Coming soon" for now.
- The top-bar buttons got slightly narrower, so "Transactions" still fits next to its filter button.

---

## 5. Things to remember
- After each update, **close and reopen the app**.
- **Investments:** add money with **+ Invest** (Investments page) or a transfer to the investment account. The balance is what I **put in**, not what it's worth.
- For bills to count as **fixed** in Analytics, they need the **same name** as the recurring payment (Paid does it automatically).
- Analytics compares the current month with last month **up to the same day**.
- Publishing sometimes fails once with "Not authorized"; Claude retries.

## 6. Next steps
- [ ] Add my broker as an **Investment** account (Profile → Accounts & cards) with what I've invested so far
- [ ] Build the **Net worth** detail page in Analytics
- [ ] Decide what the **AI button** should do
- [ ] **Delete all data** and go through the setup for real (from [[Session 6]])
- [ ] Redesign **step 3 (Budget day)** and the **"You're all set"** page (from [[Session 6]])
- [ ] Try Face ID on my iPhone (still not confirmed from [[Session 4]])
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Maybe later: monthly budgets per category, CSV export
