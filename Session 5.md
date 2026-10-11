---
title: Session 5
project: Expense Tracker
dates: 2026-10-10 – 2026-10-11
tags:
  - expense-tracker
  - session-log
status: Shop logos, money rules and savings goals linked to real money, all live
---

# Session 5: Logos and money rules

This session was about **making the money make sense**. The app now shows **shop logos** (Claude, Netflix, Continente…) instead of category emojis. It also follows **money rules**: I can't spend or move money I don't have. And **savings goals are tied to the real money** in my savings account. A few small design fixes at the end. As always, every visible change was shown to me as a preview first.

> [!summary] Where things stand
> - **Shop logos** on transactions and recurring payments, from a built-in list of ~115 shops.
> - **Home "Coming up"** rows now look like the Recurring page and are the same size as the recent transactions.
> - **Money rules:** no account (except credit cards) can go below €0; archiving only at €0; amount limit €9.999.999,99.
> - **"Paid" is saved in one step** (database script **010**, which I ran).
> - **Savings goals share the money in my savings account(s)**; when money leaves savings, the app asks which goal it comes from.
> - No more **rectangle inside text boxes** while typing; **more space** around the amount on Add transaction.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - Earlier sessions: [[Session 1]], [[Session 2]], [[Session 3]], [[Session 4]].

---

## 1. Shop logos
- I wanted to see the **real logo** when I pay for something like a Claude subscription, instead of the category emoji.
- **How it works:**
  - The app has a **built-in list of ~115 shops and services**, international and Portuguese: supermarkets, delivery, transport, phone and energy, streaming, AI tools, gyms…
  - If a transaction or recurring payment's **name matches** a shop ("Claude", "claude pro", "Uber Eats"…), its **full-colour logo** is shown in a white rounded tile (I chose **style A** from 3 mockups).
  - Everyday words only count at the start of a name, so "Dinner with Max" doesn't get the HBO Max logo.
  - Anything not on the list keeps its **category emoji**.
- Logos come from **Google's free website-icon service** (it only sees the shop's website, never my amounts) and are **kept on the phone for a month**, so they work offline.
- Every logo on the list was **checked by eye**. Shops with no proper logo were left out (EMEL, Endesa, EPAL, Fitness Hut, Segurança Social, BP, and a few others).
- Some shops only have a **small, slightly blurry** logo (Continente is one), but it's still recognisable.
- I decided **not** to have a "Change icon" option in the app. **To add a shop, I ask Claude** to put it on the list.
- Logos show on Home, Transactions, transaction details, account pages, and the Recurring list, calendar and details.

## 2. Home "Coming up"
- The upcoming payments now look like the **Recurring payments page**: big logo on the left, name, "In 3 days · Tue 13 Oct" or "Due today", and the amount (or a **Paid** button).
- The calendar-style date tile is gone.
- The rows are **exactly the same size** as the recent transactions below them, so Home fits on one screen again.

---

## 3. Questions I asked about the budget
- **Budget start day** (Profile) only affects the **"Left to spend" card on Home**. Analytics, Savings and account pages all use normal calendar months (1st to last day).
- **At the end of a budget period** the card does **not** count down to €0. "Left to spend" is simply the money really in my **debit and cash** accounts (savings and credit cards left out). "of €X" is that plus what I spent since the period started.
- On my start day the spending bars **start fresh**, and the budget becomes whatever I have then (carried over + salary).
- Moving money to savings or paying off the credit card **lowers "Left to spend"** but doesn't count as spending.
- I decided to **keep it as it is**.

---

## 4. Money rules
I asked Claude to go through the whole app and find every money rule that should exist but didn't. It found 13. I let Claude do its suggestions.

**Now blocked, with a clear message** (for example *"Not enough money in Santander: it has €84,20, so this would leave it at −€15,80"*):
- **Spending** more than a debit, cash or savings account holds.
- **Transferring** money I don't have.
- **Paying a recurring payment** from an account without enough money.
- **Editing or deleting** a transaction in a way that would push an account below €0 (e.g. deleting a salary I've already spent). The Delete button is greyed out and the reason is shown.
- **Negative balances** on debit, cash or savings accounts: the "−" option is gone; only credit cards can owe money.
- **Archiving an account that still has money** (or still owes money). It has to be at €0 first.
- **Paying from an archived account.**
- **Huge typos:** nothing above **€9.999.999,99** is accepted.

**Good to know:**
- The check uses **today's balance**.
- A change that **doesn't lower** an account is always allowed, even if older data left it below €0.
- **Credit cards** can still go below €0 (that's what I owe). Paying off more than I owe, and a credit limit, are **not** enforced (my choice, maybe later).

## 5. "Paid" in one step (script 010)
- "Paid" on a recurring payment now records the expense **and** moves the next date **in one go**, so a dropped connection can't leave it half done.
- It also **refuses to mark the same payment paid twice** (double tap, or two devices).
- This needed a new database script, **010**, which I **ran in Supabase** (SQL Editor). Claude checked it's there and closed to anyone not signed in.

---

## 6. Savings goals linked to my savings account
I chose:
- **One shared pot:** all goals share the money in my savings-type account(s). Money in all goals together can **never be more** than what's really in savings. The rest shows as **"not in a goal"**.
- **Add money → choose each time** where it comes from:
  - **a card** (e.g. Santander): the money is **moved into the savings account** (recorded as a transfer with the goal's name) and added to the goal;
  - **"Already in savings":** just assigns money that's already there but not in a goal yet.
- **Take out:** the money goes back to "not in a goal"; it **stays in the savings account**.
- **When money leaves savings** (a transfer, expense, delete or Paid) and would use money set aside in goals, a **"Take it from a goal"** sheet asks me **which goal(s)** it comes out of. I tap goals until it says "All set", then Continue. Closing the sheet cancels.
- If enough money in savings **isn't in a goal**, nothing is asked.
- **Also blocked:** a goal's "Already saved" being more than the free money, and changing/deleting a savings account in a way that would leave goals without real money.
- The blue card on the Savings page shows a line like **"€5.200,00 in savings · €4.300,00 not in a goal"**. If my older goals add up to more than my savings, it says **"Your goals hold €X more than your savings accounts"** → use **Take out** on a goal until it's fixed.
- With more than one savings account, money from a card always goes into the **first** one.
- No database change was needed.

---

## 7. Small design fixes
- **Rectangle in text boxes:** typing (e.g. a transaction name) drew a rectangle inside the box. Fixed in **every** text box in the app (all 26 checked). Buttons keep their outline for keyboard use, which I won't notice on the phone.
- **Add transaction amount:** the amount was stuck to the "From Santander · Today" pill. I chose **A, more space between them** (44 pixels instead of 20) from two dark-mode mockups. Checked on a normal and a small iPhone.

---

## 8. Things to remember
- After each update, **close and reopen the app** (sometimes twice).
- **To add a shop logo**, ask Claude with the shop's name.
- If the Savings card says my goals hold more than my savings, **take money out of goals** until it's normal.
- Money from a card into a goal goes to the **first savings account**.
- Publishing to Vercel sometimes fails once with "Not authorized"; Claude retries.

## 9. Next steps
- [ ] Check the Savings card: do my existing goals fit inside my savings balance?
- [ ] Mark a recurring payment as Paid and check it worked (first real use of script 010)
- [ ] Try Face ID on my iPhone (still not confirmed from [[Session 4]])
- [ ] Re-add the app to the Home Screen so it's labelled "LynxOS"
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Maybe later: overpaying a credit card / credit limit rules, analytics by budget period, monthly budgets per category, CSV export
