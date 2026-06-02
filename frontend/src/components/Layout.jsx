import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Clock, PieChart, User, Plus } from 'lucide-react'

const navItems = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/history', icon: Clock, label: 'History' },
  { path: '/analytics', icon: PieChart, label: 'Analytics' },
  { path: '/profile', icon: User, label: 'Profile' },
]

export default function Layout() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <div className="relative max-w-md mx-auto min-h-screen transition-colors duration-300 dark:bg-dark-bg bg-light-bg">
      <Outlet />

      {/* FAB */}
      <button
        onClick={() => navigate('/add')}
        className="fixed bottom-[72px] left-1/2 -translate-x-1/2 z-50
                   w-14 h-14 rounded-2xl gradient-blue
                   flex items-center justify-center active:scale-90 transition-transform
                   shadow-lg hover:shadow-xl animate-slideUp"
      >
        <Plus size={24} className="text-white" strokeWidth={2.5} />
      </button>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        {navItems.map(({ path, icon: Icon, label }) => {
          const isActive = location.pathname === path
          return (
            <button key={path} onClick={() => navigate(path)}
              className="flex flex-col items-center gap-1 px-5 py-1 rounded-xl transition-all duration-200">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all
                ${isActive ? 'bg-primary/20' : ''}`}>
                <Icon size={20}
                  className={isActive ? 'text-primary' : 'dark:text-gray-600 text-gray-500'}
                  strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={`text-[10px] font-semibold tracking-wide
                ${isActive ? 'text-primary' : 'dark:text-gray-600 text-gray-500'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
