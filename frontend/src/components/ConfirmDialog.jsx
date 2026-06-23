import { useEffect } from 'react'
import { AlertTriangle, LogOut, Trash2, ShieldAlert } from 'lucide-react'

const VARIANTS = {
  delete:   { icon: Trash2,       color: 'text-red-500',    bg: 'bg-red-500/10',    btn: 'bg-red-500 hover:bg-red-600' },
  logout:   { icon: LogOut,       color: 'text-orange-400', bg: 'bg-orange-400/10', btn: 'bg-orange-500 hover:bg-orange-600' },
  warning:  { icon: AlertTriangle,color: 'text-yellow-500', bg: 'bg-yellow-500/10', btn: 'bg-yellow-500 hover:bg-yellow-600' },
  critical: { icon: ShieldAlert,  color: 'text-red-600',    bg: 'bg-red-600/10',    btn: 'bg-red-600 hover:bg-red-700' },
}

export default function ConfirmDialog({ open, title, message, confirmText = 'Confirm', cancelText = 'Cancel', variant = 'delete', onConfirm, onCancel }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const v = VARIANTS[variant] || VARIANTS.delete
  const Icon = v.icon

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-3xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border shadow-2xl p-6 animate-slideUp"
        onClick={e => e.stopPropagation()}>

        {/* Icon */}
        <div className={`w-14 h-14 rounded-2xl ${v.bg} flex items-center justify-center mx-auto mb-4`}>
          <Icon size={26} className={v.color} />
        </div>

        {/* Text */}
        <h3 className="text-base font-black text-center dark:text-white text-slate-800 mb-1">{title}</h3>
        {message && <p className="text-xs text-center dark:text-gray-400 text-gray-500 leading-relaxed">{message}</p>}

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button onClick={onCancel}
            className="flex-1 py-3 rounded-2xl text-sm font-bold dark:bg-dark-border dark:text-gray-300 bg-slate-100 text-slate-600 active:scale-95 transition-all">
            {cancelText}
          </button>
          <button onClick={onConfirm}
            className={`flex-1 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 transition-all shadow-md ${v.btn}`}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
