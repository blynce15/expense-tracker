import { useEffect, useState } from 'react'
import { TabBar, TopBar } from './components/AppShell'
import Icon from './components/Icon'
import { formatTodayLabel } from './lib/dates'
import { ensureDefaultCategories } from './lib/defaults'
import { activeFilterCount, EMPTY_FILTER } from './lib/filters'
import { fetchLastUsedAccountId, fetchLookups } from './lib/lookups'
import { needsOnboarding } from './lib/onboarding'
import { fetchProfile } from './lib/profile'
import { navigate, useRoute } from './lib/useRoute'
import { useOnline } from './lib/useOnline'
import { useSession } from './lib/useSession'
import Account from './screens/Account'
import Accounts from './screens/Accounts'
import Analytics from './screens/Analytics'
import Categories from './screens/Categories'
import Home from './screens/Home'
import Login from './screens/Login'
import Onboarding from './screens/Onboarding'
import Recurring from './screens/Recurring'
import Savings from './screens/Savings'
import Settings from './screens/Settings'
import Transactions from './screens/Transactions'
import TransactionSheet from './screens/TransactionSheet'

function App() {
  const session = useSession()
  const route = useRoute()
  const online = useOnline()
  const [adding, setAdding] = useState(false)
  // Bumped after a save so screens reload their data
  const [dataVersion, setDataVersion] = useState(0)
  // Transactions filter lives here so it's kept when switching tabs
  const [txFilter, setTxFilter] = useState(EMPTY_FILTER)
  const [filterOpen, setFilterOpen] = useState(false)
  // undefined while checking, then true for a new user who still has to set up
  const [onboarding, setOnboarding] = useState(undefined)

  const userId = session?.user.id
  useEffect(() => {
    if (!userId) return
    setOnboarding(undefined)
    fetchProfile()
      .then(needsOnboarding)
      .catch((e) => {
        console.error('Onboarding check:', e)
        return false
      })
      .then((isNew) => {
        setOnboarding(isNew)
        // New users choose their categories during setup
        if (isNew) return
        // Load accounts/categories early so the Add screen opens instantly
        return ensureDefaultCategories().then(() => Promise.all([fetchLookups(), fetchLastUsedAccountId()]))
      })
      .catch((e) => console.error('Startup data:', e))
  }, [userId])

  if (session === undefined) return null
  if (!session) return <Login />
  if (onboarding === undefined) return null
  if (onboarding) {
    return (
      <Onboarding
        onDone={() => {
          setOnboarding(false)
          setDataVersion((v) => v + 1)
          navigate('/home')
        }}
      />
    )
  }

  const screen = screenFor(route, session, dataVersion, { txFilter, setTxFilter, filterOpen, setFilterOpen })

  return (
    <div className="min-h-full pb-[calc(5rem+env(safe-area-inset-bottom))]">
      <TopBar title={screen.title} back={screen.back} action={screen.action} center={screen.center} />
      {!online && (
        <p role="status" className="mx-4 mb-2 rounded-xl bg-ink px-4 py-2.5 text-sm text-white">
          You're offline. Your data will load again when you're back online.
        </p>
      )}
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

function screenFor(route, session, dataVersion, tx) {
  switch (route) {
    case '/transactions': {
      const active = activeFilterCount(tx.txFilter)
      return {
        title: 'Transactions',
        action: (
          <button
            onClick={() => tx.setFilterOpen(true)}
            className={`relative grid size-11 place-items-center rounded-full ${active ? 'text-cobalt' : 'text-muted'}`}
            aria-label="Filters"
          >
            <Icon name="sliders" size={22} />
            {active > 0 && (
              <span className="absolute top-1.5 right-1.5 grid size-4 place-items-center rounded-full bg-cobalt text-[10px] font-bold text-white">
                {active}
              </span>
            )}
          </button>
        ),
        body: (
          <Transactions
            key={dataVersion}
            filter={tx.txFilter}
            onFilterChange={tx.setTxFilter}
            filterOpen={tx.filterOpen}
            onFilterClose={() => tx.setFilterOpen(false)}
          />
        ),
      }
    }
    case '/analytics':
      return { title: 'Analytics', body: <Analytics key={dataVersion} /> }
    case '/savings':
      return { title: 'Savings', body: <Savings key={dataVersion} /> }
    case '/settings':
      return { title: 'Settings', back: '/home', body: <Settings /> }
    case '/settings/accounts':
      return { title: 'Accounts & cards', back: '/settings', body: <Accounts key={dataVersion} /> }
    case '/settings/categories':
      return { title: 'Categories', back: '/settings', body: <Categories /> }
    case '/recurring':
      return { title: 'Recurring payments', back: '/home', body: <Recurring key={dataVersion} /> }
    case '/account':
      return { title: 'Account', back: '/home', body: <Account session={session} /> }
    default:
      return { title: 'Home', center: formatTodayLabel(), body: <Home key={dataVersion} /> }
  }
}

export default App
