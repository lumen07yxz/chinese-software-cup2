import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import SidebarStars from './SidebarStars'

const navItems = [
  { path: '/', label: '总览', icon: DashboardIcon },
  { path: '/chat', label: '对话画像', icon: ChatIcon },
  { path: '/quiz', label: '在线练习', icon: QuizIcon },
  { path: '/wrong-answer-book', label: '错题本', icon: WrongAnswerIcon },
  { path: '/resources', label: '学习资源', icon: ResourcesIcon },
  { path: '/knowledge-base', label: '知识库', icon: KnowledgeBaseIcon },
  { path: '/learning-path', label: '学习路径', icon: PathIcon },
  { path: '/assessment', label: '学习评估', icon: AssessmentIcon },
  { path: '/ppt', label: 'PPT 生成', icon: PPTIcon },
  { path: '/profile', label: '我的画像', icon: ProfileIcon },
]

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const { user, logout } = useAuthStore()

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent | MediaQueryList) => {
      setCollapsed(e.matches)
      if (e.matches) setMobileOpen(false)
    }
    handler(mq)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] transition-all duration-200 whitespace-nowrap
    ${isActive
      ? 'bg-white/10 text-white font-medium'
      : 'text-white/50 hover:text-white/80 hover:bg-white/5'
    }`

  return (
    <>
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-3 left-3 z-[60] w-10 h-10 rounded-lg bg-white/10 backdrop-blur-md
          flex items-center justify-center text-white/60 hover:text-white transition-colors border border-white/10"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {mobileOpen ? (
            <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>
          ) : (
            <><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></>
          )}
        </svg>
      </button>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={`h-screen sticky top-0 flex flex-col z-50 overflow-hidden
          transition-[width] duration-200
          ${collapsed ? 'w-16' : 'w-56'}
          max-md:fixed max-md:top-0 max-md:left-0 max-md:h-full
          ${mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'}
          max-md:transition-transform`}
        style={{ background: 'linear-gradient(180deg, #020712 0%, #06142e 30%, #0a1c3e 60%, #06122a 100%)' }}
      >
        <SidebarStars collapsed={collapsed} />

        {/* Content layer */}
        <div className="relative z-10 flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-4 h-14 border-b border-white/5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-white/10">
              <img src="/favicon.png" alt="智学" className="w-full h-full object-cover" />
            </div>
            {!collapsed && <span className="font-semibold text-[15px] text-white/90">智学</span>}
          </div>

          {/* Nav */}
          <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
            {navItems.map((item) => (
              <NavLink key={item.path} to={item.path} className={linkCls} onClick={() => setMobileOpen(false)}>
                <item.icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* Bottom */}
          <div className="border-t border-white/5">
            {!collapsed && user && (
              <div className="px-4 py-2 text-xs text-white/30 truncate">{user.nickname}</div>
            )}
            <button onClick={logout}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-[13px] text-white/50 hover:text-white/80 hover:bg-white/5 transition-all">
              <LogoutIcon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>退出登录</span>}
            </button>
            <button onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center h-10 w-full border-t border-white/5 text-white/30 hover:text-white/60 transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                className={`transition-transform duration-200 ${collapsed ? 'rotate-180' : ''}`}>
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}

/* Icons */
function ChatIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="9" y1="10" x2="15" y2="10"/></svg> }
function ResourcesIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg> }
function PathIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg> }
function AssessmentIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> }
function ProfileIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> }
function LogoutIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> }
function DashboardIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> }
function QuizIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> }
function WrongAnswerIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 12l2 2 4-4"/></svg> }
function KnowledgeBaseIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><circle cx="12" cy="10" r="2"/><line x1="12" y1="12" x2="12" y2="16"/></svg> }
function PPTIcon(p: { className?: string }) { return <svg className={p.className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><polyline points="8 16 12 16 12 18 8 18"/></svg> }
