import Icon from './Icon'
import { navigate } from '../lib/useRoute'

const TABS = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/transactions', label: 'Transactions', icon: 'list' },
  null, // center add button
  { path: '/analytics', label: 'Analytics', icon: 'chart' },
  { path: '/savings', label: 'Savings', icon: 'savings' },
]

export function TopBar({ title, back, action }) {
  return (
    <header className="sticky top-0 z-20 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex h-14 items-center gap-1 px-2">
        {back ? (
          <button onClick={() => navigate(back)} className="grid size-11 place-items-center rounded-full text-ink" aria-label="Back">
            <Icon name="chevronLeft" />
          </button>
        ) : (
          <div className="w-2" />
        )}
        <h1 className="flex-1 truncate font-display text-[22px] font-bold tracking-tight">{title}</h1>
        {action}
        {!back && (
          <>
            <button onClick={() => navigate('/settings')} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Settings">
              <Icon name="settings" size={22} />
            </button>
            <button onClick={() => navigate('/account')} className="grid size-11 place-items-center rounded-full text-muted" aria-label="Account">
              <Icon name="user" size={22} />
            </button>
          </>
        )}
      </div>
    </header>
  )
}

export function TabBar({ route, onAdd }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
        {TABS.map((tab) =>
          tab ? (
            <li key={tab.path}>
              <button
                onClick={() => navigate(tab.path)}
                className={`flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  route.startsWith(tab.path) ? 'text-cobalt' : 'text-muted'
                }`}
                aria-current={route.startsWith(tab.path) ? 'page' : undefined}
              >
                <Icon name={tab.icon} size={24} strokeWidth={route.startsWith(tab.path) ? 2.2 : 1.8} />
                {tab.label}
              </button>
            </li>
          ) : (
            <li key="add" className="flex justify-center">
              <button
                onClick={onAdd}
                className="-mt-7 grid size-16 place-items-center rounded-[22px] bg-cobalt text-white shadow-[0_8px_20px_-6px_rgba(31,79,224,0.6)] ring-4 ring-paper active:scale-95 active:bg-cobalt-deep"
                aria-label="Add transaction"
              >
                <Icon name="plus" size={30} strokeWidth={2.4} />
              </button>
            </li>
          ),
        )}
      </ul>
    </nav>
  )
}
