---
title: Session 3
project: Expense Tracker
dates: 2026-10-07
tags:
  - expense-tracker
  - session-log
status: redesigns and onboarding live
---

# Session 3: Expense Tracker

A new Home page with a budget, an onboarding flow for new users, and a polish pass on every screen. As before, each change started as a design preview.

> [!summary] Where things stand
> - **Home** fits on one screen: balance with an account list, a blue **budget card** with a spending chart, the next 2 **regular payments**, and the last 3 transactions.
> - **Budget** = money in my bank and cash accounts. It runs from my **payday** to the next, set in Settings.
> - **Onboarding**: a 5-step setup that only **new users** see.
> - **Transactions, Analytics, Savings, Settings and Home** were all polished in the same style.
> - New database table **`user_settings`**, which I created in Supabase.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - [[Session 1]] covers how the app was first built, [[Session 2]] the earlier redesigns.

---

## 1. How we worked this session
- **Preview first, then build.** Claude made interactive phone mockups that I could tap through on my phone, and I chose or asked for changes before anything was built.
- **Previews are private web pages** (claude.ai links). The very first one was a plain file that showed up white on my phone, so from then on every preview was published as a link.
- **Testing without my login:** Claude ran the real app on my computer with made-up sample data and checked layouts, taps and saving. The test setup was deleted afterwards.
- **Each step** was saved in git. It was published to Vercel when I said "Publish it".

---

## 2. Home page

### How we got there
Many rounds of options (A to V). What I decided along the way:
- Keep **Upcoming** and **Recent** (round 2).
- **Balance at the top with a card on the right** that opens a list of all my cards, plus two squares like a picture I shared, and only the **last 3 transactions**. **Nothing should need scrolling.**
- From those, I chose **option J** (balance with a tilted card), then turned the squares into one wide **budget card** with **upcoming payments listed like transactions**: **option N**.
- For the budget card I tried several formats (daily bars, category grid, meter, bars per category, swipeable cards, rings) and chose **V: a line chart of spending through the month**.

### What Home shows now
- **Balance:** total balance with the monthly change as a small pill and an eye button to hide amounts. A **tilted card on the right** opens **"Your accounts"**: each account with its icon and balance, a ✓ on the one shown, and "Manage accounts". Pick one to see its balance, or "All accounts".
- **Budget card (blue):**
  - "Left to spend €X of €Y" and a tag like "▼ €16 under pace".
  - A **yellow line** shows my spending through the period, and a **dashed line** shows even spending. **Touch and drag** along it to see what I'd spent by any day.
- **Coming up:** the next 2 regular payments, with the date like a calendar page ("TODAY 7", "OCT 12") and **Paid** when one is due.
- **Recent transactions:** the last 3, with See all.

### How the budget works
- **Left to spend** = the balance of my **bank (debit) and cash** accounts. **Savings and credit cards are left out completely**; I chose to ignore the credit card.
- **This period's budget** = what's left + what I've already spent from those accounts this period. Moving money to savings lowers it.
- The **period starts on my payday**: **Settings → Budget → Period starts on**. If I'm paid on the 25th, it runs 25th to 24th.
- **No database change was needed** for the budget itself; it's calculated from my transactions.

**Previews (rounds in order):**
- Budget options D/E/F: https://claude.ai/artifact/J7JWAU8JZZWjiY7CY5LYAq
- Top part G/H/I: https://claude.ai/artifact/UD39WnHR9PL8bNGYgFbB3g
- Squares J/K/L: https://claude.ai/artifact/QbCoTZJ6jYCocXEcEqtpom
- Layouts M/N/O: https://claude.ai/artifact/96nB5Woj5GwfQoePeuZGFW
- Budget cards P/Q/R: https://claude.ai/artifact/CZHy4EoUpTm6RrQekjfght
- Budget cards S/T/U/V: https://claude.ai/artifact/DQ6whjYsJtTsrouFAkpcRy

---

## 3. Onboarding (setup for new users)

