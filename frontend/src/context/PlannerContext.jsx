import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from './AuthContext'
import { comparePeriods, currentPeriod } from '../utils/planner'

const PlannerContext = createContext(null)
export const usePlanner = () => useContext(PlannerContext)

const EMPTY_MONTH = { plan: null, salaries: [], summary: null, position: null, emi: null, spending: [] }

export function PlannerProvider({ children }) {
  const { user } = useAuth()
  const [period, setPeriod] = useState(currentPeriod)
  const [month, setMonth] = useState(EMPTY_MONTH)
  const [incomeSources, setIncomeSources] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  // One set-up request per month, shared by overlapping loads (StrictMode, quick month switching)
  // so none of them sees the stale "no plan yet" response.
  const setUps = useRef(new Map())

  // Clears data only when a different account signs in, not when the user first finishes loading.
  const lastUserId = useRef(user?.id)
  useEffect(() => {
    if (!user?.id || user.id === lastUserId.current) return
    if (lastUserId.current) {
      setMonth(EMPTY_MONTH)
      setIncomeSources([])
      setUps.current = new Map()
    }
    lastUserId.current = user.id
  }, [user?.id])

  const applyMonth = useCallback((data) => {
    setMonth({
      plan: data.plan, salaries: data.salaries, summary: data.summary, position: data.position, emi: data.emi, spending: data.spending || [],
    })
  }, [])

  const loadSources = useCallback(async () => {
    const res = await api.get('/planner/income-sources')
    setIncomeSources(res.data.incomeSources)
  }, [])

  /**
   * Loads a month. The current and future months are set up automatically (plan + pending
   * salary records, carrying repeating lines forward, or the default lines for a first plan);
   * past months are only shown, never back-filled.
   */
  const refresh = useCallback(async (target = period) => {
    if (!localStorage.getItem('token')) return
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const [overview] = await Promise.all([
        api.get('/planner/overview', { params: target }),
        loadSources(),
      ])
      let data = overview.data
      const key = `${target.year}-${target.month}`
      if (!data.plan && comparePeriods(target, currentPeriod()) >= 0) {
        if (!setUps.current.has(key)) {
          const request = api.post('/planner/budgets', { ...target, defaults: true }).then(res => res.data)
          // A failed set-up is forgotten so "Try again" can retry it.
          request.catch(() => setUps.current.delete(key))
          setUps.current.set(key, request)
        }
        data = await setUps.current.get(key)
      }
      if (id === requestId.current) applyMonth(data)
    } catch (err) {
      if (id === requestId.current && err.status !== 401) setError(err.message || 'Could not load your planner')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [period, loadSources, applyMonth])

  // Runs a write and shows the outcome; every total shown afterwards comes from the server.
  const mutate = useCallback(async (request, successMessage, { quiet = () => false } = {}) => {
    try {
      const res = await request()
      if (successMessage) toast.success(typeof successMessage === 'function' ? successMessage(res.data) : successMessage)
      return res.data
    } catch (err) {
      if (!quiet(err)) toast.error(err.message || 'Something went wrong')
      throw err
    }
  }, [])

  const isCurrentOrFuture = comparePeriods(period, currentPeriod()) >= 0

  const saveIncomeSource = useCallback(async (id, values) => {
    await mutate(() => (id ? api.put(`/planner/income-sources/${id}`, values) : api.post('/planner/income-sources', values)),
      id ? 'Income source updated' : 'Income source added')
    if (isCurrentOrFuture) await api.post('/planner/salaries/initialize', period).catch(() => {})
    await refresh()
  }, [mutate, refresh, period, isCurrentOrFuture])

  const setSourceActive = useCallback(async (id, active) => {
    await mutate(() => api.patch(`/planner/income-sources/${id}/active`, { active }), active ? 'Income source resumed' : 'Income source paused')
    if (active && isCurrentOrFuture) await api.post('/planner/salaries/initialize', period).catch(() => {})
    await refresh()
  }, [mutate, refresh, period, isCurrentOrFuture])

  const deleteIncomeSource = useCallback(async (id) => {
    await mutate(() => api.delete(`/planner/income-sources/${id}`), 'Income source deleted')
    await refresh()
  }, [mutate, refresh])

  const addOneOffIncome = useCallback(async (values) => {
    await mutate(() => api.post('/planner/salaries', { ...period, ...values }), 'Income added to this month')
    await refresh()
  }, [mutate, refresh, period])

  const updateSalary = useCallback(async (id, values) => {
    await mutate(() => api.put(`/planner/salaries/${id}`, values), 'Expected amount updated')
    await refresh()
  }, [mutate, refresh])

  // A possible duplicate is shown inside the form rather than as a toast, so the user can link it.
  const receiveSalary = useCallback(async (id, values) => {
    const messages = { link: 'Linked to the income in History', alreadyInBalance: 'Marked received; no transaction added', create: 'Income recorded' }
    await mutate(() => api.post(`/planner/salaries/${id}/receive`, values), messages[values.mode], { quiet: err => err.code === 'POSSIBLE_DUPLICATE' })
    await refresh()
  }, [mutate, refresh])

  const undoSalary = useCallback(async (id, deleteTransaction) => {
    await mutate(() => api.post(`/planner/salaries/${id}/undo`, { deleteTransaction }), deleteTransaction ? 'Undone and transaction deleted' : 'Marked as not received')
    await refresh()
  }, [mutate, refresh])

  const deleteSalary = useCallback(async (id) => {
    await mutate(() => api.delete(`/planner/salaries/${id}`), 'Income record removed')
    await refresh()
  }, [mutate, refresh])

  const getLinkCandidates = useCallback(async (id) => (await api.get(`/planner/salaries/${id}/candidates`)).data.candidates, [])
  const getSalaryHistory = useCallback(async (months = 6) => (await api.get('/planner/salaries/history', { params: { months, ...period } })).data.history, [period])

  const saveAllocation = useCallback(async (id, values) => {
    const data = await mutate(() => (id
      ? api.put(`/planner/budgets/allocations/${id}`, values)
      : api.post(`/planner/budgets/${month.plan.id}/allocations`, values)), id ? 'Expense updated' : 'Expense added')
    applyMonth(data)
  }, [mutate, applyMonth, month.plan?.id])

  const deleteAllocation = useCallback(async (id) => {
    applyMonth(await mutate(() => api.delete(`/planner/budgets/allocations/${id}`), 'Expense removed'))
  }, [mutate, applyMonth])

  const addDefaultLines = useCallback(async () => {
    const data = await mutate(() => api.post(`/planner/budgets/${month.plan.id}/default-lines`),
      d => (d.added ? `Added ${d.added} default expense${d.added === 1 ? '' : 's'}` : 'Your plan already has these expenses'))
    applyMonth(data)
  }, [mutate, applyMonth, month.plan?.id])

  const recordExpense = useCallback(async (allocationId, values) => {
    applyMonth(await mutate(() => api.post(`/planner/budgets/allocations/${allocationId}/record`, values),
      d => (d.repeated ? 'Already recorded; nothing added again' : 'Expense recorded')))
  }, [mutate, applyMonth])

  const saveSavingsPercent = useCallback(async (savingsPercent) => {
    applyMonth(await mutate(() => api.put(`/planner/budgets/${month.plan.id}`, { savingsPercent }), 'Savings suggestion updated'))
  }, [mutate, applyMonth, month.plan?.id])

  const getEmiCandidates = useCallback(async (paymentId) => (await api.get(`/planner/emi-payments/${paymentId}/candidates`)).data.candidates, [])

  // Linking or unlinking only changes how the planner counts the payment, never any money.
  const linkEmiPayment = useCallback(async (paymentId, expenseId) => {
    await mutate(() => (expenseId
      ? api.put(`/planner/emi-payments/${paymentId}/link`, { expenseId })
      : api.delete(`/planner/emi-payments/${paymentId}/link`)), expenseId ? 'Linked; the EMI now counts once' : 'Unlinked')
    await refresh()
  }, [mutate, refresh])

  // Planner data only; the server never touches transactions, balances, EMIs or Lend/Borrow.
  const resetPlanner = useCallback(async (scope) => {
    await mutate(() => api.post('/planner/reset', scope === 'all' ? { scope, confirm: 'RESET' } : { scope, ...period }),
      scope === 'all' ? 'Planner reset' : 'This month\'s plan was reset')
    // Cached month set-ups refer to plans that may no longer exist.
    setUps.current = new Map()
    await refresh()
  }, [mutate, refresh, period])

  const startPlan = useCallback(async () => {
    await mutate(() => api.post('/planner/budgets', { ...period, defaults: true }), 'Plan created for this month')
    await refresh()
  }, [mutate, refresh, period])

  return (
    <PlannerContext.Provider value={{
      period, setPeriod, month, incomeSources, loading, error, refresh, startPlan,
      saveIncomeSource, setSourceActive, deleteIncomeSource, addOneOffIncome, updateSalary,
      receiveSalary, undoSalary, deleteSalary, getLinkCandidates, getSalaryHistory,
      saveAllocation, deleteAllocation, addDefaultLines, recordExpense, saveSavingsPercent,
      getEmiCandidates, linkEmiPayment, resetPlanner,
    }}>
      {children}
    </PlannerContext.Provider>
  )
}
