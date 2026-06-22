import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfileStore, loadSnapshots, type ProfileSnapshot } from '../../stores/profileStore'
import { useAuthStore } from '../../stores/authStore'
import {
  updateProfile as apiUpdateProfile,
  fetchStudyTrends, fetchAssessment, fetchLearningPath,
  fetchResources, fetchConversations,
  type StudyTrendPoint,
} from '../../services/api'
import { getStreak } from '../../utils/achievements'

const COGNITIVE_STYLES = ['visual', 'verbal', 'active', 'reflective']
const COGNITIVE_LABELS: Record<string, { label: string; desc: string }> = {
  visual: { label: '视觉型', desc: '喜欢通过图表、视频和思维导图学习' },
  verbal: { label: '语言型', desc: '偏好通过文字、朗读和讨论吸收知识' },
  active: { label: '动手型', desc: '边做边学，喜欢实验和项目实践' },
  reflective: { label: '反思型', desc: '习惯先观察思考，再动手验证' },
}

const ALL_INTERESTS = [
  '机器学习', '深度学习', '自然语言处理', '计算机视觉',
  '强化学习', 'AI 伦理', '自动驾驶', 'AI 医疗',
  'AI 教育', '机器人', '数据分析', '知识图谱',
]

const TIME_OPTIONS = [
  { value: '<3h', label: '< 3小时/周', desc: '碎片化学习，适合轻量内容推荐' },
  { value: '3-5h', label: '3-5小时/周', desc: '中等强度，可安排系统化学习' },
  { value: '5-10h', label: '5-10小时/周', desc: '充足时间，支持深度学习路径' },
  { value: '>10h', label: '> 10小时/周', desc: '高强度学习，可并行多方向' },
]

const KNOWLEDGE_COLORS = ['#2D4A3E', '#C77D43', '#0F766E', '#8B5CF6', '#D97706', '#3B82F6']

