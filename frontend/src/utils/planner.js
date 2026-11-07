import { EXPENSE_CATEGORIES } from './constants'

// The simplified planner only plans spending; savings are a calculated suggestion, not a line.
export const GROUP_META = {
  FIXED: { label: 'Fixed Expenses', short: 'Fixed', hint: 'Rent, mess, bills and EMIs you pay every month' },
  VARIABLE: { label: 'Variable Expenses', short: 'Variable', hint: 'Travel and other spending that changes' },
}
export const GROUPS = Object.keys(GROUP_META)

export const INCOME_KINDS = [
  { value: 'SALARY', label: 'Fixed Salary' },
  { value: 'ALLOWANCE', label: 'Allowance' },
  { value: 'BONUS', label: 'Bonus' },
  { value: 'INCENTIVE', label: 'Incentive' },
  { value: 'OTHER', label: 'Other Income' },
]
export const incomeKindLabel = (kind) => INCOME_KINDS.find(k => k.value === kind)?.label || 'Income'

// EMI payments are not transactions; the backend matches them to lines that list "EMI".
export const EMI_CATEGORY = 'EMI'
export const MATCHABLE_CATEGORIES = [...EXPENSE_CATEGORIES, EMI_CATEGORY]
export const isEmiLine = (line) => (line.matchCategories || []).some(c => c.toLowerCase() === EMI_CATEGORY.toLowerCase())

export const ALLOCATION_PRESETS = {
  FIXED: [
    { name: 'Rent', matchCategories: [] },
    { name: 'Mess / Food', matchCategories: ['Food'] },
    { name: 'Electricity', matchCategories: [] },
    { name: 'Internet', matchCategories: [] },
    { name: 'Mobile Recharge', matchCategories: [] },
    { name: 'EMI', matchCategories: ['EMI'] },
    { name: 'Subscriptions', matchCategories: [] },
    { name: 'Other Bills', matchCategories: ['Bills'] },
  ],
  VARIABLE: [
    { name: 'Travel', matchCategories: ['Travel'] },
    { name: 'Other Personal', matchCategories: ['Shopping', 'Entertainment', 'Healthcare', 'Other'] },
    { name: 'Shopping', matchCategories: ['Shopping'] },
    { name: 'Personal Care', matchCategories: [] },
    { name: 'Entertainment', matchCategories: ['Entertainment'] },
    { name: 'Medical', matchCategories: ['Healthcare'] },
    { name: 'Miscellaneous', matchCategories: ['Other'] },
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
const lastDayInput = ({ year, month }) => `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`

// The dates this month's income can be received on: the earning month or the month after (salary
// paid early next month), matching the server rule, and never in the future. `max` is null while
// the month hasn't started.
export const receivedDateRange = (period) => {
  const min = `${periodToInput(period)}-01`
  const end = lastDayInput(shiftPeriod(period, 1))
  const today = todayInput()
  return { min, max: today < min ? null : (end < today ? end : today) }
}

// Spending recorded for a month's plan must be dated in that month and not in the future.
export const monthDateRange = (period) => {
  const min = `${periodToInput(period)}-01`
  const end = lastDayInput(period)
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
