import { useEffect } from 'react'
import { X } from 'lucide-react'

export default function Modal({
  isOpen = true,
  onClose,
  title,
  subtitle,
  children,
  maxWidth = 'max-w-md',
  showClose = true,
}) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onClose) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm px-4 flex items-center justify-center animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`card p-5 sm:p-6 w-full ${maxWidth} max-h-[90vh] overflow-y-auto shadow-2xl animate-scaleIn dark:bg-dark-card bg-white border dark:border-dark-border border-slate-200/80`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showClose) && (
          <div className="flex items-start justify-between gap-3 mb-4 pb-3 border-b dark:border-dark-border border-light-border">
            <div>
              {title && (
                <h2 className="text-base sm:text-lg font-bold dark:text-white text-slate-800 tracking-tight">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {subtitle}
                </p>
              )}
            </div>
            {showClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-dark-border transition-colors flex-shrink-0"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            )}
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  )
}
