import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ChatPage from './pages/Chat'
import ResourcesPage from './pages/Resources'
import LearningPathPage from './pages/LearningPath'
import AssessmentPage from './pages/Assessment'
import ProfilePage from './pages/Profile'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import { useAuthStore } from './stores/authStore'
import { useProfileStore } from './stores/profileStore'
import { fetchProfile } from './services/api'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <AppLayout>{children}</AppLayout>
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  const { setProfile, loadFromCache, clearProfile } = useProfileStore()

  useEffect(() => {
    clearProfile()
    if (isAuthenticated && user) {
      // 先快速从 localStorage 加载对应账号的缓存
      loadFromCache(user.username)
      // 再从 DB 异步刷新
      fetchProfile().then((profile) => {
        if (profile) setProfile(profile, user.username)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?.username])

  return <>{children}</>
}

function App() {
  const { loadFromStorage, isAuthenticated } = useAuthStore()

  useEffect(() => {
    loadFromStorage()
  }, [])

  return (
    <AppInitializer>
      <Routes>
        <Route path="/login" element={
          isAuthenticated ? <Navigate to="/chat" replace /> : <LoginPage />
        } />
        <Route path="/register" element={
          isAuthenticated ? <Navigate to="/chat" replace /> : <RegisterPage />
        } />
        <Route path="/" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
        <Route path="/learning-path" element={<ProtectedRoute><LearningPathPage /></ProtectedRoute>} />
        <Route path="/assessment" element={<ProtectedRoute><AssessmentPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </AppInitializer>
  )
}

export default App
