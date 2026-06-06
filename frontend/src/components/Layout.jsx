import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Clock, WalletCards, CreditCard, Plus } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/add', icon: Plus, label: 'Add', isFab: true },
  { path: '/emis', icon: CreditCard, label: 'EMI' },
  { path: '/networth', icon: WalletCards, label: 'Net Worth' },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const { mode, toggle } = useTheme()

  return (
    <div className="relative max-w-md mx-auto min-h-screen transition-colors duration-300 dark:bg-dark-bg bg-light-bg">
      {/* Theme toggle — fixed top right */}
      <button
        onClick={toggle}
        className="fixed top-4 right-4 z-50 w-9 h-9 rounded-xl
                   dark:bg-dark-card bg-light-card
                   dark:border-dark-border border-light-border border
                   flex items-center justify-center
                   transition-all active:scale-90 shadow-sm"
      >
        {mode === 'dark'
          ? <Sun size={16} className="text-yellow-400" />
          : <Moon size={16} className="text-sky-500" />}
      </button>

      <Outlet />

      {/* Bottom Navigation with embedded FAB */}
      <nav className="bottom-nav">
        {navItems.map(({ path, icon: Icon, label, isFab }) => {
          const isActive = location.pathname === path
          if (isFab) {
            return (
              <button key={path} onClick={() => navigate(path)}
                className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all duration-200">
                <div className="w-8 h-8 rounded-xl gradient-blue flex items-center justify-center">
                  <Icon size={18} className="text-white" strokeWidth={2.5} />
                </div>
                <span className="text-[10px] font-semibold tracking-wide text-sky-500">
                  {label}
                </span>
              </button>
            )
          }
          return (
            <button key={path} onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1 px-4 py-1 rounded-xl transition-all duration-200">
                <div className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-all
                ${isActive ? 'bg-sky-500/20' : ''}`}>
                <Icon size={20}
                  className={isActive ? 'text-sky-500' : 'dark:text-gray-500 text-gray-400'}
                  strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={`text-[10px] font-semibold tracking-wide
                ${isActive ? 'text-sky-500' : 'dark:text-gray-500 text-gray-400'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
