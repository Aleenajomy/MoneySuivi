import axios from 'axios'

const getBaseURL = () => {
  const configuredURL = import.meta.env.VITE_API_URL
  const fallbackURL = import.meta.env.DEV ? '/api' : 'https://smartexpencetracker.onrender.com/api'
  const baseURL = (configuredURL || fallbackURL).replace(/\/+$/, '')

  if (baseURL.startsWith('http') && !baseURL.endsWith('/api')) {
    return `${baseURL}/api`
  }

  return baseURL
}

const api = axios.create({
  baseURL: getBaseURL(),
  headers: { 'Content-Type': 'application/json' }
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle response errors globally
api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status
    const url = err.config?.url || ''
    // Only auto-redirect to /login for 401s on protected endpoints,
    // NOT on the auth endpoints themselves (login/register/forgot-password)
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/forgot-password')
    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    const rejectError = new Error(err.response?.data?.message || err.message || 'Something went wrong')
    if (err.response) {
      rejectError.status = status
      rejectError.code = err.response.data?.code
    }
    return Promise.reject(rejectError)
  }
)

export default api
