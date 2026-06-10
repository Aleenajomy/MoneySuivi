import { useEffect } from 'react'
import { AlertTriangle, CheckCheck, Trash2 } from 'lucide-react'
import { useNotification } from '../context/NotificationContext'
import { formatDate } from '../utils/constants'

export default function Notifications() {
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAllRead,
    markRead,
    deleteNotification,
  } = useNotification()

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return (
    <div className="page">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between animate-fadeIn pr-12">
          <div>
            <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">Budget Alerts</h1>
            <p className="text-xs dark:text-gray-500 text-gray-400 mt-0.5">{unreadCount} unread warnings</p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center hover:bg-sky-500/20 active:scale-95 transition-all shadow-sm"
              title="Mark all as read"
            >
              <CheckCheck size={18} />
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="text-center py-16 card p-5 flex flex-col items-center justify-center animate-scaleIn">
            <p className="dark:text-gray-400 text-gray-500 font-bold text-sm">No alerts yet</p>
            <p className="dark:text-gray-600 text-gray-400 text-xs mt-1">Budget warnings will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map(notification => {
              const isCritical = notification.type === 'critical'
              return (
                <div
                  key={notification.id}
                  className={`card p-4 border-l-4 transition-all hover:shadow-md ${isCritical ? 'border-l-red-500' : 'border-l-yellow-400'
                    } ${notification.read ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${isCritical ? 'bg-red-500/10 text-red-500' : 'bg-yellow-400/10 text-yellow-500'
                      }`}>
                      <AlertTriangle size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{notification.category}</p>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isCritical ? 'bg-red-500/10 text-red-500' : 'bg-yellow-400/10 text-yellow-600'
                          }`}>
                          {Math.round(notification.percentage || 0)}%
                        </span>
                      </div>
                      <p className="text-xs dark:text-gray-300 text-slate-600 mt-1 leading-relaxed">{notification.message}</p>
                      <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-2">{formatDate(notification.createdAt)}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      {!notification.read && (
                        <button
                          type="button"
                          onClick={() => markRead(notification.id)}
                          className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center hover:bg-sky-500/20 transition-all"
                          title="Mark as read"
                        >
                          <CheckCheck size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => { if (window.confirm('Delete alert?')) deleteNotification(notification.id) }}
                        className="w-8 h-8 rounded-xl text-gray-400 hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-all"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
