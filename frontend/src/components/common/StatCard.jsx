import { formatCurrency } from '../../utils/constants'

export default function StatCard({
  label,
  amount,
  icon: Icon,
  tone = 'secondary',
  onClick,
  isPercentage = false,
  subtext,
  className = '',
  children,
}) {
  const toneStyles = {
    secondary: 'text-secondary bg-secondary/10',
    danger: 'text-danger bg-danger/10',
    info: 'text-sky-500 bg-sky-500/10',
    warning: 'text-amber-500 bg-amber-500/10',
    neutral: 'text-gray-500 bg-gray-500/10',
  }

  const iconStyle = toneStyles[tone] || toneStyles.secondary
  const Component = onClick ? 'button' : 'div'

  const formattedAmount = isPercentage
    ? amount
    : typeof amount === 'number'
      ? formatCurrency(amount)
      : amount || '₹0'

  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card p-4 sm:p-5 text-left transition-all duration-200 border dark:border-dark-border border-light-border dark:bg-dark-card bg-white shadow-sm ${
        onClick
          ? 'active:scale-[0.98] cursor-pointer hover:border-sky-500/30 hover:shadow-md'
          : 'hover:shadow-sm'
      } ${className}`}
    >
      <div className="flex items-center justify-between mb-2 sm:mb-3">
        <span className="text-[10px] sm:text-xs font-bold dark:text-gray-400 text-gray-500 uppercase tracking-wider truncate">
          {label}
        </span>
        {Icon && (
          <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconStyle}`}>
            <Icon size={16} strokeWidth={2} />
          </div>
        )}
      </div>
      <p className="dark:text-white text-slate-800 font-black text-base sm:text-lg md:text-xl tracking-tight tabular-nums truncate">
        {formattedAmount}
      </p>
      {subtext && (
        <p className="text-[10px] sm:text-xs dark:text-gray-500 text-gray-400 mt-1 truncate">
          {subtext}
        </p>
      )}
      {children}
    </Component>
  )
}
