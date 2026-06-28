import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Clock, WalletCards, CreditCard, Plus,
  BarChart3, WalletIcon, BellIcon, UserCircle, LogOut, Settings,
  Menu, Sun, Moon, ChevronLeft, ChevronRight, X, HandCoins, Download, Smartphone, Share2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { useTheme } from '../context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import { subscribeUserToPush } from '../utils/pushManager'

const mobileNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/emis', icon: CreditCard, label: 'Loans' },
  { path: '/ledger', icon: HandCoins, label: 'Ledger' },
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
  { path: '/ledger', icon: HandCoins, label: 'Ledger' },
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

  const activeItem = sidebarNavItems.find(item => item.path === location.pathname) || { label: 'Dashboard' }

  return (
    <div className="flex min-h-screen dark:bg-dark-bg bg-light-bg transition-colors duration-300">

      {/* ── PWA Install Banner ──────────────────────────────────── */}
      <InstallBanner />

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
            {/* Hamburger button (Hidden on mobile < 768px, visible on tablet, hidden on desktop >= 1024px) */}
            <button
              onClick={() => setMobileDrawerOpen(true)}
              className="block lg:hidden p-2 dark:text-gray-400 text-gray-500 hover:dark:bg-dark-border hover:bg-light-muted rounded-xl transition-colors"
              title="Menu"
            >
              <Menu size={20} />
            </button>

            {/* Mobile Branding (Visible only on mobile < 768px) */}
            <div className="flex md:hidden items-center gap-2 cursor-pointer" onClick={() => navigate('/')}>
              <div className="w-8 h-8 rounded-xl gradient-blue flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/20">
                <WalletCards size={16} className="text-white" />
              </div>
              <span className="font-black text-sm dark:text-white text-slate-800 tracking-tight">MoneySuivi</span>
            </div>
          </div>

          {/* Quick Actions & Profiles */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Theme Toggle (Hidden on mobile < 768px as it is inside the dropdown) */}
            <button
              onClick={toggle}
              className="hidden md:block p-2 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors"
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {mode === 'dark' ? <Sun size={15} className="text-yellow-400" /> : <Moon size={15} className="text-sky-500" />}
            </button>

            {/* Alerts (Visible always) */}
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

            {/* Mobile Profile Avatar → navigates to Profile page (mobile < 768px only) */}
            <button
              onClick={() => navigate('/profile')}
              className="flex md:hidden w-8 h-8 rounded-xl gradient-blue items-center justify-center text-white font-bold text-sm shadow-sm active:scale-95 transition-transform"
              title="Go to Profile"
            >
              {user?.name?.[0]?.toUpperCase() || <UserCircle size={16} />}
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

/* ── PWA Install Banner Component ───────────────────────────── */
function InstallBanner() {
  const [show, setShow] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSGuide, setShowIOSGuide] = useState(false)

  useEffect(() => {
    // Don't show if already installed as PWA
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    if (isStandalone) return

    // Don't show on desktop
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
    if (!isMobile) return

    // Check if dismissed within 7 days
    const dismissedAt = localStorage.getItem('installBannerDismissed')
    if (dismissedAt) {
      const dismissedDate = new Date(dismissedAt)
      const daysSince = (Date.now() - dismissedDate.getTime()) / (1000 * 60 * 60 * 24)
      if (daysSince < 7) return
    }

    // Detect iOS
    const iosDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
    setIsIOS(iosDevice)

    if (iosDevice) {
      // iOS doesn't have beforeinstallprompt — show banner immediately
      setShow(true)
    } else {
      // Android / Chrome — listen for beforeinstallprompt
      const handler = (e) => {
        e.preventDefault()
        setDeferredPrompt(e)
        setShow(true)
      }
      window.addEventListener('beforeinstallprompt', handler)
      return () => window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const result = await deferredPrompt.userChoice
      if (result.outcome === 'accepted') {
        setShow(false)
      }
      setDeferredPrompt(null)
    } else if (isIOS) {
      setShowIOSGuide(true)
    }
  }

  const handleDismiss = () => {
    setShow(false)
    setShowIOSGuide(false)
    localStorage.setItem('installBannerDismissed', new Date().toISOString())
  }

  if (!show) return null

  return (
    <>
      <AnimatePresence>
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -80, opacity: 0 }}
          transition={{ type: 'spring', damping: 20, stiffness: 250 }}
          className="fixed top-0 left-0 right-0 z-[80] px-3 pt-2 lg:hidden"
        >
          <div className="w-full max-w-lg mx-auto rounded-2xl border shadow-xl overflow-hidden
            dark:bg-dark-card dark:border-dark-border bg-white border-slate-200">
            {/* Gradient accent */}
            <div className="h-1 w-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />

            <div className="p-3.5 flex items-center gap-3">
              {/* Icon */}
              <div className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center flex-shrink-0 shadow-md shadow-sky-500/20">
                <Smartphone size={18} className="text-white" />
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold dark:text-white text-slate-800 leading-tight">
                  Install MoneySuivi
                </p>
                <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5 leading-tight">
                  Add to your home screen for the best experience
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleInstall}
                  className="px-3.5 py-1.5 rounded-xl gradient-blue text-white text-[11px] font-bold shadow-md shadow-sky-500/20 active:scale-95 transition-transform flex items-center gap-1.5"
                >
                  <Download size={12} />
                  Install
                </button>
                <button
                  onClick={handleDismiss}
                  className="w-7 h-7 rounded-lg dark:bg-dark-border bg-slate-100 flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* iOS Install Guide Overlay */}
      <AnimatePresence>
        {showIOSGuide && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] bg-black/50 backdrop-blur-sm flex items-center justify-center px-4"
            onClick={handleDismiss}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden
                dark:bg-dark-card dark:border-dark-border bg-white border-slate-200"
            >
              <div className="h-1.5 w-full bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-500" />
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold dark:text-white text-slate-800">Install on iPhone</h3>
                  <button
                    onClick={handleDismiss}
                    className="w-7 h-7 rounded-lg dark:bg-dark-border bg-slate-100 flex items-center justify-center dark:text-gray-400 text-gray-500"
                  >
                    <X size={14} />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 rounded-xl dark:bg-dark-bg bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold text-sm">1</div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold dark:text-gray-200 text-slate-700">Tap the Share button</p>
                      <p className="text-[10px] dark:text-gray-500 text-gray-400 flex items-center gap-1 mt-0.5">
                        <Share2 size={10} /> at the bottom of Safari
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl dark:bg-dark-bg bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center font-bold text-sm">2</div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold dark:text-gray-200 text-slate-700">Scroll down and tap</p>
                      <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">"Add to Home Screen"</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 p-3 rounded-xl dark:bg-dark-bg bg-slate-50">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-sm">3</div>
                    <div className="flex-1">
                      <p className="text-xs font-semibold dark:text-gray-200 text-slate-700">Tap "Add" to confirm</p>
                      <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">MoneySuivi will appear on your home screen</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleDismiss}
                  className="w-full mt-4 py-2.5 rounded-xl gradient-blue text-white text-xs font-bold shadow-md shadow-sky-500/20 active:scale-95 transition-transform"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
