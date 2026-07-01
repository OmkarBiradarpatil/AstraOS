import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { ProtectedRoute } from '../features/auth/ProtectedRoute'
import { LoginPage } from '../features/auth/LoginPage'
import { AssistantPage } from '../features/assistant/AssistantPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { EntertainmentPage } from '../features/entertainment/EntertainmentPage'
import { FocusTubePage } from '../features/focustube/FocusTubePage'
import { HealthPage } from '../features/health/HealthPage'
import { NotFoundPage } from '../features/not-found/NotFoundPage'
import { SettingsPage } from '../features/settings/SettingsPage'
import { TasksPage } from '../features/tasks/TasksPage'
import { VaultPage } from '../features/vault/VaultPage'
import { AppProviders } from './providers'

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/focustube" element={<FocusTubePage />} />
          <Route path="/health" element={<HealthPage />} />
          <Route path="/vault" element={<VaultPage />} />
          <Route path="/entertainment" element={<EntertainmentPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AppProviders>
      <AppRoutes />
    </AppProviders>
  )
}
