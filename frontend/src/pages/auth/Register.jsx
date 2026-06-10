import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Eye, EyeOff, ArrowLeft, TrendingUp } from 'lucide-react'
import toast from 'react-hot-toast'

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) return toast.error('Passwords do not match')
    if (form.password.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      await register(form.name, form.email, form.password)
      navigate('/')
    } catch (err) {
      toast.error(err.message || 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 dark:bg-dark-bg bg-light-bg transition-colors duration-300">
      
      {/* Left Column: Branding (Desktop only) */}
      <div className="hidden lg:flex lg:col-span-5 flex-col justify-between p-12 text-white relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)' }}>
        <div className="absolute -top-12 -left-12 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute -bottom-24 -right-12 w-80 h-80 rounded-full bg-white/5" />
        
        {/* Brand Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center">
            <TrendingUp size={20} className="text-white" />
          </div>
          <span className="font-black text-lg tracking-tight">MoneySuivi</span>
        </div>

        {/* Hero Content */}
        <div className="space-y-4 my-auto pr-8">
          <h2 className="text-4xl font-extrabold leading-tight">Your gateway to financial freedom.</h2>
          <p className="text-blue-100 text-sm font-medium leading-relaxed">
            Create an account to start tracking transactions, analyzing monthly trends, managing outstanding loans, and creating custom category budgets.
          </p>
        </div>

        {/* Brand Footer */}
        <p className="text-xs text-blue-200 font-semibold">MoneySuivi All-in-One Finance © 2026</p>
      </div>

      {/* Right Column: Register Form */}
      <div className="col-span-1 lg:col-span-7 flex flex-col justify-center items-center p-6 sm:p-12 relative">
        {/* Simple back button or logo for mobile */}
        <div className="w-full max-w-md flex justify-between items-center mb-8 lg:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg gradient-blue flex items-center justify-center">
              <TrendingUp size={16} className="text-white" />
            </div>
            <span className="font-black text-sm tracking-tight dark:text-white text-slate-800">MoneySuivi</span>
          </div>
        </div>

        {/* Form Container */}
        <div className="w-full max-w-md">
          <button onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-gray-500 hover:text-sky-500 transition-colors mb-6 w-fit font-bold text-sm">
            <ArrowLeft size={16} /> Back to Sign In
          </button>

          <div className="glass-card p-8 sm:p-10 animate-scaleIn">
            <div className="mb-6">
              <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Get started</p>
              <h1 className="text-2xl font-black dark:text-white text-slate-800">Create Account</h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Full Name</label>
                <input type="text" required className="input" placeholder="John Doe"
                  value={form.name} onChange={set('name')} />
              </div>

              <div>
                <label className="label">Email Address</label>
                <input type="email" required className="input" placeholder="you@example.com"
                  value={form.email} onChange={set('email')} />
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} required className="input pr-12"
                    placeholder="Min. 6 characters"
                    value={form.password} onChange={set('password')} />
                  <button type="button" onClick={() => setShowPass(s => !s)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="label">Confirm Password</label>
                <input type="password" required className="input" placeholder="Re-enter password"
                  value={form.confirm} onChange={set('confirm')} />
              </div>

              <div className="pt-2">
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading
                    ? <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating account...
                      </span>
                    : 'Create Account'}
                </button>
              </div>

              <p className="text-center text-sm text-gray-500 pt-2">
                Already have an account?{' '}
                <Link to="/login" className="text-primary font-bold hover:text-sky-400">Sign In</Link>
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
