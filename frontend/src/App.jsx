import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ExpenseProvider } from './context/ExpenseContext'
import { BudgetProvider } from './context/BudgetContext'
import { NotificationProvider } from './context/NotificationContext'
import { EMIProvider } from './context/EMIContext'
import { NetWorthProvider } from './context/NetWorthContext'
import { LedgerProvider } from './context/LedgerContext'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import Dashboard from './pages/Dashboard'
import History from './pages/History'
import Analytics from './pages/Analytics'
import Profile from './pages/Profile'
import AddExpense from './pages/AddExpense'
import Budgets from './pages/Budgets'
import Notifications from './pages/Notifications'
import EMITracker from './pages/EMITracker'
import NetWorth from './pages/NetWorth'
import Ledger from './pages/Ledger'
import Layout from './components/Layout'

function PrivateRoute({ children }) {
  const { token } = useAuth()
  return token ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { token } = useAuth()
  return !token ? children : <Navigate to="/" replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NotificationProvider>
          <ExpenseProvider>
            <BudgetProvider>
              <NetWorthProvider>
                <LedgerProvider>
                <EMIProvider>
                  <BrowserRouter>
                <Toaster
                  position="top-center"
                  toastOptions={{
                    duration: 3000,
                    style: { borderRadius: '12px', fontSize: '14px', maxWidth: '340px' }
                  }}
                />
                <Routes>
                  <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
                  <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
                  <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
                    <Route index element={<Dashboard />} />
                    <Route path="history" element={<History />} />
                    <Route path="analytics" element={<Analytics />} />
                    <Route path="budgets" element={<Budgets />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="emis" element={<EMITracker />} />
                    <Route path="networth" element={<NetWorth />} />
                    <Route path="ledger" element={<Ledger />} />
                    <Route path="profile" element={<Profile />} />
                    <Route path="add" element={<AddExpense />} />
                    <Route path="edit/:id" element={<AddExpense />} />
                  </Route>
                </Routes>
                  </BrowserRouter>
                </EMIProvider>
                </LedgerProvider>
              </NetWorthProvider>
            </BudgetProvider>
          </ExpenseProvider>
        </NotificationProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
