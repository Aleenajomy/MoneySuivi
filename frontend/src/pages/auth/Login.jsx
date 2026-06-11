import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, TrendingUp, ArrowLeft, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'

// Reusable field error hint
function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p className="flex items-center gap-1 text-[11px] text-red-500 font-semibold mt-1">
      <AlertCircle size={11} /> {msg}
    </p>
  )
}

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})          // field-level errors
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState('login')          // 'login' | 'forgot'
  const [fpForm, setFpForm] = useState({ email: '', newPassword: '', confirm: '' })
  const [fpErrors, setFpErrors] = useState({})
  const [fpLoading, setFpLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  // ── Client-side validation ───────────────────────────────────────────────
  const validateLogin = () => {
    const e = {}
    if (!form.email.trim()) {
      e.email = 'Please enter your email address.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      e.email = 'Please enter a valid email address.'
    }
    if (!form.password) {
      e.password = 'Please enter your password.'
    }
    return e
  }

  // ── Login submit ─────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const fieldErrors = validateLogin()
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setLoading(true)
    try {
      await login(form.email, form.password)
      navigate('/')
    } catch (err) {
      const status = err.status
      // Map each backend error to a targeted field message
      if (status === 404) {
        setErrors({ email: 'No account found with this email address. Please create an account first.' })
      } else if (status === 401) {
        setErrors({ password: 'Incorrect password. Please try again.' })
      } else {
        toast.error(err.message || 'Login failed. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Forgot-password validation ───────────────────────────────────────────
  const validateForgot = () => {
    const e = {}
    if (!fpForm.email.trim()) {
      e.email = 'Please enter your email address.'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fpForm.email)) {
      e.email = 'Please enter a valid email address.'
    }
    if (!fpForm.newPassword) {
      e.newPassword = 'Please enter a new password.'
    } else if (fpForm.newPassword.length < 6) {
      e.newPassword = 'Password must be at least 6 characters long.'
    }
    if (!fpForm.confirm) {
      e.confirm = 'Please confirm your new password.'
    } else if (fpForm.newPassword !== fpForm.confirm) {
      e.confirm = 'Passwords do not match.'
    }
    return e
  }

  // ── Forgot-password submit ───────────────────────────────────────────────
  const handleForgot = async (e) => {
    e.preventDefault()
    const fieldErrors = validateForgot()
    if (Object.keys(fieldErrors).length > 0) {
      setFpErrors(fieldErrors)
      return
    }
    setFpErrors({})
    setFpLoading(true)
    try {
      await api.post('/auth/forgot-password', { email: fpForm.email, newPassword: fpForm.newPassword })
      toast.success('Password reset successfully! Please sign in.')
      setView('login')
      setFpForm({ email: '', newPassword: '', confirm: '' })
    } catch (err) {
      if (err.status === 404) {
        setFpErrors({ email: 'No account found with this email address.' })
      } else {
        toast.error(err.message || 'Password reset failed. Please try again.')
      }
    } finally {
      setFpLoading(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  const inputClass = (field) =>
    `input${errors[field] ? ' border-red-500 focus:border-red-500 dark:border-red-500' : ''}`

  const fpInputClass = (field) =>
    `input${fpErrors[field] ? ' border-red-500 focus:border-red-500 dark:border-red-500' : ''}`

  // ══════════════════════════════════════════════════════════════════════════
  // FORGOT PASSWORD VIEW
  // ══════════════════════════════════════════════════════════════════════════
  if (view === 'forgot') {
    return (
      <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 dark:bg-dark-bg bg-light-bg transition-colors duration-300">
        {/* Left branding */}
        <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)' }}>
          <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-white/5" />
          <div className="absolute -bottom-24 -right-12 w-80 h-80 rounded-full bg-white/5" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
              <TrendingUp size={20} className="text-white" />
            </div>
            <span className="font-black text-lg tracking-tight">MoneySuivi</span>
          </div>
          <div className="space-y-4 my-auto pr-8">
            <h2 className="text-4xl font-extrabold leading-tight">Master your money. Elevate your financial future.</h2>
            <p className="text-blue-100 text-sm font-medium leading-relaxed">
              Get instant control over expenses, map assets and liabilities, monitor budgets, and manage loans in a single, secure environment.
            </p>
          </div>
          <p className="text-xs text-blue-200 font-semibold">MoneySuivi All-in-One Finance © 2026</p>
        </div>

        {/* Right form */}
        <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 sm:p-12 relative">
          <div className="w-full max-w-md flex justify-between items-center mb-8 lg:hidden">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center">
                <TrendingUp size={16} className="text-white" />
              </div>
              <span className="font-black text-sm tracking-tight dark:text-white text-slate-800">MoneySuivi</span>
            </div>
          </div>

          <div className="w-full max-w-md">
            <button onClick={() => { setView('login'); setFpErrors({}) }}
              className="flex items-center gap-2 text-sm dark:text-gray-400 text-gray-500 mb-6 hover:text-sky-500 transition-colors w-fit font-bold">
              <ArrowLeft size={16} /> Back to Sign In
            </button>

            <div className="glass-card p-8 sm:p-10 animate-scaleIn">
              <div className="mb-6">
                <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Reset Password</p>
                <h1 className="text-2xl font-black dark:text-white text-slate-800">New Password</h1>
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-1.5 leading-relaxed">Enter your registered email and set a new password.</p>
              </div>

              <form onSubmit={handleForgot} noValidate className="space-y-4">
                <div>
                  <label className="label">Email Address</label>
                  <input
                    id="fp-email"
                    type="email"
                    className={fpInputClass('email')}
                    placeholder="you@example.com"
                    value={fpForm.email}
                    onChange={e => { setFpForm(p => ({ ...p, email: e.target.value })); setFpErrors(p => ({ ...p, email: '' })) }}
                  />
                  <FieldError msg={fpErrors.email} />
                </div>
                <div>
                  <label className="label">New Password</label>
                  <input
                    id="fp-newPassword"
                    type="password"
                    className={fpInputClass('newPassword')}
                    placeholder="Min. 6 characters"
                    value={fpForm.newPassword}
                    onChange={e => { setFpForm(p => ({ ...p, newPassword: e.target.value })); setFpErrors(p => ({ ...p, newPassword: '' })) }}
                  />
                  <FieldError msg={fpErrors.newPassword} />
                </div>
                <div>
                  <label className="label">Confirm Password</label>
                  <input
                    id="fp-confirm"
                    type="password"
                    className={fpInputClass('confirm')}
                    placeholder="Re-enter new password"
                    value={fpForm.confirm}
                    onChange={e => { setFpForm(p => ({ ...p, confirm: e.target.value })); setFpErrors(p => ({ ...p, confirm: '' })) }}
                  />
                  <FieldError msg={fpErrors.confirm} />
                </div>
                <div className="pt-2">
                  <button type="submit" disabled={fpLoading} className="btn-primary w-full">
                    {fpLoading
                      ? <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Resetting...
                        </span>
                      : 'Reset Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LOGIN VIEW
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 dark:bg-dark-bg bg-light-bg transition-colors duration-300">

      {/* Left branding */}
      <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)' }}>
        <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -right-12 w-80 h-80 rounded-full bg-white/5" />
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
            <TrendingUp size={20} className="text-white" />
          </div>
          <span className="font-black text-lg tracking-tight">MoneySuivi</span>
        </div>
        <div className="space-y-4 my-auto pr-8">
          <h2 className="text-4xl font-extrabold leading-tight">Master your money. Elevate your financial future.</h2>
          <p className="text-blue-100 text-sm font-medium leading-relaxed">
            Get instant control over expenses, map assets and liabilities, monitor budgets, and manage loans in a single, secure environment.
          </p>
        </div>
        <p className="text-xs text-blue-200 font-semibold">MoneySuivi All-in-One Finance © 2026</p>
      </div>

      {/* Right form */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 sm:p-12 relative">
        <div className="w-full max-w-md flex justify-between items-center mb-8 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="font-black text-sm tracking-tight dark:text-white text-slate-800">MoneySuivi</span>
          </div>
        </div>

        {/* Glassmorphism Card */}
        <div className="w-full max-w-md glass-card p-8 sm:p-10 animate-scaleIn">
          <div className="mb-6">
            <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Welcome back</p>
            <h1 className="text-2xl font-black dark:text-white text-slate-800">Sign In</h1>
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Email */}
            <div>
              <label className="label">Email Address</label>
              <input
                id="login-email"
                type="email"
                className={inputClass('email')}
                placeholder="you@example.com"
                value={form.email}
                onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErrors(p => ({ ...p, email: '' })) }}
              />
              <FieldError msg={errors.email} />
            </div>

            {/* Password */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="label mb-0">Password</label>
                <button type="button" onClick={() => { setView('forgot'); setFpErrors({}) }}
                  className="text-primary text-xs font-bold hover:underline">
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPass ? 'text' : 'password'}
                  className={`${inputClass('password')} pr-12`}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => { setForm(p => ({ ...p, password: e.target.value })); setErrors(p => ({ ...p, password: '' })) }}
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                  {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <FieldError msg={errors.password} />
            </div>

            <div className="pt-2">
              <button type="submit" id="login-submit" disabled={loading} className="btn-primary w-full">
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
              <Link to="/register" className="text-primary font-bold hover:text-sky-400">
                Create Account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
