---
title: Session 4
project: Expense Tracker
dates: 2026-10-09
tags:
  - expense-tracker
  - session-log
status: LynxOS with profile, app lock, dark mode and reminders live
---

# Session 4: LynxOS

A big session. The app got its real name, **LynxOS**, a new bottom bar, a new Home top, and redesigned Recurring, Savings and Profile pages. It also gained four new features: **app lock (PIN + Face ID)**, **dark mode**, **payment reminders on my phone**, and **delete all data**. As before, every change started as a design preview.

> [!summary] Where things stand
> - **Bottom bar:** a floating frosted pill with icons only, and a separate blue **+** button on the right.
> - **Home:** a bigger balance with a **fan of cards**. Tap the fan for the account list, then pick an account to open its **own page**. The budget card is now **daily bars**.
> - **Profile** replaces Settings: one round **avatar** in the top bar, with my **photo** and name.
> - **New features:** app lock, dark mode, payment reminders (notifications), default account, and delete all data.
> - The app is called **LynxOS** everywhere I see it, and the **lynx logo** appears in more places.
> - New database tables/scripts **006 to 009**, all of which I ran in Supabase.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - [[Session 1]] covers the first build, [[Session 2]] the early redesigns, and [[Session 3]] Home, the budget and onboarding.

---

## 1. Bottom bar
- I wanted a **floating pill** with **icons only**: the **+** on the right, the tabs on the left.
- From 3 designs I chose **option 2** (frosted white). I didn't like the colour of the +, so I chose **bright blue** from 4 colour options.
- A **light-blue bubble** slides behind the active tab.
- Icons: **house** (Home), **list** (Transactions), **target** (Savings). Analytics started as a pie chart, then became **three rounded bars**, like Revolut.

**Previews:**
- Bar designs and + colours: https://claude.ai/artifact/XZ4QnKZs3uhaN361ojm5Zb
- Icon styles: https://claude.ai/artifact/HponRBWexdekYi7CwgCAms

---

## 2. Home

### Balance and cards
- The monthly **"−246% this month" pill is gone**. The balance and cards are **bigger**.
- I chose **"Card fan"**: my accounts drawn as a fan of cards in the onboarding style.
- Tapping the fan still opens the **list of all accounts**. Picking one opens the **account page**, styled after a Revolut-like picture I shared:
  - a dark navy top with the big card and a **Hide** button;
  - **money in / out this month**;
  - the **latest 30 transactions** grouped by day;
  - **See all**, which opens Transactions filtered to that account.
- The **same card style** is now used everywhere: Profile, the Accounts & cards page (each account is a full card; tap to edit), the edit sheet (live card preview), and the Transactions card filter.

### Budget card
- I chose **"Daily bars"**, but in the app's colours rather than green:
  - a light-blue card with one bar per day of the budget period;
  - **blue** bars, **orange** when a day goes over the daily budget, faint bars for days still to come;
  - a dashed daily-budget line and a pace tag.
- **Touch a bar** to see that day's spending.

**Previews:**
- Home designs: https://claude.ai/artifact/UhXKSkXY1QWkRoCbNtcQf7
- New Home screenshots: https://claude.ai/artifact/Jxom1Ded56WAVEi6SV6SEt
- Cards everywhere (before/after): https://claude.ai/artifact/7zjaXWY1sJGQgT4fmQyKXC
- Budget card designs: https://claude.ai/artifact/4Cu15MzD7sjM3wGBwgQq3k
- Daily bars screenshots: https://claude.ai/artifact/Um9QHp3ExMnL8Ewh4FdRov

---

## 3. Transactions filter
- **Custom date range** now opens a **calendar**: tap the first day, then the last, and the range is highlighted.
- At my request I removed the From/To boxes, the hint under the calendar, the instructions on the Filters sheet, and the transfers note on the Cards page.

**Preview:** https://claude.ai/artifact/D7bYbHvZCTQJxBiQ4FnuYf

---

## 4. Recurring payments
- I chose **design C** from 3 and asked for more polish: a bigger calendar and nicer top tiles.
  - **Blue summary card:** per month, per year, and number of active payments.
  - **Big month calendar** with each payment's icon on its day. Tap a day to see its payments; arrows change the month.
  - The list is grouped into **This month / Later / Paused**, with **+** in the top bar.
- **Tapping a payment opens a details sheet**, adapted from a picture I shared:
  - a status tag and **Mark paid**;
  - the amount, plus boxes for Next payment, Repeats, Total paid and Category;
  - **Paid from** card, **Pause/Resume**, **Delete**, and a pencil to edit.
  - I left out auto-renew and the reminder switch for now.
- The same sheet opens from **"Coming up" on Home**.

**Previews:**
- Designs: https://claude.ai/artifact/L39ago7RkPu3yyMwYQpBnn
- Polished C: https://claude.ai/artifact/HxcZqaA5nYk6aFmxHmLUCT
- Screenshots: https://claude.ai/artifact/BZq7EBj6p89NzZ7Cc756EG

---

## 5. Savings
- I chose **design A**:
  - a **blue total card** with a white progress ring and Target / Goals boxes;
  - the savings-account chart as a light-blue card (blue months in, orange months out; tap a bar);
  - goal cards showing "€X to go" and a pace tag (€/month, No deadline, Deadline passed).
- **Reached goals** are listed as small rows at the end.

**Preview:** https://claude.ai/artifact/4VuC6CyEE1dGR7qqR456hb

---

## 6. Profile (replaces Settings)
- **Settings and Account were merged into Profile.** The top bar has **one round avatar** on every tab: my photo, or the first letter of my name.
- **Profile photo:** Edit profile lets me add, change or remove a photo and set my name.
- **Default account:** pin the account new transactions start on, or keep "Last used".
- **Redesign** (my mix of options B and C):
  - centred photo with Edit profile;
  - **4 tiles**: Accounts & cards, Recurring, Categories, Default account;
  - a compact **Budget** row;
  - **Appearance** with three little theme previews;
  - a **Notifications & security** card;
  - **Sign out / Delete all data**;
  - a LynxOS footer.
