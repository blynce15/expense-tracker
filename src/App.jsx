import { useEffect, useState } from 'react'
import { TabBar, TopBar } from './components/AppShell'
import { ensureDefaultCategories } from './lib/defaults'
import { fetchLastUsedAccountId, fetchLookups } from './lib/lookups'
import { useRoute } from './lib/useRoute'
import { useSession } from './lib/useSession'
import Account from './screens/Account'
import Accounts from './screens/Accounts'
import Categories from './screens/Categories'
import Home from './screens/Home'
import Login from './screens/Login'
import Placeholder from './screens/Placeholder'
import Settings from './screens/Settings'
import Transactions from './screens/Transactions'
import TransactionSheet from './screens/TransactionSheet'

function App() {
  const session = useSession()
  const route = useRoute()
  const [adding, setAdding] = useState(false)
  // Bumped after a save so screens reload their data
  const [dataVersion, setDataVersion] = useState(0)

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    // Load accounts/categories early so the Add screen opens instantly
    ensureDefaultCategories()
      .then(() => Promise.all([fetchLookups(), fetchLastUsedAccountId()]))
      .catch((e) => console.error('Startup data:', e))
  }, [userId])

  if (session === undefined) return null
  if (!session) return <Login />

  const screen = screenFor(route, session, dataVersion)

  return (
    <div className="min-h-full pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <TopBar title={screen.title} back={screen.back} />
      <main>{screen.body}</main>
      <TabBar route={route} onAdd={() => setAdding(true)} />
      {adding && (
        <TransactionSheet
          transaction={null}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            setDataVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

function screenFor(route, session, dataVersion) {
  switch (route) {
    case '/transactions':
      return { title: 'Transactions', body: <Transactions key={dataVersion} /> }
    case '/analytics':
      return { title: 'Analytics', body: <Placeholder text="Spending insights arrive in phase 3." /> }
    case '/savings':
      return { title: 'Savings', body: <Placeholder text="Savings goals arrive in phase 4." /> }
    case '/settings':
      return { title: 'Settings', back: '/home', body: <Settings /> }
    case '/settings/accounts':
      return { title: 'Accounts & cards', back: '/settings', body: <Accounts key={dataVersion} /> }
    case '/settings/categories':
      return { title: 'Categories', back: '/settings', body: <Categories /> }
    case '/account':
      return { title: 'Account', back: '/home', body: <Account session={session} /> }
    default:
      return { title: 'Home', body: <Home key={dataVersion} /> }
  }
}

export default App
