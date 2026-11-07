import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { useAuth } from './AuthContext'
import { comparePeriods, currentPeriod } from '../utils/planner'

const PlannerContext = createContext(null)
export const usePlanner = () => useContext(PlannerContext)

const EMPTY = { plan: null, summary: null, emiTrackerTotal: 0 }

/**
 * The monthly salary plan. Every call here reads or writes planning figures only
 * (/planner/salary-plan); none of them can create, change or delete a transaction.
 */
export function PlannerProvider({ children }) {
  const { user } = useAuth()
  const [period, setPeriod] = useState(currentPeriod)
  const [data, setData] = useState(EMPTY)
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saveState, setSaveState] = useState('idle')
  const requestId = useRef(0)
  const saveId = useRef(0)

  const lastUserId = useRef(user?.id)
  useEffect(() => {
    if (!user?.id || user.id === lastUserId.current) return
    if (lastUserId.current) {
      setData(EMPTY)
      setLoaded(false)
    }
    lastUserId.current = user.id
  }, [user?.id])

  // The current and future months are set up automatically (a copy of the latest planned month);
  // past months are only shown, and set up when the user asks.
  const refresh = useCallback(async (target = period) => {
    if (!localStorage.getItem('token')) return
    const id = ++requestId.current
    setLoading(true)
    setError('')
    setSaveState('idle')
    try {
      const res = comparePeriods(target, currentPeriod()) >= 0
        ? await api.post('/planner/salary-plan/init', target)
        : await api.get('/planner/salary-plan', { params: target })
      if (id === requestId.current) {
        setData(res.data)
        setLoaded(true)
      }
    } catch (err) {
      if (id === requestId.current && err.status !== 401) setError(err.message || 'Could not load your plan')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [period])

  // Saves one or more figures; only the latest save's answer is shown, so a slow earlier
  // response can't overwrite a newer value.
  const saveValues = useCallback(async (values) => {
    const id = ++saveId.current
    setSaveState('saving')
    try {
      const res = await api.put('/planner/salary-plan', { ...period, ...values })
      if (id === saveId.current) {
        setData(res.data)
        setSaveState('saved')
      }
    } catch (err) {
      if (id === saveId.current) setSaveState('error')
      toast.error(err.message || 'Could not save')
      throw err
    }
  }, [period])

  const startPlan = useCallback(async () => {
    try {
      setData((await api.post('/planner/salary-plan/init', period)).data)
    } catch (err) {
      toast.error(err.message || 'Could not create the plan')
    }
  }, [period])

  const resetToDefault = useCallback(async () => {
    try {
      setData((await api.post('/planner/salary-plan/reset', period)).data)
      toast.success('Plan reset to your default amounts')
    } catch (err) {
      toast.error(err.message || 'Could not reset')
    }
  }, [period])

  return (
    <PlannerContext.Provider value={{ period, setPeriod, data, loaded, loading, error, saveState, refresh, saveValues, startPlan, resetToDefault }}>
      {children}
    </PlannerContext.Provider>
  )
}
