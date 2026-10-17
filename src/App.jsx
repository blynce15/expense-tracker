import { lazy, Suspense, useEffect, useState } from 'react'
import { TabBar, TopBar } from './components/AppShell'
import Icon from './components/Icon'
import LockScreen from './components/LockScreen'
import { lockSettings, shouldLockOnLeave } from './lib/applock'
import './lib/theme'
import { formatTodayLabel } from './lib/dates'
import { ensureDefaultCategories } from './lib/defaults'
import { activeFilterCount, EMPTY_FILTER } from './lib/filters'
import { fetchLastUsedAccountId, fetchLookups, lookupCache } from './lib/lookups'
import { needsOnboarding } from './lib/onboarding'
import { fetchProfile } from './lib/profile'
import { navigate, useRoute } from './lib/useRoute'
import { useOnline } from './lib/useOnline'
import { useSession } from './lib/useSession'
import Home from './screens/Home'
import Login from './screens/Login'
import TransactionSheet from './screens/TransactionSheet'

// Every other screen is its own piece of code, loaded the first time it's needed, so the app starts with
// only Home and Add. Once the app is up, the rest load quietly in the background (see preloadScreens).
const load = {
  accounts: () => import('./screens/Accounts'),
  analytics: () => import('./screens/Analytics'),
  analyticsCategories: () => import('./screens/AnalyticsCategories'),
  analyticsSaving: () => import('./screens/AnalyticsSaving'),
  analyticsSpending: () => import('./screens/AnalyticsSpending'),
  analyticsTrends: () => import('./screens/AnalyticsTrends'),
  categories: () => import('./screens/Categories'),
  investments: () => import('./screens/Investments'),
  onboarding: () => import('./screens/Onboarding'),
  recurring: () => import('./screens/Recurring'),
  savings: () => import('./screens/Savings'),
  settings: () => import('./screens/Settings'),
  transactions: () => import('./screens/Transactions'),
}
const named = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })))
const Accounts = lazy(load.accounts)
const Analytics = lazy(load.analytics)
const AnalyticsCategories = lazy(load.analyticsCategories)
const CategoryDetail = named(load.analyticsCategories, 'CategoryDetail')
const AnalyticsSaving = lazy(load.analyticsSaving)
const AnalyticsSpending = lazy(load.analyticsSpending)
const AnalyticsTrends = lazy(load.analyticsTrends)
const Categories = lazy(load.categories)
const Investments = lazy(load.investments)
const InvestmentsRefresh = named(load.investments, 'InvestmentsRefresh')
const Onboarding = lazy(load.onboarding)
const Recurring = lazy(load.recurring)
const Savings = lazy(load.savings)
const Settings = lazy(load.settings)
const Transactions = lazy(load.transactions)

function preloadScreens() {
  const all = () => Object.entries(load).forEach(([name, loader]) => name !== 'onboarding' && loader().catch(() => {}))
  setTimeout(all, 1200)
}

function App() {
  const session = useSession()
  const route = useRoute()
  const online = useOnline()
  const [adding, setAdding] = useState(false)
  // App lock: locked when the app starts and every time you come back to it
  const [locked, setLocked] = useState(() => !!lockSettings())
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && shouldLockOnLeave()) setLocked(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])
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
        preloadScreens()
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
      <Suspense fallback={null}>
        <Onboarding
          email={session.user.email}
          onDone={() => {
            setOnboarding(false)
            setDataVersion((v) => v + 1)
            navigate('/home')
            preloadScreens()
          }}
        />
      </Suspense>
    )
  }

  const screen = screenFor(route, session, dataVersion, { txFilter, setTxFilter, filterOpen, setFilterOpen })

  return (
    <div className="min-h-full pb-[calc(6rem+max(env(safe-area-inset-bottom),12px))]">
      <TopBar
        title={screen.title}
        back={screen.back}
        action={screen.action && <Suspense fallback={null}>{screen.action}</Suspense>}
        center={screen.center}
        email={session.user.email}
      />
      {!online && (
        <p role="status" className="mx-4 mb-2 rounded-xl bg-ink px-4 py-2.5 text-sm text-paper">
          You're offline. Your data will load again when you're back online.
        </p>
      )}
      <main>
        <Suspense fallback={null}>{screen.body}</Suspense>
      </main>
      <TabBar route={route} onAdd={() => setAdding(true)} />
      {locked && lockSettings() && <LockScreen email={session.user.email} onUnlock={() => setLocked(false)} />}
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
  // One category's analytics: #/analytics/categories/<id> ("none" = no category)
  if (route.startsWith('/analytics/categories/')) {
    const id = route.slice('/analytics/categories/'.length)
    const cat = lookupCache.lookups?.categories.find((c) => c.id === id)
    const title = cat ? `${cat.icon} ${cat.name}` : id === 'none' ? 'No category' : 'Category'
    return { title, back: '/analytics/categories', body: <CategoryDetail key={`${id}-${dataVersion}`} id={id} /> }
  }
  switch (route) {
    case '/transactions': {
      const active = activeFilterCount(tx.txFilter)
      return {
        title: 'Transactions',
        action: (
          <button
            onClick={() => tx.setFilterOpen(true)}
            className={`relative grid h-11 w-10 place-items-center rounded-full ${active ? 'text-cobalt' : 'text-muted'}`}
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
    case '/analytics/categories':
      return { title: 'Categories', back: '/analytics', body: <AnalyticsCategories key={dataVersion} /> }
    case '/analytics/saving':
      return { title: 'What you keep', back: '/analytics', body: <AnalyticsSaving key={dataVersion} /> }
    case '/analytics/trends':
      return { title: 'Better or worse', back: '/analytics', body: <AnalyticsTrends key={dataVersion} /> }
    case '/analytics/spending':
      return { title: 'Where it goes', back: '/analytics', body: <AnalyticsSpending key={dataVersion} /> }
    case '/savings':
      return { title: 'Savings', body: <Savings key={dataVersion} /> }
    case '/investments':
      return { title: 'Investments', action: <InvestmentsRefresh />, body: <Investments key={dataVersion} /> }
    case '/profile':
      return { title: 'Profile', back: '/home', body: <Settings session={session} /> }
    case '/settings/accounts':
      return { title: 'Accounts & cards', back: '/profile', body: <Accounts key={dataVersion} /> }
    case '/settings/categories':
      return { title: 'Categories', back: '/profile', body: <Categories /> }
    case '/recurring':
      return {
        title: 'Recurring',
        back: '/profile',
        action: (
          <button
            onClick={() => window.dispatchEvent(new Event('recurring:add'))}
            className="mr-1 grid size-10 place-items-center rounded-full bg-cobalt text-white shadow-[0_8px_16px_-8px_rgba(31,79,224,0.8)] active:bg-cobalt-deep"
            aria-label="Add recurring payment"
          >
            <Icon name="plus" size={22} strokeWidth={2.4} />
          </button>
        ),
        body: <Recurring key={dataVersion} />,
      }
    default:
      return {
        title: 'Home',
        center: formatTodayLabel(),
        body: (
          <Home
            key={dataVersion}
            onSeeAccount={(id) => {
              tx.setTxFilter({ ...EMPTY_FILTER, accountIds: [id] })
              navigate('/transactions')
            }}
          />
        ),
      }
  }
}

export default App
