// Light / dark / follow the iPhone setting. Kept on this device; index.html applies it before the app draws.
const KEY = 'theme'

export function getTheme() {
  try {
    return localStorage.getItem(KEY) || 'light'
  } catch {
    return 'light'
  }
}

const isDark = (t) => t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

export function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t)
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', isDark(t) ? '#0a1022' : '#F4F7FD')
  // The iPhone status bar style only updates the next time the app opens
  document.querySelector('meta[name=apple-mobile-web-app-status-bar-style]')?.setAttribute('content', isDark(t) ? 'black-translucent' : 'default')
}

export function setTheme(t) {
  try {
    localStorage.setItem(KEY, t)
  } catch {
    // Not saved (private mode): still applies for this visit
  }
  applyTheme(t)
}

// Keep the browser bar colour right when the iPhone switches between light and dark
window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
  if (getTheme() === 'system') applyTheme('system')
})
