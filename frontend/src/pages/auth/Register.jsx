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
    <div className="min-h-screen dark:bg-dark-bg bg-light-bg flex flex-col px-6 py-12">

      <button onClick={() => navigate('/login')}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-400 mb-8 w-fit">
        <ArrowLeft size={18} /> Back
      </button>

      <div className="mb-8">
        <div className="w-12 h-12 rounded-2xl gradient-blue flex items-center justify-center mb-6">
          <TrendingUp size={22} className="text-white" />
        </div>
        <p className="text-gray-500 text-sm font-medium uppercase tracking-widest mb-2">Get started</p>
        <h1 className="text-3xl font-bold dark:text-white text-slate-800">Create Account</h1>
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
          <button type="submit" disabled={loading} className="btn-primary">
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
          <Link to="/login" className="text-primary font-semibold hover:text-indigo-400">Sign In</Link>
        </p>
      </form>
    </div>
  )
}
