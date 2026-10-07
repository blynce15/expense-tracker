import { useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { startDayOf } from '../lib/budget'
import { fetchProfile, saveProfile } from '../lib/profile'
import { navigate } from '../lib/useRoute'

const ITEMS = [
  { path: '/settings/accounts', label: 'Accounts & cards', icon: 'card' },
  { path: '/settings/categories', label: 'Categories', icon: 'tag' },
  { path: '/recurring', label: 'Recurring payments', icon: 'repeat' },
]

// 1 → "1st", 22 → "22nd"
function ordinal(n) {
  const suffix = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'
  return `${n}${suffix}`
}

export default function Settings() {
  const [startDay, setStartDay] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchProfile()
      .then((p) => setStartDay(startDayOf(p)))
      .catch((e) => setError(e.message))
  }, [])

  async function changeStartDay(day) {
    const before = startDay
    setStartDay(day)
    setError(null)
    try {
      await saveProfile({ budget_start_day: day })
    } catch (e) {
      setStartDay(before)
      setError(`Couldn't save: ${e.message}`)
    }
  }

  return (
    <div className="space-y-6">
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

      <section>
        <h2 className="px-5 pb-2 font-display text-lg font-bold">Budget</h2>
        <div className="mx-4 rounded-2xl bg-card">
          <label className="flex items-center gap-3 px-4 py-3">
            <Icon name="chart" className="text-cobalt" />
            <span className="flex-1 text-base font-medium">Period starts on the</span>
            <select
              id="budget-start-day"
              value={startDay ?? ''}
              disabled={startDay == null}
              onChange={(e) => changeStartDay(Number(e.target.value))}
              className="rounded-xl bg-paper px-3 py-2 text-base font-semibold text-cobalt outline-none"
            >
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  {ordinal(d)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="px-5 pt-2 text-sm text-loss">{error}</p>}
        <p className="px-5 pt-2 text-sm text-muted">
          Set this to your payday. Your budget is the money in your debit and cash accounts, so moving money to savings
          lowers it. Savings and credit cards are left out.
          {startDay > 28 && ' In shorter months the period starts on the last day of the month.'}
        </p>
      </section>
    </div>
  )
}
