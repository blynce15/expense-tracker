// Several parts of a screen often ask for the same thing at the same moment (profile, accounts,
// categories…). shared() lets them all wait for one request instead of each sending its own.
// Once the answer is in, the next call asks again, so data is never older than that request.
export function shared(load) {
  let pending = null
  return () => {
    if (!pending) pending = load().finally(() => (pending = null))
    return pending
  }
}
