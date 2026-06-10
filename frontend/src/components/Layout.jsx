import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Clock, WalletCards, CreditCard, Plus,
  BarChart3, WalletIcon, BellIcon, UserCircle, LogOut, Settings,
  Menu, Search, Sun, Moon, ChevronLeft, ChevronRight, X
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { useTheme } from '../context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import { subscribeUserToPush } from '../utils/pushManager'

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
  const { mode, toggle } = useTheme()
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (user) {
      subscribeUserToPush()
    }
  }, [user])

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout()
      navigate('/login')
    }
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/history?search=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

  const activeItem = sidebarNavItems.find(item => item.path === location.pathname) || { label: 'Dashboard' }

  return (
    <div className="flex min-h-screen dark:bg-dark-bg bg-light-bg transition-colors duration-300">

      {/* ── Desktop Sidebar ───────────────────────────────────────── */}
      <aside className={`sidebar border-r dark:border-dark-border border-light-border transition-all duration-300 hidden lg:flex flex-col fixed left-0 top-0 h-screen z-50
        ${sidebarCollapsed ? 'w-20' : 'w-60'}`}>
        
        {/* Collapse toggle button */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex items-center justify-center w-7 h-7 rounded-full border dark:border-dark-border border-light-border dark:bg-dark-card bg-white dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors absolute -right-3.5 top-5 z-50 shadow-sm"
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b dark:border-dark-border border-light-border overflow-hidden h-[73px] flex-shrink-0">
          <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/20">
            <WalletCards size={18} className="text-white" />
          </div>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="min-w-0"
            >
              <p className="font-black text-sm dark:text-white text-slate-800 tracking-tight">MoneySuivi</p>
              <p className="text-[10px] dark:text-gray-500 text-gray-400">Finance Tracker</p>
            </motion.div>
          )}
        </div>

        {/* Nav links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto scrollbar-none">
          {sidebarNavItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path
            const isAdd = path === '/add'
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 text-sm font-medium relative
                  ${isAdd
                    ? 'gradient-blue text-white shadow-md hover:shadow-lg mt-1 mb-1'
                    : isActive
                      ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400'
                      : 'dark:text-gray-400 text-gray-500 hover:dark:bg-dark-border hover:bg-light-muted hover:dark:text-gray-200 hover:text-slate-700'
                  }`}
                title={sidebarCollapsed ? label : undefined}
              >
                <div className="relative flex-shrink-0">
                  <Icon size={18} strokeWidth={isActive || isAdd ? 2.5 : 1.8} />
                  {label === 'Alerts' && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-danger text-white text-[8px] font-bold leading-3.5 flex items-center justify-center shadow-sm">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="truncate"
                  >
                    {label}
                  </motion.span>
                )}
                {isActive && !isAdd && (
                  <div className="absolute left-0 top-3 bottom-3 w-1 rounded-r-md gradient-blue" />
                )}
              </button>
            )
          })}
        </nav>

        {/* User + Logout */}
        <div className="px-3 py-4 border-t dark:border-dark-border border-light-border space-y-2 flex-shrink-0">
          <button
            onClick={() => navigate('/profile')}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-xl transition-all dark:hover:bg-dark-border hover:bg-light-muted text-left"
            title={sidebarCollapsed ? user?.name : undefined}
          >
            <div className="w-8 h-8 rounded-xl gradient-blue flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
              {user?.name?.[0]?.toUpperCase() || <UserCircle size={16} />}
            </div>
            {!sidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 min-w-0">
                <p className="text-xs font-bold dark:text-gray-200 text-slate-700 truncate">{user?.name || 'User'}</p>
                <p className="text-[10px] dark:text-gray-500 text-gray-400 truncate">{user?.email}</p>
              </motion.div>
            )}
          </button>
          {!sidebarCollapsed && (
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-danger hover:bg-danger/10 transition-all duration-200"
            >
              <LogOut size={16} />
              <span>Logout</span>
            </button>
          )}
        </div>
      </aside>

      {/* ── Mobile/Tablet Sliding Drawer ─────────────────────────── */}
      <AnimatePresence>
        {mobileDrawerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-black lg:hidden"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed left-0 top-0 bottom-0 z-[60] w-64 dark:bg-dark-card bg-white border-r dark:border-dark-border border-light-border flex flex-col lg:hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b dark:border-dark-border border-light-border flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center flex-shrink-0">
                    <WalletCards size={18} className="text-white" />
                  </div>
                  <div>
                    <p className="font-black text-sm dark:text-white text-slate-800 tracking-tight">MoneySuivi</p>
                    <p className="text-[9px] dark:text-gray-500 text-gray-400">Finance Tracker</p>
                  </div>
                </div>
                <button
                  onClick={() => setMobileDrawerOpen(false)}
                  className="w-8 h-8 rounded-xl dark:bg-dark-border bg-slate-100 flex items-center justify-center text-gray-500 dark:text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>

              <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
                {sidebarNavItems.map(({ path, icon: Icon, label }) => {
                  const isActive = location.pathname === path
                  const isAdd = path === '/add'
                  return (
                    <button
                      key={path}
                      onClick={() => {
                        navigate(path)
                        setMobileDrawerOpen(false)
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-200 text-sm font-semibold
                        ${isAdd
                          ? 'gradient-blue text-white shadow-md mt-1 mb-1'
                          : isActive
                            ? 'bg-sky-500/10 text-sky-500 dark:text-sky-400'
                            : 'dark:text-gray-400 text-gray-500 hover:dark:bg-dark-border hover:bg-light-muted hover:dark:text-gray-200 hover:text-slate-700'
                        }`}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {label === 'Alerts' && unreadCount > 0 && (
                        <span className="ml-auto min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[9px] font-bold flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  )
                })}
              </nav>

              <div className="p-4 border-t dark:border-dark-border border-light-border space-y-3">
                <div className="flex items-center gap-3 px-2">
                  <div className="w-8 h-8 rounded-xl gradient-blue flex items-center justify-center text-white font-bold text-sm">
                    {user?.name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold dark:text-gray-200 text-slate-700 truncate">{user?.name}</p>
                    <p className="text-[10px] dark:text-gray-500 text-gray-400 truncate">{user?.email}</p>
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-bold text-danger hover:bg-danger/10 transition-all duration-200"
                >
                  <LogOut size={14} />
                  <span>Logout</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main Content Container ───────────────────────────────── */}
      <div className={`flex-1 w-full min-w-0 flex flex-col min-h-screen transition-all duration-300
        ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-60'}`}>

        {/* ── Top Navbar ─────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 w-full h-[73px] dark:bg-dark-bg/85 bg-light-bg/85 backdrop-blur-md border-b dark:border-dark-border border-light-border flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Hamburger button */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="lg:hidden p-2 dark:text-gray-400 text-gray-500 hover:dark:bg-dark-border hover:bg-light-muted rounded-xl transition-colors"
              title="Menu"
            >
              <Menu size={20} />
            </button>
          </div>

          {/* Quick Actions & Profiles */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Theme Toggle */}
            <button
              onClick={toggle}
              className="p-2 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors"
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {mode === 'dark' ? <Sun size={15} className="text-yellow-400" /> : <Moon size={15} className="text-sky-500" />}
            </button>

            {/* Alerts */}
            <button
              onClick={() => navigate('/notifications')}
              className="p-2 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors relative"
              title="Alerts"
            >
              <BellIcon size={15} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger ring-2 dark:ring-dark-bg ring-light-bg" />
              )}
            </button>
          </div>
        </header>

        {/* ── Main Scrollable Workspace ──────────────────────────── */}
        <main className="flex-1 w-full max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 pb-28 lg:pb-12">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Navigation (Hidden on large screens) ─── */}
        <nav className="bottom-nav bg-white/80 dark:bg-dark-card/80 backdrop-blur-md border-t dark:border-dark-border border-light-border lg:hidden">
          {mobileNavItems.map(({ path, icon: Icon, label, isFab }) => {
            const isActive = location.pathname === path
            if (isFab) {
              return (
                <button key={path} onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl active:scale-90 transition-transform">
                  <div className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center shadow-md shadow-sky-500/10">
                    <Icon size={18} className="text-white" strokeWidth={3} />
                  </div>
                  <span className="text-[9px] font-bold text-sky-500">{label}</span>
                </button>
              )
            }
            return (
              <button key={path} onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl active:scale-95 transition-transform">
                <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-sky-500/15' : ''}`}>
                  <Icon size={18}
                    className={isActive ? 'text-sky-500 dark:text-sky-400' : 'dark:text-gray-500 text-gray-400'}
                    strokeWidth={isActive ? 2.5 : 1.8} />
                  {label === 'Home' && unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-danger" />
                  )}
                </div>
                <span className={`text-[9px] font-bold ${isActive ? 'text-sky-500 dark:text-sky-400' : 'dark:text-gray-500 text-gray-400'}`}>
                  {label}
                </span>
              </button>
            )
          })}
        </nav>

      </div>
    </div>
  )
}