### How we got there
- Three approaches: **step by step**, **chat**, or **quick start + checklist**. I chose **step by step** and added **regular payments** as a step.
- Three looks: navy header, live preview, and **"big & sunny"**. I chose **C**, but with **the app's lynx logo and blue colours** instead of yellow.
- Then I asked for more polish: first **step 1** (it didn't look polished), then **all the other steps**. I also removed the "1st / 25th" shortcut buttons from the budget-day step.
- Finally, categories had to cover **expenses and income**, and I had to be able to **create my own** with an emoji and colour.

### The steps
0. **Welcome:** the logo, "Let's set up your money", and the 5 steps listed.
1. **Your accounts:** a **live bank-card preview** in the account's colour that updates as I type. Choose Bank / Savings / Credit card / Cash, name, balance (or amount owed for a credit card) and colour. Add as many as I want.
2. **Budget day:** a blue card showing the period ("25 Sep → 24 Oct", "day 13 of 30", "starts over in 18 days") and a 1–31 calendar.
3. **Your categories:** an **Expenses / Income** switch, tap to keep or remove, one-tap ideas (Pets, Gym, Freelance, Refunds…), and **"New category"** with name, colour, an emoji picker (or type any emoji), and a live preview of how it will look.
4. **Regular payments:** popular tiles (Rent, Netflix, Spotify, Gym, Phone, Internet, Electricity, Car insurance) or "Something else". A **live preview** shows how it will appear under "Coming up" on Home. Set the amount, how often, the next date, the account and the category. This step can be skipped.
5. **About you:** 5 questions (goal, how I'm paid, what I'm saving for, where it's hard to hold back, tone of tips), saved for a future **AI assistant**. Each can be skipped.
6. **Finish:** a summary of everything. It's all saved at the end, and if saving fails, "Try again" won't create duplicates.

- **Only new users see it**: someone with no accounts who hasn't finished setup. **I never see it.**
- There's a **Sign out** link on the welcome screen in case someone logs in by mistake.

**Previews:**
- Approaches: https://claude.ai/artifact/37XRKEZTSwU8SsuBq1bgf2
- Looks A/B/C: https://claude.ai/artifact/T3o1BUtybWrCPjBqGPY6aT
- Final design C: https://claude.ai/artifact/1qSH3qXLUSJpUE6zuPV258

### Database change I ran
- **New table `user_settings`** (file `005_user_settings.sql`). It stores the budget start day, my "About you" answers, and whether setup is finished.
- My first attempt failed with *"relation profiles already exists"*: the project already had an **older, unused "profiles" table** (id, full_name, currency). Claude renamed the new table to **`user_settings`** so the old one stays untouched, and I ran the new script successfully.
- The budget day I had already set on my phone carried over automatically.

---

## 4. Polished screens
**Preview:** https://claude.ai/artifact/V2xRk2KtidfiTba8WVZCw4

- **Transactions:** soft All / Income / Expense / Transfer switch, blue filter chips with ✕, day headers ("TODAY", "MON 5 OCT") with the day's total in a pill, rounder cards. Rows read "Groceries · Everyday".
- **Analytics:** a **blue summary card** (spent, "▼ 41% vs Sep", Income and Left over tiles), **categories in their own colours** with a split bar, rounder month and daily charts.
- **Savings:** a **navy "Total saved" card** with a yellow ring, a savings-account chart with a net-total tag, a "+ New goal" button, and goal cards with a blue gradient bar plus "Put aside €X a month to reach it by…".
- **Settings:** grouped rows with live summaries (accounts, categories, regular payments), the budget day with the current period, my email and **Sign out**, and the logo at the bottom. The separate Account page (person icon) still exists.
- **Home polish:** the change pill, the new account list with type icons, a budget card finish matching the other blue cards (the pace tag moved next to "Left to spend" so big amounts aren't cut off), and friendly empty states.

---

## 5. Small fixes along the way
- **Amounts like "2.100"** are now read as **two thousand one hundred** everywhere, not 2,10.
- Publishing to Vercel sometimes fails the first time with "Not authorized". Trying again works; Claude now retries automatically.

## 6. Things to remember
- **Set my payday** in **Settings → Budget** if I haven't. It's now saved with my account, so it works on any device.
- After each update, **close and reopen the app** on my phone, sometimes twice.
- The old **"profiles" table** in Supabase isn't used by anything. It's harmless; Claude can give me a script to remove it if I want to tidy up.
- The "About you" answers are stored for a **future AI feature**; nothing uses them yet.

## 7. Next steps
- [ ] Check everything on my phone with my real data (Home, budget card, account list, Settings, the polished screens)
- [ ] Set the budget start day to my payday in Settings
- [ ] Optionally: remove the unused "profiles" table
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Ideas for later: monthly budgets per category, CSV export, using the budget period in Analytics, AI tips based on my answers
