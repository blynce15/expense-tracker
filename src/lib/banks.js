import { logoUrl } from './merchants'

// Banks offered as shortcuts when adding an account: tapping one fills in the name,
// shows its logo and picks a colour close to the bank's own.
export const BANKS = [
  { name: 'Revolut', domain: 'revolut.com', color: '#0b1b45' },
  { name: 'Millennium', domain: 'millenniumbcp.pt', color: '#c8005a' },
  { name: 'CGD', domain: 'cgd.pt', color: '#0062a8' },
  { name: 'Santander', domain: 'santander.pt', color: '#e60000' },
  { name: 'Novo Banco', domain: 'novobanco.pt', color: '#00a19a' },
  { name: 'ActivoBank', domain: 'activobank.pt', color: '#5f9e1e' },
  { name: 'BPI', domain: 'bancobpi.pt', color: '#f26a1b' },
  { name: 'Wise', domain: 'wise.com', color: '#163300' },
  { name: 'N26', domain: 'n26.com', color: '#2e8b7a' },
]

// The bank an account name stands for ("revolut" → Revolut), or null
export function bankFor(name) {
  const n = name.trim().toLowerCase()
  return BANKS.find((b) => b.name.toLowerCase() === n) ?? null
}

export const bankLogo = (bank) => logoUrl(bank.domain)
