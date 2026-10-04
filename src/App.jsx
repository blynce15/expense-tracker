import { supabase } from './lib/supabase'
import { useSession } from './lib/useSession'
import Login from './screens/Login'

function App() {
  const session = useSession()

  if (session === undefined) return null
  if (!session) return <Login />

  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-6">
      <p>Signed in as {session.user.email}</p>
      <button onClick={() => supabase.auth.signOut()} className="rounded-xl border px-4 py-2">
        Sign out
      </button>
    </main>
  )
}

export default App
