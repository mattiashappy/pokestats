import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "./components/layout/app-layout"
import { ProtectedRoute } from "./components/protected-route"
import { AdminPage } from "./pages/admin"
import { AuctionsPage } from "./pages/auctions"
import { BillingPage } from "./pages/billing"
import { CardPage } from "./pages/card"
import { LandingPage } from "./pages/landing"
import { LoginPage } from "./pages/login"
import { SettingsPage } from "./pages/settings"
import { SignupPage } from "./pages/signup"

function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected app routes – require active subscription */}
      <Route element={<ProtectedRoute requireSubscription />}>
        <Route element={<AppLayout />}>
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/auctions/:attribute" element={<AuctionsPage />} />
          <Route path="/cards/:id" element={<CardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>

      {/* Billing – login required, subscription NOT required */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/billing" element={<BillingPage />} />
        </Route>
      </Route>

      <Route path="/app/*" element={<Navigate to="/auctions" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
