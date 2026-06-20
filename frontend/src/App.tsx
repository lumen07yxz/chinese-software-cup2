import { useEffect, useRef } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/Dashboard'
import ChatPage from './pages/Chat'
import QuizPage from './pages/Quiz'
import WrongAnswerBookPage from './pages/WrongAnswerBook'
import OnboardingPage from './pages/Onboarding'
import KnowledgeBasePage from './pages/KnowledgeBase'
import ResourcesPage from './pages/Resources'
import LearningPathPage from './pages/LearningPath'
import AssessmentPage from './pages/Assessment'
import PPTPage from './pages/PPT'
import ProfilePage from './pages/Profile'
import LoginPage from './pages/Login'
import RegisterPage from './pages/Register'
import { useAuthStore } from './stores/authStore'
import { useProfileStore } from './stores/profileStore'
import { fetchProfile } from './services/api'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Check onboarding — redirect to wizard if not complete (only for main app routes)
  const onboardingComplete = localStorage.getItem('onboarding-complete') === 'true'
  if (!onboardingComplete) {
    return <Navigate to="/onboarding" replace />
  }
  return <AppLayout>{children}</AppLayout>
}

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  const onboardingComplete = localStorage.getItem('onboarding-complete') === 'true'
  if (onboardingComplete) return <Navigate to="/" replace />
  return <>{children}</>
}

function AppInitializer({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user } = useAuthStore()
  const { setProfile, loadFromCache, clearProfile } = useProfileStore()
  const prevUsername = useRef<string | undefined>(undefined)

  useEffect(() => {
    // #23: 仅在用户切换时清空画像，避免每次渲染闪烁
    if (prevUsername.current !== user?.username) {
      if (prevUsername.current) clearProfile()
      prevUsername.current = user?.username
    }

    if (isAuthenticated && user) {
      // 先快速从 localStorage 加载对应账号的缓存（立即显示，无闪烁）
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
          isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />
        } />
        <Route path="/register" element={
          isAuthenticated ? <Navigate to="/" replace /> : <RegisterPage />
        } />
        <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/onboarding" element={<OnboardingGuard><OnboardingPage /></OnboardingGuard>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/quiz" element={<ProtectedRoute><QuizPage /></ProtectedRoute>} />
        <Route path="/wrong-answer-book" element={<ProtectedRoute><WrongAnswerBookPage /></ProtectedRoute>} />
        <Route path="/resources" element={<ProtectedRoute><ResourcesPage /></ProtectedRoute>} />
        <Route path="/knowledge-base" element={<ProtectedRoute><KnowledgeBasePage /></ProtectedRoute>} />
        <Route path="/learning-path" element={<ProtectedRoute><LearningPathPage /></ProtectedRoute>} />
        <Route path="/assessment" element={<ProtectedRoute><AssessmentPage /></ProtectedRoute>} />
        <Route path="/ppt" element={<ProtectedRoute><PPTPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppInitializer>
  )
}

export default App
