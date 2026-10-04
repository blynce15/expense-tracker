// Money is always integer cents. These helpers never use floating-point math.

const formatter = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })

// 123456 → "€1,234.56"
export function formatCents(cents) {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  const euros = Math.trunc(abs / 100)
  const rest = abs % 100
  // Intl only sees whole euros + a fixed 2-digit string, so no float rounding issues
  const whole = formatter.format(euros).replace(/\.00$/, '')
  return `${sign}${whole}.${String(rest).padStart(2, '0')}`
}

// "12,5" / "12.50" / "1 234,56" → cents (integer), or null if invalid
export function parseToCents(input) {
  const s = String(input).trim().replace(/[\s€]/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [euros, decimals = ''] = s.split('.')
  return Number(euros) * 100 + Number(decimals.padEnd(2, '0'))
}

// cents → "12.50" for prefilling an input (no currency sign)
export function centsToInput(cents) {
  const abs = Math.abs(cents)
  return `${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}
