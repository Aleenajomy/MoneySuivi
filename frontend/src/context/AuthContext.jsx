import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

const readAuthPayload = (res) => {
  const token = res?.data?.token
  const user = res?.data?.user

  if (!token || !user) {
    throw new Error(res?.data?.message || 'Invalid response from server')
  }

  return { token, user }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('user')
      return savedUser ? JSON.parse(savedUser) : null
    } catch {
      return null
    }
  })
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(false)

  // Load user profile on mount if token exists
  useEffect(() => {
    if (!token) return

    let isMounted = true
    setLoading(true)

    api.get('/auth/me')
      .then(res => {
        if (!isMounted) return
        setUser(res.data.user)
        try {
          localStorage.setItem('user', JSON.stringify(res.data.user))
        } catch (_) {}
      })
      .catch(err => {
        if (!isMounted) return
        // Only clear credentials if the server explicitly rejected the token (401)
        if (err.status === 401 || err.response?.status === 401) {
          localStorage.removeItem('token')
          localStorage.removeItem('user')
          setToken(null)
          setUser(null)
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [token])

  // Listen to unauthorized events from api interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null)
      setUser(null)
    }
    window.addEventListener('auth:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized)
  }, [])

  const login = async (email, password) => {
    // Let the original API error propagate so callers can read err.status / err.code
    const res = await api.post('/auth/login', { email, password })
    const auth = readAuthPayload(res)
    localStorage.setItem('token', auth.token)
    try {
      localStorage.setItem('user', JSON.stringify(auth.user))
    } catch (_) {}
    setToken(auth.token)
    setUser(auth.user)
    toast.success(`Welcome back, ${auth.user.name?.split(' ')[0] || 'there'}!`)
  }

  const register = async (name, email, password) => {
    // Let the original API error propagate so callers can read err.status / err.code
    const res = await api.post('/auth/register', { name, email, password })
    const auth = readAuthPayload(res)
    localStorage.setItem('token', auth.token)
    try {
      localStorage.setItem('user', JSON.stringify(auth.user))
    } catch (_) {}
    setToken(auth.token)
    setUser(auth.user)
    toast.success('Account created successfully!')
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
    toast.success('Logged out successfully')
  }

  const updateProfile = async (data) => {
    const res = await api.put('/auth/profile', data)
    setUser(prev => {
      const updated = { ...prev, ...data }
      try {
        localStorage.setItem('user', JSON.stringify(updated))
      } catch (_) {}
      return updated
    })
    toast.success('Profile updated!')
    return res.data
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}
