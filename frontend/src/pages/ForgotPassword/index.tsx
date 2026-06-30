import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { forgotPassword } from '../../services/api'
import StarsCanvas from '../../components/StarsCanvas'

export default function ForgotPasswordPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [username, setUsername] = useState('')
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Step 1: 获取密保问题
  const handleGetQuestion = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username.trim()) { setError('请输入用户名'); return }
    setLoading(true); setError('')
    try {
      const res = await forgotPassword('get_question', username.trim())
      setQuestion(res.question)
      setStep(2)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setLoading(false) }
  }

  // Step 2: 验证答案并重置
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!answer.trim()) { setError('请输入密保答案'); return }
    if (newPassword.length < 4) { setError('新密码至少 4 个字符'); return }
    if (!/\d/.test(newPassword) || !/[a-zA-Z]/.test(newPassword)) { setError('密码需同时包含字母和数字'); return }
    if (newPassword !== confirmPwd) { setError('两次密码输入不一致'); return }
    setLoading(true); setError('')
    try {
      await forgotPassword('verify_and_reset', username.trim(), answer.trim(), newPassword)
      setStep(3)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : '操作失败') }
    finally { setLoading(false) }
  }

  // 密码规则
  const pwdRules = [
    { label: '至少 4 个字符', met: newPassword.length >= 4 },
    { label: '包含至少一个数字', met: /\d/.test(newPassword) },
    { label: '包含至少一个字母', met: /[a-zA-Z]/.test(newPassword) },
  ]

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(180deg,#020712 0%,#06142e 30%,#0a1c3e 60%,#06122a 100%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', position:'relative', padding:'40px 24px', overflow:'hidden' }}>
      <StarsCanvas />

      <div style={{ position:'relative', zIndex:10, textAlign:'center', marginBottom:36, animation:'fadeUp .7s cubic-bezier(.32,.72,0,1) both' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'5px 14px', borderRadius:100, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', fontSize:11, fontWeight:500, color:'rgba(74,158,255,0.75)', letterSpacing:'0.06em', marginBottom:20 }}>
          <span style={{ width:5, height:5, borderRadius:'50%', background:'#4a9eff', boxShadow:'0 0 8px rgba(74,158,255,0.5)' }} />
          AI 个性化学习系统
        </div>
        <h1 style={{ fontSize:'clamp(28px,3.5vw,40px)', fontWeight:800, lineHeight:1.2, letterSpacing:'-0.02em', marginBottom:12, color:'#fff' }}>
          找回你的<span style={{ color:'#4a9eff' }}>账号密码</span>
        </h1>
        <p style={{ fontSize:14, color:'rgba(255,255,255,0.35)', lineHeight:1.6, maxWidth:420, margin:'0 auto' }}>
          通过密保问题验证身份，重置密码
        </p>
      </div>

      <div style={{ position:'relative', zIndex:10, width:'100%', maxWidth:420, animation:'cardIn .8s cubic-bezier(.32,.72,0,1) .12s both' }}>
        <div style={{ background:'rgba(255,255,255,0.97)', borderRadius:20, padding:'36px 32px', boxShadow:'0 4px 6px rgba(0,0,0,0.06), 0 20px 50px rgba(0,0,0,0.25)', color:'#1a1a2e' }}>
          {/* 步骤指示器 */}
          <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:24 }}>
            {[1, 2, 3].map(s => (
              <div key={s} style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', background: step >= s ? '#2b8cf6' : '#e5e7eb', color: step >= s ? '#fff' : '#9ca3af', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .3s' }}>
                  {step > s ? '✓' : s}
                </div>
                {s < 3 && <div style={{ width:32, height:2, background: step > s ? '#2b8cf6' : '#e5e7eb', borderRadius:1, transition:'all .3s' }} />}
              </div>
            ))}
          </div>

          {error && <div key={error} style={{ padding:'10px 14px', borderRadius:10, marginBottom:18, background:'#fef2f2', border:'1px solid #fecaca', fontSize:12, color:'#dc2626', animation:'shake .4s ease-out' }}>{error}</div>}

          {/* Step 1: 输入用户名 */}
          {step === 1 && (
            <form onSubmit={handleGetQuestion}>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>用户名</label>
                <input type="text" value={username} onChange={e => { setUsername(e.target.value); setError('') }}
                  className="fp-input" placeholder="请输入你的用户名" autoFocus />
              </div>
              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:'13px 24px', borderRadius:12, border:'none', cursor: loading ? 'not-allowed' : 'pointer', background:'linear-gradient(135deg,#2b8cf6,#1a6dd1)', color:'#fff', fontSize:15, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(43,140,246,0.3)', transition:'all .35s', opacity: loading ? 0.6 : 1 }}>
                {loading ? '查询中...' : '下一步'}
                {!loading && <span style={{ width:24, height:24, borderRadius:7, background:'rgba(255,255,255,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13 }} className="btn-arrow">→</span>}
              </button>
            </form>
          )}

          {/* Step 2: 回答密保 + 新密码 */}
          {step === 2 && (
            <form onSubmit={handleReset}>
              <div style={{ padding:'12px 16px', borderRadius:10, background:'#f0f7ff', border:'1px solid #dbeafe', marginBottom:20, fontSize:13, color:'#1e40af' }}>
                <span style={{ fontWeight:600 }}>密保问题：</span>{question}
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>答案</label>
                <input type="text" value={answer} onChange={e => { setAnswer(e.target.value); setError('') }}
                  className="fp-input" placeholder="请输入密保答案" autoFocus />
              </div>
              <div style={{ marginBottom:14 }}>
                <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>新密码</label>
                <input type="password" value={newPassword} onChange={e => { setNewPassword(e.target.value); setError('') }}
                  className="fp-input" placeholder="至少 4 个字符，含字母和数字" />
                {newPassword.length > 0 && (
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
              </div>
              <div style={{ marginBottom:20 }}>
                <label style={{ fontSize:13, fontWeight:500, color:'#374151', marginBottom:6, display:'block' }}>确认新密码</label>
                <input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)}
                  className="fp-input"
                  style={{ borderColor: confirmPwd ? (confirmPwd !== newPassword ? '#fca5a5' : '#86efac') : undefined }}
                  placeholder="再次输入新密码" />
                {confirmPwd && confirmPwd !== newPassword && <p style={{ fontSize:11, color:'#dc2626', marginTop:4 }}>两次密码不一致</p>}
                {confirmPwd && confirmPwd === newPassword && <p style={{ fontSize:11, color:'#22c55e', marginTop:4 }}>✓ 密码一致</p>}
              </div>
              <button type="submit" disabled={loading}
                style={{ width:'100%', padding:'13px 24px', borderRadius:12, border:'none', cursor: loading ? 'not-allowed' : 'pointer', background:'linear-gradient(135deg,#2b8cf6,#1a6dd1)', color:'#fff', fontSize:15, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(43,140,246,0.3)', transition:'all .35s', opacity: loading ? 0.6 : 1 }}>
                {loading ? '重置中...' : '验证并重置密码'}
                {!loading && <span style={{ width:24, height:24, borderRadius:7, background:'rgba(255,255,255,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:13 }} className="btn-arrow">→</span>}
              </button>
            </form>
          )}

          {/* Step 3: 成功 */}
          {step === 3 && (
            <div style={{ textAlign:'center', padding:'20px 0' }}>
              <div style={{ width:64, height:64, borderRadius:'50%', background:'linear-gradient(135deg,#22c55e,#16a34a)', display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:28, color:'#fff', marginBottom:16, boxShadow:'0 4px 20px rgba(34,197,94,0.3)' }}>
                ✓
              </div>
              <h3 style={{ fontSize:18, fontWeight:700, color:'#0d2744', marginBottom:8 }}>密码重置成功！</h3>
              <p style={{ fontSize:13, color:'#6b7280', marginBottom:24 }}>请使用新密码登录你的账号</p>
              <button type="button" onClick={() => navigate('/login')}
                style={{ width:'100%', padding:'13px 24px', borderRadius:12, border:'none', cursor:'pointer', background:'linear-gradient(135deg,#2b8cf6,#1a6dd1)', color:'#fff', fontSize:15, fontWeight:600, fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center', gap:8, boxShadow:'0 4px 14px rgba(43,140,246,0.3)', transition:'all .35s' }}>
                立即登录
              </button>
            </div>
          )}

          {step < 3 && (
            <div style={{ textAlign:'center', marginTop:20, fontSize:13, color:'#9ca3af' }}>
              想起密码了？<Link to="/login" style={{ color:'#2b8cf6', textDecoration:'none', fontWeight:500 }}>返回登录</Link>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .fp-input { width:100%; padding:11px 14px; border-radius:10px; border:1.5px solid #e5e7eb; background:#f9fafb; color:#1a1a2e; font-size:14px; font-family:inherit; outline:none; box-sizing:border-box; transition: all .3s cubic-bezier(.32,.72,0,1); }
        .fp-input::placeholder { color:#c0c4cc; }
        .fp-input:focus { border-color:#2b8cf6 !important; background:#fff !important; box-shadow: 0 0 0 3px rgba(43,140,246,0.1) !important; }
        button:hover .btn-arrow { transform:translate(2px,-1px) scale(1.1); }
      `}</style>
    </div>
  )
}
