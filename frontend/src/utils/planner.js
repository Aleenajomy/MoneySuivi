const EXACT_AMOUNT = /^-?\d+(\.\d{1,2})?$/

// Shows paise only when there are any, so ₹4,999.50 is never rounded up to ₹5,000. Very large
// totals arrive from the API as exact decimal strings; Intl formats those without going through
// a float, so no paisa is lost on screen either.
export const formatAmount = (amount) => {
  const exact = typeof amount === 'string' && EXACT_AMOUNT.test(amount)
  const value = exact ? amount : (Number(amount) || 0)
  const hasPaise = exact ? !/^-?\d+(\.00?)?$/.test(amount) : !Number.isInteger(value)
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(value)
}

// Mirrors the backend rule: non-negative, at most two decimal places.
export const AMOUNT_PATTERN = /^\d+(\.\d{1,2})?$/
export const amountError = (value, { label = 'Amount' } = {}) => {
  const text = String(value ?? '').trim()
  if (!text) return `${label} is required`
  if (!AMOUNT_PATTERN.test(text)) return `${label} must be a positive number with at most 2 decimals`
  if (Number(text) > 999999999999.99) return `${label} is too large`
  return ''
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export const currentPeriod = (now = new Date()) => ({ year: now.getFullYear(), month: now.getMonth() + 1 })
export const shiftPeriod = ({ year, month }, by) => {
  const index = year * 12 + (month - 1) + by
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}
export const comparePeriods = (a, b) => (a.year * 12 + a.month) - (b.year * 12 + b.month)
export const periodLabel = ({ year, month }) => `${MONTHS[month - 1]} ${year}`
export const periodToInput = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}`
export const inputToPeriod = (value) => {
  const match = /^(\d{4})-(\d{2})$/.exec(value || '')
  if (!match) return null
  const period = { year: Number(match[1]), month: Number(match[2]) }
  return period.year >= 2000 && period.year <= 2100 && period.month >= 1 && period.month <= 12 ? period : null
}
