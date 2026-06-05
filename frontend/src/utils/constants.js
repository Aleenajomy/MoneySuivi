export const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Salary', 'Healthcare', 'Other']
export const INCOME_CATEGORIES = ['Salary', 'Freelance', 'Investment', 'Gift', 'Other']
export const EXPENSE_CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other']
export const PAYMENT_METHODS = ['Cash', 'UPI', 'Credit Card', 'Debit Card', 'Net Banking']

export const CATEGORY_ICONS = {
  Food: 'Utensils',
  Travel: 'Bus',
  Shopping: 'ShoppingBag',
  Bills: 'Receipt',
  Entertainment: 'Tv',
  Salary: 'Banknote',
  Healthcare: 'HeartPulse',
  Other: 'CircleDot',
  Freelance: 'Briefcase',
  Investment: 'TrendingUp',
  Gift: 'Gift',
}

export const CATEGORY_COLORS = {
  Food: '#FF6B6B',
  Travel: '#0066FF',
  Shopping: '#A78BFA',
  Bills: '#FB923C',
  Entertainment: '#F472B6',
  Salary: '#00C896',
  Healthcare: '#38BDF8',
  Other: '#94A3B8',
  Freelance: '#34D399',
  Investment: '#FBBF24',
  Gift: '#F87171',
}

export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount || 0)

export const formatDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })

export const formatShortDate = (date) =>
  new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
