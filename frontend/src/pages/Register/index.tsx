import { useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { register } from '../../services/api'
import StarsCanvas from '../../components/StarsCanvas'

export default function RegisterPage() {
  const navigate = useNavigate()
  const { login: authLogin } = useAuthStore()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [usernameHint, setUsernameHint] = useState('')
  const [passwordHint, setPasswordHint] = useState('')
  const [confirmHint, setConfirmHint] = useState('')

  const onUsernameChange = (val: string) => {
    setUsername(val); setUsernameHint(val && !/^[a-zA-Z0-9_一-鿿]{2,20}$/.test(val) ? '2-20 位字母、数字、下划线或中文' : '')
  }
  const onPasswordChange = (val: string) => {
    setPassword(val); setPasswordHint(val && val.length < 4 ? '密码至少 4 个字符' : '')
    setConfirmHint(confirmPwd && val !== confirmPwd ? '两次密码不一致' : '')
  }
  const onConfirmChange = (val: string) => { setConfirmPwd(val); setConfirmHint(val && val !== password ? '两次密码不一致' : '') }
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
    if (password.length < 4) { setError('密码至少 4 个字符'); return }
    if (password !== confirmPwd) { setError('两次密码输入不一致'); return }
    setLoading(true); setError('')
    try { const d = await register(username.trim(), password, nickname.trim() || username.trim()); authLogin(d.token, d.user); navigate('/chat', { replace: true }) }
    catch (e: unknown) { setError(e instanceof Error ? e.message : '注册失败') }
    finally { setLoading(false) }
  }

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#020712 0%,#06142e 30%,#0a1c3e 60%,#06122a 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', position:'relative', padding:'40px 24px', overflow:'hidden' }}>
      <StarsCanvas />
      <div style={{ position:'relative', zIndex:10, textAlign:'center', marginBottom:36, animation:'fadeUp .7s cubic-bezier(.32,.72,0,1) both' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:100, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', fontSize:11, fontWeight:500, color:'rgba(74,158,255,0.75)', letterSpacing:'0.06em', marginBottom:20 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#4a9eff', boxShadow:'0 0 8px rgba(74,158,255,0.5)' }} />
          AI 个性化学习系统
        </div>
        <h1 style={{ fontSize:'clamp(28px,3.5vw,40px)', fontWeight:800, lineHeight:1.2, letterSpacing:'-0.02em', marginBottom:12, color:'#fff' }}>
          开始你的<span style={{ color:'#4a9eff' }}>个性化</span>学习之旅
        </h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.35)', lineHeight:1.6, maxWidth:420, margin:'0 auto' }}>
          创建账号，AI 将为你构建专属学习路径
        </p>
      </div>

      <div style={{ position:'relative', zIndex:10, width:'100%', maxWidth:420, animation:'cardIn .8s cubic-bezier(.32,.72,0,1) .12s both' }}>
        <div style={{ background:'rgba(255,255,255,0.97)', borderRadius:20, padding:'36px 32px', boxShadow:'0 4px 6px rgba(0,0,0,0.06), 0 20px 50px rgba(0,0,0,0.25)', color:'#1a1a2e' }}>
          <div style={{ display:'flex', marginBottom:24, borderBottom:'1px solid #eef0f4' }}>
            <Link to="/login" style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:14, fontWeight:600, color:'#9ca3af', textDecoration:'none' }}>登录</Link>
            <div style={{ flex:1, padding:'10px 0', textAlign:'center', fontSize:14, fontWeight:600, color:'#0d2744', position:'relative', cursor:'default' }}>
              注册
              <div style={{ position:'absolute', bottom:-1, left:'25%', right:'25%', height:2, background:'#2b8cf6', borderRadius:1 }} />
            </div>
          </div>

          {error && <div style={{ padding:'10px 14px', borderRadius:10, marginBottom:18, background:'#fef2f2', border:'1px solid #fecaca', fontSize:12, color:'#dc2626' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>用户名</label>
              <input type="text" value={username} onChange={e => onUsernameChange(e.target.value)} className="reg-input" placeholder="2-20 位字母数字或中文" />
              {usernameHint && <p style={{ fontSize:11, color:'#d97706', marginTop:4 }}>{usernameHint}</p>}
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>昵称 <span style={{ fontSize:11, color:'#9ca3af', fontWeight:400 }}>可选</span></label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} className="reg-input" placeholder="显示名称，默认同用户名" />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>密码</label>
              <div style={{ position:'relative' }}>
                <input type="password" value={password} onChange={e => onPasswordChange(e.target.value)} onKeyDown={handleCapsLock} onKeyUp={handleCapsLock} className="reg-input" placeholder="至少 4 个字符" />
                {capsLock && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:10, color:'#d97706', fontWeight:500 }}>⇪ 大写锁定</span>}
              </div>
              {passwordHint && <p style={{ fontSize:11, color:'#d97706', marginTop:4 }}>{passwordHint}</p>}
              {strength && (
                <div style={{ display:'flex', gap:3, marginTop:6 }}>
                  <div className={`reg-seg ${strength.lv >= 1 ? (strength.lv === 1 ? 'weak' : strength.lv === 2 ? 'mid' : 'strong') : ''}`} />
                  <div className={`reg-seg ${strength.lv >= 2 ? (strength.lv === 2 ? 'mid' : 'strong') : ''}`} />
                  <div className={`reg-seg ${strength.lv >= 3 ? 'strong' : ''}`} />
                </div>
              )}
            </div>
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>确认密码</label>
              <input type="password" value={confirmPwd} onChange={e => onConfirmChange(e.target.value)} onKeyDown={handleCapsLock} onKeyUp={handleCapsLock} className="reg-input" placeholder="再次输入密码" />
              {confirmHint && <p style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>{confirmHint}</p>}
            </div>
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'13px 24px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#2b8cf6,#1a6dd1)', color:'#fff', fontSize:15, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(43,140,246,0.3)', transition:'all .35s cubic-bezier(.32,.72,0,1)', opacity:loading?0.6:1 }}
              onMouseEnter={e => { const t=e.currentTarget; if(!loading){t.style.transform='translateY(-1px)';t.style.boxShadow='0 6px 20px rgba(43,140,246,0.4)'}}}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px rgba(43,140,246,0.3)' }}>
              {loading ? '注册中...' : '创建账号'}
              <span style={{ width:24, height:24, borderRadius:7, background:'rgba(255,255,255,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13 }} className="btn-arrow">→</span>
            </button>
          </form>
          <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'#9ca3af' }}>
            已有账号？<Link to="/login" style={{ color:'#2b8cf6', textDecoration:'none', fontWeight:500 }}>登录</Link>
          </div>
        </div>
      </div>

      <style>{`
        .reg-input { width:100%; padding:11px 14px; border-radius:10px; border:1.5px solid #e5e7eb; background:#f9fafb; color:#1a1a2e; font-size:14px; font-family:inherit; outline:none; box-sizing:border-box; transition: all .3s cubic-bezier(.32,.72,0,1); }
        .reg-input::placeholder { color:#c0c4cc; }
        .reg-input:focus { border-color:#2b8cf6 !important; background:#fff !important; box-shadow: 0 0 0 3px rgba(43,140,246,0.1) !important; }
        .reg-seg { flex:1; height:3px; border-radius:2px; background:#e5e7eb; transition:all .3s; }
        .reg-seg.weak { background:#ef4444; }
        .reg-seg.mid { background:#f59e0b; }
        .reg-seg.strong { background:#22c55e; }
        button:hover .btn-arrow { transform:translate(2px,-1px) scale(1.1); }
      `}</style>
    </div>
  )
}
