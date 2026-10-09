import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    setBusy(false)
  }

  return (
    <main className="flex min-h-full flex-col justify-center px-6 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-sm">
        <img src="/app-icon.png" alt="" className="mx-auto mb-5 size-24 rounded-[26px] shadow-[0_6px_20px_-8px_rgba(11,27,69,0.35)]" />
        <h1 className="mb-8 text-center font-display text-3xl font-bold tracking-tight">LynxOS</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            autoComplete="email"
            placeholder="Email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-line bg-card px-4 py-3 text-base outline-none focus:border-cobalt"
          />
          {error && <p className="text-sm text-loss">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-cobalt py-3.5 text-base font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  )
}
