---
title: Session 6
project: Expense Tracker
dates: 2026-10-11
tags:
  - expense-tracker
  - session-log
status: Savings rebuilt, onboarding redesigned, recurring income and meal cards added, all live
---

# Session 6: Savings and onboarding

This session had two big parts. First, I **rebuilt how savings work**, so the Savings page always shows the real money in my savings account. Then I **redesigned the onboarding**, the setup a new user goes through, one step at a time. Along the way I added **recurring income** (salary, meal card), a **Meal card** account type and **bank logos** everywhere. As always, every visible change was shown to me as a mockup or screenshot first.

> [!summary] Where things stand
> - **Savings:** every euro in savings belongs to a goal; money not set aside is **General savings**. The Savings page shows the **real total**.
> - **Onboarding** has 5 steps: **Profile → Accounts → Budget day → Categories → Regular payments**. "A bit about you" is gone.
> - **Bank logos** (12 banks + 3 meal cards) on account cards across the app.
> - **Recurring income** (salary, meal card) next to recurring payments, with a "Payday tomorrow" reminder.
> - **Meal card** is a new account type; its money counts in "Left to spend".
> - **Sports** is a new default category.
> - Database scripts **011, 012 and 013** were all run by me in Supabase.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - Earlier sessions: [[Session 1]], [[Session 2]], [[Session 3]], [[Session 4]], [[Session 5]].

---

## 1. Savings rebuilt (script 011)
- **The problem:** I had €2.000 in my savings account, but the Savings page showed €0 because I had no goals. Goals were just numbers on top of the money, so it felt disconnected.
- Claude explained the old logic step by step with diagrams. I chose **"Goals tied to transfers"** out of 3 options.
- **How it works now:**
  - **Every euro in savings belongs to a goal.** Money not set aside for anything is in **General savings**, a goal that is always there and has no target.
  - A goal's money is **calculated from real transactions**: a transfer into savings tagged "Holiday" adds to Holiday, and money going out tagged "Holiday" takes from it. Editing or deleting a transaction updates the goal by itself.
  - When money goes **into or out of** a savings account (Add transaction, recurring Paid), the app shows a **goal choice** (General savings by default).
  - **No goal can go below €0.** If I try, the app says why (e.g. *"Trip has €1.200, so this would leave it at −€300"*).
  - In a goal: **Add money** / **Take out**. The other side is a **card** (a real transfer) or **another goal** (money only moves between goals; it stays in the account).
  - A new goal can **start with money from General savings**.
  - **Deleting a goal** gives its money back to General savings.
  - The Savings page shows **"In savings"** (the real total), split into **In goals** and **General savings**.
- I ran database script **011** in Supabase. I planned to **start fresh** (Delete all data), so old goal amounts didn't matter.

---

## 2. Onboarding: the first page
- I didn't like the old page; it felt **AI generated** ("Let's set up your money", motivational lines).
- I chose **logo + "LynxOS" + "Expense tracker"** with the steps listed below (a mix of two mockups).
- I removed the "Setup · 5 steps, about 3 minutes" line.
- The steps are a **coloured timeline**: round coloured icons joined by a thin line (I picked it from 3 icon styles).
- The **headers of every step** are plainer now: no "STEP X OF 5", no small logo, no blue gradient word.

## 3. Step 1: Profile (new)
- A new first step, **before the accounts**: a big round **photo** (or my first letter) with a camera badge, my **name** and email.
- "Add photo / Change photo / Remove". **Continue** only works once I've typed a name.
- The photo is cropped to a square and made smaller on the phone. Opening the photo library doesn't trigger the app lock.
- After setup, the photo shows **straight away** in the round avatar at the top of every tab.

