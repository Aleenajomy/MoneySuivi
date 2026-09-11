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
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000 // 60s to comfortably allow Render free-tier spin-up
})

// Attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Handle response errors globally with cold-start retry
api.interceptors.response.use(
  res => res,
  async err => {
    const config = err.config
    const status = err.response?.status
    const isTimeout = err.code === 'ECONNABORTED' || (err.message && err.message.toLowerCase().includes('timeout'))
    const isColdStartGatewayError = !err.response || (status >= 502 && status <= 504)

    // Auto-retry GET requests on cold start or timeout (up to 2 retries)
    if (config && (!config.method || config.method.toLowerCase() === 'get') && (isTimeout || isColdStartGatewayError)) {
      config._retryCount = config._retryCount || 0
      if (config._retryCount < 2) {
        config._retryCount += 1
        const delay = config._retryCount * 2000
        await new Promise(resolve => setTimeout(resolve, delay))
        return api(config)
      }
    }

    const url = config?.url || ''
    // Only auto-redirect to /#/login for 401s on protected endpoints,
    // NOT on the auth endpoints themselves (login/register/forgot-password/me)
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/forgot-password') || url.includes('/auth/me')
    if (status === 401 && !isAuthEndpoint) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      if (!window.location.hash.includes('/login')) {
        window.location.hash = '#/login'
      }
    }

    let userMessage = err.response?.data?.message
    if (!userMessage) {
      if (isTimeout) {
        userMessage = 'Server is taking longer to respond. Please wait a moment...'
      } else if (!err.response && err.request) {
        userMessage = 'Unable to connect to server. Please check your network.'
      } else {
        userMessage = err.message || 'Something went wrong'
      }
    }

    const rejectError = new Error(userMessage)
    rejectError.isTimeout = isTimeout
    rejectError.isNetworkError = !err.response && Boolean(err.request)
    if (err.response) {
      rejectError.status = status
      rejectError.code = err.response.data?.code
    }
    return Promise.reject(rejectError)
  }
)

export default api
