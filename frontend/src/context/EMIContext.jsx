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
    const res = await api.patch(`/emis/${id}/pay`)
    setEmis(prev => prev.map(e => e.id === id ? res.data.emi : e))
    toast.success('Installment marked as paid')
  }

  const deleteEMI = async (id) => {
    await api.delete(`/emis/${id}`)
    setEmis(prev => prev.filter(e => e.id !== id))
    toast.success('EMI deleted')
  }

  return (
    <EMIContext.Provider value={{ emis, loading, fetchEMIs, addEMI, payInstallment, deleteEMI }}>
      {children}
    </EMIContext.Provider>
  )
}
