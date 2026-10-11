import { logoUrl } from './merchants'

// Banks offered as shortcuts when adding an account (a grid of 4 per row): tapping one fills in
// the name, shows its logo and picks a colour close to the bank's own.
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
  { name: 'Bybit', domain: 'bybit.com', color: '#1d1e24' },
  { name: 'Trade Republic', domain: 'traderepublic.com', color: '#111111' },
  { name: 'Bleap', domain: 'bleap.finance', color: '#2b2f38' },
]

// The bank an account name stands for, or null: the bank's name as a whole word,
// so "Revolut" and "Revolut Savings" both show the Revolut logo
export function bankFor(name) {
  const n = ` ${(name ?? '').trim().toLowerCase()} `
  return BANKS.find((b) => n.includes(` ${b.name.toLowerCase()} `)) ?? null
}

export const bankLogo = (bank) => logoUrl(bank.domain)
