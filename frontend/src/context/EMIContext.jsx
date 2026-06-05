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
    const res = await api.post('/emis', data)
    setEmis(prev => [res.data.emi, ...prev])
    toast.success('EMI added')
  }

  const payInstallment = async (id) => {
    try {
      await api.patch(`/emis/${id}/pay`)
      await fetchEMIs()
      toast.success('Installment marked as paid')
    } catch (e) {
      toast.error(e.message || 'Failed to mark paid')
    }
  }

  const updateEMI = async (id, data) => {
    try {
      await api.put(`/emis/${id}`, data)
      await fetchEMIs()
      toast.success('EMI updated')
    } catch (e) {
      toast.error(e.message || 'Failed to update EMI')
      throw e
    }
  }

  const deleteEMI = async (id) => {
    try {
      await api.delete(`/emis/${id}`)
      await fetchEMIs()
      toast.success('EMI deleted')
    } catch (e) {
      toast.error(e.message || 'Failed to delete EMI')
    }
  }

  return (
    <EMIContext.Provider value={{ emis, loading, fetchEMIs, addEMI, updateEMI, payInstallment, deleteEMI }}>
      {children}
    </EMIContext.Provider>
  )
}
