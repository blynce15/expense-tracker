import { useEffect, useState } from 'react'
import { fetchPension, isPensionDue } from '../lib/pension'
import Pension from './Pension'
import Portfolio from './Portfolio'

export { InvestmentsRefresh, LinkSheet } from './Portfolio'

// Investments tab: Portfolio (getquin, #/investments) and Pension (by hand, #/investments/pension), switched
// at the top. An orange dot on Pension = this month's update is due.
export default function Investments({ part = 'portfolio' }) {
  const [due, setDue] = useState(false)

  useEffect(() => {
    const check = () =>
      fetchPension()
        .then((d) => setDue(isPensionDue(d.entries)))
        .catch(() => {})
    check()
    window.addEventListener('pension:changed', check)
    return () => window.removeEventListener('pension:changed', check)
  }, [])

  const go = (path) => window.location.replace(`#${path}`)
  const tabs = [
    { value: 'portfolio', label: 'Portfolio', path: '/investments' },
    { value: 'pension', label: 'Pension', path: '/investments/pension' },
  ]
  return (
    <div className="space-y-3.5 px-4 pt-1 pb-6">
      <div className="flex gap-1 rounded-full bg-line/60 p-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={part === t.value}
            onClick={() => go(t.path)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-[9px] text-[15px] font-bold transition ${
              part === t.value ? 'bg-card text-ink shadow-[0_3px_10px_-6px_rgba(11,27,69,0.4)]' : 'text-muted'
            }`}
          >
            {t.label}
            {t.value === 'pension' && due && <span className="size-[7px] rounded-full bg-[#f0a020]" aria-label="Update due" />}
          </button>
        ))}
      </div>
      {part === 'pension' ? <Pension /> : <Portfolio />}
    </div>
  )
}