- The **Back** button now returns to the screen I came from.
- "About you" answers are not shown (my choice, not now).

**Previews:**
- First designs: https://claude.ai/artifact/7Ujp49z8SPZB1vWpPGKsY1
- Redesign options: https://claude.ai/artifact/4z3pK2p7HWaHkWnHz6Udbd

---

## 7. App lock (PIN + Face ID)
- **Profile → App lock:**
  1. Choose a 4-digit PIN (twice).
  2. Optionally turn on **Face ID**.
  3. **Change PIN** whenever I like.
  4. Turning the lock off needs the PIN.
- The app **locks every time I open it or leave it** (except while picking a photo).
- **Face ID needs one tap** to start; iPhone doesn't allow it to start by itself in a home-screen app.
- **Forgot PIN?** Signs me out and removes the lock; I sign in again with email and password.
- The lock is **stored on this phone only**. It's a privacy lock, not encryption.
- The lock screen is blue, with the **white lynx and "LynxOS" at the top** and my photo in the middle with soft rings. I didn't like a bigger lock-screen redesign, so only the logo was added and the layout tidied.

**Previews:**
- Lock designs: https://claude.ai/artifact/W1puDJh8qVPaP4mhSjm9QK
- How it works (tap-through): https://claude.ai/artifact/AESkppHQXSvivYZK6TQ5RR

---

## 8. Dark mode
- **Profile → Appearance:** Light / Dark / **Auto** (follows the iPhone). It's saved on each device and defaults to Light.
- Every screen, sheet, dropdown and onboarding step was checked in dark mode.
- **App icon and launch screen stay light.** A home-screen web app can't switch its icon with the iPhone's dark/tinted icon setting. A dark version was made and then **discarded** at my request.

**Preview (discarded idea):** https://claude.ai/artifact/BrFiW9GgW4KuLXf1dUFwoY

---

## 9. Payment reminders (phone notifications)
- **Profile → Payment reminders.** The iPhone asks for permission, and this phone is saved for reminders.
- **Every morning at about 9:00** (Lisbon time), the server checks for payments **due tomorrow** and sends one notification:
  - Title: **"Due tomorrow · 🎬 Netflix"**
  - Body: **"€12,99 · Main card · Sat 10 Oct"**
  - Several payments are combined: "Due tomorrow · 2 payments", one line each.
- Tapping the notification opens Recurring; from there, tap the payment → **Mark paid**.
- Only works in the app **added to the Home Screen**.
- **Setup I did:**
  - added secret keys in Vercel, including the Supabase service role key (server only, never in the app);
  - ran scripts **006** (table `push_subscriptions`), **007** and **008** (permissions; the first test failed with *"permission denied for table push_subscriptions"* until 007 was run).
- The **test notification arrived** on my iPhone. Afterwards I asked to **remove the "Send a test notification" button**.

**Previews:**
- How it works: https://claude.ai/artifact/AtTnjm3fbgDPfYxvAFo4jt
- Notification styles (I chose C, calendar style): https://claude.ai/artifact/CncRnzbVqWsyNPnYn4pnTp

---

## 10. Delete all data
- **Profile → Danger zone → Delete all data:**
  1. Type **DELETE**.
  2. Enter the PIN or Face ID if the lock is on.
  3. Everything goes at once (all or nothing): transactions, recurring payments, goals, accounts, categories, reminders, and settings.
- The app then **restarts the onboarding**.
- **My login stays**; theme and app lock (phone settings) stay too.
- No backup/export first (my choice). There is **no "delete account"**; I decided to keep only delete data.
- Needed script **009**, which I ran.

---

## 11. LynxOS name and logo
- **"Expense tracker" is now "LynxOS"** in everything I see: the Home Screen name, the title, Login ("Lynx" + blue "OS"), the lock screen, the Profile footer, notifications and Face ID. Vercel and GitHub names stay the same.
- **The Home Screen label only changes if I remove the app and add it again.**
- **The lynx logo** now appears:
  - before the title of each main tab (Home, Transactions, Analytics, Savings);
  - on Login and in the Profile footer;
  - faded on empty screens;
  - as a faint white watermark on the blue cards;
  - in white on the lock screen.
- The **white strip behind the clock** in light mode is iPhone's own and can't be recoloured.

**Previews:**
- Logo spots: https://claude.ai/artifact/NN7NPYygqKZ2rPTvSnBJ7m
- All branding changes: https://claude.ai/artifact/75iMp2F7cZ4KbvHmq4aExu

---

## 12. Things to remember
- **My data lives in Supabase**, not on the phone: on an iPad (or any device), signing in shows everything. **Per device:** theme, app lock, reminders and hidden amounts. On iPad the app shows as a phone-width column.
- After each update, **close and reopen the app**, sometimes twice.
- Reminders need the app **from the Home Screen**, with notifications allowed in iPhone Settings.
- **Face ID** on my iPhone is set up but not confirmed yet.
- Publishing to Vercel sometimes fails once with "Not authorized"; Claude retries.

## 13. Next steps
- [ ] Try Face ID on my iPhone
- [ ] Re-add the app to the Home Screen so it's labelled "LynxOS"
- [ ] Connect GitHub to Vercel for automatic publishing (needs me at the computer)
- [ ] Profile ideas to pick from: hide amounts on open, change password, first day of week, CSV export, app info / what's new, change email, stats
- [ ] Bigger ideas: monthly budgets per category, importing bank CSVs, iPad layout, app icon badge
