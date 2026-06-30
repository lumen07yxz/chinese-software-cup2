import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { register, verifyUsername } from '../../services/api'
import StarsCanvas from '../../components/StarsCanvas'

const SECURITY_QUESTIONS = [
  '你母亲的名字是什么？',
  '你出生的城市是哪里？',
  '你的第一只宠物叫什么？',
  '你最喜欢的颜色是什么？',
  '自定义问题',
]

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
  const [confirmHint, setConfirmHint] = useState('')
  const [agreed, setAgreed] = useState(false)

  // 用户名查重
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle')
  const [usernameStatusMsg, setUsernameStatusMsg] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // 密保
  const [showSecurity, setShowSecurity] = useState(false)
  const [secQuestion, setSecQuestion] = useState(SECURITY_QUESTIONS[0])
  const [customQuestion, setCustomQuestion] = useState('')
  const [secAnswer, setSecAnswer] = useState('')

  const onUsernameChange = (val: string) => {
    setUsername(val)
    setUsernameStatus('idle')
    setUsernameStatusMsg('')
    if (!val) { setUsernameHint(''); return }
    if (!/^[a-zA-Z0-9_一-鿿]{2,20}$/.test(val)) {
      setUsernameHint('2-20 位字母、数字、下划线或中文')
      return
    }
    setUsernameHint('')
    // debounce 查重
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      abortRef.current?.abort()
      const ctrl = new AbortController()
      abortRef.current = ctrl
      setUsernameStatus('checking')
      verifyUsername(val).then(res => {
        if (ctrl.signal.aborted) return
        if (res.available) { setUsernameStatus('available'); setUsernameStatusMsg('用户名可用') }
        else { setUsernameStatus('taken'); setUsernameStatusMsg(res.message || '用户名已被占用') }
      }).catch(() => {
        if (!ctrl.signal.aborted) setUsernameStatus('idle')
      })
    }, 500)
  }

  useEffect(() => () => { debounceRef.current && clearTimeout(debounceRef.current); abortRef.current?.abort() }, [])

  const onPasswordChange = (val: string) => {
    setPassword(val)
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

  // 密码规则
  const pwdRules = [
    { label: '至少 4 个字符', met: password.length >= 4 },
    { label: '包含至少一个数字', met: /\d/.test(password) },
    { label: '包含至少一个字母', met: /[a-zA-Z]/.test(password) },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim() || !password.trim()) { setError('请输入用户名和密码'); return }
    if (password.length < 4) { setError('密码至少 4 个字符'); return }
    if (!/\d/.test(password) || !/[a-zA-Z]/.test(password)) { setError('密码需同时包含字母和数字'); return }
    if (password !== confirmPwd) { setError('两次密码输入不一致'); return }
    if (!agreed) { setError('请先阅读并同意用户协议和隐私政策'); return }
    setLoading(true); setError('')
    try {
      const q = secQuestion === '自定义问题' ? customQuestion.trim() : secQuestion
      const a = secAnswer.trim()
      const d = await register(
        username.trim(), password, nickname.trim() || username.trim(),
        q && a ? q : undefined, a && q ? a : undefined,
      )
      authLogin(d.token, d.user)
      navigate('/chat', { replace: true })
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '注册失败') }
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

          {error && <div key={error} style={{ padding:'10px 14px', borderRadius:10, marginBottom:18, background:'#fef2f2', border:'1px solid #fecaca', fontSize:12, color:'#dc2626', animation:'shake .4s ease-out' }}>{error}</div>}

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>用户名</label>
              <input type="text" value={username} onChange={e => onUsernameChange(e.target.value)} className="reg-input" placeholder="2-20 位字母数字或中文" />
              {usernameHint && <p style={{ fontSize:11, color:'#d97706', marginTop:4 }}>{usernameHint}</p>}
              {!usernameHint && usernameStatus === 'checking' && <p style={{ fontSize:11, color:'#9ca3af', marginTop:4 }}>检查中...</p>}
              {!usernameHint && usernameStatus === 'available' && <p style={{ fontSize:11, color:'#22c55e', marginTop:4 }}>✓ {usernameStatusMsg}</p>}
              {!usernameHint && usernameStatus === 'taken' && <p style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>✗ {usernameStatusMsg}</p>}
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'flex', alignItems:'center', gap:4 }}>昵称 <span style={{ fontSize:11, color:'#9ca3af', fontWeight:400 }}>可选</span></label>
              <input type="text" value={nickname} onChange={e => setNickname(e.target.value)} className="reg-input" placeholder="显示名称，默认同用户名" />
            </div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>密码</label>
              <div style={{ position:'relative' }}>
                <input type="password" value={password} onChange={e => onPasswordChange(e.target.value)} onKeyDown={handleCapsLock} onKeyUp={handleCapsLock} className="reg-input" placeholder="至少 4 个字符，含字母和数字" />
                {capsLock && <span style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', fontSize:10, color:'#d97706', fontWeight:500 }}>⇪ 大写锁定</span>}
              </div>
              {/* 密码规则清单 */}
              {password.length > 0 && (
                <div style={{ marginTop:6, display:'flex', flexDirection:'column', gap:3 }}>
                  {pwdRules.map(r => (
                    <div key={r.label} style={{ fontSize:11, display:'flex', alignItems:'center', gap:4, color: r.met ? '#22c55e' : '#9ca3af' }}>
                      <span style={{ width:14, height:14, borderRadius:'50%', border: `1.5px solid ${r.met ? '#22c55e' : '#d1d5db'}`, background: r.met ? '#22c55e' : 'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:8, color:'#fff', flexShrink:0, transition:'all .2s' }}>
                        {r.met ? '✓' : ''}
                      </span>
                      {r.label}
                    </div>
                  ))}
                </div>
              )}
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
              <input type="password" value={confirmPwd} onChange={e => onConfirmChange(e.target.value)} onKeyDown={handleCapsLock} onKeyUp={handleCapsLock}
                className="reg-input"
                style={{ borderColor: confirmPwd ? (confirmHint ? '#fca5a5' : '#86efac') : undefined, background: confirmPwd ? (confirmHint ? '#fef2f2' : '#f0fdf4') : undefined }}
                placeholder="再次输入密码" />
              {confirmHint
                ? <p style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>{confirmHint}</p>
                : confirmPwd && !confirmHint && <p style={{ fontSize:11, color:'#22c55e', marginTop:4 }}>✓ 密码一致</p>
              }
            </div>

            {/* 协议勾选 */}
            <label style={{ display:'flex', alignItems:'flex-start', gap:8, marginBottom:18, cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
                style={{ width:16, height:16, borderRadius:4, accentColor:'#2b8cf6', cursor:'pointer', marginTop:2, flexShrink:0 }} />
              <span style={{ fontSize:12, color:'#6b7280', lineHeight:1.5 }}>
                我已阅读并同意{' '}
                <span style={{ color:'#2b8cf6', cursor:'pointer' }}>《用户协议》</span>
                {' '}和{' '}
                <span style={{ color:'#2b8cf6', cursor:'pointer' }}>《隐私政策》</span>
              </span>
            </label>

            {/* 密保设置（可折叠） */}
            <div style={{ marginBottom:18, border:'1px solid #e5e7eb', borderRadius:10, overflow:'hidden' }}>
              <button type="button" onClick={() => setShowSecurity(!showSecurity)}
                style={{ width:'100%', padding:'10px 14px', background:'#f9fafb', border:'none', cursor:'pointer', fontSize:12, color:'#6b7280', display:'flex', alignItems:'center', justifyContent:'space-between', fontFamily:'inherit' }}>
                <span>🔐 设置密保问题（可选，用于找回密码）</span>
                <span style={{ transform: showSecurity ? 'rotate(180deg)' : 'rotate(0)', transition:'transform .2s', fontSize:10 }}>▼</span>
              </button>
              {showSecurity && (
                <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:10, background:'#fff' }}>
                  <select value={secQuestion} onChange={e => setSecQuestion(e.target.value)}
                    className="reg-input" style={{ fontSize:13 }}>
                    {SECURITY_QUESTIONS.map(q => <option key={q} value={q}>{q}</option>)}
                  </select>
                  {secQuestion === '自定义问题' && (
                    <input type="text" value={customQuestion} onChange={e => setCustomQuestion(e.target.value)}
                      className="reg-input" placeholder="请输入你的密保问题" style={{ fontSize:13 }} />
                  )}
                  <input type="text" value={secAnswer} onChange={e => setSecAnswer(e.target.value)}
                    className="reg-input" placeholder="请输入答案" style={{ fontSize:13 }} />
                </div>
              )}
            </div>

            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:'13px 24px', borderRadius:12, border:'none', cursor: loading ? 'not-allowed' : 'pointer', background:'linear-gradient(135deg,#2b8cf6,#1a6dd1)', color:'#fff', fontSize:15, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(43,140,246,0.3)', transition:'all .35s cubic-bezier(.32,.72,0,1)', opacity:loading?0.6:1 }}
              onMouseEnter={e => { const t=e.currentTarget; if(!loading){t.style.transform='translateY(-1px)';t.style.boxShadow='0 6px 20px rgba(43,140,246,0.4)'}}}
              onMouseLeave={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 4px 14px rgba(43,140,246,0.3)' }}>
              {loading ? <><span className="reg-spinner" /> 注册中...</> : '创建账号'}
              {!loading && <span style={{ width:24, height:24, borderRadius:7, background:'rgba(255,255,255,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13 }} className="btn-arrow">→</span>}
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
        .reg-spinner { width:16px; height:16px; border:2px solid rgba(255,255,255,0.3); border-top-color:#fff; border-radius:50%; animation:spin .6s linear infinite; }
      `}</style>
    </div>
  )
}
