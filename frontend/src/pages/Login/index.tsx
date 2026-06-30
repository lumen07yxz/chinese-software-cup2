import { useState, useEffect, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { login } from '../../services/api'
import StarsCanvas from '../../components/StarsCanvas'

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
  const [rememberMe, setRememberMe] = useState(false)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  useEffect(() => {
    if (sessionStorage.getItem('auth_expired') === '1') {
      setExpired(true)
      sessionStorage.removeItem('auth_expired')
    }
  }, [])

  // 锁定倒计时
  useEffect(() => {
    if (lockoutSeconds <= 0) return
    const timer = setInterval(() => {
      setLockoutSeconds(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [lockoutSeconds])

  const onUsernameChange = (val: string) => {
    setUsername(val)
    setUsernameHint(val && !/^[a-zA-Z0-9_一-鿿]{2,20}$/.test(val) ? '2-20 位字母、数字、下划线或中文' : '')
  }
  const onPasswordChange = (val: string) => {
    setPassword(val)
    setPasswordHint(val && val.length < 4 ? '密码至少 4 个字符' : '')
  }
  const handleCapsLock = useCallback((e: React.KeyboardEvent) => {
    setCapsLock(e.getModifierState('CapsLock') && (e.target as HTMLInputElement).type === 'password')
  }, [])

  const getStrength = (pwd: string) => {
    let s = 0; if (pwd.length >= 4) s++; if (pwd.length >= 8) s++; if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) s++; if (/\d/.test(pwd)) s++; if (/[^A-Za-z0-9]/.test(pwd)) s++;
    if (s <= 2) return { lv: 1, label: '弱' }; if (s <= 3) return { lv: 2, label: '中' }; return { lv: 3, label: '强' }
  }
  const strength = password.length > 0 ? getStrength(password) : null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) { setError('请输入用户名和密码'); return }
    setLoading(true); setError('')
    try {
      const d = await login(username.trim(), password, rememberMe)
      authLogin(d.token, d.user)
      navigate('/chat', { replace: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '登录失败'
      // 解析锁定秒数
      const match = msg.match(/(\d+)\s*秒/)
      if (match) setLockoutSeconds(parseInt(match[1]))
      setError(msg)
    } finally { setLoading(false) }
  }

  const isLocked = lockoutSeconds > 0

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#020712 0%,#06142e 30%,#0a1c3e 60%,#06122a 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', position:'relative', padding:'40px 24px', overflow:'hidden' }}>
      <StarsCanvas />

      <div style={{ position:'relative', zIndex:10, textAlign:'center', marginBottom:36, animation:'fadeUp .7s cubic-bezier(.32,.72,0,1) both' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:100, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', fontSize:11, fontWeight:500, color:'rgba(74,158,255,0.75)', letterSpacing:'0.06em', marginBottom:20 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#4a9eff', boxShadow:'0 0 8px rgba(74,158,255,0.5)' }} />
          AI 个性化学习系统
        </div>
        <h1 style={{ fontSize:'clamp(28px,3.5vw,40px)', fontWeight:800, lineHeight:1.2, letterSpacing:'-0.02em', marginBottom:12, color:'#fff' }}>
          让每个学生都拥有<br />专属的 <span style={{ color:'#4a9eff' }}>AI 学习伙伴</span>
        </h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.35)', lineHeight:1.6, maxWidth:420, margin:'0 auto' }}>
          基于知识图谱与大模型技术，为每位学习者构建个性化学习路径
        </p>
      </div>

      <div style={{ position:'relative', zIndex:10, width:'100%', maxWidth:420, animation:'cardIn .8s cubic-bezier(.32,.72,0,1) .12s both' }}>
        <div style={{ background:'rgba(255,255,255,0.97)', borderRadius:20, padding:'36px 32px', boxShadow:'0 4px 6px rgba(0,0,0,0.06), 0 20px 50px rgba(0,0,0,0.25)', color:'#1a1a2e' }}>
          <div style={{ display:'flex', marginBottom:24, borderBottom:'1px solid #eef0f4' }}>
            <div style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:14, fontWeight:600, color:'#0d2744', position:'relative', cursor:'default' }}>
              登录
              <div style={{ position:'absolute', bottom:-1, left:'25%', right:'25%', height:2, background:'#2b8cf6', borderRadius:1 }} />
            </div>
            <Link to="/register" style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:14, fontWeight:600, color:'#9ca3af', textDecoration:'none' }}>
              注册
            </Link>
          </div>

          {expired && <div style={{ display:'flex', alignItems:'center', gap:6, padding:'10px 14px', borderRadius:10, marginBottom:18, background:'#fffbeb', border:'1px solid #fef3c7', fontSize:12, color:'#d97706' }}>⚠ 登录已过期，请重新登录</div>}
          {isLocked && <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:18, background:'#fef2f2', border:'1px solid #fecaca', fontSize:12, color:'#dc2626' }}>🔒 登录尝试过多，请 {lockoutSeconds} 秒后重试</div>}
          {error && !isLocked && <div key={error} style={{ padding:'10px 14px', borderRadius:10, marginBottom:18, background:'#fef2f2', border:'1px solid #fecaca', fontSize:12, color:'#dc2626', animation:'shake .4s ease-out' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>用户名</label>
              <input type="text" value={username} onChange={e => onUsernameChange(e.target.value)} className="login-input" placeholder="请输入用户名" disabled={isLocked} />
              {usernameHint && <p style={{ fontSize:11, color:'#d97706', marginTop:4 }}>{usernameHint}</p>}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>密码</label>
              <div style={{ position:'relative' }}>
                <input type="password" value={password} onChange={e => onPasswordChange(e.target.value)} onKeyDown={handleCapsLock} onKeyUp={handleCapsLock} className="login-input" placeholder="请输入密码" disabled={isLocked} />
                {capsLock && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:10, color:'#d97706', fontWeight:500, whiteSpace:'nowrap' }}>⇪ 大写锁定</span>}
              </div>
              {passwordHint && <p style={{ fontSize:11, color:'#d97706', marginTop:4 }}>{passwordHint}</p>}
              {strength && (
                <div style={{ display:'flex', gap:3, marginTop:6 }}>
                  <div className={`str-seg ${strength.lv >= 1 ? (strength.lv === 1 ? 'weak' : strength.lv === 2 ? 'mid' : 'strong') : ''}`} />
                  <div className={`str-seg ${strength.lv >= 2 ? (strength.lv === 2 ? 'mid' : 'strong') : ''}`} />
                  <div className={`str-seg ${strength.lv >= 3 ? 'strong' : ''}`} />
                </div>
              )}
            </div>

            {/* 记住我 + 忘记密码 */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, color:'#6b7280', cursor:'pointer', userSelect:'none' }}>
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                  style={{ width:16, height:16, borderRadius:4, accentColor:'#2b8cf6', cursor:'pointer' }} />
                记住我
              </label>
              <Link to="/forgot-password" style={{ fontSize:13, color:'#2b8cf6', textDecoration:'none' }}>忘记密码？</Link>
            </div>

            <button type="submit" disabled={loading || isLocked}
              style={{ width:'100%', padding:'13px 24px', borderRadius:12, border:'none', cursor: loading || isLocked ? 'not-allowed' : 'pointer', background:'linear-gradient(135deg,#2b8cf6,#1a6dd1)', color:'#fff', fontSize:15, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(43,140,246,0.3)', transition:'all .35s cubic-bezier(.32,.72,0,1)', opacity: loading || isLocked ? 0.6 : 1 }}
              onMouseEnter={e => { const t=e.currentTarget; if(!loading && !isLocked){t.style.transform='translateY(-1px)';t.style.boxShadow='0 6px 20px rgba(43,140,246,0.4)'}}}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px rgba(43,140,246,0.3)' }}>
              {loading ? <><span className="login-spinner" /> 登录中...</> : isLocked ? `请等待 ${lockoutSeconds} 秒` : '登录'}
              {!loading && !isLocked && <span style={{ width:24, height:24, borderRadius:7, background:'rgba(255,255,255,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13, transition:'all .3s' }} className="btn-arrow">→</span>}
            </button>
          </form>
          <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'#9ca3af' }}>
            还没有账号？<Link to="/register" style={{ color:'#2b8cf6', textDecoration:'none', fontWeight:500 }}>立即注册</Link>
          </div>
        </div>
      </div>

      <style>{`
        .login-input { width:100%; padding:11px 14px; border-radius:10px; border:1.5px solid #e5e7eb; background:#f9fafb; color:#1a1a2e; font-size:14px; font-family:inherit; outline:none; box-sizing:border-box; transition: all .3s cubic-bezier(.32,.72,0,1); }
        .login-input::placeholder { color:#c0c4cc; }
        .login-input:focus { border-color:#2b8cf6 !important; background:#fff !important; box-shadow: 0 0 0 3px rgba(43,140,246,0.1) !important; }
        .login-input:disabled { opacity:.5; cursor:not-allowed; }
        .str-seg { flex:1; height:3px; border-radius:2px; background:#e5e7eb; transition:all .3s; }
        .str-seg.weak { background:#ef4444; }
        .str-seg.mid { background:#f59e0b; }
        .str-seg.strong { background:#22c55e; }
        button:hover .btn-arrow { transform:translate(2px,-1px) scale(1.1); }
        .login-spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin .6s linear infinite; }
      `}</style>
    </div>
  )
}
