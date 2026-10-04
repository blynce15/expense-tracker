import { useEffect, useState } from 'react'
import { TabBar, TopBar } from './components/AppShell'
import { ensureDefaultCategories } from './lib/defaults'
import { useRoute } from './lib/useRoute'
import { useSession } from './lib/useSession'
import Account from './screens/Account'
import Accounts from './screens/Accounts'
import Login from './screens/Login'
import Placeholder from './screens/Placeholder'
import Settings from './screens/Settings'

function App() {
  const session = useSession()
  const route = useRoute()
  const [adding, setAdding] = useState(false)

  const userId = session?.user.id
  useEffect(() => {
    if (userId) ensureDefaultCategories().catch((e) => console.error('Default categories:', e))
  }, [userId])

  if (session === undefined) return null
  if (!session) return <Login />

  const screen = screenFor(route, session)

  return (
    <div className="min-h-full pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <TopBar title={screen.title} back={screen.back} />
      <main>{screen.body}</main>
      <TabBar route={route} onAdd={() => setAdding(true)} />
      {adding && (
        // Replaced by the real "Add transaction" screen in the next step
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-6" onClick={() => setAdding(false)}>
          <p className="rounded-2xl bg-card p-6 text-center">Add transaction is coming in the next step.</p>
        </div>
      )}
    </div>
  )
}

function screenFor(route, session) {
  switch (route) {
    case '/transactions':
      return { title: 'Transactions', body: <Placeholder text="Your transactions will appear here." /> }
    case '/analytics':
      return { title: 'Analytics', body: <Placeholder text="Spending insights arrive in phase 3." /> }
    case '/savings':
      return { title: 'Savings', body: <Placeholder text="Savings goals arrive in phase 4." /> }
    case '/settings':
      return { title: 'Settings', back: '/home', body: <Settings /> }
    case '/settings/accounts':
      return { title: 'Accounts & cards', back: '/settings', body: <Accounts /> }
    case '/account':
      return { title: 'Account', back: '/home', body: <Account session={session} /> }
    default:
      return { title: 'Home', body: <Placeholder text="Your monthly overview arrives in phase 2." /> }
  }
}

export default App
