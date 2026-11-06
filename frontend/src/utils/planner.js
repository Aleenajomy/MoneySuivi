import { EXPENSE_CATEGORIES } from './constants'

// Categorical slots validated (dataviz validate_palette) against the app's card surfaces:
// light #FFFFFF and dark #1E293B. Light-mode aqua/yellow sit below 3:1, so every chart that
// uses them also prints names and amounts as text.
export const GROUP_META = {
  FIXED: { label: 'Fixed Expenses', short: 'Fixed', light: '#2a78d6', dark: '#3987e5', hint: 'Rent, mess, bills and EMIs you pay every month' },
  VARIABLE: { label: 'Variable Expenses', short: 'Variable', light: '#eb6834', dark: '#d95926', hint: 'Travel, shopping and other spending that changes' },
  SAVINGS: { label: 'Savings', short: 'Savings', light: '#1baf7a', dark: '#199e70', hint: 'Money you set aside; it stays in your accounts' },
  INVESTMENT: { label: 'Investments', short: 'Investments', light: '#eda100', dark: '#c98500', hint: 'Gold, mutual funds, stocks and other investments' },
}
export const GROUPS = Object.keys(GROUP_META)
export const UNALLOCATED_COLOR = { light: '#cbd5e1', dark: '#475569' }

export const INCOME_KINDS = [
  { value: 'SALARY', label: 'Fixed Salary' },
  { value: 'ALLOWANCE', label: 'Travel Allowance' },
  { value: 'BONUS', label: 'Bonus' },
  { value: 'INCENTIVE', label: 'Incentive' },
  { value: 'OTHER', label: 'Other Income' },
]
export const incomeKindLabel = (kind) => INCOME_KINDS.find(k => k.value === kind)?.label || 'Income'

// EMI payments are not transactions; the backend matches them to lines that list "EMI".
export const MATCHABLE_CATEGORIES = [...EXPENSE_CATEGORIES, 'EMI']

export const ALLOCATION_PRESETS = {
  FIXED: [
    { name: 'Rent / Accommodation', matchCategories: [] },
    { name: 'Mess / Food', matchCategories: ['Food'] },
    { name: 'Electricity', matchCategories: [] },
    { name: 'Internet', matchCategories: [] },
    { name: 'Mobile Recharge', matchCategories: [] },
    { name: 'EMI / Loan', matchCategories: ['EMI'] },
    { name: 'Subscriptions', matchCategories: [] },
    { name: 'Other Bills', matchCategories: ['Bills'] },
  ],
  VARIABLE: [
    { name: 'Travel', matchCategories: ['Travel'] },
    { name: 'Shopping', matchCategories: ['Shopping'] },
    { name: 'Personal Care', matchCategories: [] },
    { name: 'Entertainment', matchCategories: ['Entertainment'] },
    { name: 'Medical', matchCategories: ['Healthcare'] },
    { name: 'Miscellaneous', matchCategories: ['Other'] },
  ],
  SAVINGS: [
    { name: 'Emergency Fund', matchCategories: [] },
    { name: 'Personal Savings', matchCategories: [] },
    { name: 'Shopping Goals', matchCategories: [] },
  ],
  INVESTMENT: [
    { name: 'Gold', matchCategories: [] },
    { name: 'Mutual Funds', matchCategories: [] },
    { name: 'Index Fund', matchCategories: [] },
    { name: 'Stocks / ETFs', matchCategories: [] },
    { name: 'Other Investments', matchCategories: [] },
  ],
}

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
export const amountError = (value, { allowZero = true, label = 'Amount' } = {}) => {
  const text = String(value ?? '').trim()
  if (!text) return `${label} is required`
  if (!AMOUNT_PATTERN.test(text)) return `${label} must be a positive number with at most 2 decimals`
  if (!allowZero && Number(text) === 0) return `${label} must be more than 0`
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
export const todayInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// The dates income for this month can be recorded on: within the month (the server rejects any
// other) and not in the future. `max` is null while the month hasn't started.
export const receivedDateRange = ({ year, month }) => {
  const mm = String(month).padStart(2, '0')
  const min = `${year}-${mm}-01`
  const end = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`
  const today = todayInput()
  return { min, max: today < min ? null : (end < today ? end : today) }
}

// Default "received on" date: the pay day in that month, clamped to the allowed range.
export const defaultReceivedDate = (period, payDay) => {
  const { min, max } = receivedDateRange(period)
  if (!max) return ''
  const day = `${min.slice(0, 8)}${String(Math.min(payDay || 1, 31)).padStart(2, '0')}`
  if (day > max) return max
  return day < min ? min : day
}
