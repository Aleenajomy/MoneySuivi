import { createContext, useCallback, useContext, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const NetWorthContext = createContext(null)
export const useNetWorth = () => useContext(NetWorthContext)

export function NetWorthProvider({ children }) {
  const [summary, setSummary] = useState({
    totalAssets: 0,
    totalLiabilities: 0,
    netWorth: 0,
    cashInHand: 0,
    bankBalance: 0,
    investmentBalance: 0,
    cashBalance: 0,
    outstandingLoans: 0,
    outstandingEMIs: 0,
    assets: [],
    liabilities: [],
  })
  const [loading, setLoading] = useState(false)

  const fetchNetWorth = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/networth/summary')
      setSummary(res.data)
    } catch (err) {
      if (err.status !== 401) {
        toast.error('Failed to load net worth')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const addAsset = async (data) => {
    const res = await api.post('/networth/assets', data)
    setSummary(prev => {
      const assets = [res.data.asset, ...prev.assets]
      const totalAssets = assets.reduce((s, a) => s + a.value, 0)
      return { ...prev, assets, totalAssets, netWorth: totalAssets + (prev.cashBalance || 0) + (prev.ledgerReceivable || 0) - prev.totalLiabilities }
    })
    toast.success('Asset added')
  }

  const updateAsset = async (id, data) => {
    const res = await api.put(`/networth/assets/${id}`, data)
    setSummary(prev => {
      const assets = prev.assets.map(a => a.id === id ? res.data.asset : a)
      const totalAssets = assets.reduce((s, a) => s + a.value, 0)
      return { ...prev, assets, totalAssets, netWorth: totalAssets + (prev.cashBalance || 0) + (prev.ledgerReceivable || 0) - prev.totalLiabilities }
    })
    toast.success('Asset updated')
  }

  const deleteAsset = async (id) => {
    await api.delete(`/networth/assets/${id}`)
    setSummary(prev => {
      const assets = prev.assets.filter(a => a.id !== id)
      const totalAssets = assets.reduce((s, a) => s + a.value, 0)
      return { ...prev, assets, totalAssets, netWorth: totalAssets + (prev.cashBalance || 0) + (prev.ledgerReceivable || 0) - prev.totalLiabilities }
    })
    toast.success('Asset deleted')
  }

  const addLiability = async (data) => {
    const res = await api.post('/networth/liabilities', data)
    setSummary(prev => {
      const liabilities = [res.data.liability, ...prev.liabilities]
      const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0)
      return { ...prev, liabilities, totalLiabilities, netWorth: prev.totalAssets + (prev.cashBalance || 0) + (prev.ledgerReceivable || 0) - totalLiabilities }
    })
    toast.success('Liability added')
  }

  const updateLiability = async (id, data) => {
    const res = await api.put(`/networth/liabilities/${id}`, data)
    setSummary(prev => {
      const liabilities = prev.liabilities.map(l => l.id === id ? res.data.liability : l)
      const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0)
      return { ...prev, liabilities, totalLiabilities, netWorth: prev.totalAssets + (prev.cashBalance || 0) + (prev.ledgerReceivable || 0) - totalLiabilities }
    })
    toast.success('Liability updated')
  }

  const deleteLiability = async (id) => {
    await api.delete(`/networth/liabilities/${id}`)
    setSummary(prev => {
      const liabilities = prev.liabilities.filter(l => l.id !== id)
      const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0)
      return { ...prev, liabilities, totalLiabilities, netWorth: prev.totalAssets + (prev.cashBalance || 0) + (prev.ledgerReceivable || 0) - totalLiabilities }
    })
    toast.success('Liability deleted')
  }

  return (
    <NetWorthContext.Provider value={{ summary, loading, fetchNetWorth, addAsset, updateAsset, deleteAsset, addLiability, updateLiability, deleteLiability }}>
      {children}
    </NetWorthContext.Provider>
  )
}