## 4. Step 2: Accounts
- Title is just **"Accounts"**.
- **"Your bank"** grid with real logos, 4 per row: **Revolut, Millennium, CGD, Santander, Novo Banco, ActivoBank, BPI, Wise, N26, Bybit, Trade Republic, Bleap**.
- Tapping a bank **fills in its name** and **picks its colour**. That colour jumps to the front of the colour row.
- The card shows the **logo with the name beside it**, and the type ("Bank") underneath.
- The **balance** uses the same **number pad** as Add transaction.
- **16 colours** in a row I can swipe.
- **Credit cards** say **"Owed"**, with the amount in **red**.
- Example names ("e.g. Revolut") are faded, so they don't look filled in.
- The budget help line and the **"Money to spend right now"** box are gone.
- **Bank logos across the whole app:** any account whose name contains a bank's name (e.g. "Revolut Savings") shows that logo on Home, Accounts & cards, the account page, Add transaction, transaction details, Recurring and Savings. Nothing is stored; renaming the account changes the logo.

## 5. Meal card account type (script 013)
- A 5th account type, **Meal card** (fork and knife icon). Picking it shows **Coverflex, Edenred and Pluxee** instead of the banks.
- It **can't go below €0**, and (my choice) its money **counts in "Left to spend"**.
- I ran database script **013**.

## 6. Step 3: Budget day
- Not redesigned yet.

## 7. Step 4: Categories
- I chose **tiles (B)**, 3 per row: selected ones are coloured, unselected ones are faded grey. Tap to switch.
- The **ideas** are faded tiles in the same grid; one tap adds them. The last tile is **"+ New"**.
- Gone: the "9 of 10" counter, "Select all" and the separate Ideas section.
- **New category:** big icon preview with the name, Name row, colours, emoji grid. I removed "Or type an emoji".
- **Income:** defaults **Salary, Other income**. Ideas: Bonus, Freelance, Refunds, Tax refund, Investments, Interest, **Sales** (selling second-hand things), Gifts, Rent received, Cashback.
- **Expenses:** defaults **Groceries, Eating out, Transport, Housing, Bills, Shopping, Health, Entertainment, Sports, Other**. Ideas: Travel, Subscriptions, Car, Coffee, Going out, Personal care, Gym, Education, Insurance, Gifts, Pets, Kids, Donations, Fees.
- **Sports ⚽** was added as a default at the end of the session (also ⚽ 🏃 🚴 🏊 in the emoji picker). My current account doesn't have it yet.

## 8. Step 5: Regular payments + recurring income (script 012)
- **Payments / Income** switch at the top.
- **Logo shortcuts:** Rent, Netflix, Spotify, Disney+, HBO Max, Prime Video, YouTube, iCloud, ChatGPT, **Claude**, MEO, NOS, Vodafone, EDP, Gym. **Income:** Salary, Coverflex, Edenred, Pluxee, Rent received, Freelance.
- The **amount starts empty** (my choice: prices change), and opens the number pad. The date opens a **calendar**.
- Added entries show as rows like the Recurring page ("In 5 days · Thu 16 Oct").
- **Recurring income in the whole app:**
  - Income shows **"+€…" in green** with **"Received"** instead of "Paid", and records an income transaction.
  - The Recurring page counts **costs only**, plus a new **"Income / month"** box. The form has a **Payment / Income** switch.
  - **Home "Coming up"** mixes payments and income by date.
  - **Reminder** the day before: **"Payday tomorrow · 💼 Salary"**.
- The page is now called **"Recurring"** (it holds income too).
- I ran database script **012**.

## 9. Removed: "A bit about you"
- I don't need the questions for now, so the step is gone. Setup ends on the "You're all set" page after Regular payments.

---

## 10. Things to remember
- After each update, **close and reopen the app**.
- The onboarding only shows **when the app has no data** (e.g. after Profile → Delete all data).
- **Every euro in savings belongs to a goal.** Untagged savings money is General savings.
- **To add a bank or shop logo**, ask Claude with the name.
- Publishing sometimes fails once; Claude retries.

## 11. Next steps
- [ ] **Delete all data** and go through the new setup for real
- [ ] Or: add **Sports** to my current categories (Profile → Categories)
- [ ] Redesign **step 3 (Budget day)** and the **"You're all set"** page
- [ ] Add my **salary / meal card** as recurring income and check the "Payday tomorrow" reminder arrives
- [ ] Try Face ID on my iPhone (still not confirmed from [[Session 4]])
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Maybe later: monthly budgets per category, CSV export
