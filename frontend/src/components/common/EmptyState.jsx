export default function EmptyState({
  icon: Icon,
  title = 'No items found',
  description = 'Get started by creating your first entry.',
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div
      className={`card p-8 sm:p-10 text-center flex flex-col items-center justify-center border border-dashed dark:border-dark-border border-light-border bg-slate-50/50 dark:bg-dark-bg/30 animate-fadeIn ${className}`}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-3.5 shadow-sm">
          <Icon size={22} strokeWidth={1.8} />
        </div>
      )}
      <p className="dark:text-gray-200 text-slate-800 font-bold text-sm sm:text-base tracking-tight">
        {title}
      </p>
      {description && (
        <p className="dark:text-gray-400 text-gray-500 text-xs sm:text-sm mt-1 max-w-xs sm:max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold text-white gradient-blue shadow-md hover:shadow-lg transition-all active:scale-95 flex items-center gap-1.5"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
