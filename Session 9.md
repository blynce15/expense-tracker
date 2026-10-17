---
title: Session 9
project: Expense Tracker
dates: 2026-10-17
tags:
  - expense-tracker
  - session-log
  - ai-generated
status: code on GitHub with auto-deploys, monthly data backup, security review passed, cleanup, faster app, 71 automated tests, all live
---

# Session 9: Making LynxOS safe, clean and fast

This session added no new screens. I worked through the "missing steps" from [[Session 8]]: the code is now **backed up on GitHub** and **publishes itself**, my **data backs up every month** to OneDrive, a **security review** passed, old unused things were **cleaned out**, the app got **faster** (and a hidden bug was fixed before it could hit me), and there are now **automated tests** that stop a broken calculation from going live.

> [!summary] Where things stand
> - **Code:** private GitHub repo https://github.com/blynce15/expense-tracker. Every change Claude uploads **goes live by itself** (Vercel).
> - **Data:** backed up on the **1st of every month at 12:00** into `OneDrive\Documents\Dados Pessoais\Bazinho\Finances\Expense-tracker`.
> - **Security:** every table protected, strangers refused, sign-ups off, no secret key in the app.
> - **Database** now has only the **8 tables** LynxOS uses. Scripts **016–019** were run by Claude (after a backup each time).
> - **Faster**, with correct balances however long my history gets. Tabs show their last content straight away.
> - **71 automated tests** run before every publish.
> - Everything is live: https://expense-tracker-phi-ivory-98.vercel.app
> - Earlier sessions: [[Session 1]], [[Session 2]], [[Session 3]], [[Session 4]], [[Session 5]], [[Session 6]], [[Session 7]], [[Session 8]].

---

## 1. Code backed up on GitHub
- Before, the code existed **only on my laptop**. If it broke, nothing could be changed any more (the live app would keep running).
- Claude first checked the whole history: **no passwords or secret keys** were ever saved in the code, so it was safe to upload.
- Created a **private** repo `blynce15/expense-tracker` and uploaded everything. I only had to sign in to GitHub and Vercel once in the browser pane, and click **Install** for the Vercel GitHub app (only for this repo).
- **Vercel is connected to GitHub**: every upload now publishes the app automatically (about 30 seconds). Tested and confirmed.

## 2. Monthly data backup
- Supabase's free plan has **no backups I can restore**, so I chose a **monthly backup to my PC**, saved in a **OneDrive** folder so it's also in the cloud.
- **Windows Task Scheduler** runs it on the **1st of every month at 12:00**. If the laptop is off, it runs the next time I turn it on. It runs hidden and needs internet.
- Each month adds a dated folder, e.g. `LynxOS backup 2026-11-01`, with:
  - one **Excel-friendly file per table** (transactions, accounts…)
  - **backup.json**: the full copy Claude would use to put everything back
  - **what is in here.txt**: rows per table
- If it ever fails, a **BACKUP FAILED.txt** file appears in the folder with the reason.
- The database address and password live in a secret file **only on my PC** (`.env.backup`), never on GitHub. The first try failed because I'd left the **[ ]** brackets around the password.
- New helper (pg) added, only for the backup, never in the app on my phone.
- There's no "restore" button yet: if needed, Claude rebuilds everything from these files plus the code on GitHub.

## 3. Security review: passed
- **Row Level Security is on for every table**, so I can only see my own rows. Claude tried reading my data as a stranger: **refused** every time.
- **Public sign-ups are off** (confirmed), so nobody else can make an account.
- **Server helpers** (reminders and getquin) only do what they should: reminders need Vercel's secret password; getquin needs me signed in and only talks to getquin's own addresses.
- **No secret key** in the app on my phone (checked a fresh build and the live app).
- Four small tidy-ups applied (script **016**): a safety setting on two old functions, removed the "empty a whole table" permission, getquin no longer needs the secret key, and reminder errors are in plain words. **Investments still refresh fine** (checked on my iPhone).

