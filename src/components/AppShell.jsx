import Avatar, { useProfileLook } from './Avatar'
import Icon from './Icon'
import { goBack, navigate } from '../lib/useRoute'

const TABS = [
  { path: '/home', label: 'Home', icon: 'home' },
  { path: '/transactions', label: 'Transactions', icon: 'list' },
  { path: '/analytics', label: 'Analytics', icon: 'bars' },
  { path: '/savings', label: 'Savings', icon: 'target' },
]

export function TopBar({ title, back, action, center, email }) {
  const look = useProfileLook()
  return (
    <header className="sticky top-0 z-20 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="relative flex h-14 items-center gap-1 px-2">
        {center && (
          <p className="pointer-events-none absolute inset-x-0 text-center text-sm font-semibold text-muted">{center}</p>
        )}
        {back ? (
          <button onClick={() => goBack(back)} className="grid size-11 place-items-center rounded-full text-ink" aria-label="Back">
            <Icon name="chevronLeft" />
          </button>
        ) : (
          // The LynxOS lynx before the title of each main tab
          <img src="/logo.png" alt="" className="ml-2 size-8 shrink-0" />
        )}
        {typeof title === 'string' ? (
          <h1 className="flex-1 truncate font-display text-[22px] font-bold tracking-tight">{title}</h1>
        ) : (
          <div className="flex min-w-0 flex-1 items-center">{title}</div>
        )}
        {action}
        {!back && (
          <button onClick={() => navigate('/profile')} className="grid size-11 place-items-center rounded-full" aria-label="Profile">
            <Avatar name={look.name} email={email} photo={look.photo} size={34} className="shadow-[0_6px_14px_-6px_rgba(31,79,224,0.8)]" />
          </button>
        )}
      </div>
    </header>
  )
}

// Savings tab title: "Savings  Investments" side by side; the page you're on is dark, the other faded.
// Switching replaces the address, so Back doesn't step through every switch.
export function SavingsTitle({ investments }) {
  const tabs = [
    { path: '/savings', label: 'Savings', on: !investments },
    { path: '/savings/investments', label: 'Investments', on: investments },
  ]
  return (
    <div className="flex min-w-0 items-center gap-2.5" role="tablist">
      {tabs.map((t) =>
        t.on ? (
          <h1 key={t.path} role="tab" aria-selected="true" className="truncate font-display text-[22px] font-bold tracking-tight">
            {t.label}
          </h1>
        ) : (
          <button
            key={t.path}
            role="tab"
            aria-selected="false"
            onClick={() => window.location.replace(`#${t.path}`)}
            className="-my-2 truncate py-2 font-display text-[22px] font-bold tracking-tight text-muted/50 active:text-muted"
          >
            {t.label}
          </button>
        ),
      )}
    </div>
  )
}

// Floating frosted pill with the four tabs (icons only), and the + button on its own at the right.
export function TabBar({ route, onAdd }) {
  const current = TABS.findIndex((tab) => route.startsWith(tab.path))
  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-[max(env(safe-area-inset-bottom),12px)] z-30 px-4">
      <div className="mx-auto flex max-w-lg items-center gap-2.5">
        <ul className="pointer-events-auto relative grid h-[60px] flex-1 grid-cols-4 rounded-[30px] border border-line/90 bg-card/80 px-1.5 shadow-[0_12px_30px_-14px_rgba(11,27,69,0.35)] backdrop-blur-xl">
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-1.5 left-1.5 grid w-[calc((100%-12px)/4)] place-items-center transition-[transform,opacity] duration-300 ease-[cubic-bezier(.3,1.3,.5,1)] motion-reduce:transition-none ${
              current < 0 ? 'opacity-0' : ''
            }`}
            style={{ transform: `translateX(${Math.max(current, 0) * 100}%)` }}
          >
            <span className="h-[42px] w-[52px] rounded-[21px] bg-bubble" />
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
