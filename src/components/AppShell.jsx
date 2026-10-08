import Icon from './Icon'
import { navigate } from '../lib/useRoute'

const TABS = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/transactions', label: 'Transactions', icon: 'list' },
  { path: '/analytics', label: 'Analytics', icon: 'chart' },
  { path: '/savings', label: 'Savings', icon: 'savings' },
]

export function TopBar({ title, back, action, center }) {
  return (
    <header className="sticky top-0 z-20 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="relative flex h-14 items-center gap-1 px-2">
        {center && (
          <p className="pointer-events-none absolute inset-x-0 text-center text-sm font-semibold text-muted">{center}</p>
        )}
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

// Floating frosted pill with the four tabs (icons only), and the + button on its own at the right.
export function TabBar({ route, onAdd }) {
  const current = TABS.findIndex((tab) => route.startsWith(tab.path))
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 px-4">
      <div className="mx-auto flex max-w-lg items-center gap-2.5">
        <ul className="pointer-events-auto relative grid h-[60px] flex-1 grid-cols-4 rounded-[30px] border border-line/90 bg-white/80 px-1.5 shadow-[0_12px_30px_-14px_rgba(11,27,69,0.35)] backdrop-blur-xl">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 grid w-[calc((100%-12px)/4)] place-items-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none ${
              current < 0 ? 'opacity-0' : ''
            }`}
            style={{ transform: `translateX(${Math.max(current, 0) * 100}%)` }}
          >
            <span className="h-[42px] w-[52px] rounded-[21px] bg-[#e3ebff]" />
          </span>
          {TABS.map((tab, i) => (
            <li key={tab.path} className="relative grid">
              <button
                onClick={() => navigate(tab.path)}
                className={`grid place-items-center transition-colors active:scale-90 ${i === current ? 'text-cobalt' : 'text-muted'}`}
                aria-label={tab.label}
                aria-current={i === current ? 'page' : undefined}
              >
                <Icon name={tab.icon} size={25} strokeWidth={i === current ? 2.3 : 1.9} />
              </button>
            </li>
          ))}
        </ul>
        <button
          onClick={onAdd}
          className="pointer-events-auto grid size-[60px] shrink-0 place-items-center rounded-full bg-cobalt text-white shadow-[0_12px_24px_-10px_rgba(31,79,224,0.75)] active:scale-95 active:bg-cobalt-deep"
          aria-label="Add transaction"
        >
          <Icon name="plus" size={28} strokeWidth={2.6} />
        </button>
      </div>
    </nav>
  )
}
