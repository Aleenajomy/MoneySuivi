import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { FileText, RotateCcw, Search, SlidersHorizontal, X, FileSpreadsheet } from 'lucide-react'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton } from '../components/Skeleton'
import { useExpense } from '../context/ExpenseContext'
import api from '../services/api'
import { CATEGORIES, formatCurrency } from '../utils/constants'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'

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
    const timer = setTimeout(() => {
      const params = { page: 1 }
      if (filters.category && filters.category !== 'All') params.category = filters.category
      if (filters.type && filters.type !== 'All') params.type = filters.type
      if (search.trim()) params.search = search.trim()
      if (appliedRange.startDate) params.startDate = appliedRange.startDate
      if (appliedRange.endDate) params.endDate = appliedRange.endDate
      fetchExpenses(params)
    }, 300)
    return () => clearTimeout(timer)
  }, [filters.category, filters.type, search, appliedRange, fetchExpenses])

  const activeFilterCount = [
    filters.category && filters.category !== 'All',
    filters.type && filters.type !== 'All',
    filters.search,
    appliedRange.startDate || appliedRange.endDate,
  ].filter(Boolean).length

  const handleSearch = (val) => setSearch(val)

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
    applyFilter('category', 'All')
    applyFilter('type', 'All')
  }

  const loadMore = () => {
    if (pagination.page < pagination.totalPages) {
      const params = { page: pagination.page + 1 }
      if (filters.category && filters.category !== 'All') params.category = filters.category
      if (filters.type && filters.type !== 'All') params.type = filters.type
      if (search.trim()) params.search = search.trim()
      if (appliedRange.startDate) params.startDate = appliedRange.startDate
      if (appliedRange.endDate) params.endDate = appliedRange.endDate
      fetchExpenses(params, true)
    }
  }

  const exportFile = async (type) => {
    setExporting(type)
    try {
      const params = { ...appliedRange }
      if (filters.category && filters.category !== 'All') params.category = filters.category
      if (filters.type && filters.type !== 'All') params.type = filters.type
      if (search.trim()) params.search = search.trim()

      const res = await api.get(`/export/${type}`, {
        params,
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

  // Group transactions chronologically by calendar day
  const groupExpensesByDate = (expensesList) => {
    const groups = {}
    expensesList.forEach(exp => {
      // Use date string representation without time
      const d = new Date(exp.expenseDate)
      const dateStr = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString()
      if (!groups[dateStr]) groups[dateStr] = []
      groups[dateStr].push(exp)
    })

    return Object.keys(groups).map(dateStr => {
      const items = groups[dateStr]
      const dateObj = new Date(dateStr)
      let dayIncome = 0
      let dayExpense = 0
      items.forEach(i => {
        if (i.type === 'income') dayIncome += i.amount
        else if (i.type === 'expense') dayExpense += i.amount
      })
      return {
        dateStr,
        dateObj,
        dayIncome,
        dayExpense,
        items
      }
    }).sort((a, b) => b.dateObj - a.dateObj)
  }

  const formatGroupHeaderDate = (dateObj) => {
    const today = new Date()
    const yesterday = new Date()
    yesterday.setDate(today.getDate() - 1)

    const cleanD = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
    const targetTime = cleanD(dateObj)
    const todayTime = cleanD(today)
    const yesterdayTime = cleanD(yesterday)

    if (targetTime === todayTime) return 'Today'
    if (targetTime === yesterdayTime) return 'Yesterday'

    return dateObj.toLocaleDateString('en-IN', {
      weekday: 'long',
      day: '2-digit',
      month: 'short',
      year: dateObj.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
    })
  }

  const groupedTransactions = groupExpensesByDate(expenses)

  // Reusable filters controls component
  const FiltersForm = () => (
    <div className="space-y-5">
      {/* Search Input */}
      <div>
        <label className="label">Search</label>
        <div className="relative">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 dark:text-gray-500 text-gray-400" />
          <input
            className="input pl-10 pr-10"
            placeholder="Search transactions..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
          />
          {search && (
            <button
              type="button"
              onClick={() => handleSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 dark:text-gray-500 text-gray-400 hover:text-gray-600"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Transaction Type Filters */}
      <div>
        <label className="label">Type</label>
        <div className="segmented-control p-1 gap-1">
          {[
            { label: 'All', value: 'All' },
            { label: 'Income', value: 'income' },
            { label: 'Expenses', value: 'expense' }
          ].map(t => {
            const isActive = (filters.type || 'All') === t.value
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => applyFilter('type', t.value)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all text-center ${isActive
                  ? 'bg-sky-500 text-white shadow-sm'
                  : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Category Pills */}
      <div>
        <label className="label">Categories</label>
        <div className="flex gap-2 overflow-x-auto pb-1.5 scrollbar-none">
          {['All', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              type="button"
              onClick={() => applyFilter('category', cat)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all border ${filters.category === cat
                ? 'bg-sky-500 border-sky-500 text-white shadow-sm'
                : 'dark:bg-dark-card bg-white dark:border-dark-border border-slate-200 text-slate-600 dark:text-gray-300 hover:border-sky-500/30'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Date Pickers */}
      <div>
        <label className="label">Date Range</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <span className="text-[10px] font-semibold dark:text-gray-500 text-gray-400 uppercase">From</span>
            <input
              type="date"
              className="input mt-1"
              value={range.startDate}
              onChange={e => setRange(prev => ({ ...prev, startDate: e.target.value }))}
            />
          </div>
          <div>
            <span className="text-[10px] font-semibold dark:text-gray-500 text-gray-400 uppercase">To</span>
            <input
              type="date"
              className="input mt-1"
              value={range.endDate}
              onChange={e => setRange(prev => ({ ...prev, endDate: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2 pt-2">
        <button
          type="button"
          onClick={clearFilters}
          className="btn-secondary py-2.5 flex items-center justify-center gap-2"
        >
          <RotateCcw size={14} />
          Reset
        </button>
        <button
          type="button"
          onClick={applyDateFilter}
          className="btn-primary py-2.5"
        >
          Apply
        </button>
      </div>

      {/* Export Reports */}
      <div className="pt-4 border-t dark:border-dark-border border-light-border space-y-2">
        <label className="label">Export Reports</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => exportFile('pdf')}
            disabled={Boolean(exporting)}
            className="w-full py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 dark:bg-dark-bg bg-white dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-red-500 hover:border-red-500/30 disabled:opacity-50"
          >
            <FileText size={14} />
            {exporting === 'pdf' ? 'PDF...' : 'PDF'}
          </button>
          <button
            type="button"
            onClick={() => exportFile('csv')}
            disabled={Boolean(exporting)}
            className="w-full py-2.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-2 dark:bg-dark-bg bg-white dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-emerald-500 hover:border-emerald-500/30 disabled:opacity-50"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'csv' ? 'CSV...' : 'CSV'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <PageHeader
        title="Transaction History"
        subtitle="View, filter, and export your transaction logs"
        badge={activeFilterCount > 0 ? `${activeFilterCount} Active` : undefined}
        actions={
          <button
            type="button"
            onClick={() => setShowFilters(prev => !prev)}
            className={`lg:hidden relative w-10 h-10 rounded-xl border flex items-center justify-center transition-all active:scale-95 shadow-sm ${
              showFilters || activeFilterCount
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500'
            }`}
            aria-pressed={showFilters}
            title="Filters"
          >
            <SlidersHorizontal size={16} />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold leading-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </button>
        }
      />

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Side: Transaction List */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Mobile expandable filters */}
          {showFilters && (
            <div className="card p-5 mb-4 lg:hidden animate-slideDown">
              <div className="flex items-center justify-between mb-4 pb-2 border-b dark:border-dark-border border-light-border">
                <span className="text-sm font-bold dark:text-white text-slate-800">Filter Transactions</span>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-dark-border flex items-center justify-center text-gray-500 dark:text-gray-400"
                >
                  <X size={15} />
                </button>
              </div>
              <FiltersForm />
            </div>
          )}

          {!loading && expenses.length > 0 && (
            <p className="text-xs dark:text-gray-500 text-gray-400 font-bold uppercase tracking-wider mb-2">
              Showing {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
            </p>
          )}

          {loading && expenses.length === 0 ? (
            Array(5).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
          ) : expenses.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="No transactions found"
              description="Try adjusting your active filters or range."
              actionLabel={activeFilterCount > 0 ? "Reset Filters" : undefined}
              onAction={activeFilterCount > 0 ? clearFilters : undefined}
            />
          ) : (
            <div className="space-y-6">
              {groupedTransactions.map(group => (
                <div key={group.dateStr} className="animate-fadeIn">
                  {/* Daily Date Header with Subtotals */}
                  <div className="flex items-center justify-between px-3 py-1.5 mb-2 sticky top-[73px] z-10 backdrop-blur-md bg-light-bg/85 dark:bg-dark-bg/85 rounded-xl border border-slate-200/60 dark:border-dark-border/60">
                    <span className="text-xs font-bold text-slate-800 dark:text-gray-200">
                      {formatGroupHeaderDate(group.dateObj)}
                    </span>
                    <div className="flex items-center gap-2.5 text-[11px] font-bold tabular-nums">
                      {group.dayIncome > 0 && (
                        <span className="text-emerald-500 font-semibold">+ {formatCurrency(group.dayIncome)}</span>
                      )}
                      {group.dayExpense > 0 && (
                        <span className="text-rose-500 font-semibold">- {formatCurrency(group.dayExpense)}</span>
                      )}
                    </div>
                  </div>

                  {/* Transactions of this day */}
                  <div className="card overflow-hidden divide-y dark:divide-dark-border divide-light-border px-1">
                    {group.items.map(e => (
                      <ExpenseCard key={e.id || e._id} expense={e} showActions />
                    ))}
                  </div>
                </div>
              ))}

              {pagination.page < pagination.totalPages && (
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="w-full py-3.5 text-primary text-sm font-bold bg-primary/10 hover:bg-primary/15 rounded-xl transition-all active:scale-[0.99]"
                >
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Desktop Permanent Sidebar */}
        <div className="hidden lg:block lg:col-span-1">
          <div className="card p-6 space-y-6 sticky top-24">
            <div className="flex items-center justify-between border-b dark:border-dark-border border-light-border pb-3">
              <span className="text-sm font-black dark:text-white text-slate-800 uppercase tracking-wider">Filters & Actions</span>
              {activeFilterCount > 0 && (
                <span className="min-w-[18px] h-4.5 px-1.5 rounded-full bg-primary text-white text-[9px] font-bold leading-4.5 flex items-center justify-center">
                  {activeFilterCount} active
                </span>
              )}
            </div>
            <FiltersForm />
          </div>
        </div>

      </div>
    </div>
  )
}
