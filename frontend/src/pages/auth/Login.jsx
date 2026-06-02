import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
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

  return (
    <div className="min-h-screen bg-dark-bg flex flex-col px-6 py-12">

      {/* Logo */}
      <div className="mb-10">
        <div className="w-12 h-12 rounded-2xl gradient-blue flex items-center justify-center mb-6">
          <TrendingUp size={22} className="text-white" />
        </div>
        <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-2">Welcome back</p>
        <h1 className="text-3xl font-bold text-white">Sign In</h1>
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

        {/* Divider */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-dark-border" />
          <span className="text-gray-600 text-xs">or</span>
          <div className="flex-1 h-px bg-dark-border" />
        </div>

        <p className="text-center text-sm text-gray-500">
          Don't have an account?{' '}
          <Link to="/register" className="text-primary font-semibold hover:text-blue-400">
            Create Account
          </Link>
        </p>
      </form>

      <p className="text-center text-xs text-gray-700 mt-8">
        Smart Expense Tracker © 2024
      </p>
    </div>
  )
}