export default function ProfilePage() {
  const navigate = useNavigate()
  const { profile, setProfile } = useProfileStore()
  const { user } = useAuthStore()

  // 扩展数据状态
  const [enrichLoading, setEnrichLoading] = useState(true)
  const [trendData, setTrendData] = useState<{ trends: StudyTrendPoint[]; total_minutes: number; avg_per_day: number } | null>(null)
  const [resourceCount, setResourceCount] = useState(0)
  const [convCount, setConvCount] = useState(0)
  const [pathData, setPathData] = useState<{ progress: number; nodes: number; completed: number } | null>(null)
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[]>([])
  const [streak, setStreak] = useState(0)

  // 画像编辑状态
  const [editing, setEditing] = useState<'goal' | 'style' | 'time' | 'interests' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState<'goal' | 'style' | 'time' | 'interests' | null>(null)

  const [editGoal, setEditGoal] = useState('')
  const [editStyle, setEditStyle] = useState('')
  const [editTime, setEditTime] = useState('')
  const [editInterests, setEditInterests] = useState<string[]>([])

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(null), 2000)
      return () => clearTimeout(t)
    }
  }, [saved])

  // 加载扩展数据
  useEffect(() => {
    if (!user?.username) return
    const load = async () => {
      await Promise.allSettled([
        fetchStudyTrends().then(setTrendData).catch(() => {}),
        fetchAssessment().then(r => {
          const records = (r as Record<string, unknown>).records as Array<Record<string, unknown>> || []
        }).catch(() => {}),
        fetchResources().then(r => setResourceCount((r as Record<string, unknown>).resources?.length || 0)).catch(() => {}),
        fetchConversations().then(c => setConvCount((c as Record<string, unknown>).conversations?.length || 0)).catch(() => {}),
        fetchLearningPath().then(lp => {
          const p = (lp as Record<string, unknown>).path as Record<string, unknown> | null
          if (p?.data) {
            const d = p.data as { nodes?: unknown[]; edges?: unknown[] }
            const completed = (p.completed_nodes as string[] || []).length
            setPathData({
              progress: (p.progress as number) || 0,
              nodes: d.nodes?.length || 0,
              completed,
            })
          }
        }).catch(() => {}),
      ])
      setSnapshots(loadSnapshots(user.username))
      setStreak(getStreak())
      setEnrichLoading(false)
    }
    load()
  }, [user?.username])

  const startEdit = (field: 'goal' | 'style' | 'time' | 'interests') => {
    if (!profile) return
    switch (field) {
      case 'goal': setEditGoal(profile.learning_goal || ''); break
      case 'style': setEditStyle(profile.cognitive_style || ''); break
      case 'time': setEditTime(profile.available_time || ''); break
      case 'interests': setEditInterests([...(profile.interests || [])]); break
    }
    setEditing(field)
  }

  const saveEdit = async (field: 'goal' | 'style' | 'time' | 'interests') => {
    setSaving(true)
    let updateData: Record<string, unknown> = {}
    switch (field) {
      case 'goal': updateData = { learning_goal: editGoal }; break
      case 'style': updateData = { cognitive_style: editStyle }; break
      case 'time': updateData = { available_time: editTime }; break
      case 'interests': updateData = { interests: editInterests }; break
    }
    const updated = { ...profile, ...updateData } as Record<string, unknown>
    setProfile(updated as unknown as Parameters<typeof setProfile>[0], user?.username)
    try {
      await apiUpdateProfile(updateData)
      setSaved(field)
    } catch { /* fallback */ }
    setSaving(false)
    setEditing(null)
  }

  const cancelEdit = () => setEditing(null)
  const toggleInterest = (i: string) => {
    setEditInterests(prev =>
      prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <h1 className="text-lg font-semibold text-ink mb-3">我的学习画像</h1>
        <p className="text-sm text-muted">尚未构建画像，请在对话页面与 AI 交流以生成学习画像。</p>
      </div>
    )
  }

  // 画像维度计算
  const dimensions: { key: string; label: string; icon: string; present: boolean; desc: string }[] = [
    { key: 'knowledge_base', label: '知识基础', icon: '📊', present: !!profile.knowledge_base && Object.keys(profile.knowledge_base).length > 0, desc: '各学科领域的当前掌握程度' },
    { key: 'cognitive_style', label: '认知风格', icon: '🧩', present: !!profile.cognitive_style, desc: '最适合你的学习方式' },
    { key: 'weak_points', label: '薄弱知识点', icon: '⚠️', present: !!profile.weak_points && profile.weak_points.length > 0, desc: '容易出错的概念，针对性强化' },
    { key: 'learning_goal', label: '学习目标', icon: '🎯', present: !!profile.learning_goal, desc: '期望达成的学习成果' },
    { key: 'available_time', label: '可用时间', icon: '⏰', present: !!profile.available_time, desc: '每周学习时间' },
    { key: 'interests', label: '兴趣方向', icon: '💡', present: !!profile.interests && profile.interests.length > 0, desc: '最感兴趣的细分领域' },
  ]
  const completed = dimensions.filter(d => d.present).length

  // 统计摘要
  const totalMinutes = trendData?.total_minutes || 0
  const avgPerDay = trendData?.avg_per_day || 0
  const trendPoints = trendData?.trends || []
  const hasStudyData = totalMinutes > 0

  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {/* ─── 1. 用户头部问候 ─── */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">
          {greeting}，{user?.nickname || '同学'} 👋
        </h1>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted mt-1">
          {hasStudyData && <span>⏱ 累计 <strong className="text-ink">{Math.floor(totalMinutes / 60)}h{totalMinutes % 60}m</strong></span>}
          {streak > 0 && <span>🔥 连续 <strong className="text-ink">{streak} 天</strong></span>}
          {convCount > 0 && <span>💬 <strong className="text-ink">{convCount}</strong> 次对话</span>}
          {pathData && <span>🎯 <strong className="text-ink">{pathData.completed}/{pathData.nodes}</strong> 章节</span>}
          {!hasStudyData && convCount === 0 && <span>开始学习，记录你的成长轨迹</span>}
        </div>
      </div>

      {/* ─── 2. 快捷统计条 ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard icon="⏱" value={hasStudyData ? `${Math.floor(totalMinutes / 60)}h` : '--'} label="总学习时长" sub={hasStudyData ? `日均 ${avgPerDay.toFixed(0)} 分钟` : '暂无'} />
        <StatCard icon="📚" value={resourceCount} label="学习资源" sub={`已生成 ${resourceCount} 份`} />
        <StatCard icon="🎯" value={pathData ? `${Math.round(pathData.progress * 100)}%` : '--'} label="学习进度" sub={pathData ? `${pathData.completed}/${pathData.nodes} 章` : '尚未生成'} />
        <StatCard icon="💬" value={convCount} label="对话次数" sub={`共 ${convCount} 次对话`} />
      </div>

      {/* ─── 3. 画像维度进度（保留） ─── */}
      <p className="text-[13px] text-muted mb-2">
        画像完善度 <span className="text-ink font-medium">{completed}/6</span>
        <span className="text-muted/60"> — 完整度越高推荐越精准</span>
      </p>
      <div className="h-1.5 bg-cream rounded-full mb-6 overflow-hidden">
        <div className="h-full bg-ink rounded-full transition-all duration-700" style={{ width: `${(completed / 6) * 100}%` }} />
      </div>

      {/* ─── 4. 画像可编辑卡片（保留） ─── */}
      <div className="space-y-3 mb-8">
        {editing === 'goal' ? (
          <EditCard title="编辑学习目标" onCancel={cancelEdit} onSave={() => saveEdit('goal')} saving={saving}>
            <textarea
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              className="w-full px-3 py-3 rounded-lg border border-border text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ink/20 min-h-[100px] resize-y"
              placeholder="例如：系统掌握深度学习理论与实践，能够独立完成 NLP 项目..." autoFocus
            />
            <p className="text-[11px] text-muted/60 mt-1">越具体越好，包括目标领域、期望水平和时间框架</p>
          </EditCard>
        ) : (
          <DisplayCard icon="🎯" label="学习目标" value={profile.learning_goal || '未设置'} desc="期望达成的学习成果"
            onEdit={() => startEdit('goal')} saved={saved === 'goal'} />
        )}

        {editing === 'style' ? (
          <EditCard title="编辑认知风格" onCancel={cancelEdit} onSave={() => saveEdit('style')} saving={saving}>
            <div className="grid grid-cols-2 gap-3">
              {COGNITIVE_STYLES.map(s => (
                <button key={s} onClick={() => setEditStyle(s)}
                  className={`px-4 py-4 rounded-xl text-left transition-all ${editStyle === s ? 'bg-ink text-warm-white ring-2 ring-ink/20' : 'bg-cream text-ink hover:bg-cream/80'}`}>
                  <div className="font-medium text-sm">{COGNITIVE_LABELS[s].label}</div>
                  <div className={`text-xs mt-1 ${editStyle === s ? 'text-white/70' : 'text-muted'}`}>{COGNITIVE_LABELS[s].desc}</div>
                </button>
              ))}
            </div>
          </EditCard>
        ) : (
          <DisplayCard icon="🧩" label="认知风格" value={profile.cognitive_style ? (COGNITIVE_LABELS[profile.cognitive_style]?.label || profile.cognitive_style) : '未设置'}
            desc={profile.cognitive_style ? (COGNITIVE_LABELS[profile.cognitive_style]?.desc || '') : '影响学习方式偏好'}
            sub={profile.cognitive_style || undefined} onEdit={() => startEdit('style')} saved={saved === 'style'} />
        )}

        {editing === 'time' ? (
          <EditCard title="编辑可用时间" onCancel={cancelEdit} onSave={() => saveEdit('time')} saving={saving}>
            <div className="grid grid-cols-2 gap-3">
              {TIME_OPTIONS.map(t => (
                <button key={t.value} onClick={() => setEditTime(t.value)}
                  className={`px-4 py-4 rounded-xl text-left transition-all ${editTime === t.value ? 'bg-ink text-warm-white ring-2 ring-ink/20' : 'bg-cream text-ink hover:bg-cream/80'}`}>
                  <div className="font-medium text-sm">{t.label}</div>
                  <div className={`text-xs mt-1 ${editTime === t.value ? 'text-white/70' : 'text-muted'}`}>{t.desc}</div>
                </button>
              ))}
            </div>
          </EditCard>
        ) : (
          <DisplayCard icon="⏰" label="可用时间" value={profile.available_time ? (TIME_OPTIONS.find(t => t.value === profile.available_time)?.label || profile.available_time) : '未设置'}
            desc={profile.available_time ? (TIME_OPTIONS.find(t => t.value === profile.available_time)?.desc || '') : '影响学习节奏'}
            onEdit={() => startEdit('time')} saved={saved === 'time'} />
        )}

        {editing === 'interests' ? (
          <EditCard title="编辑兴趣方向" onCancel={cancelEdit} onSave={() => saveEdit('interests')} saving={saving}>
            <div className="flex flex-wrap gap-2">
              {ALL_INTERESTS.map(i => (
                <button key={i} onClick={() => toggleInterest(i)}
                  className={`px-4 py-2 rounded-full text-sm transition-all ${editInterests.includes(i) ? 'bg-ink text-warm-white shadow-sm' : 'bg-cream text-ink hover:bg-cream/80'}`}>
                  {i}
                </button>
              ))}
            </div>
          </EditCard>
        ) : (
          <DisplayCard icon="💡" label="兴趣方向" value={(profile.interests || []).join('、') || '未设置'}
            desc="优先推送相关内容" onEdit={() => startEdit('interests')} saved={saved === 'interests'} tags={profile.interests} />
        )}

        {/* 薄弱知识点 */}
        <div className="p-5 rounded-xl border border-border bg-surface/30">
          <div className="flex items-start gap-3">
            <span className="text-lg flex-shrink-0 mt-0.5">⚠️</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">薄弱知识点</span>
                <span className="text-[10px] text-muted/50">系统自动识别</span>
              </div>
              {profile.weak_points && profile.weak_points.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {profile.weak_points.map((wp, i) => (
                    <span key={i} className="px-2.5 py-1 bg-amber/10 text-amber text-xs rounded-full">{wp}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted/60 mt-1">暂无薄弱记录，继续学习后将自动识别</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ─── 5. 学习统计 ─── */}
      {hasStudyData && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-4">📈 学习统计</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-4">
              <TrendChart data={trendPoints} />
            </div>
            <div className="space-y-3">
              <MiniCard label="总学习时长" value={`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`} icon="⏱" />
              <MiniCard label="日均学习" value={`${avgPerDay.toFixed(0)} 分钟`} icon="📊" />
              <MiniCard label="学习天数" value={`${trendPoints.filter(d => d.minutes > 0).length} 天`} icon="📅" />
            </div>
          </div>
        </div>
      )}

      {/* ─── 6. 知识掌握度趋势 ─── */}
      {snapshots.length >= 2 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-ink mb-4">📊 知识掌握度趋势</h2>
          <div className="rounded-xl border border-border bg-surface p-4">
            <KnowledgeTrendChart snapshots={snapshots} />
          </div>
        </div>
      )}

      {/* ─── 7. 学习进度 ─── */}
      {pathData && pathData.nodes > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-ink">🗺️ 学习路径进度</h2>
            <button onClick={() => navigate('/learning-path')} className="text-[12px] text-muted hover:text-ink transition-colors">
              查看全部 →
            </button>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 flex items-center gap-6">
            <div className="relative w-20 h-20 flex-shrink-0">
              <svg className="w-20 h-20 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E8E4DF" strokeWidth="3" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke="#2D4A3E" strokeWidth="3"
                  strokeDasharray={`${pathData.progress * 100} ${100 - pathData.progress * 100}`}
                  strokeLinecap="round" className="transition-all duration-700" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-base font-semibold text-ink">{Math.round(pathData.progress * 100)}%</span>
              </div>
            </div>
            <div>
              <p className="text-sm text-ink font-medium">已完成 {pathData.completed}/{pathData.nodes} 个节点</p>
              <p className="text-[13px] text-muted mt-1">继续学习，逐步掌握完整知识体系</p>
            </div>
          </div>
        </div>
      )}

      {/* ─── 8. 画像维度说明（保留，紧凑版） ─── */}
      <div className="border-t border-border pt-6">
        <h2 className="text-sm font-medium text-ink mb-4">画像维度说明</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {dimensions.map(item => (
            <div key={item.key} className={`flex items-center gap-3 p-3 rounded-lg border ${
              item.present ? 'border-border' : 'border-dashed border-muted/20'
            }`}>
              <span className="text-base flex-shrink-0">{item.icon}</span>
              <div className="min-w-0">
                <span className="text-[13px] font-medium text-ink">{item.label}</span>
                {item.present && <span className="ml-1.5 text-[10px] text-green-600">✓</span>}
                <p className="text-[11px] text-muted truncate">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── 子组件 ──

function StatCard({ icon, value, label, sub }: { icon: string; value: string | number; label: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="text-xl mb-1">{icon}</div>
      <div className="text-xl font-semibold text-ink">{value}</div>
      <div className="text-[12px] text-muted mt-0.5">{label}</div>
      <div className="text-[11px] text-muted/60 mt-0.5">{sub}</div>
    </div>
  )
}

function MiniCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface">
      <span className="text-lg">{icon}</span>
      <div>
        <div className="text-[11px] text-muted">{label}</div>
        <div className="text-sm font-medium text-ink">{value}</div>
      </div>
    </div>
  )
}

function DisplayCard({
  icon, label, value, desc, onEdit, saved, sub, tags,
}: {
  icon: string; label: string; value: string; desc?: string; onEdit: () => void; saved?: boolean;
  sub?: string; tags?: string[];
}) {
  return (
    <div className="p-5 rounded-xl border border-border bg-surface hover:border-muted/60 transition-all group relative">
      {saved && (
        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
      )}
      <div className="flex items-start gap-3">
        <span className="text-lg flex-shrink-0 mt-0.5">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">{label}</span>
            <span className="text-[10px] text-muted/40">{desc}</span>
          </div>
          {tags ? (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tags.map((t, i) => <span key={i} className="px-2.5 py-1 bg-cream text-ink text-xs rounded-full">{t}</span>)}
            </div>
          ) : sub ? (
            <div className="mt-1.5">
              <span className="text-sm text-ink">{value}</span>
              <span className="ml-2 px-2 py-0.5 bg-cream rounded text-[10px] text-muted">{sub}</span>
            </div>
          ) : (
            <p className={`text-sm mt-1 ${value === '未设置' ? 'text-muted/60 italic' : 'text-ink'}`}>{value}</p>
          )}
        </div>
        <button onClick={onEdit}
          className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-muted hover:text-ink hover:bg-cream rounded-lg transition-all opacity-0 group-hover:opacity-100 flex-shrink-0 mt-0.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          编辑
        </button>
      </div>
    </div>
  )
}

function EditCard({
  title, children, onCancel, onSave, saving,
}: {
  title: string; children: React.ReactNode; onCancel: () => void; onSave: () => void; saving: boolean;
}) {
  return (
    <div className="p-5 rounded-xl border border-ink/20 bg-surface shadow-sm">
      <label className="text-sm font-medium text-ink mb-3 block">{title}</label>
      {children}
      <div className="flex gap-2 mt-4 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm text-muted hover:text-ink transition-colors">取消</button>
        <button onClick={onSave} disabled={saving}
          className="px-5 py-2 bg-ink text-warm-white text-sm rounded-lg hover:bg-ink-light transition-colors disabled:opacity-50 flex items-center gap-1.5">
          {saving && <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="32" strokeLinecap="round" /></svg>}
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}

function TrendChart({ data }: { data: StudyTrendPoint[] }) {
  if (!data.length) return null
  const W = 600, H = 140, padL = 40, padR = 12, padT = 16, padB = 28
  const chartW = W - padL - padR, chartH = H - padT - padB
  const maxMin = Math.max(...data.map(d => d.minutes), 10)
  const yStep = Math.max(1, Math.ceil(maxMin / 4))
  const yTicks = Array.from({ length: 5 }, (_, i) => i * yStep)
  const xScale = (i: number) => padL + (i / (data.length - 1)) * chartW
  const yScale = (v: number) => padT + chartH - (v / (yTicks[yTicks.length - 1] || 1)) * chartH
  const points = data.map((d, i) => `${xScale(i)},${yScale(d.minutes)}`).join(' ')

  const fmtDay = (s: string) => {
    try { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}` }
    catch { return s.slice(5) }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {yTicks.map(v => (
        <g key={v}>
          <line x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} stroke="#E8E4DF" strokeDasharray="3,3" />
          <text x={padL - 6} y={yScale(v) + 3} textAnchor="end" fontSize="9" fill="#8B8580">{v}m</text>
        </g>
      ))}
      <polyline points={points} fill="none" stroke="#2D4A3E" strokeWidth="2" strokeLinejoin="round" />
      {data.map((d, i) => (
        d.minutes > 0 && (
          <circle key={i} cx={xScale(i)} cy={yScale(d.minutes)} r="3" fill="#2D4A3E" stroke="#fff" strokeWidth="1.5" />
        )
      ))}
      {data.map((d, i) => (
        (i === 0 || i === data.length - 1 || data.length <= 7 || i % Math.ceil(data.length / 5) === 0) && (
          <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#8B8580">{fmtDay(d.date)}</text>
        )
      ))}
    </svg>
  )
}

function KnowledgeTrendChart({ snapshots }: { snapshots: ProfileSnapshot[] }) {
  const W = 400, H = 120, padL = 8, padR = 8, padT = 8, padB = 20
  const chartW = W - padL - padR, chartH = H - padT - padB
  const allKeys = [...new Set(snapshots.flatMap(s => Object.keys(s.knowledge_base)))].slice(0, 6)
  if (allKeys.length === 0) return null
  const xScale = (i: number) => padL + (snapshots.length === 1 ? chartW / 2 : (i / (snapshots.length - 1)) * chartW)
  const yScale = (v: number) => padT + chartH - v * chartH
  const fmtDay = (s: string) => { try { const d = new Date(s + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}` } catch { return s.slice(5) } }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {[0.25, 0.5, 0.75].map(v => (
        <line key={v} x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} stroke="#E8E4DF" strokeWidth="0.5" />
      ))}
      {allKeys.map((key, ki) => {
        const pts = snapshots.map((s, i) => `${xScale(i)},${yScale(s.knowledge_base[key] || 0)}`).join(' ')
        return (
          <g key={key}>
            <polyline points={pts} fill="none" stroke={KNOWLEDGE_COLORS[ki % KNOWLEDGE_COLORS.length]} strokeWidth="1.5" strokeLinejoin="round" />
          </g>
        )
      })}
      {snapshots.map((s, i) => (
        (i === 0 || i === snapshots.length - 1 || snapshots.length <= 7 || i % Math.ceil(snapshots.length / 5) === 0) && (
          <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#8B8580">{fmtDay(s.date)}</text>
        )
      ))}
      {allKeys.map((key, ki) => (
        <g key={key} transform={`translate(${padL + ki * 65}, ${H - 2})`}>
          <circle cx="0" cy="-8" r="3" fill={KNOWLEDGE_COLORS[ki % KNOWLEDGE_COLORS.length]} />
          <text x="6" y="-5" fontSize="8" fill="#8B8580">{key.length > 6 ? key.slice(0, 6) + '…' : key}</text>
        </g>
      ))}
    </svg>
  )
}
