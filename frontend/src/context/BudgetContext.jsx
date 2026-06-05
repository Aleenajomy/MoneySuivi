import { createContext, useContext, useState, useCallback } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const BudgetContext = createContext(null)
export const useBudget = () => useContext(BudgetContext)

export function BudgetProvider({ children }) {
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchBudgets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/budgets')
      setBudgets(res.data.budgets)
    } catch (_) {}
    finally { setLoading(false) }
  }, [])

  const saveBudget = async (category, monthlyLimit) => {
    await api.post('/budgets', { category, monthlyLimit })
    toast.success('Budget saved!')
    fetchBudgets()
  }

  const updateBudget = async (id, monthlyLimit) => {
    await api.put(`/budgets/${id}`, { monthlyLimit })
    toast.success('Budget updated!')
    fetchBudgets()
  }

  const deleteBudget = async (id) => {
    await api.delete(`/budgets/${id}`)
    toast.success('Budget deleted')
    fetchBudgets()
  }

  return (
    <BudgetContext.Provider value={{ budgets, loading, fetchBudgets, saveBudget, updateBudget, deleteBudget }}>
      {children}
    </BudgetContext.Provider>
  )
}
