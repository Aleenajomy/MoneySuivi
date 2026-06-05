import { createContext, useCallback, useContext, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useNotification } from './NotificationContext'

const ExpenseContext = createContext(null)
export const useExpense = () => useContext(ExpenseContext)

export function ExpenseProvider({ children }) {
  const notificationContext = useNotification()
  const [expenses, setExpenses] = useState([])
  const [analytics, setAnalytics] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingAnalytics, setLoadingAnalytics] = useState(false)
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1 })
  const [filters, setFilters] = useState({ category: 'All', search: '' })

  const fetchExpenses = useCallback(async (params = {}, append = false) => {
    setLoading(true)
    try {
      const query = { ...params }
      if (query.category === 'All') delete query.category
      const res = await api.get('/expenses', { params: query })
      const data = res.data
      const sorted = (data.expenses || []).sort((a, b) => new Date(b.expenseDate) - new Date(a.expenseDate))
      setExpenses(prev => append ? [...prev, ...sorted] : sorted)
      setPagination({ page: data.currentPage, totalPages: data.totalPages })
    } catch (err) {
      toast.error('Failed to load transactions')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchAnalytics = useCallback(async () => {
    setLoadingAnalytics(true)
    try {
      const res = await api.get('/expenses/analytics')
      setAnalytics(res.data.analytics)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingAnalytics(false)
    }
  }, [])

  const addExpense = async (data) => {
    const res = await api.post('/expenses', data)
    toast.success('Transaction added')
    if (res.data.notification) {
      toast(res.data.notification.message, {
        icon: res.data.notification.type === 'critical' ? '!' : 'i',
      })
      notificationContext?.fetchNotifications?.()
    }
    fetchExpenses({ page: 1 })
    fetchAnalytics()
  }

  const updateExpense = async (id, data) => {
    await api.put(`/expenses/${id}`, data)
    toast.success('Transaction updated')
    fetchExpenses({ page: 1 })
    fetchAnalytics()
  }

  const deleteExpense = async (id) => {
    await api.delete(`/expenses/${id}`)
    setExpenses(prev => prev.filter(e => e._id !== id))
    toast.success('Transaction deleted')
    fetchAnalytics()
  }

  const applyFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  return (
    <ExpenseContext.Provider value={{
      expenses,
      analytics,
      loading,
      loadingAnalytics,
      pagination,
      filters,
      fetchExpenses,
      fetchAnalytics,
      addExpense,
      updateExpense,
      deleteExpense,
      applyFilter,
    }}>
      {children}
    </ExpenseContext.Provider>
  )
}
