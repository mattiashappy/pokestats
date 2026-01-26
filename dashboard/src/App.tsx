import { Navigate, Route, Routes } from "react-router-dom"

import { AppLayout } from "./components/layout/app-layout"
import { ProtectedRoute } from "./components/protected-route"
import { AdminPage } from "./pages/admin"
import { AuctionsPage } from "./pages/auctions"
import { BillingPage } from "./pages/billing"
import { CardPage } from "./pages/card"
import { CollectionsPage } from "./pages/collections"
import { DashboardPage } from "./pages/dashboard"
import { EnrichPage } from "./pages/enrich"
import { LoginPage } from "./pages/login"
import { PokemonSetPage } from "./pages/pokemon-set"
import { SetsPage } from "./pages/sets"
import { SettingsPage } from "./pages/settings"
import { SignupPage } from "./pages/signup"
import { AuctionImportsPage } from "./pages/auction-imports"
import { ErasPage } from "./pages/eras"
import { EraSetsPage } from "./pages/era-sets"

function App(): JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
      </Route>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected app routes – user/member access */}
      <Route element={<ProtectedRoute allowedRoles={["admin", "member"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/collections" element={<CollectionsPage />} />
          <Route path="/sets" element={<SetsPage />} />
          <Route path="/sets/:setCode" element={<PokemonSetPage />} />
          <Route path="/sets/:setCode/:id" element={<CardPage />} />
          <Route path="/era" element={<ErasPage />} />
          <Route path="/era/:eraCode" element={<EraSetsPage />} />
          <Route path="/era/:eraCode/:setCode" element={<PokemonSetPage />} />
          <Route path="/era/:eraCode/:setCode/:id" element={<CardPage />} />
          <Route path="/era/sets/:setCode" element={<PokemonSetPage />} />
          <Route path="/cards/:id" element={<CardPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Admin-only routes */}
      <Route element={<ProtectedRoute allowedRoles={["admin"]} />}>
        <Route element={<AppLayout />}>
          <Route path="/auctions" element={<AuctionsPage />} />
          <Route path="/auctions/:attribute" element={<AuctionsPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/imports" element={<AuctionImportsPage />} />
          <Route path="/admin/enrich" element={<EnrichPage />} />
        </Route>
      </Route>

      {/* Billing – login required, subscription NOT required */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/billing" element={<BillingPage />} />
        </Route>
      </Route>

      <Route path="/app/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
