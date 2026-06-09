import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Clock, WalletCards, CreditCard, Plus,
  BarChart3, WalletIcon, BellIcon, UserCircle, LogOut, Settings
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'

const mobileNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/add', icon: Plus, label: 'Add', isFab: true },
  { path: '/emis', icon: CreditCard, label: 'Loans' },
  { path: '/networth', icon: WalletCards, label: 'Net Worth' },
]

const sidebarNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/add', icon: Plus, label: 'Add Transaction' },
  { path: '/emis', icon: CreditCard, label: 'Loans & EMIs' },
  { path: '/networth', icon: WalletCards, label: 'Net Worth' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/budgets', icon: WalletIcon, label: 'Budgets' },
  { path: '/notifications', icon: BellIcon, label: 'Alerts' },
  { path: '/profile', icon: Settings, label: 'Profile' },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const { unreadCount } = useNotification()

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout()
      navigate('/login')
    }
  }

  return (
    <div className="flex min-h-screen dark:bg-dark-bg bg-light-bg transition-colors duration-300">

      {/* ── Desktop Sidebar ───────────────────────────────────────── */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-6 border-b dark:border-dark-border border-light-border">
          <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center flex-shrink-0">
            <WalletCards size={18} className="text-white" />
          </div>
          <div>
            <p className="font-black text-sm dark:text-white text-slate-800 tracking-tight">MoneySuivi</p>
            <p className="text-[10px] dark:text-gray-500 text-gray-400">Finance Tracker</p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {sidebarNavItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path
            const isAdd = path === '/add'
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 text-sm font-medium
                  ${isAdd
                    ? 'gradient-blue text-white shadow-md hover:shadow-lg mt-1 mb-1'
                    : isActive
                      ? 'bg-sky-500/15 text-sky-500 dark:text-sky-400'
                      : 'dark:text-gray-400 text-gray-500 hover:dark:bg-dark-border hover:bg-light-muted hover:dark:text-gray-200 hover:text-slate-700'
                  }`}
              >
                <div className="relative">
                  <Icon size={18} strokeWidth={isActive || isAdd ? 2.5 : 1.8} />
                  {label === 'Alerts' && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-danger text-white text-[8px] font-bold leading-3.5 flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span>{label}</span>
              </button>
            )
          })}
        </nav>

        {/* User + Logout */}
        <div className="px-3 py-4 border-t dark:border-dark-border border-light-border space-y-2">
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all dark:hover:bg-dark-border hover:bg-light-muted"
          >
            <div className="w-8 h-8 rounded-xl gradient-blue flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || <UserCircle size={16} />}
            </div>
            <div className="flex-1 text-left min-w-0">
              <p className="text-xs font-semibold dark:text-gray-200 text-slate-700 truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] dark:text-gray-500 text-gray-400 truncate">{user?.email}</p>
            </div>
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-danger hover:bg-danger/10 transition-all duration-200"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content Area ─────────────────────────────────────── */}
      <main className="flex-1 w-full min-w-0 lg:ml-60">
        {/* Constrain desktop content to readable width */}
        <div className="w-full max-w-7xl mx-auto">
          <Outlet />
        </div>

        {/* ── Mobile / Tablet Bottom Nav (hidden on lg+) ─────────── */}
        <nav className="bottom-nav">
          {mobileNavItems.map(({ path, icon: Icon, label, isFab }) => {
            const isActive = location.pathname === path
            if (isFab) {
              return (
                <button key={path} onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all duration-200">
                  <div className="w-8 h-8 rounded-xl gradient-blue flex items-center justify-center">
                    <Icon size={18} className="text-white" strokeWidth={2.5} />
                  </div>
                  <span className="text-[10px] font-semibold tracking-wide text-sky-500">{label}</span>
                </button>
              )
            }
            return (
              <button key={path} onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all duration-200">
                <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-sky-500/20' : ''}`}>
                  <Icon size={20}
                    className={isActive ? 'text-sky-500' : 'dark:text-gray-500 text-gray-400'}
                    strokeWidth={isActive ? 2.5 : 1.8} />
                  {label === 'Home' && unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-danger text-white text-[8px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-semibold tracking-wide ${isActive ? 'text-sky-500' : 'dark:text-gray-500 text-gray-400'}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </nav>
      </main>
    </div>
  )
}
