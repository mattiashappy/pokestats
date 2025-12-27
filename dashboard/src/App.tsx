import { Navigate, Route, Routes } from 'react-router-dom'

import { AppLayout } from './components/layout/app-layout'
import { ProtectedRoute } from './components/protected-route'
import { BillingPage } from './pages/billing'
import { DashboardPage } from './pages/dashboard'
import { LandingPage } from './pages/landing'
import { LoginPage } from './pages/login'
import { SalesPage } from './pages/sales'
import { SettingsPage } from './pages/settings'
import { SignupPage } from './pages/signup'

function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      <Route element={<ProtectedRoute requireSubscription />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<DashboardPage />} />
          <Route path="/app/sales" element={<SalesPage />} />
          <Route path="/app/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/billing" element={<BillingPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
