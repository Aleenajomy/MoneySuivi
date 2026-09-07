import { useState, useEffect } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Home, Clock, WalletCards, CreditCard, Plus,
  BarChart3, WalletIcon, BellIcon, UserCircle, LogOut, Settings,
  Sun, Moon, ChevronLeft, ChevronRight, X, HandCoins, Download, Smartphone, Share2
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useNotification } from '../context/NotificationContext'
import { useTheme } from '../context/ThemeContext'
import { motion, AnimatePresence } from 'framer-motion'
import { subscribeUserToPush } from '../utils/pushManager'
import { registerFcmToken, setupForegroundListener } from '../services/firebase'
import toast from 'react-hot-toast'

const mobileNavItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/add', icon: Plus, label: 'Add', isFab: true },
  { path: '/notifications', icon: BellIcon, label: 'Alerts' },
  { path: '/profile', icon: UserCircle, label: 'Profile' },
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
  const { unreadCount, fetchNotifications } = useNotification()
  const { mode, toggle } = useTheme()
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useEffect(() => {
    if (user) {
      // 1. Existing Web Push subscription (preserves compatibility)
      subscribeUserToPush()

      // 2. Firebase Cloud Messaging registration (non-blocking)
      registerFcmToken().catch(() => {})

      // 3. Foreground message listener (toast notification + badge refresh)
      const unsubscribe = setupForegroundListener((payload) => {
        const title = payload.notification?.title || payload.data?.title || 'MoneySuivi Alert'
        const body = payload.notification?.body || payload.data?.body || ''
        const url = payload.data?.url || '/'

        toast(
          (t) => (
            <div
              className="cursor-pointer flex flex-col gap-0.5"
              onClick={() => {
                toast.dismiss(t.id)
                if (url && url !== '/') navigate(url)
              }}
            >
              <span className="font-bold text-xs text-slate-800 dark:text-white">{title}</span>
              {body && <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{body}</span>}
            </div>
          ),
          { icon: '🔔', duration: 4500 }
        )

        fetchNotifications?.()
      })

      return () => {
        if (typeof unsubscribe === 'function') unsubscribe()
      }
    }
  }, [user, navigate, fetchNotifications])

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout()
      navigate('/login')
    }
  }

  const activeItem = sidebarNavItems.find(item => item.path === location.pathname) || { label: 'Dashboard' }

  return (
    <div className="flex min-h-screen dark:bg-dark-bg bg-light-bg transition-colors duration-300 overflow-x-hidden w-full">

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
        <div
          onClick={() => navigate('/')}
          className="flex items-center gap-3 px-5 py-5 border-b dark:border-dark-border border-light-border overflow-hidden h-[73px] flex-shrink-0 cursor-pointer"
        >
          <img
            src="/logo.png?v=2"
            alt="MoneySuivi Logo"
            className="w-9 h-9 rounded-xl object-contain shadow-md shadow-sky-500/20 flex-shrink-0 transition-transform duration-200 hover:scale-105"
          />
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

      {/* ── Main Content Container ───────────────────────────────── */}
      <div className={`main-content-container flex-1 w-full min-w-0 flex flex-col min-h-screen transition-all duration-300 ml-0
        ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-60'}`}>
        {/* ── Top Navbar ─────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 w-full h-[73px] dark:bg-dark-bg/85 bg-light-bg/85 backdrop-blur-md border-b dark:border-dark-border border-light-border flex items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Mobile Branding (Visible on mobile & tablet < 1024px, hidden on desktop >= 1024px) */}
            <div className="flex lg:hidden items-center gap-2.5 cursor-pointer" onClick={() => navigate('/')}>
              <img
                src="/logo.png?v=2"
                alt="MoneySuivi Logo"
                className="w-8 h-8 rounded-xl object-contain shadow-md shadow-sky-500/20 flex-shrink-0"
              />
              <span className="font-black text-sm dark:text-white text-slate-800 tracking-tight">MoneySuivi</span>
            </div>

            {/* Desktop Active Page Title (Visible on desktop >= 1024px) */}
            <div className="hidden lg:flex items-center gap-2 min-w-0">
              <span className="text-base font-bold dark:text-white text-slate-800 tracking-tight truncate">
                {activeItem?.label || 'Dashboard'}
              </span>
            </div>
          </div>

          {/* Quick Actions & Profiles */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Theme Toggle (Desktop only) */}
            <button
              onClick={toggle}
              className="hidden lg:block p-2 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors"
              title={mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle Theme"
            >
              {mode === 'dark' ? <Sun size={15} className="text-yellow-400" /> : <Moon size={15} className="text-sky-500" />}
            </button>

            {/* Alerts (Visible always) */}
            <button
              onClick={() => navigate('/notifications')}
              className="p-2 rounded-xl dark:bg-dark-card bg-white border dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 hover:text-sky-500 transition-colors relative"
              title="Alerts"
              aria-label="Alerts"
            >
              <BellIcon size={15} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-danger ring-2 dark:ring-dark-bg ring-light-bg" />
              )}
            </button>

            {/* Mobile Profile Avatar → navigates to Profile page (mobile < 1024px only) */}
            <button
              onClick={() => navigate('/profile')}
              className="flex lg:hidden w-8 h-8 rounded-xl gradient-blue items-center justify-center text-white font-bold text-sm shadow-sm active:scale-95 transition-transform"
              title="Go to Profile"
              aria-label="Go to Profile"
            >
              {user?.name?.[0]?.toUpperCase() || <UserCircle size={16} />}
            </button>
          </div>
        </header>

        {/* ── Main Scrollable Workspace ──────────────────────────── */}
        <main className="flex-1 w-full max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 pb-28 lg:pb-12">
          <Outlet />
        </main>

        {/* ── Mobile Bottom Navigation (Hidden on large screens >= 1024px) ─── */}
        <nav className="bottom-nav bg-white/85 dark:bg-dark-card/85 backdrop-blur-md border-t dark:border-dark-border border-light-border lg:hidden" aria-label="Mobile Bottom Navigation">
          {mobileNavItems.map(({ path, icon: Icon, label, isFab }) => {
            const isActive = location.pathname === path
            if (isFab) {
              return (
                <button
                  key={path}
                  onClick={() => navigate(path)}
                  className="flex flex-col items-center gap-0.5 px-3 py-1 rounded-xl active:scale-90 transition-transform -mt-3"
                  aria-label={label}
                >
                  <div className="w-11 h-11 rounded-2xl gradient-blue flex items-center justify-center shadow-lg shadow-sky-500/25 border-2 dark:border-dark-card border-white">
                    <Icon size={20} className="text-white" strokeWidth={2.8} />
                  </div>
                  <span className="text-[10px] font-bold text-sky-500">{label}</span>
                </button>
              )
            }
            return (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1 px-3 py-1 rounded-xl active:scale-95 transition-transform"
                aria-label={label}
              >
                <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isActive ? 'bg-sky-500/15' : ''}`}>
                  <Icon
                    size={18}
                    className={isActive ? 'text-sky-500 dark:text-sky-400' : 'dark:text-gray-500 text-gray-400'}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                  {label === 'Alerts' && unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full bg-danger text-white text-[8px] font-bold flex items-center justify-center">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'text-sky-500 dark:text-sky-400 font-bold' : 'dark:text-gray-500 text-gray-400'}`}>
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
              <img
                src="/logo.png?v=2"
                alt="MoneySuivi Logo"
                className="w-10 h-10 rounded-xl object-contain shadow-md shadow-sky-500/20 flex-shrink-0"
              />

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
                  <div className="flex items-center gap-2.5">
                    <img src="/logo.png?v=2" alt="MoneySuivi Logo" className="w-6 h-6 rounded-lg object-contain shadow-sm shadow-sky-500/20" />
                    <h3 className="text-sm font-bold dark:text-white text-slate-800">Install MoneySuivi</h3>
                  </div>
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
