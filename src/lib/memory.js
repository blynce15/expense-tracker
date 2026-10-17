// What each screen last showed, kept while the app is open. Going back to a screen shows it at once,
// while fresh data loads in the background and replaces it.
const memory = new Map()

export const recall = (key) => memory.get(key) ?? null

export function remember(key, value) {
  memory.set(key, value)
  return value
}
