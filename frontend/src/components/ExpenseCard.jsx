import { Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useExpense } from '../context/ExpenseContext'
import { CATEGORY_ICONS, CATEGORY_COLORS, formatCurrency, formatShortDate } from '../utils/constants'

export default function ExpenseCard({ expense, showActions = false }) {
  const navigate = useNavigate()
  const { deleteExpense } = useExpense()
  const isIncome = expense.type === 'income'
  const color = CATEGORY_COLORS[expense.category] || '#0066FF'

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm('Delete this expense?')) deleteExpense(expense._id)
  }

  return (
    <div
      onClick={() => navigate(`/edit/${expense._id}`)}
      className="card p-4 flex items-center gap-3 mb-2.5 cursor-pointer
                 active:scale-[0.98] transition-transform hover:dark:border-dark-muted hover:bg-opacity-75
                 animate-fadeIn"
    >
      {/* Icon */}
      <div className="w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
        style={{ backgroundColor: `${color}18` }}>
        {CATEGORY_ICONS[expense.category] || '📦'}
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold dark:text-white text-slate-800 text-sm truncate">{expense.title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs dark:text-gray-500 text-gray-400">{expense.category}</span>
          <span className="w-1 h-1 rounded-full dark:bg-gray-700 bg-gray-300" />
          <span className="text-xs dark:text-gray-500 text-gray-400">{formatShortDate(expense.expenseDate)}</span>
        </div>
      </div>

      {/* Amount */}
      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className={`font-bold text-sm ${isIncome ? 'text-secondary' : 'text-danger'}`}>
            {isIncome ? '+' : '-'}{formatCurrency(expense.amount)}
          </p>
          <p className="text-[10px] dark:text-gray-600 text-gray-600 mt-0.5">{expense.paymentMethod}</p>
        </div>
        {showActions && (
          <button onClick={handleDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center
                       dark:text-gray-700 text-gray-600 hover:text-danger hover:bg-danger/10 transition-colors">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
