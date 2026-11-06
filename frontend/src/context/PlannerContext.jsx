import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from './AuthContext'
import { comparePeriods, currentPeriod } from '../utils/planner'

const PlannerContext = createContext(null)
export const usePlanner = () => useContext(PlannerContext)

const EMPTY_MONTH = { plan: null, salaries: [], summary: null }

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
    setMonth({ plan: data.plan, salaries: data.salaries, summary: data.summary })
  }, [])

  const loadSources = useCallback(async () => {
    const res = await api.get('/planner/income-sources')
    setIncomeSources(res.data.incomeSources)
  }, [])

  /**
   * Loads a month. The current and future months are set up automatically (plan + pending
   * salary records, copying recurring lines); past months are only shown, never back-filled.
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
          const request = api.post('/planner/budgets', target).then(res => res.data)
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

  // Runs a write, shows the outcome, and re-reads the month so every total comes from the server.
  const mutate = useCallback(async (request, successMessage) => {
    try {
      const res = await request()
      if (successMessage) toast.success(successMessage)
      return res.data
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
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

  const receiveSalary = useCallback(async (id, values) => {
    await mutate(() => api.post(`/planner/salaries/${id}/receive`, values), 'Marked as received')
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
      : api.post(`/planner/budgets/${month.plan.id}/allocations`, values)), id ? 'Allocation updated' : 'Allocation added')
    applyMonth(data)
  }, [mutate, applyMonth, month.plan?.id])

  const deleteAllocation = useCallback(async (id) => {
    applyMonth(await mutate(() => api.delete(`/planner/budgets/allocations/${id}`), 'Allocation removed'))
  }, [mutate, applyMonth])

  const copyRecurring = useCallback(async () => {
    const data = await mutate(() => api.post(`/planner/budgets/${month.plan.id}/copy-recurring`))
    applyMonth(data)
    toast.success(data.copied ? `Copied ${data.copied} recurring line${data.copied === 1 ? '' : 's'}` : 'Nothing new to copy')
  }, [mutate, applyMonth, month.plan?.id])

  const startPlan = useCallback(async () => {
    await mutate(() => api.post('/planner/budgets', period), 'Plan created for this month')
    await refresh()
  }, [mutate, refresh, period])

  return (
    <PlannerContext.Provider value={{
      period, setPeriod, month, incomeSources, loading, error, refresh, startPlan,
      saveIncomeSource, setSourceActive, deleteIncomeSource, addOneOffIncome, updateSalary,
      receiveSalary, undoSalary, deleteSalary, getLinkCandidates, getSalaryHistory,
      saveAllocation, deleteAllocation, copyRecurring,
    }}>
      {children}
    </PlannerContext.Provider>
  )
}
