import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { login } from '../../services/api'

function getPasswordStrength(pwd: string): { level: 'weak' | 'medium' | 'strong'; label: string; color: string } {
  let score = 0
  if (pwd.length >= 4) score++
  if (pwd.length >= 8) score++
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
  if (/\d/.test(pwd)) score++
  if (/[^A-Za-z0-9]/.test(pwd)) score++
  if (score <= 2) return { level: 'weak', label: '弱', color: 'bg-red-400' }
  if (score <= 3) return { level: 'medium', label: '中', color: 'bg-amber' }
  return { level: 'strong', label: '强', color: 'bg-green-500' }
}

export default function LoginPage() {
  const navigate = useNavigate()
  const { login: authLogin } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [expired, setExpired] = useState(false)
  const [usernameHint, setUsernameHint] = useState('')
  const [passwordHint, setPasswordHint] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem('auth_expired') === '1') {
      setExpired(true)
      sessionStorage.removeItem('auth_expired')
    }
  }, [])

  // 实时校验用户名
  const onUsernameChange = (val: string) => {
    setUsername(val)
    if (val && !/^[a-zA-Z0-9_一-鿿]{2,20}$/.test(val)) {
      setUsernameHint('2-20 位字母、数字、下划线或中文')
    } else {
      setUsernameHint('')
    }
  }

  // 实时校验密码
  const onPasswordChange = (val: string) => {
    setPassword(val)
    if (val && val.length < 4) {
      setPasswordHint('密码至少 4 个字符')
    } else {
      setPasswordHint('')
    }
  }

  const handleCapsLock = useCallback((e: React.KeyboardEvent) => {
    setCapsLock(e.getModifierState('CapsLock')
      && (e.target as HTMLInputElement).type === 'password')
  }, [])

  const strength = password.length > 0 ? getPasswordStrength(password) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 animate-[fadeIn_0.3s_ease-out]">
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

          {expired && (
            <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              登录已过期，请重新登录
            </div>
          )}

          {error && (
            <div className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</div>
          )}

          <div>
            <label className="block text-sm text-muted mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border bg-warm-white text-ink text-sm
                focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink"
              placeholder="2-20 位字母数字"
            />
            {usernameHint && (
              <p className="text-xs text-amber-600 mt-1">{usernameHint}</p>
            )}
          </div>

          <div>
            <label className="block text-sm text-muted mb-1">密码</label>
            <div className="relative">
              <input
                type="password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                onKeyDown={handleCapsLock}
                onKeyUp={handleCapsLock}
                className="w-full px-3 py-2 rounded-lg border border-border bg-warm-white text-ink text-sm
                  focus:outline-none focus:ring-1 focus:ring-ink focus:border-ink"
                placeholder="至少 4 个字符"
              />
              {capsLock && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-600 select-none">
                  ⇪ 大写锁定
                </span>
              )}
            </div>
            {passwordHint && (
              <p className="text-xs text-amber-600 mt-1">{passwordHint}</p>
            )}
            {strength && (
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 flex gap-1">
                  <div className={`h-1 flex-1 rounded-full ${strength.level === 'weak' ? strength.color : 'bg-gray-200'}`} />
                  <div className={`h-1 flex-1 rounded-full ${strength.level === 'medium' || strength.level === 'strong' ? strength.color : 'bg-gray-200'}`} />
                  <div className={`h-1 flex-1 rounded-full ${strength.level === 'strong' ? strength.color : 'bg-gray-200'}`} />
                </div>
                <span className="text-xs text-muted">密码强度：{strength.label}</span>
              </div>
            )}
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
