import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCheck, Trash2, Bell } from 'lucide-react'
import { useNotification } from '../context/NotificationContext'
import { formatDate } from '../utils/constants'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Notifications() {
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAllRead,
    markRead,
    deleteNotification,
  } = useNotification()

  const [deleteTargetId, setDeleteTargetId] = useState(null)

  useEffect(() => {
    fetchNotifications()
  }, [fetchNotifications])

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title="Budget Alerts"
        subtitle={`${unreadCount} unread warning${unreadCount === 1 ? '' : 's'}`}
        actions={
          unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="icon-btn text-sky-500 bg-sky-500/10 hover:bg-sky-500/20 border-sky-500/20"
              title="Mark all as read"
              aria-label="Mark all alerts as read"
            >
              <CheckCheck size={18} />
            </button>
          )
        }
      />

        {notifications.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="No alerts yet"
            description="Budget warnings and spending thresholds will appear here."
          />
        ) : (
          <div className="space-y-4">
            {notifications.map(notification => {
              const id = notification.id || notification._id
              const isCritical = notification.type === 'critical'
              return (
                <div
                  key={id}
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
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full tabular-nums ${isCritical ? 'bg-red-500/10 text-red-500' : 'bg-yellow-400/10 text-yellow-600'
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
                          onClick={() => markRead(id)}
                          className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center hover:bg-sky-500/20 transition-all"
                          title="Mark as read"
                          aria-label="Mark as read"
                        >
                          <CheckCheck size={14} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteTargetId(id)}
                        className="w-8 h-8 rounded-xl text-gray-400 hover:text-danger hover:bg-danger/10 flex items-center justify-center transition-all"
                        title="Delete"
                        aria-label="Delete alert"
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

        <ConfirmDialog
          open={!!deleteTargetId}
          variant="delete"
          title="Delete Alert?"
          message="This alert will be permanently removed."
          confirmText="Delete"
          onConfirm={() => {
            const target = deleteTargetId
            setDeleteTargetId(null)
            deleteNotification(target)
          }}
          onCancel={() => setDeleteTargetId(null)}
        />
      </div>
  )
}
