import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from './AuthContext'
import { comparePeriods, currentPeriod } from '../utils/planner'

const PlannerContext = createContext(null)
export const usePlanner = () => useContext(PlannerContext)

const EMPTY_MONTH = { plan: null, salaries: [], summary: null, spending: [] }

export function PlannerProvider({ children }) {
  const { user } = useAuth()
  const [period, setPeriod] = useState(currentPeriod)
  const [month, setMonth] = useState(EMPTY_MONTH)
  const [incomeSources, setIncomeSources] = useState([])
  const [goals, setGoals] = useState([])
  const [investments, setInvestments] = useState({ plans: [], summary: null })
  const [bills, setBills] = useState(null)
  const [report, setReport] = useState(null)
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
      setGoals([])
      setInvestments({ plans: [], summary: null })
      setBills(null)
      setReport(null)
      setUps.current = new Map()
    }
    lastUserId.current = user.id
  }, [user?.id])

  const applyMonth = useCallback((data) => {
    setMonth({ plan: data.plan, salaries: data.salaries, summary: data.summary, spending: data.spending || [] })
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
      const [overview, goalsRes, investRes, billsRes, reportRes] = await Promise.all([
        api.get('/planner/overview', { params: target }),
        api.get('/planner/goals', { params: target }),
        api.get('/planner/investments', { params: target }),
        api.get('/planner/bills', { params: target }),
        api.get('/planner/report', { params: target }),
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
      if (id === requestId.current) {
        applyMonth(data)
        setGoals(goalsRes.data.goals)
        setInvestments({ plans: investRes.data.plans, summary: investRes.data.summary })
        setBills(billsRes.data)
        setReport(reportRes.data)
      }
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

  // Pins a transaction to a line, or (allocationId null) hands it back to automatic matching.
  const assignTransaction = useCallback(async (expenseId, allocationId) => {
    applyMonth(await mutate(() => (allocationId
      ? api.put(`/planner/transactions/${expenseId}/assignment`, { allocationId })
      : api.delete(`/planner/transactions/${expenseId}/assignment`)), allocationId ? 'Moved to the chosen line' : 'Back to automatic matching'))
  }, [mutate, applyMonth])

  // Goals and investments feed the month (linked lines, saved and invested totals), so every change
  // re-reads the whole month rather than patching one list.
  const saveGoal = useCallback(async (id, values) => {
    await mutate(() => (id ? api.put(`/planner/goals/${id}`, values) : api.post('/planner/goals', values)), id ? 'Goal updated' : 'Goal created')
    await refresh()
  }, [mutate, refresh])

  const archiveGoal = useCallback(async (id, archived) => {
    await mutate(() => api.patch(`/planner/goals/${id}/archive`, { archived }), archived ? 'Goal archived' : 'Goal restored')
    await refresh()
  }, [mutate, refresh])

  const deleteGoal = useCallback(async (id) => {
    await mutate(() => api.delete(`/planner/goals/${id}`), 'Goal deleted')
    await refresh()
  }, [mutate, refresh])

  const addContribution = useCallback(async (goalId, values) => {
    await mutate(() => api.post(`/planner/goals/${goalId}/contributions`, values), values.type === 'WITHDRAWAL' ? 'Withdrawal recorded' : 'Money added to goal')
    await refresh()
  }, [mutate, refresh])

  const deleteContribution = useCallback(async (contributionId) => {
    await mutate(() => api.delete(`/planner/goals/contributions/${contributionId}`), 'Entry removed')
    await refresh()
  }, [mutate, refresh])

  const getContributions = useCallback(async (goalId) => (await api.get(`/planner/goals/${goalId}/contributions`)).data.contributions, [])

  const saveInvestment = useCallback(async (id, values) => {
    await mutate(() => (id ? api.put(`/planner/investments/${id}`, values) : api.post('/planner/investments', values)), id ? 'Investment updated' : 'Investment added')
    await refresh()
  }, [mutate, refresh])

  const setInvestmentActive = useCallback(async (id, active) => {
    await mutate(() => api.patch(`/planner/investments/${id}/active`, { active }), active ? 'Investment resumed' : 'Investment paused')
    await refresh()
  }, [mutate, refresh])

  const deleteInvestment = useCallback(async (id, deleteTransactions = false) => {
    await mutate(() => api.delete(`/planner/investments/${id}`, { params: deleteTransactions ? { deleteTransactions: true } : {} }), 'Investment deleted')
    await refresh()
  }, [mutate, refresh])

  const addInvestmentTx = useCallback(async (planId, values) => {
    await mutate(() => api.post(`/planner/investments/${planId}/transactions`, values), values.type === 'REDEEM' ? 'Redemption recorded' : 'Investment recorded')
    await refresh()
  }, [mutate, refresh])

  const deleteInvestmentTx = useCallback(async (txId) => {
    await mutate(() => api.delete(`/planner/investments/transactions/${txId}`), 'Investment transaction deleted')
    await refresh()
  }, [mutate, refresh])

  const getInvestmentTxs = useCallback(async (planId) => (await api.get(`/planner/investments/${planId}/transactions`)).data.transactions, [])

  // Paid through the existing Loans & EMIs endpoint, so the EMI tracker stays the only record of it.
  const payEmi = useCallback(async (emiId, values) => {
    await mutate(() => api.patch(`/emis/${emiId}/pay`, values), 'EMI payment recorded')
    await refresh()
  }, [mutate, refresh])

  const startPlan = useCallback(async () => {
    await mutate(() => api.post('/planner/budgets', period), 'Plan created for this month')
    await refresh()
  }, [mutate, refresh, period])

  return (
    <PlannerContext.Provider value={{
      period, setPeriod, month, incomeSources, loading, error, refresh, startPlan,
      saveIncomeSource, setSourceActive, deleteIncomeSource, addOneOffIncome, updateSalary,
      receiveSalary, undoSalary, deleteSalary, getLinkCandidates, getSalaryHistory,
      saveAllocation, deleteAllocation, copyRecurring, assignTransaction,
      goals, saveGoal, archiveGoal, deleteGoal, addContribution, deleteContribution, getContributions,
      bills, payEmi, report,
      investments, saveInvestment, setInvestmentActive, deleteInvestment, addInvestmentTx, deleteInvestmentTx, getInvestmentTxs,
    }}>
      {children}
    </PlannerContext.Provider>
  )
}
