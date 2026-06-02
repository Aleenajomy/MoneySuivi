export const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Salary', 'Healthcare', 'Other']
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking']

export const CATEGORY_ICONS = {
  Food: '🍔', Travel: '✈️', Shopping: '🛍️', Bills: '📄',
  Entertainment: '🎬', Salary: '💰', Healthcare: '🏥', Other: '📦'
}

export const CATEGORY_COLORS = {
  Food: '#FF6B6B',
  Travel: '#0066FF',
  Shopping: '#A78BFA',
  Bills: '#FB923C',
  Entertainment: '#F472B6',
  Salary: '#00C896',
  Healthcare: '#38BDF8',
  Other: '#94A3B8'
}

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0
  }).format(amount)

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export const formatShortDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
