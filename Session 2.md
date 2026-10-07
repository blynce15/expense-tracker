---
title: Session 2
project: Expense Tracker
dates: 2026-10-06 to 2026-10-07
tags:
  - expense-tracker
  - session-log
status: redesigns live
---

# Session 2: Expense Tracker

Redesigning Savings, the add-transaction screen and the Transactions page, with a design preview for every change before it was built.

> [!summary] Where things stand
> - **Savings** has emoji icons, a total ring, a 6-month savings-account chart and simpler goal cards.
> - **Add transaction** is a two-step flow: amount, then name and category, then **Save**.
> - **Transactions** has a Transfer tab, new filters (date range, card, category) and a details sheet with Edit and Delete.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - [[Session 1]] covers how the app was first built.

---

## 1. How we worked this session
- **Preview first, then build.** For each change, Claude made a design preview (a web page with phone mockups, often interactive). I picked an option or asked for changes, and only then was it built.
- **Testing without my login:** Claude can't sign in to my account. To test, it ran the real app on my computer with **made-up sample transactions** and checked every tap and result. The temporary test setup was deleted afterwards. A quick check on my phone with my real data is still a good idea after each change.
- **Every step** was saved in git and then published to Vercel.

---

## 2. Savings page

### Emoji icons on goals
- Each goal now has an **emoji**. There's a quick-pick grid of savings emojis (✈️ 🏠 🚗 💻 💍 🛡️ 🐷 …), or I can type any emoji. Goals without one show 🐷.
- **Database update I ran in Supabase → SQL Editor:** `004_savings_goal_icon.sql`. It adds an `icon` field to savings goals.

### New layout
I went through several rounds of previews: list, tiles, progress rings, a dark hero card, and a version based on a picture I shared. The final design:
- **Top:** the **total saved** across all goals, with a **ring** showing overall progress.
- **Chart:** a bar for each of the **last 6 months**, showing how much went into my **savings account(s)** (blue) or came out (red). The current month is lighter because it isn't over yet. Tap a bar for the exact amount.
  - It uses accounts marked as type **Savings**: transfers in count as money in; transfers or expenses out count as money out. Moving money between two savings accounts doesn't count.
  - It needed no database change, because it reads my existing transactions.
- **Goal cards:** emoji, name, %, progress bar, "€1.800 of €3.000 · by Mar 2027". I asked to remove the "On track / Behind" tags.
- **Finished goals** are hidden from the list but still count in the total.
- **"+ New"** sits next to the "Goals" heading. I tried a few positions for it and picked this one.

**Previews:** https://claude.ai/artifact/Vzedx8XXr69ULPGHUBqoLy

---

## 3. Add transaction (the + button)

### The new flow
Based on a picture I shared, from three options (two steps / one screen / tap-to-save) I chose **two steps**:
1. **Amount:** full screen with Expense / Income / Transfer at the top, a big amount, a **"From Bleap · Today"** chip (tap the account or the date to change them) and the number pad. Then **"Next: name and category"**.
2. **Name and category:** a panel slides up with the amount, account and date, an optional **Name** field ("Pingo Doce") and the categories in coloured circles. Tap a category to select it, then the blue **Save** button right below the categories.
   - **Transfers** show my other accounts here instead of categories: tap where the money goes, then Save.
   - **Category suggestion:** typing a name I've used before pre-selects the category I used last time.

### Decisions and changes I asked for
- The **name is stored in the note field**, so there was no database change. The transaction list already shows it as the title. There's no separate note anymore.
- At first, tapping a category saved straight away. I changed this to **select only, then Save**.
- **Save button:** always blue, directly below the categories, just "Save".
- **Date picker:** calendar only. I removed the Today/Yesterday buttons.
- Adding an expense now takes **4 taps** (amount → Next → category → Save). The brief's goal was 3, and the brief now notes that I want the explicit Save.

**Previews:** https://claude.ai/artifact/WJe13SbPhbsQFH5jDKGyGX

---

## 4. Transactions page

### Transfer tab
- The switch at the top is now **All · Income · Expense · Transfer**.

### New filters
I chose a single filter sheet (design A), with a **sliders icon** instead of the funnel. For the sheet itself, I picked the **simple list** out of three options.
- **Sliders icon** in the top bar. A small number on it shows how many filters are on.
- **Filter sheet:** three rows, each opening its own page:
  - **Date range:** This month, Last month, Last 3 months, This year, All time, or **Custom** (From and To dates on a calendar).
  - **Cards:** tick one or more, or Select all. A transfer shows up if the money left **or arrived** on a selected card.
  - **Categories:** tick one or more. This row is hidden on the Transfer tab.
- **"Show N transactions"** at the bottom shows how many match, and **Reset** clears everything.
- **Chips above the list** show each filter that's on. Tap a chip to remove that filter.
- Filters are remembered when switching tabs.

**Previews:** https://claude.ai/artifact/4UAmdgmVKZRcEK4NJEcAPS

### Transaction details
- **Tapping a transaction**, on the Transactions page or in Home's recent list, opens a details sheet with:
  - the emoji, name and amount;
  - the type, category, account (or From/To for transfers), the full date, and when it was added;
  - the account's balance right now.
- **⋯ (top right):**
  - **Edit transaction** opens the add screens, filled in. After saving, the details update right away.
  - **Delete transaction** asks to confirm, and shows how each affected balance will change (e.g. "Bleap €2.313,80 → €2.337,20"). A transfer shows both accounts.
- **Balances** are always recalculated from transactions, so edits and deletes update them everywhere immediately, including Home and the Savings chart.

**Preview:** https://claude.ai/artifact/2PbEEnnc5Y8dXWBVRtRGqu

---

## 5. Things to remember
- **Mark my savings account as type "Savings"** (Settings → Accounts & cards) if it isn't already, otherwise the Savings chart has nothing to show.
- After each update, **close and reopen the app** on my phone to get the new version.
- One preview came out blank the first time because of a bug in the preview itself. It was fixed, and since then Claude checks previews in its own browser before sending them.
- Small display quirk I noticed: older dates in the transaction list show as "Tue, 2 Sept 2025" instead of the same style as the others. It was there before this session, and Claude offered to tidy it up.

## 6. Next steps
- [ ] Check the new screens on my phone with my real data (Savings chart, add transaction, filters, details, edit, delete)
- [ ] Make sure my savings account is set to type "Savings"
- [ ] Optionally: tidy the "2 Sept 2025" date style in the transaction list
- [ ] Re-add the app to the iPhone Home Screen if not done yet (new icon and launch screen, from [[Session 1]])
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Later: monthly budgets per category, CSV export
