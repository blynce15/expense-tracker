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

// "12,5" / "12.50" / "1.234,56" → cents (integer), or null if invalid.
// If there's a comma it's the decimal separator and dots are thousands;
// otherwise a dot is the decimal separator.
export function parseToCents(input) {
  let s = String(input).trim().replace(/[\s€]/g, '')
  s = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null
  const [euros, decimals = ''] = s.split('.')
  return Number(euros) * 100 + Number(decimals.padEnd(2, '0'))
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
