import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useAuth } from './AuthContext'

const BudgetContext = createContext(null)
export const useBudget = () => useContext(BudgetContext)

const isMissingRoute = (err) => err.message?.toLowerCase().includes('route not found')
const withDefaultTotals = (items) => items.map(budget => ({
  ...budget,
  spent: budget.spent || 0,
  remaining: Math.max(Number(budget.monthlyLimit || 0) - Number(budget.spent || 0), 0),
  percentage: budget.monthlyLimit > 0 ? Math.round((Number(budget.spent || 0) / Number(budget.monthlyLimit)) * 100) : 0,
}))

export function BudgetProvider({ children }) {
  const { user } = useAuth()
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(false)
  const [useLocalBudgets, setUseLocalBudgets] = useState(false)

  const userKey = user?.id || user?.email || 'local'
  const storageKeyRef = useRef(`budgets:${userKey}`)
  useEffect(() => {
    storageKeyRef.current = `budgets:${userKey}`
  }, [userKey])

  const readLocalBudgets = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKeyRef.current) || '[]')
    } catch {
      return []
    }
  }, [])

  const writeLocalBudgets = useCallback((nextBudgets) => {
    localStorage.setItem(storageKeyRef.current, JSON.stringify(nextBudgets))
  }, [])

  const loadLocalBudgets = useCallback(() => {
    const localBudgets = withDefaultTotals(readLocalBudgets())
    setBudgets(localBudgets)
    return localBudgets
  }, [readLocalBudgets])

  const fetchBudgets = useCallback(async () => {
    if (useLocalBudgets) {
      loadLocalBudgets()
      return
    }

    if (!localStorage.getItem('token')) return
    setLoading(true)
    try {
      const res = await api.get('/budgets')
      setBudgets(res.data.budgets)
    } catch (err) {
      if (isMissingRoute(err)) {
        setUseLocalBudgets(true)
        loadLocalBudgets()
        toast.error('Budget API is not deployed yet. Using local budgets on this device.')
      } else {
        if (err.status !== 401) {
          toast.error(err.isTimeout ? 'Server is waking up. Please wait a moment...' : (err.message || 'Failed to load budgets'), {
            id: err.isTimeout ? 'server-connection-status' : 'load-budgets'
          })
        }
      }
    } finally {
      setLoading(false)
    }
  }, [loadLocalBudgets, useLocalBudgets])

  const saveBudget = async (category, monthlyLimit) => {
    if (useLocalBudgets) {
      const current = readLocalBudgets()
      const existing = current.find(b => b.category === category)
      const nextBudgets = existing
        ? current.map(b => b.category === category ? { ...b, monthlyLimit } : b)
        : [...current, { id: crypto.randomUUID(), category, monthlyLimit }]
      writeLocalBudgets(nextBudgets)
      setBudgets(withDefaultTotals(nextBudgets))
      toast.success('Budget saved locally!')
      return
    }

    try {
      await api.post('/budgets', { category, monthlyLimit })
      toast.success('Budget saved!')
      await fetchBudgets()
    } catch (err) {
      if (!isMissingRoute(err)) throw err
      setUseLocalBudgets(true)
      const current = readLocalBudgets()
      const nextBudgets = [...current, { id: crypto.randomUUID(), category, monthlyLimit }]
      writeLocalBudgets(nextBudgets)
      setBudgets(withDefaultTotals(nextBudgets))
      toast.success('Budget saved locally!')
    }
  }

  const updateBudget = async (id, monthlyLimit) => {
    if (useLocalBudgets) {
      const nextBudgets = readLocalBudgets().map(b => b.id === id ? { ...b, monthlyLimit } : b)
      writeLocalBudgets(nextBudgets)
      setBudgets(withDefaultTotals(nextBudgets))
      toast.success('Budget updated locally!')
      return
    }

    try {
      await api.put(`/budgets/${id}`, { monthlyLimit })
      toast.success('Budget updated!')
      await fetchBudgets()
    } catch (err) {
      if (!isMissingRoute(err)) throw err
      setUseLocalBudgets(true)
      const nextBudgets = readLocalBudgets().map(b => b.id === id ? { ...b, monthlyLimit } : b)
      writeLocalBudgets(nextBudgets)
      setBudgets(withDefaultTotals(nextBudgets))
      toast.success('Budget updated locally!')
    }
  }

  const deleteBudget = async (id) => {
    if (useLocalBudgets) {
      const nextBudgets = readLocalBudgets().filter(b => b.id !== id)
      writeLocalBudgets(nextBudgets)
      setBudgets(withDefaultTotals(nextBudgets))
      toast.success('Budget deleted locally')
      return
    }

    try {
      await api.delete(`/budgets/${id}`)
      toast.success('Budget deleted')
      await fetchBudgets()
    } catch (err) {
      if (!isMissingRoute(err)) throw err
      setUseLocalBudgets(true)
      const nextBudgets = readLocalBudgets().filter(b => b.id !== id)
      writeLocalBudgets(nextBudgets)
      setBudgets(withDefaultTotals(nextBudgets))
      toast.success('Budget deleted locally')
    }
  }

  return (
    <BudgetContext.Provider value={{ budgets, loading, fetchBudgets, saveBudget, updateBudget, deleteBudget }}>
      {children}
    </BudgetContext.Provider>
  )
}
