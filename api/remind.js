// Payment reminders, run by Vercel Cron every morning (vercel.json): for each recurring payment
// due tomorrow, a notification goes to the phones of its owner that turned reminders on.
// POST /api/remind?test=1 with the user's login token sends a test notification to that user only.
//
// Needs these Vercel settings: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only, never in the app),
// VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, CRON_SECRET.

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const TIME_ZONE = 'Europe/Lisbon'

// "2026-10-10": tomorrow's date where the owner lives
function tomorrowISO() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()).map((p) => [p.type, p.value]),
  )
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + 1))
  return d.toISOString().slice(0, 10)
}

const euros = (cents) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100).replace(/\s?€$/, '').replace(/^/, '€')

export default async function handler(req, res) {
  const missing = ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'CRON_SECRET'].filter((k) => !process.env[k])
  if (missing.length) return res.status(500).json({ error: `Reminders aren't set up yet (missing ${missing.join(', ')} in Vercel).` })

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

    const due = tomorrowISO()
    const { data: payments, error } = await db.from('recurring_payments').select('user_id, name, icon, amount_cents').eq('active', true).eq('next_due', due)
    if (error) throw error

    const byUser = new Map()
    for (const p of payments) byUser.set(p.user_id, [...(byUser.get(p.user_id) ?? []), p])

    let sent = 0
    for (const [userId, list] of byUser) {
      const message =
        list.length === 1
          ? { title: `${list[0].icon ?? ''} ${list[0].name} · due tomorrow`.trim(), body: `${euros(list[0].amount_cents)} will be due tomorrow. Tap to see it.` }
          : {
              title: `${list.length} payments due tomorrow`,
              body: list.map((p) => `${p.name} ${euros(p.amount_cents)}`).join(' · '),
            }
      sent += await notify(userId, { ...message, tag: `due-${due}`, url: '/#/recurring' })
    }
    return res.status(200).json({ due, payments: payments.length, sent })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
