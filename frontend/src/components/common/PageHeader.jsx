import { ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export default function PageHeader({
  title,
  subtitle,
  badge,
  showBack = false,
  onBack,
  actions,
  className = '',
}) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (onBack) onBack()
    else navigate(-1)
  }

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fadeIn ${className}`}>
      <div className="flex items-center gap-3">
        {showBack && (
          <button
            type="button"
            onClick={handleBack}
            className="w-9 h-9 rounded-xl border dark:border-dark-border border-light-border dark:bg-dark-card bg-white dark:text-gray-300 text-slate-700 flex items-center justify-center hover:text-sky-500 hover:border-sky-500/30 transition-all active:scale-95 shadow-sm flex-shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-800 dark:text-white truncate">
              {title}
            </h1>
            {badge && (
              <span className="px-2 py-0.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 text-[10px] font-bold uppercase tracking-wider">
                {badge}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-normal truncate">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex items-center gap-2 flex-shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
