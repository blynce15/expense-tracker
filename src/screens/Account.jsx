import { supabase } from '../lib/supabase'

export default function Account({ session }) {
  return (
    <div className="mx-4 mt-2 space-y-4">
      <div className="rounded-2xl bg-card px-4 py-4">
        <p className="text-sm text-muted">Signed in as</p>
        <p className="text-base font-medium">{session.user.email}</p>
      </div>
      <button
        onClick={() => supabase.auth.signOut()}
        className="w-full rounded-2xl bg-card py-4 text-base font-medium text-loss"
      >
        Sign out
      </button>
    </div>
  )
}
