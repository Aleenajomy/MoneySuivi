import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton } from '../components/Skeleton'
import { useExpense } from '../context/ExpenseContext'
import api from '../services/api'
import { CATEGORIES } from '../utils/constants'

const downloadBlob = (blob, filename) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export default function History() {
  const { expenses, loading, pagination, filters, fetchExpenses, applyFilter } = useExpense()
  const [search, setSearch] = useState('')
  const [range, setRange] = useState({ startDate: '', endDate: '' })
  const [appliedRange, setAppliedRange] = useState({ startDate: '', endDate: '' })
  const [showFilters, setShowFilters] = useState(false)
  const [exporting, setExporting] = useState('')

  useEffect(() => {
    const params = { page: 1 }
    if (filters.category && filters.category !== 'All') params.category = filters.category
    if (filters.search) params.search = filters.search
    if (appliedRange.startDate) params.startDate = appliedRange.startDate
    if (appliedRange.endDate) params.endDate = appliedRange.endDate
    fetchExpenses(params)
  }, [filters, appliedRange, fetchExpenses])

  const activeFilterCount = [
    filters.category && filters.category !== 'All',
    filters.search,
    appliedRange.startDate || appliedRange.endDate,
  ].filter(Boolean).length

  const handleSearch = (val) => {
    setSearch(val)
    applyFilter('search', val)
  }

  const applyDateFilter = () => {
    if (range.startDate && range.endDate && range.startDate > range.endDate) {
      toast.error('Start date cannot be after end date')
      return
    }
    setAppliedRange(range)
  }

  const clearFilters = () => {
    setSearch('')
    setRange({ startDate: '', endDate: '' })
    setAppliedRange({ startDate: '', endDate: '' })
    applyFilter('search', '')
    applyFilter('category', 'All')
  }

  const loadMore = () => {
    if (pagination.page < pagination.totalPages) {
      const params = { page: pagination.page + 1 }
      if (filters.category && filters.category !== 'All') params.category = filters.category
      if (filters.search) params.search = filters.search
      if (appliedRange.startDate) params.startDate = appliedRange.startDate
      if (appliedRange.endDate) params.endDate = appliedRange.endDate
      fetchExpenses(params, true)
    }
  }

  const exportFile = async (type) => {
    setExporting(type)
    try {
      const res = await api.get(`/export/${type}`, {
        params: appliedRange,
        responseType: 'blob',
      })
      downloadBlob(res.data, type === 'csv' ? 'transactions.csv' : 'expense-report.pdf')
      toast.success(`${type.toUpperCase()} downloaded`)
    } catch (err) {
      toast.error(err.message || 'Export failed')
    } finally {
      setExporting('')
    }
  }

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-5 pr-12">
        <h1 className="text-xl font-bold dark:text-white text-slate-800">History</h1>
        <button
          type="button"
          onClick={() => setShowFilters(prev => !prev)}
          className={`relative w-9 h-9 rounded-xl border flex items-center justify-center transition-colors ${
            showFilters || activeFilterCount
              ? 'bg-primary/10 border-primary/20 text-primary'
              : 'dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500'
          }`}
          aria-pressed={showFilters}
          title="Filters"
        >
          <SlidersHorizontal size={16} />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-4">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="card p-4 mb-4 animate-slideDown">
          <div className="relative mb-4">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 dark:text-gray-600 text-gray-400" />
            <input className="input pl-10 pr-10" placeholder="Search transactions..." value={search} onChange={e => handleSearch(e.target.value)} />
            {search && (
              <button type="button" onClick={() => handleSearch('')} className="absolute right-4 top-1/2 -translate-y-1/2 dark:text-gray-600 text-gray-400 hover:text-gray-500">
                <X size={15} />
              </button>
            )}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
            {['All', ...CATEGORIES].map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => applyFilter('category', cat)}
                className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filters.category === cat
                    ? 'bg-primary text-white'
                    : 'dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border border dark:text-gray-400 text-gray-500'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={range.startDate}
                onChange={e => setRange(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={range.endDate}
                onChange={e => setRange(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={clearFilters}
              className="btn-secondary flex items-center justify-center gap-2"
            >
              <RotateCcw size={15} />
              Clear
            </button>
            <button
              type="button"
              onClick={applyDateFilter}
              className="btn-primary"
            >
              Apply Dates
            </button>
          </div>

          <button
            type="button"
            onClick={() => exportFile('pdf')}
            disabled={Boolean(exporting)}
            className="btn-primary flex items-center justify-center gap-2 mt-3"
          >
            <FileText size={15} />
            {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      )}

      {!loading && expenses.length > 0 && (
        <p className="text-xs dark:text-gray-500 text-gray-400 mb-3 font-medium">
          {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
        </p>
      )}

      {loading && expenses.length === 0
        ? Array(5).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
        : expenses.length === 0
          ? <div className="text-center py-16">
              <p className="dark:text-gray-400 text-gray-500 font-medium">No transactions found</p>
              <p className="dark:text-gray-600 text-gray-400 text-sm mt-1">Try adjusting your filters</p>
            </div>
          : <>
              {expenses.map(e => <ExpenseCard key={e._id} expense={e} showActions />)}
              {pagination.page < pagination.totalPages && (
                <button onClick={loadMore} disabled={loading} className="w-full py-3 text-primary text-sm font-semibold bg-primary/10 rounded-xl mt-2">
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>}
    </div>
  )
}
