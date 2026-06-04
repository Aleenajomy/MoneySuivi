import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { LogOut, ChevronRight, User, Bell, Shield, HelpCircle, X, Mail, Phone, Lock, Eye, EyeOff, Moon, Sun } from 'lucide-react'
import { formatDate } from '../utils/constants'
import toast from 'react-hot-toast'
import api from '../services/api'

export default function Profile() {
  const { user, logout, updateProfile } = useAuth()
  const { mode, toggle } = useTheme()
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [modal, setModal] = useState(null) // 'notifications' | 'privacy' | 'help'
  const [form, setForm] = useState({ name: user?.name || '', budgetLimit: user?.budgetLimit || 0 })
  const [loading, setLoading] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      await updateProfile({ name: form.name, budgetLimit: Number(form.budgetLimit) })
      setEditing(false)
    } catch {
      toast.error('Update failed')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout()
      navigate('/login')
    }
  }

  return (
    <div className="page">

      {/* Profile Header */}
      <div className="card p-5 mb-5 relative overflow-hidden animate-fadeIn">
        <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-primary/5 -translate-y-8 translate-x-8" />
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl gradient-blue flex items-center justify-center
                          text-2xl font-bold text-white flex-shrink-0">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-lg dark:text-gray-100 text-slate-800">{user?.name}</h2>
            <p className="text-gray-500 dark:text-gray-500 text-sm">{user?.email}</p>
            {user?.createdAt && (
              <p className="text-gray-600 dark:text-gray-700 text-xs mt-1">Joined {formatDate(user.createdAt)}</p>
            )}
          </div>
          <button onClick={() => setEditing(!editing)}
            className="w-9 h-9 rounded-xl dark:bg-dark-border bg-light-border flex items-center justify-center">
            <User size={16} className="dark:text-gray-400 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Edit Form */}
      {editing && (
        <div className="card p-5 mb-4 animate-slideDown">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-widest mb-4">Edit Profile</p>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Full Name</label>
              <input className="input" value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Monthly Budget Limit (₹)</label>
              <input type="number" className="input" value={form.budgetLimit}
                onChange={e => setForm(p => ({ ...p, budgetLimit: e.target.value }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)} className="btn-secondary flex-1 py-2.5">
                Cancel
              </button>
              <button type="submit" disabled={loading}
                className="flex-1 py-2.5 rounded-xl gradient-blue text-white text-sm font-semibold disabled:opacity-50">
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Settings */}
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3 px-1 dark:text-gray-400">Settings</p>
      <div className="space-y-2 mb-4">
        <SettingRow icon={<Bell size={17} />}        label="Notifications"      onClick={() => setModal('notifications')} />
        <SettingRow icon={<Shield size={17} />}      label="Privacy & Security" onClick={() => setModal('privacy')} />
        <SettingRow icon={<HelpCircle size={17} />}  label="Help & Support"     onClick={() => setModal('help')} />
        <button onClick={toggle}
          className="w-full card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform animate-fadeIn">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
            {mode === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
          </div>
          <span className="flex-1 text-sm font-medium dark:text-gray-300 text-slate-700 text-left">
            Theme: {mode === 'dark' ? 'Dark' : 'Light'}
          </span>
          <ChevronRight size={15} className="dark:text-gray-600 text-gray-400" />
        </button>
      </div>

      <p className="text-xs font-semibold text-gray-600 uppercase tracking-widest mb-3 px-1 dark:text-gray-400">Account</p>
      <button onClick={handleLogout}
        className="w-full card p-4 flex items-center gap-3 border-danger/20 active:scale-[0.98] transition-transform">
        <div className="w-9 h-9 rounded-xl bg-danger/10 flex items-center justify-center">
          <LogOut size={17} className="text-danger" />
        </div>
        <span className="text-sm font-semibold text-danger">Logout</span>
      </button>

      <p className="text-center dark:text-gray-700 text-gray-400 text-xs mt-8">Smart Expense Tracker v1.0.0</p>

      {/* Modals */}
      {modal === 'notifications' && <NotificationsModal onClose={() => setModal(null)} />}
      {modal === 'privacy'        && <PrivacyModal       onClose={() => setModal(null)} user={user} />}
      {modal === 'help'           && <HelpModal          onClose={() => setModal(null)} />}
    </div>
  )
}

// ── Reusable row ────────────────────────────────────────────────────────────────
function SettingRow({ icon, label, onClick }) {
  return (
    <button onClick={onClick}
      className="w-full card p-4 flex items-center gap-3 active:scale-[0.98] transition-transform animate-fadeIn">
      <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
        {icon}
      </div>
      <span className="flex-1 text-sm font-medium dark:text-gray-300 text-slate-700 text-left">{label}</span>
      <ChevronRight size={15} className="dark:text-gray-600 text-gray-400" />
    </button>
  )
}

// ── Modal wrapper ───────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fadeIn"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-t-3xl border-t animate-slideUp
                      dark:bg-dark-card dark:border-dark-border
                      bg-light-card border-light-border shadow-lg"
        style={{ maxHeight: '85vh', overflowY: 'auto' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-dark-border dark:bg-dark-border bg-light-border" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b dark:border-dark-border border-light-border">
          <h2 className="font-bold text-base dark:text-white">{title}</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center
                       dark:bg-dark-border dark:text-gray-400
                       bg-light-border text-gray-600">
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Toggle row ──────────────────────────────────────────────────────────────────
function ToggleRow({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3.5 border-b dark:border-dark-border border-light-border last:border-0">
      <div className="flex-1 pr-4">
        <p className="text-sm font-semibold dark:text-gray-200 text-slate-700">{label}</p>
        {description && <p className="text-xs dark:text-gray-600 text-gray-500 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full
          border-2 border-transparent transition-colors duration-200 focus:outline-none
          ${value ? 'bg-primary' : 'dark:bg-dark-border bg-slate-300'}`}>
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-md
            ring-0 transition-transform duration-200
            ${value ? 'translate-x-5' : 'translate-x-0'}`}
        />
      </button>
    </div>
  )
}

// ── Notifications Modal ─────────────────────────────────────────────────────────
function NotificationsModal({ onClose }) {
  const [settings, setSettings] = useState({
    pushEnabled: true,
    budgetAlerts: true,
    weeklyReport: false,
    monthlyReport: true,
    expenseAdded: false,
  })

  const toggle = key => val => setSettings(p => ({ ...p, [key]: val }))

  const handleSave = () => {
    toast.success('Notification preferences saved!')
    onClose()
  }

  return (
    <Modal title="Notifications" onClose={onClose}>
      <div className="mb-2">
        <ToggleRow label="Push Notifications"    description="Receive alerts on your device"            value={settings.pushEnabled}    onChange={toggle('pushEnabled')} />
        <ToggleRow label="Budget Alerts"          description="Warn when spending reaches 80% of budget" value={settings.budgetAlerts}   onChange={toggle('budgetAlerts')} />
        <ToggleRow label="Expense Added"          description="Notify when a new expense is recorded"    value={settings.expenseAdded}   onChange={toggle('expenseAdded')} />
        <ToggleRow label="Weekly Report"          description="Get a summary every Monday"               value={settings.weeklyReport}   onChange={toggle('weeklyReport')} />
        <ToggleRow label="Monthly Report"         description="Receive monthly spending summary"         value={settings.monthlyReport}  onChange={toggle('monthlyReport')} />
      </div>
      <button onClick={handleSave} className="btn-primary mt-4">Save Preferences</button>
    </Modal>
  )
}

// ── Privacy & Security Modal ────────────────────────────────────────────────────
function PrivacyModal({ onClose, user }) {
  const [tab, setTab] = useState('privacy') // 'privacy' | 'password'
  const [privacy, setPrivacy] = useState({ shareData: false, analytics: true, twoFactor: false })
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  const togglePrivacy = key => val => setPrivacy(p => ({ ...p, [key]: val }))

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (pwForm.newPw !== pwForm.confirm) return toast.error('New passwords do not match')
    if (pwForm.newPw.length < 6) return toast.error('Password must be at least 6 characters')
    setLoading(true)
    try {
      await api.put('/auth/profile', { currentPassword: pwForm.current, password: pwForm.newPw })
      toast.success('Password changed successfully!')
      setPwForm({ current: '', newPw: '', confirm: '' })
      onClose()
    } catch (err) {
      toast.error(err.message || 'Failed to change password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal title="Privacy & Security" onClose={onClose}>
      {/* Tabs */}
      <div className="flex gap-2 mb-5 p-1 rounded-xl dark:bg-dark-bg bg-light-muted">
        {['privacy', 'password'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
              ${tab === t ? 'bg-primary text-white' : 'dark:text-gray-500 text-gray-600'}`}>
            {t === 'privacy' ? '🔒 Privacy' : '🔑 Password'}
          </button>
        ))}
      </div>

      {tab === 'privacy' ? (
        <>
          <ToggleRow label="Share Analytics Data"  description="Help improve the app with anonymous usage data" value={privacy.shareData}  onChange={togglePrivacy('shareData')} />
          <ToggleRow label="In-App Analytics"      description="Allow analytics tracking within the app"        value={privacy.analytics}  onChange={togglePrivacy('analytics')} />
          <ToggleRow label="Two-Factor Auth"        description="Extra security on login (coming soon)"         value={privacy.twoFactor}  onChange={togglePrivacy('twoFactor')} />

          <div className="mt-4 p-3.5 rounded-xl dark:bg-dark-bg dark:border-dark-border border
                          bg-light-bg border-light-border">
            <p className="text-xs font-semibold dark:text-gray-400 text-gray-600 mb-1">Account Email</p>
            <p className="text-sm dark:text-white font-medium">{user?.email}</p>
          </div>
          <button onClick={() => { toast.success('Privacy settings saved!'); onClose() }}
            className="btn-primary mt-4">
            Save Settings
          </button>
        </>
      ) : (
        <form onSubmit={handleChangePassword} className="space-y-4">
          {[
            { key: 'current', label: 'Current Password',  placeholder: 'Enter current password' },
            { key: 'newPw',   label: 'New Password',      placeholder: 'Min. 6 characters' },
            { key: 'confirm', label: 'Confirm Password',  placeholder: 'Re-enter new password' },
          ].map(({ key, label, placeholder }) => (
            <div key={key}>
              <label className="label">{label}</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="input pr-11" placeholder={placeholder}
                  value={pwForm[key]}
                  onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                  required
                />
                {key === 'newPw' && (
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                )}
              </div>
            </div>
          ))}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Changing...
                </span>
              : 'Change Password'}
          </button>
        </form>
      )}
    </Modal>
  )
}

// ── Help & Support Modal ────────────────────────────────────────────────────────
function HelpModal({ onClose }) {
  const [openFaq, setOpenFaq] = useState(null)
  const [ticket, setTicket] = useState({ subject: '', message: '' })
  const [tab, setTab] = useState('faq') // 'faq' | 'contact'

  const faqs = [
    { q: 'How do I add an expense?',           a: 'Tap the blue + button at the bottom center of the screen, fill in the details and tap "Add Transaction".' },
    { q: 'How do I set a budget limit?',        a: 'Go to Profile → Edit Profile → enter your Monthly Budget Limit. You\'ll get a warning when you reach 80% of it.' },
    { q: 'Can I edit or delete an expense?',    a: 'Yes! Tap any expense to edit it. On the History screen, tap the trash icon on the right side to delete.' },
    { q: 'How does the Analytics chart work?',  a: 'It shows your current month\'s spending by category (pie chart) and your last 6 months trend (bar chart).' },
    { q: 'Is my data secure?',                  a: 'Yes. Passwords are encrypted with bcrypt. All API calls use JWT tokens. Data is stored in MongoDB Atlas.' },
    { q: 'Does this work offline?',             a: 'The app is a PWA — it caches the shell offline. However, adding/viewing expenses requires an internet connection.' },
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    toast.success('Support ticket submitted! We\'ll reply within 24 hours.')
    setTicket({ subject: '', message: '' })
    onClose()
  }

  return (
    <Modal title="Help & Support" onClose={onClose}>
      {/* Tabs */}
      <div className="flex gap-2 mb-5 p-1 rounded-xl dark:bg-dark-bg bg-light-muted">
        {['faq', 'contact'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all
              ${tab === t ? 'bg-primary text-white' : 'dark:text-gray-500 text-gray-600'}`}>
            {t === 'faq' ? '❓ FAQs' : '✉️ Contact Us'}
          </button>
        ))}
      </div>

      {tab === 'faq' ? (
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <div key={i} className="rounded-xl border dark:border-dark-border border-light-border overflow-hidden">
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between p-4 text-left">
                <span className="text-sm font-semibold dark:text-gray-200 pr-3">{faq.q}</span>
                <span className={`dark:text-gray-500 transition-transform flex-shrink-0
                  ${openFaq === i ? 'rotate-180' : ''}`}>
                  <ChevronRight size={16} className={openFaq === i ? 'rotate-90' : ''} />
                </span>
              </button>
              {openFaq === i && (
                <div className="px-4 pb-4 border-t dark:border-dark-border border-light-border">
                  <p className="text-sm dark:text-gray-400 mt-3 leading-relaxed">{faq.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Contact info tiles */}
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div className="p-3 rounded-xl dark:bg-dark-bg dark:border-dark-border border bg-light-bg border-light-border text-center">
              <Mail size={20} className="text-primary mx-auto mb-1" />
              <p className="text-[10px] dark:text-gray-500 text-gray-600 font-semibold uppercase">Email</p>
              <p className="text-xs dark:text-gray-300 text-gray-700 mt-0.5">support@smartexpense.app</p>
            </div>
            <div className="p-3 rounded-xl dark:bg-dark-bg dark:border-dark-border border bg-light-bg border-light-border text-center">
              <Phone size={20} className="text-secondary mx-auto mb-1" />
              <p className="text-[10px] dark:text-gray-500 text-gray-600 font-semibold uppercase">Phone</p>
              <p className="text-xs dark:text-gray-300 text-gray-700 mt-0.5">+91 98765 43210</p>
            </div>
          </div>

          <div>
            <label className="label">Subject</label>
            <input className="input" placeholder="e.g. Issue with expense sync"
              value={ticket.subject} required
              onChange={e => setTicket(p => ({ ...p, subject: e.target.value }))} />
          </div>
          <div>
            <label className="label">Message</label>
            <textarea className="input resize-none" rows={4}
              placeholder="Describe your issue in detail..."
              value={ticket.message} required
              onChange={e => setTicket(p => ({ ...p, message: e.target.value }))} />
          </div>
          <button type="submit" className="btn-primary">Send Message</button>
        </form>
      )}
    </Modal>
  )
}
