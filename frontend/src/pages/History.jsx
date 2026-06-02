import { useEffect, useState } from 'react'
import { useExpense } from '../context/ExpenseContext'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton } from '../components/Skeleton'
import { CATEGORIES } from '../utils/constants'
import { Search, X, SlidersHorizontal } from 'lucide-react'

export default function History() {
  const { expenses, loading, pagination, filters, fetchExpenses, applyFilter } = useExpense()
  const [search, setSearch] = useState('')

  useEffect(() => {
    const params = { page: 1 }
    if (filters.category && filters.category !== 'All') params.category = filters.category
    if (filters.search) params.search = filters.search
    fetchExpenses(params)
  }, [filters])

  const handleSearch = (val) => {
    setSearch(val)
    applyFilter('search', val)
  }

  const loadMore = () => {
    if (pagination.page < pagination.totalPages) {
      const params = { page: pagination.page + 1 }
      if (filters.category && filters.category !== 'All') params.category = filters.category
      if (filters.search) params.search = filters.search
      fetchExpenses(params, true)
    }
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-white">History</h1>
        <div className="w-9 h-9 rounded-xl bg-dark-card border border-dark-border
                        flex items-center justify-center">
          <SlidersHorizontal size={16} className="text-gray-400" />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
        <input className="input pl-10 pr-10" placeholder="Search transactions..."
          value={search} onChange={e => handleSearch(e.target.value)} />
        {search && (
          <button onClick={() => handleSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-600 hover:text-gray-300">
            <X size={15} />
          </button>
        )}
      </div>

      {/* Category Filter */}
      <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
        {['All', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => applyFilter('category', cat)}
            className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all
              ${filters.category === cat
                ? 'bg-primary text-white shadow-glow'
                : 'bg-dark-card border border-dark-border text-gray-500'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      {!loading && expenses.length > 0 && (
        <p className="text-xs text-gray-600 mb-3 font-medium">
          {expenses.length} transaction{expenses.length !== 1 ? 's' : ''}
        </p>
      )}

      {/* List */}
      {loading && expenses.length === 0
        ? Array(5).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
        : expenses.length === 0
          ? <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-400 font-medium">No expenses found</p>
              <p className="text-gray-600 text-sm mt-1">Try adjusting your filters</p>
            </div>
          : <>
              {expenses.map(e => <ExpenseCard key={e._id} expense={e} showActions />)}
              {pagination.page < pagination.totalPages && (
                <button onClick={loadMore} disabled={loading}
                  className="w-full py-3 text-primary text-sm font-semibold
                             bg-primary/10 rounded-xl mt-2">
                  {loading ? 'Loading...' : 'Load more'}
                </button>
              )}
            </>
      }
    </div>
  )
}
