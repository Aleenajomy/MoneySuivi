import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import AuthShell from '../../components/AuthShell'
import { PASSWORD_MIN, PASSWORD_MAX } from '../../utils/constants'

function FieldError({ msg }) {
  if (!msg) return null
  return (
    <p className="flex items-center gap-1 text-[11px] text-red-500 font-semibold mt-1" role="alert">
      <AlertCircle size={11} /> {msg}
    </p>
  )
}

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const navigate = useNavigate()
  const [form, setForm] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [showPass, setShowPass] = useState(false)
  const [loading, setLoading] = useState(false)
  const [linkInvalid, setLinkInvalid] = useState(!token)

  const validate = () => {
    const e = {}
    if (form.password.length < PASSWORD_MIN || form.password.length > PASSWORD_MAX) {
      e.password = `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters long.`
    }
    if (form.password !== form.confirm) e.confirm = 'Passwords do not match.'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const fieldErrors = validate()
    if (Object.keys(fieldErrors).length) return setErrors(fieldErrors)
    setLoading(true)
    try {
      await api.post('/auth/reset-password', { token, password: form.password })
      toast.success('Password updated. Please sign in with your new password.')
      navigate('/login', { replace: true })
    } catch (err) {
      if (err.code === 'INVALID_RESET_TOKEN') setLinkInvalid(true)
      else toast.error(err.message || 'Could not reset your password. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const set = (field) => (e) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  return (
    <AuthShell>
      <div className="glass-card p-8 sm:p-10 animate-scaleIn">
        <div className="mb-6">
          <p className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase tracking-widest mb-1">Reset Password</p>
          <h1 className="text-2xl font-black dark:text-white text-slate-800">{linkInvalid ? 'Link expired' : 'Choose a new password'}</h1>
          <p className="text-gray-400 dark:text-gray-500 text-xs mt-1.5 leading-relaxed">
            {linkInvalid
              ? 'This reset link is invalid, has already been used, or has expired. Request a new one from the sign-in page.'
              : 'Signing in elsewhere will stop working once you change your password.'}
          </p>
        </div>

        {linkInvalid ? (
          <Link to="/login" className="btn-primary w-full inline-flex justify-center">Back to Sign In</Link>
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="label" htmlFor="rp-password">New Password</label>
              <div className="relative">
                <input
                  id="rp-password"
                  type={showPass ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={`input pr-11${errors.password ? ' border-red-500' : ''}`}
                  placeholder={`Min. ${PASSWORD_MIN} characters`}
                  value={form.password}
                  onChange={set('password')}
                />
                <button type="button" onClick={() => setShowPass(s => !s)} aria-label={showPass ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-sky-500">
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <FieldError msg={errors.password} />
            </div>
            <div>
              <label className="label" htmlFor="rp-confirm">Confirm Password</label>
              <input
                id="rp-confirm"
                type={showPass ? 'text' : 'password'}
                autoComplete="new-password"
                className={`input${errors.confirm ? ' border-red-500' : ''}`}
                placeholder="Re-enter new password"
                value={form.confirm}
                onChange={set('confirm')}
              />
              <FieldError msg={errors.confirm} />
            </div>
            <div className="pt-2">
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? 'Updating...' : 'Set New Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
