import { Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import ChatPage from './pages/Chat'
import ResourcesPage from './pages/Resources'
import LearningPathPage from './pages/LearningPath'
import AssessmentPage from './pages/Assessment'
import ProfilePage from './pages/Profile'

function App() {
  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<ChatPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/resources" element={<ResourcesPage />} />
        <Route path="/learning-path" element={<LearningPathPage />} />
        <Route path="/assessment" element={<AssessmentPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<Navigate to="/chat" replace />} />
      </Routes>
    </AppLayout>
  )
}

export default App
