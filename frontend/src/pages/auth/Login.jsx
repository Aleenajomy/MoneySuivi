import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, TrendingUp, ArrowLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('login') // 'login' | 'forgot'
  const [fpForm, setFpForm] = useState({ email: '', newPassword: '', confirm: '' })
  const [fpLoading, setFpLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  const handleForgot = async (e) => {
    e.preventDefault()
    if (fpForm.newPassword !== fpForm.confirm) return toast.error('Passwords do not match')
    setFpLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: fpForm.email, newPassword: fpForm.newPassword })
      toast.success('Password reset successfully! Please sign in.')
      setView('login')
      setFpForm({ email: '', newPassword: '', confirm: '' })
    } catch (err) {
      toast.error(err.message || 'Reset failed')
    } finally {
      setFpLoading(false)
    }
  }

  if (view === 'forgot') {
    return (
      <div className="min-h-screen dark:bg-dark-bg bg-light-bg flex flex-col px-6 py-12">
        <button onClick={() => setView('login')} className="flex items-center gap-2 text-sm dark:text-gray-400 text-gray-500 mb-8">
          <ArrowLeft size={16} /> Back to Sign In
        </button>
        <div className="mb-8">
          <div className="w-12 h-12 rounded-2xl gradient-blue flex items-center justify-center mb-6">
            <TrendingUp size={22} className="text-white" />
          </div>
          <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-2">Reset Password</p>
          <h1 className="text-3xl font-bold dark:text-white text-slate-800">New Password</h1>
          <p className="text-gray-500 text-sm mt-2">Enter your registered email and set a new password.</p>
        </div>
        <form onSubmit={handleForgot} className="space-y-4">
          <div>
            <label className="label">Email Address</label>
            <input type="email" required className="input" placeholder="you@example.com"
              value={fpForm.email} onChange={e => setFpForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div>
            <label className="label">New Password</label>
            <input type="password" required minLength={6} className="input" placeholder="Min. 6 characters"
              value={fpForm.newPassword} onChange={e => setFpForm(p => ({ ...p, newPassword: e.target.value }))} />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" required className="input" placeholder="Re-enter new password"
              value={fpForm.confirm} onChange={e => setFpForm(p => ({ ...p, confirm: e.target.value }))} />
          </div>
          <div className="pt-2">
            <button type="submit" disabled={fpLoading} className="btn-primary">
              {fpLoading
                ? <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Resetting...
                  </span>
                : 'Reset Password'}
            </button>
          </div>
        </form>
        <p className="text-center text-xs dark:text-gray-700 text-gray-400 mt-8">MoneySuivi © 2026</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen dark:bg-dark-bg bg-light-bg flex flex-col px-6 py-12">

      {/* Logo */}
      <div className="mb-10">
        <div className="w-12 h-12 rounded-2xl gradient-blue flex items-center justify-center mb-6">
          <TrendingUp size={22} className="text-white" />
        </div>
        <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-2">Welcome back</p>
        <h1 className="text-3xl font-bold dark:text-white text-slate-800">Sign In</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 flex-1">
        <div>
          <label className="label">Email Address</label>
          <input type="email" required className="input"
            placeholder="you@example.com"
            value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>

        <div>
          <label className="label">Password</label>
          <div className="relative">
            <input type={showPass ? 'text' : 'password'} required className="input pr-12"
              placeholder="••••••••"
              value={form.password}
              onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
            <button type="button" onClick={() => setShowPass(s => !s)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <button type="button" onClick={() => setView('forgot')}
            className="text-primary text-xs font-semibold mt-2 float-right hover:underline">
            Forgot Password?
          </button>
        </div>

        <div className="pt-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </span>
              : 'Sign In'}
          </button>
        </div>

        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px dark:bg-dark-border bg-light-border" />
          <span className="text-gray-500 text-xs">or</span>
          <div className="flex-1 h-px dark:bg-dark-border bg-light-border" />
        </div>

        <p className="text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary font-semibold hover:text-sky-400">
            Create Account
          </Link>
        </p>
      </form>

      <p className="text-center text-xs dark:text-gray-700 text-gray-400 mt-8">
        MoneySuivi © 2026
      </p>
    </div>
  )
}
