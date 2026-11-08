// Each savings goal gets a colour from its emoji (nothing is stored). Used by Onboarding and Savings.
// Mid-tone colours, so they read on white cards and on dark cards alike.
const GOAL_COLORS = {
  '🎯': '#1f4fe0',
  '🐷': '#e64980',
  '💰': '#2f9e44',
  '🛟': '#2b8a3e',
  '🛡️': '#1c7ed6',
  '✈️': '#1c7ed6',
  '🏖️': '#e8a400',
  '🌍': '#0c8599',
  '🏠': '#e8590c',
  '🛋️': '#d9480f',
  '🚗': '#7048e8',
  '🚲': '#0ca678',
  '💻': '#4c6ef5',
  '📱': '#4263eb',
  '🎓': '#0c8599',
  '💍': '#d6336c',
  '👶': '#f06595',
  '🐶': '#a0522d',
  '🎁': '#f08c00',
  '🎸': '#ae3ec9',
  '📷': '#5c7cfa',
  '⛷️': '#339af0',
  '🏕️': '#2b8a3e',
  '🎮': '#7950f2',
  '🩺': '#e03131',
  '📈': '#0c8599',
}

export const goalColor = (icon) => GOAL_COLORS[icon] ?? '#1f4fe0'

// The goal's colour for text: pulled a little towards the page's ink, so it stays readable in light and dark
export const goalTextColor = (icon) => `color-mix(in srgb, ${goalColor(icon)} 78%, var(--color-ink))`
