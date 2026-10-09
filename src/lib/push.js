import { supabase } from './supabase'

// Payment reminders as phone notifications (Web Push). This phone's subscription is saved in
// push_subscriptions; api/remind.js on Vercel sends the reminders every morning.

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// iPhone: only in the app added to the Home Screen (iOS 16.4+)
export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!PUBLIC_KEY
}

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true

function keyBytes(base64) {
  const s = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function currentSubscription() {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

// On when this phone has a subscription that's also saved for this account
export async function remindersOn() {
  if (!pushSupported() || Notification.permission !== 'granted') return false
  const sub = await currentSubscription()
  if (!sub) return false
  const { data } = await supabase.from('push_subscriptions').select('id').eq('endpoint', sub.endpoint).maybeSingle()
  return !!data
}

// Must run from a tap: the iPhone asks "Allow notifications?"
export async function turnOnReminders() {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notifications are turned off for this app in iPhone Settings.')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) }))
  const { endpoint, keys } = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions').upsert({ endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function turnOffReminders() {
  const sub = await currentSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Asks the server to send a test notification to this account's phones
export async function sendTestReminder() {
  const { data } = await supabase.auth.getSession()
  const res = await fetch('/api/remind?test=1', { method: 'POST', headers: { Authorization: `Bearer ${data.session?.access_token}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `The server answered ${res.status}.`)
  return body
}
