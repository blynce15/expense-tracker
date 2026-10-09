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

// How many screens deep we are since the app opened, so Back can return to the previous screen
let depth = 0

export function navigate(path) {
  if (current() === path) return
  depth += 1
  window.location.hash = path
}

// Previous screen if we came from one in the app, otherwise the given parent page
export function goBack(fallback) {
  if (depth > 0) {
    depth -= 1
    window.history.back()
  } else {
    window.location.replace(`#${fallback}`)
  }
}
