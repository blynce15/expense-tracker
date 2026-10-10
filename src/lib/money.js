// Money is always integer cents. These helpers never use floating-point math.
// Display uses European style: €1.234,56

function groupThousands(digits) {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

// 123456 → "€1.234,56", -500 → "−€5,00"
export function formatCents(cents) {
  const sign = cents < 0 ? '−' : ''
  const abs = Math.abs(cents)
  const euros = String(Math.trunc(abs / 100))
  const rest = String(abs % 100).padStart(2, '0')
  return `${sign}€${groupThousands(euros)},${rest}`
}

// Largest amount anywhere in the app: €9.999.999,99 (the number pad's limit too), so a typo can't distort totals
export const MAX_CENTS = 999999999

// "12,5" / "12.50" / "1.234,56" / "2.100" → cents (integer), or null if invalid or above MAX_CENTS.
// If there's a comma it's the decimal separator and dots are thousands.
// Without a comma, dots in groups of three are thousands ("2.100" = 2100);
// otherwise a dot is the decimal separator ("12.50").
export function parseToCents(input) {
  let s = String(input).trim().replace(/[\s€]/g, '')
  s = s.includes(',') || /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [euros, decimals = ''] = s.split('.')
  const cents = Number(euros) * 100 + Number(decimals.padEnd(2, '0'))
  return cents > MAX_CENTS ? null : cents
}

// cents → "12,50" for prefilling an input (no currency sign)
export function centsToInput(cents) {
  const abs = Math.abs(cents)
  return `${Math.trunc(abs / 100)},${String(abs % 100).padStart(2, '0')}`
}

// Shows a number-pad amount ("1234.5", dot = decimal) as "1.234,5" while typing
export function formatTyping(amount) {
  if (!amount) return '0'
  const [whole, decimals] = amount.split('.')
  return decimals === undefined ? groupThousands(whole) : `${groupThousands(whole)},${decimals}`
}
