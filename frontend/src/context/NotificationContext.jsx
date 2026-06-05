import { createContext, useContext, useState, useCallback } from 'react'
import api from '../services/api'

const NotificationContext = createContext(null)
export const useNotification = () => useContext(NotificationContext)

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await api.get('/notifications')
      setNotifications(res.data.notifications)
      setUnreadCount(res.data.unreadCount)
    } catch (_) {}
  }, [])

  const markAllRead = async () => {
    await api.put('/notifications/read-all')
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  const markRead = async (id) => {
    await api.put(`/notifications/${id}/read`)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(prev => Math.max(prev - 1, 0))
  }

  const deleteNotification = async (id) => {
    const deleted = notifications.find(n => n.id === id)
    await api.delete(`/notifications/${id}`)
    setNotifications(prev => prev.filter(n => n.id !== id))
    if (deleted && !deleted.read) setUnreadCount(prev => Math.max(prev - 1, 0))
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, fetchNotifications, markAllRead, markRead, deleteNotification }}>
      {children}
    </NotificationContext.Provider>
  )
}
