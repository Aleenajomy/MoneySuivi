import { createContext, useCallback, useContext, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../services/api'

const LedgerContext = createContext(null)
export const useLedger = () => useContext(LedgerContext)

export function LedgerProvider({ children }) {
  const [contacts, setContacts] = useState([])
  const [summary, setSummary] = useState({ totalLentOut: 0, totalBorrowed: 0, netBalance: 0 })
  const [loading, setLoading] = useState(false)

  const fetchContacts = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/ledger/contacts')
      setContacts(res.data.contacts || [])
    } catch (err) {
      if (err.status !== 401) toast.error('Failed to load ledger contacts')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/ledger/summary')
      setSummary(res.data)
    } catch (err) {
      if (err.status !== 401) toast.error('Failed to load ledger summary')
    }
  }, [])

  const addContact = async (data) => {
    const res = await api.post('/ledger/contacts', data)
    setContacts(prev => [res.data.contact, ...prev])
    toast.success('Contact added')
    return res.data.contact
  }

  const updateContact = async (id, data) => {
    const res = await api.put(`/ledger/contacts/${id}`, data)
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...res.data.contact } : c))
    toast.success('Contact updated')
  }

  const deleteContact = async (id) => {
    await api.delete(`/ledger/contacts/${id}`)
    setContacts(prev => prev.filter(c => c.id !== id))
    toast.success('Contact deleted')
  }

  const fetchEntries = async (contactId) => {
    const res = await api.get(`/ledger/contacts/${contactId}/entries`)
    return res.data  // { contact, entries, balance }
  }

  const addEntry = async (contactId, data) => {
    const res = await api.post(`/ledger/contacts/${contactId}/entries`, data)
    // Refresh contact balance in list
    setContacts(prev => prev.map(c => {
      if (c.id !== contactId) return c
      const amt = Number(data.amount)
      const type = data.type
      let delta = 0
      if (type === 'LENT')               delta =  amt
      if (type === 'REPAYMENT_RECEIVED') delta = -amt
      if (type === 'BORROWED')           delta = -amt
      if (type === 'REPAYMENT_MADE')     delta =  amt
      return { ...c, balance: (c.balance || 0) + delta, entryCount: (c.entryCount || 0) + 1 }
    }))
    toast.success('Entry added')
    return res.data.entry
  }

  const updateEntry = async (entryId, data) => {
    const res = await api.put(`/ledger/entries/${entryId}`, data)
    toast.success('Entry updated')
    return res.data.entry
  }

  const deleteEntry = async (entryId, contactId) => {
    await api.delete(`/ledger/entries/${entryId}`)
    setContacts(prev => prev.map(c =>
      c.id === contactId ? { ...c, entryCount: Math.max(0, (c.entryCount || 1) - 1) } : c
    ))
    toast.success('Entry deleted')
  }

  return (
    <LedgerContext.Provider value={{
      contacts, summary, loading,
      fetchContacts, fetchSummary,
      addContact, updateContact, deleteContact,
      fetchEntries, addEntry, updateEntry, deleteEntry,
    }}>
      {children}
    </LedgerContext.Provider>
  )
}
