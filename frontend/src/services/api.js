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

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(new Error(err.response?.data?.message || err.message || 'Something went wrong'))
  }
)

export default api
