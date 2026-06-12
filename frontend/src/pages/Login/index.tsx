import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { login } from '../../services/api'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login: authLogin } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    console.log('[login submit]', username, password.length)
    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await login(username.trim(), password)
      authLogin(data.token, data.user)
      navigate('/chat', { replace: true })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '登录失败，请检查用户名和密码')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-ink flex items-center justify-center mx-auto mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#F5F0EB" strokeWidth="1.5" strokeLinecap="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </div>
          <h1 className="text-xl font-medium text-ink">智学</h1>
          <p className="text-sm text-muted mt-1">AI 个性化学习系统</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-border shadow-sm p-6 space-y-4">
          <h2 className="text-base font-medium text-ink text-center">登录</h2>

          {error && (
            <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-sm text-muted mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-warm-white text-ink text-sm
                focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink"
              placeholder="请输入用户名"
            />
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-warm-white text-ink text-sm
                focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink"
              placeholder="请输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-ink text-warm-white text-sm font-medium
              hover:bg-ink-light transition-colors disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>

          <p className="text-xs text-center text-muted">
            还没有账号？
            <Link to="/register" className="text-ink hover:underline ml-1">注册</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