## 4. Cleanup
- **Deleted the 7 old tables** from before LynxOS (old `profiles`, `expenses`, `holdings`…) and their sign-up functions (script **017**). They were empty and unused.
- **Housekeeping** (script **018**):
  - accounts can only be **Bank, Cash, Savings or Meal card** now (no credit cards or investment accounts existed)
  - an old unused **goal amount column** was removed (goals still work out their money from transactions)
- Removed unused code: old credit card/investment account rules, old safety nets, the old phone-only budget day, three old forwarding addresses, and leftovers from the old Analytics.
- Each step had its own backup folder in OneDrive ("before deleting old tables", "before housekeeping", "before speed-up").

## 5. Faster, and a hidden bug fixed
- **The bug:** Supabase sends at most **1.000 rows per request**. Balances, savings goals and Analytics downloaded my **whole history** in one go. After about a year of transactions they would have shown **wrong numbers without any warning**. With 5 years of made-up test data, Main card showed €2.660,59 instead of €12,26.
- **Fixed** (script **019**): the **database adds up the balances** and sends one line per account. Goals only load savings transactions, and Analytics loads in batches of 1.000.
- **Faster:**
  - downloads much smaller (with 5 years of test data: Home 412 KB → 19 KB, Savings 784 KB → 27 KB)
  - the app starts with less code (≈ 550 KB instead of 820 KB)
  - **tabs show their last content straight away** and refresh in the background
  - fewer duplicate requests
- Checked on my iPhone: balances right, feels faster.

## 6. Automated tests
- **71 tests** check the riskiest parts:
  - **Money:** amounts shown as €1.234,56, typed amounts read correctly, the number pad
  - **No account below €0**, including edits, deletes, transfers and Invest
  - **Savings goals:** goals + General savings always equal the savings balance; no goal below €0
  - **Budget and recurring:** payday periods (31st, new year), next due dates (short months, leap years), cost per month
  - **Analytics:** income, spending, kept, "by the same day" comparisons, usual month, fixed bills, categories, net worth, the year view; transfers and Invest are never spending
- **Vercel runs the tests before every publish.** If one fails, the update doesn't go live and my phone keeps the last good version.
- Proven: Claude broke three rules on purpose and the tests caught each one.
- New helper: **Vitest** (test tool, never in the app on my phone).

---

## 7. Things to remember
- After each update, **close and reopen the app** (sometimes twice).
- If **BACKUP FAILED.txt** appears in the backup folder, tell Claude.
- My **database password** is in `.env.backup` on this PC: keep the Windows login protected.
- **supa_pass.txt** in the backup folder holds a password in plain text: move it into a password manager and delete the file.
- Old backup copies from today are kept in OneDrive ("before deleting old tables", "before housekeeping", "before speed-up").
- Updates now go live **only if all tests pass**.

## 8. Missing steps (Claude's review at the end)
- No **restore** button or script yet (the backups exist, but putting data back would be a manual job).
- No **error tracking** if something breaks on my iPhone.
- No **offline adding** of transactions.
- Tests cover the calculations, not the screens themselves (tapping through Add transaction, etc.).

## 9. Next steps
- [x] ~~Put the code on GitHub and connect it to Vercel~~
- [x] ~~Set up a monthly data backup~~
- [x] ~~Check public signups are off in Supabase~~
- [x] ~~Add automated tests for the money rules and Analytics~~
- [ ] Delete **supa_pass.txt** (after saving the password in a password manager)
- [ ] **Delete all data** and go through the new setup for real (from [[Session 6]])
- [ ] Try Face ID on my iPhone (still not confirmed from [[Session 4]])
- [ ] Rethink **subscriptions**
- [ ] Maybe: a restore script, error tracking, offline adding
- [ ] Maybe later: AI assistant, CSV export, budgets per category, Net worth details page
