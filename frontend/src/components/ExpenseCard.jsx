import { Repeat, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useExpense } from '../context/ExpenseContext'
import { CATEGORY_COLORS, CATEGORY_ICONS, formatCurrency, formatShortDate } from '../utils/constants'

export default function ExpenseCard({ expense, showActions = false }) {
  const navigate = useNavigate()
  const { deleteExpense } = useExpense()
  const isIncome = expense.type === 'income'
  const color = CATEGORY_COLORS[expense.category] || '#0066FF'

  const handleDelete = (e) => {
    e.stopPropagation()
    if (window.confirm('Delete this transaction?')) deleteExpense(expense._id)
  }

  return (
    <div
      onClick={() => navigate(`/edit/${expense._id}`)}
      className="card p-4 flex items-center gap-3 mb-2.5 cursor-pointer active:scale-[0.98] transition-transform hover:dark:border-dark-muted hover:bg-opacity-75 animate-fadeIn"
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0"
        style={{ backgroundColor: `${color}18`, color }}
      >
        {CATEGORY_ICONS[expense.category] || 'OT'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <p className="font-semibold dark:text-white text-slate-800 text-sm truncate">{expense.title}</p>
          {expense.recurring && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase">
              <Repeat size={10} />
              {expense.recurringType}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs dark:text-gray-500 text-gray-400">{expense.category}</span>
          <span className="w-1 h-1 rounded-full dark:bg-gray-700 bg-gray-300" />
          <span className="text-xs dark:text-gray-500 text-gray-400">{formatShortDate(expense.expenseDate)}</span>
        </div>
        {expense.recurring && expense.nextRunDate && (
          <p className="text-[10px] text-primary mt-1">Next: {formatShortDate(expense.nextRunDate)}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="text-right">
          <p className={`font-bold text-sm ${isIncome ? 'text-secondary' : 'text-danger'}`}>
            {isIncome ? '+' : '-'}{formatCurrency(expense.amount)}
          </p>
          <p className="text-[10px] dark:text-gray-600 text-gray-600 mt-0.5">{expense.paymentMethod}</p>
        </div>
        {showActions && (
          <button
            type="button"
            onClick={handleDelete}
            className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-700 text-gray-600 hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
