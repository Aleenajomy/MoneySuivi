import { createContext, useCallback, useContext, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const EMIContext = createContext(null)
export const useEMI = () => useContext(EMIContext)

export function EMIProvider({ children }) {
  const [emis, setEmis] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchEMIs = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/emis')
      setEmis(res.data.emis)
    } catch { toast.error('Failed to load EMIs') }
    finally { setLoading(false) }
  }, [])

  const addEMI = async (data) => {
    try {
      const res = await api.post('/emis', data)
      setEmis(prev => [res.data.emi, ...prev])
      toast.success('Loan added successfully')
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Failed to add loan'
      toast.error(errorMsg)
      throw e
    }
  }

  const payInstallment = async (id, paymentData = null) => {
    try {
      await api.patch(`/emis/${id}/pay`, paymentData || {})
      await fetchEMIs()
      toast.success('Repayment recorded successfully')
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Failed to record repayment'
      toast.error(errorMsg)
      throw e
    }
  }

  const updateEMI = async (id, data) => {
    try {
      await api.put(`/emis/${id}`, data)
      await fetchEMIs()
      toast.success('Loan updated successfully')
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Failed to update loan'
      toast.error(errorMsg)
      throw e
    }
  }

  const deleteEMI = async (id) => {
    try {
      await api.delete(`/emis/${id}`)
      await fetchEMIs()
      toast.success('Loan deleted')
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Failed to delete loan'
      toast.error(errorMsg)
    }
  }

  const deletePayment = async (paymentId) => {
    try {
      await api.delete(`/emis/payments/${paymentId}`)
      await fetchEMIs()
      toast.success('Repayment log deleted')
    } catch (e) {
      const errorMsg = e.response?.data?.message || e.message || 'Failed to delete repayment log'
      toast.error(errorMsg)
    }
  }

  return (
    <EMIContext.Provider value={{ emis, loading, fetchEMIs, addEMI, updateEMI, payInstallment, deleteEMI, deletePayment }}>
      {children}
    </EMIContext.Provider>
  )
}
