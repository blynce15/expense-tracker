// Payment reminders, run by Vercel Cron every morning (vercel.json): for each recurring payment
// due tomorrow, a notification goes to the phones of its owner that turned reminders on
// (recurring income gets its own note; the wording is in reminderText). On the 1st of each month, owners of a pension fund
// (Investments → Pension) with no entry for the month yet get "Update due · 🏛️ Pension".
// POST /api/remind?test=1 with the user's login token sends a test notification to that user only.
//
// Needs these Vercel settings: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only, never in the app),
// VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const TIME_ZONE = 'Europe/Lisbon'

// "2026-10-10": today's (0) or tomorrow's (1) date where the owner lives
function lisbonISO(addDays) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  )
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + addDays))
  return d.toISOString().slice(0, 10)
}

// "Sat 10 Oct"
function shortDay(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '').replace('Sept', 'Sep')
}

const euros = (cents) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/\s?€$/, '').replace(/^/, '€')
// "€12,99", but "€2.100" for round amounts
const shortEuros = (cents) => euros(cents).replace(/,00$/, '')

// What a reminder says (owner chose "Simple 1", 2026-11-07): what and how much in bold, "Tomorrow" under it.
//   one payment:  "🎬 Netflix · €12,99" / "Tomorrow"
//   several:      "3 payments · €42,48" / "Tomorrow: Netflix, Spotify, Uber"
//   income:       "💼 Salary · +€2.100" / "Tomorrow"  (several: "2 incomes · +€2.600")
export function reminderText(list, income) {
  const sign = income ? '+' : ''
  if (list.length === 1) {
    const p = list[0]
    return { title: `${p.icon ? `${p.icon} ` : ''}${p.name} · ${sign}${shortEuros(p.amount_cents)}`, body: 'Tomorrow' }
  }
  const total = list.reduce((sum, p) => sum + p.amount_cents, 0)
  return {
    title: `${list.length} ${income ? 'incomes' : 'payments'} · ${sign}${shortEuros(total)}`,
    body: `Tomorrow: ${list.map((p) => p.name).join(', ')}`,
  }
}

export default async function handler(req, res) {
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'CRON_SECRET'].filter((k) => !process.env[k])
  if (missing.length) return res.status(500).json({ error: `Reminders aren't set up yet (missing ${missing.join(', ')} in Vercel).` })

  // The publishable key looks similar but can't read other tables; say so clearly
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  let keyRole = key.startsWith('sb_secret_') ? 'service_role' : key.startsWith('sb_publishable_') ? 'anon' : null
  if (!keyRole) {
    try {
      keyRole = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role
    } catch {
      keyRole = 'unknown'
    }
  }
  if (keyRole === 'anon') {
    return res.status(500).json({ error: 'The key in Vercel (SUPABASE_SERVICE_ROLE_KEY) is the publishable one. Use the secret key from Supabase → Project Settings → API Keys.' })
  }

  const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  webpush.setVapidDetails('https://expense-tracker-phi-ivory-98.vercel.app', process.env.VITE_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')

  // Sends one notification to every phone of a user; forgets phones that turned notifications off
  async function notify(userId, message) {
    const { data: subs, error } = await db.from('push_subscriptions').select('*').eq('user_id', userId)
    if (error) throw error
    let sent = 0
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(message), { TTL: 60 * 60 * 12 })
        sent += 1
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', s.id)
      }
    }
    return sent
  }

  try {
    // Test from Profile: only the signed-in user, only their phones
    if (req.query.test) {
      const { data, error } = await db.auth.getUser(token)
      if (error || !data.user) return res.status(401).json({ error: 'Please sign in again.' })
      const sent = await notify(data.user.id, { title: 'Reminders are on', body: "You'll get a note the morning before each payment is due.", tag: 'test' })
      return res.status(200).json({ sent })
    }

    // Daily run: only Vercel Cron knows the secret
    if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'Not allowed.' })

    const due = lisbonISO(1)
    const { data: payments, error } = await db.from('recurring_payments').select('user_id, name, icon, amount_cents, type').eq('active', true).eq('next_due', due)
    if (error) throw error

    const byUser = new Map()
    for (const p of payments) byUser.set(p.user_id, [...(byUser.get(p.user_id) ?? []), p])

    let sent = 0
    for (const [userId, list] of byUser) {
      const costs = list.filter((p) => p.type !== 'income')
      const income = list.filter((p) => p.type === 'income')
      if (costs.length) sent += await notify(userId, { ...reminderText(costs, false), tag: `due-${due}`, url: '/#/recurring' })
      if (income.length) sent += await notify(userId, { ...reminderText(income, true), tag: `pay-${due}`, url: '/#/recurring' })
    }
    // Pension: on the 1st, a note to enter this month's numbers (needs migration 020's grant).
    // "Update due · 🏛️ Pension" / "Last updated 31 Oct"; tapping it opens the update.
    const today = lisbonISO(0)
    let pensions = 0
    if (today.endsWith('-01')) {
      const { data: entries, error: pensionError } = await db.from('pension_entries').select('user_id, date')
      if (pensionError) throw pensionError
      const latest = new Map()
      for (const e of entries) if (!latest.has(e.user_id) || e.date > latest.get(e.user_id)) latest.set(e.user_id, e.date)
      for (const [userId, date] of latest) {
        if (date.slice(0, 7) === today.slice(0, 7)) continue
        pensions += 1
        sent += await notify(userId, { title: 'Update due · 🏛️ Pension', body: `Last updated ${shortDay(date).replace(/^\w+ /, '')}`, tag: `pension-${today.slice(0, 7)}`, url: '/#/investments/pension?update' })
      }
    }
    return res.status(200).json({ due, payments: payments.length, pensions, sent })
  } catch (e) {
    // The details go to Vercel's logs only; the answer stays plain
    const hint = /permission denied/.test(e.message) ? ' Run supabase/migrations/007_reminders_server_access.sql in the Supabase SQL Editor.' : ''
    console.error('remind failed:', e.message + hint)
    return res.status(500).json({ error: 'Reminders could not be sent. Details are in the Vercel logs.' })
  }
}
