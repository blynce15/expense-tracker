import { useEffect, useState } from 'react'
import { fetchProfile, nameOf } from '../lib/profile'

let cachedName = null

// The user's name, loaded once and updated when it's changed in Profile
export function useDisplayName() {
  const [name, setName] = useState(cachedName ?? '')
  useEffect(() => {
    if (cachedName === null) {
      fetchProfile()
        .then((p) => {
          cachedName = nameOf(p)
          setName(cachedName)
        })
        .catch(() => {})
    }
    const onChange = (e) => {
      cachedName = e.detail
      setName(e.detail)
    }
    window.addEventListener('profile:name', onChange)
    return () => window.removeEventListener('profile:name', onChange)
  }, [])
  return name
}

// Round blue avatar with the first letter of the name (or of the email until a name is set)
export default function Avatar({ name, email, size = 32, className = '' }) {
  const letter = (name || email || '?').trim().charAt(0).toUpperCase()
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2b8ef7] via-cobalt to-cobalt-deep font-display font-extrabold text-white ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}
