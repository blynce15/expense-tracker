import { useEffect, useState } from 'react'
import { fetchProfile, nameOf, photoOf } from '../lib/profile'

let cached = null // { name, photo }

// The user's name and photo, loaded once and updated when they're changed in Profile
export function useProfileLook() {
  const [look, setLook] = useState(cached ?? { name: '', photo: null })
  useEffect(() => {
    if (cached === null) {
      fetchProfile()
        .then((p) => {
          cached = { name: nameOf(p), photo: photoOf(p) }
          setLook(cached)
        })
        .catch(() => {})
    }
    const onChange = (e) => {
      cached = { ...(cached ?? { name: '', photo: null }), ...e.detail }
      setLook(cached)
    }
    window.addEventListener('profile:look', onChange)
    return () => window.removeEventListener('profile:look', onChange)
  }, [])
  return look
}

// Round avatar: the profile photo, or a blue circle with the first letter of the name (or email)
export default function Avatar({ name, email, photo, size = 32, className = '' }) {
  if (photo) {
    return (
      <img src={photo} alt="" width={size} height={size} className={`shrink-0 rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
    )
  }
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
