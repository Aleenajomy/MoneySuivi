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
      <div className="flex items-center justify-between mb-6 pr-12">
        <div>
          <h1 className="text-xl font-bold dark:text-white text-slate-800">Budget Alerts</h1>
          <p className="text-xs dark:text-gray-500 text-gray-500">{unreadCount} unread</p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center"
            title="Mark all as read"
          >
            <CheckCheck size={17} />
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <div className="text-center py-16">
          <p className="dark:text-gray-400 text-gray-500 font-medium">No alerts yet</p>
          <p className="dark:text-gray-600 text-gray-400 text-sm mt-1">Budget alerts will appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map(notification => {
            const isCritical = notification.type === 'critical'
            return (
              <div
                key={notification.id}
                className={`card p-4 border-l-4 ${
                  isCritical ? 'border-l-red-500' : 'border-l-yellow-400'
                } ${notification.read ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                    isCritical ? 'bg-red-500/10 text-red-500' : 'bg-yellow-400/10 text-yellow-500'
                  }`}>
                    <AlertTriangle size={17} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-sm dark:text-white text-slate-800 truncate">{notification.category}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isCritical ? 'bg-red-500/10 text-red-500' : 'bg-yellow-400/10 text-yellow-600'
                      }`}>
                        {Math.round(notification.percentage || 0)}%
                      </span>
                    </div>
                    <p className="text-xs dark:text-gray-400 text-gray-600 mt-1">{notification.message}</p>
                    <p className="text-[10px] dark:text-gray-600 text-gray-400 mt-2">{formatDate(notification.createdAt)}</p>
                  </div>
                  <div className="flex flex-col gap-2">
                    {!notification.read && (
                      <button
                        type="button"
                        onClick={() => markRead(notification.id)}
                        className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center"
                        title="Mark as read"
                      >
                        <CheckCheck size={14} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => deleteNotification(notification.id)}
                      className="w-7 h-7 rounded-lg text-gray-400 hover:text-danger hover:bg-danger/10 flex items-center justify-center"
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
  )
}
