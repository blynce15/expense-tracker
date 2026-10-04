import Icon from '../components/Icon'
import { navigate } from '../lib/useRoute'

const ITEMS = [{ path: '/settings/accounts', label: 'Accounts & cards', icon: 'card' }]

export default function Settings() {
  return (
    <ul className="mx-4 mt-2 overflow-hidden rounded-2xl bg-card">
      {ITEMS.map((item) => (
        <li key={item.path} className="border-b border-line last:border-0">
          <button onClick={() => navigate(item.path)} className="flex w-full items-center gap-3 px-4 py-4 text-left">
            <Icon name={item.icon} className="text-cobalt" />
            <span className="flex-1 text-base font-medium">{item.label}</span>
            <Icon name="chevronRight" size={20} className="text-muted" />
          </button>
        </li>
      ))}
    </ul>
  )
}
