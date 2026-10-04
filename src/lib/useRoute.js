import { useEffect, useState } from 'react'

// Tiny hash router: "#/settings/accounts" → "/settings/accounts"
function current() {
  return window.location.hash.replace(/^#/, '') || '/home'
}

export function useRoute() {
  const [route, setRoute] = useState(current)
  useEffect(() => {
    const onChange = () => setRoute(current())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}

export function navigate(path) {
  window.location.hash = path
}
