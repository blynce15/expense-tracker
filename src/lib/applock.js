// App lock: a 4-digit PIN, plus Face ID through a passkey made only for unlocking.
// Everything is kept on this device (localStorage): the lock protects this phone's screen,
// your data itself is protected by your login.

const KEY = 'appLock' // { pinHash, salt, credentialId? }

export function lockSettings() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? null
  } catch {
    return null
  }
}

function store(value) {
  try {
    if (value) localStorage.setItem(KEY, JSON.stringify(value))
    else localStorage.removeItem(KEY)
  } catch {
    // Storage blocked (e.g. private mode): the lock just stays off
  }
  window.dispatchEvent(new Event('applock:changed'))
}

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))
const toB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

async function hashPin(pin, salt) {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:${pin}`)))
}

export async function enableLock(pin) {
  const salt = toHex(randomBytes(16))
  store({ pinHash: await hashPin(pin, salt), salt })
}

export async function changePin(pin) {
  const s = lockSettings()
  const salt = toHex(randomBytes(16))
  store({ ...s, pinHash: await hashPin(pin, salt), salt })
}

export async function checkPin(pin) {
  const s = lockSettings()
  return !!s && (await hashPin(pin, s.salt)) === s.pinHash
}

export const disableLock = () => store(null)

// ---- Face ID (passkey) ----

export function faceIdSupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential && !!navigator.credentials
}

// Creates a passkey on this device; iPhone asks for Face ID to save it. Must run from a tap.
export async function setUpFaceId({ email, name }) {
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Expense Tracker', id: location.hostname },
      user: { id: randomBytes(16), name: email || 'Expense Tracker', displayName: name || email || 'Expense Tracker' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000,
    },
  })
  if (!cred) throw new Error('Face ID was not set up.')
  store({ ...lockSettings(), credentialId: toB64(cred.rawId) })
}

export function turnOffFaceId() {
  const { credentialId: _removed, ...rest } = lockSettings() ?? {}
  store(rest)
}

// Asks for Face ID with the passkey; resolves true when it passed. Must run from a tap.
export async function unlockWithFaceId() {
  const s = lockSettings()
  if (!s?.credentialId) return false
  const res = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      allowCredentials: [{ type: 'public-key', id: fromB64(s.credentialId) }],
      userVerification: 'required',
      timeout: 60000,
    },
  })
  if (!res) return false
  // Flags byte: bit 2 = the user was verified (Face ID / passcode)
  const flags = new Uint8Array(res.response.authenticatorData)[32]
  return (flags & 0x04) !== 0
}

// The photo picker leaves the app for a moment; that shouldn't lock it
let skipNextLock = false
export const allowLeavingOnce = () => {
  skipNextLock = true
}
export function shouldLockOnLeave() {
  if (skipNextLock) {
    skipNextLock = false
    return false
  }
  return !!lockSettings()
}
