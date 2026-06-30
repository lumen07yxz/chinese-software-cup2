import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useProfileStore, loadSnapshots, type ProfileSnapshot } from '../../stores/profileStore'
import { fetchAssessment, fetchResources, fetchLearningPath, fetchConversations, fetchDailyPlan, fetchDueFlashcards } from '../../services/api'
import { getDueReviews, markReviewed, type ReviewItem } from '../../utils/spacedRepetition'
import { getTodayRecord, getStreak, checkAchievements, getUnlockedAchievements, ACHIEVEMENTS } from '../../utils/achievements'

interface StatCard {
  label: string
  value: string | number
  sub: string
  icon: string
  color: string
}

interface RecentItem {
  type: 'resource' | 'chat' | 'assessment' | 'path'
  title: string
  time: string
  link: string
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { profile } = useProfileStore()
  const [stats, setStats] = useState<StatCard[]>([])
  const [recentItems, setRecentItems] = useState<RecentItem[]>([])
  const [pathProgress, setPathProgress] = useState(0)
  const [pathNodeCount, setPathNodeCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [snapshots, setSnapshots] = useState<ProfileSnapshot[]>([])
  const [dueReviews, setDueReviews] = useState<ReviewItem[]>([])
  const [todayRecord] = useState(getTodayRecord())
  const [streak, setStreak] = useState(0)
  const [newAchievements, setNewAchievements] = useState<ReturnType<typeof checkAchievements>>([])
  const [dailyPlan, setDailyPlan] = useState<{ tasks: { type: string; label: string; minutes: number; done: boolean }[] } | null>(null)
  const [dueFlashcards, setDueFlashcards] = useState(0)

  useEffect(() => {
    loadDashboardData()
    if (user?.username) {
      setSnapshots(loadSnapshots(user.username))
    }
    setDueReviews(getDueReviews())
    setStreak(getStreak())
    // 检查新解锁的成就
    const newUnlocked = checkAchievements()
    setNewAchievements(newUnlocked)

    // 加载今日计划
    fetchDailyPlan().then((plan) => {
      if (plan?.tasks) setDailyPlan(plan)
    }).catch(() => {})

    // 加载待复习闪卡数
    fetchDueFlashcards().then((res) => {
      setDueFlashcards(res.total || 0)
    }).catch(() => {})
  }, [])

  const loadDashboardData = async () => {
    try {
      const [assessData, resourceData, pathData, convData] = await Promise.all([
        fetchAssessment().catch(() => ({ records: [] })),
        fetchResources().catch(() => ({ resources: [] })),
        fetchLearningPath().catch(() => ({ path: null })),
        fetchConversations().catch(() => ({ conversations: [] })),
      ])

      // Calculate totals
      const records = assessData.records || []
      const totalStudyMinutes = records.reduce((sum: number, r: Record<string, unknown>) => sum + (r.study_time_minutes as number || 0), 0)
      const resources = resourceData.resources || []
      const conversations = convData.conversations || []

      // Path progress
      const path = pathData.path
      if (path && path.data && path.data.nodes) {
        setPathProgress(path.progress || 0)
        setPathNodeCount(path.data.nodes.length)
      }

      // Stats cards
      setStats([
        {
          label: '学习时长',
          value: `${Math.floor(totalStudyMinutes / 60)}h${totalStudyMinutes % 60}m`,
          sub: `${records.length} 次学习记录`,
          icon: '⏱',
          color: 'bg-blue-50 text-blue-600 border-blue-200',
        },
        {
          label: '学习资源',
          value: resources.length,
          sub: `${resources.filter((r: Record<string, unknown>) => r.type === 'doc').length} 篇文档 · ${resources.filter((r: Record<string, unknown>) => r.type === 'quiz').length} 道练习`,
          icon: '📚',
          color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
        },
        {
          label: '学习进度',
          value: path && path.data ? `${Math.round(pathProgress * 100)}%` : '--',
          sub: path && path.data ? `${path.data.nodes.filter((n: Record<string, unknown>) => path.completed_nodes?.includes(n.id)).length}/${pathNodeCount} 章节` : '尚未生成路径',
          icon: '🎯',
          color: 'bg-amber-50 text-amber-600 border-amber-200',
        },
        {
          label: '对话次数',
          value: conversations.length,
          sub: `共 ${conversations.length} 次对话`,
          icon: '💬',
          color: 'bg-violet-50 text-violet-600 border-violet-200',
        },
      ])

      // Build recent items
      const items: RecentItem[] = []

      // Recent resources
      for (const r of resources.slice(0, 3)) {
        items.push({
          type: 'resource',
          title: `生成了 ${r.type === 'doc' ? '文档' : r.type === 'quiz' ? '练习题' : r.type === 'mindmap' ? '思维导图' : r.type === 'video' ? '视频脚本' : '代码示例'}：${r.title || r.chapter || '未命名'}`,
          time: formatRelativeTime(r.created_at),
          link: '/resources',
        })
      }

      // Recent path progress
      if (path && path.data) {
        const completedCount = path.completed_nodes?.length || 0
        if (completedCount > 0) {
          items.push({
            type: 'path',
            title: `已完成 ${completedCount}/${pathNodeCount} 个学习节点`,
            time: formatRelativeTime(path.updated_at),
            link: '/learning-path',
          })
        }
      }

      // Recent conversations
      for (const c of conversations.slice(0, 3)) {
        items.push({
          type: 'chat',
          title: `对话：${c.title}`,
          time: formatRelativeTime(c.updated_at),
          link: '/chat',
        })
      }

      // Recent assessment
      if (records.length > 0) {
        items.push({
          type: 'assessment',
          title: `第 ${records.length} 次学习评估报告已生成`,
          time: formatRelativeTime(records[0].created_at),
          link: '/assessment',
        })
      }

      setRecentItems(items.sort((a, b) => a.time.localeCompare(b.time)).slice(0, 8))
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }

  // Time-based greeting
  const hour = new Date().getHours()
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好'

  const knowledgeAreas = [
    { key: '机器学习', label: '机器学习' },
    { key: '深度学习', label: '深度学习' },
    { key: 'NLP', label: '自然语言处理' },
    { key: 'CV', label: '计算机视觉' },
    { key: '强化学习', label: '强化学习' },
    { key: 'AI伦理', label: 'AI 伦理' },
  ]

  const getMastery = (area: string): number => {
    if (!profile?.knowledge_base) return 0
    // Match partial keys
    for (const [k, v] of Object.entries(profile.knowledge_base)) {
      if (k.toLowerCase().includes(area.toLowerCase())) return v as number
    }
    return 0
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-ink border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto pb-8">
      {/* Welcome */}
      <div className="mb-8 relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-400 p-6 text-white shadow-lg shadow-indigo-200">
        <div className="relative z-10">
          <h1 className="text-2xl font-bold">
            {greeting}，{user?.nickname || '同学'} 👋
          </h1>
          <p className="text-sm text-white/80 mt-1">
            {profile?.learning_goal
              ? `🎯 ${profile.learning_goal}`
              : '🚀 开始你的个性化学习之旅吧'}
          </p>
        </div>
        {/* 装饰圆 */}
        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
      </div>

      {/* H42 每日打卡 + 连续学习 */}
      <div className="flex items-center gap-4 mb-6 p-4 rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🔥</span>
          <div>
            <div className="text-lg font-semibold text-ink">{streak} 天</div>
            <div className="text-[11px] text-muted">连续学习</div>
          </div>
        </div>
        <div className="h-8 w-px bg-border" />
        <div className="flex-1 flex items-center gap-4">
          <div className="text-center">
            <div className="text-sm font-medium text-ink">{todayRecord.studyMinutes}</div>
            <div className="text-[11px] text-muted">今日分钟</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-ink">{todayRecord.quizCompleted}</div>
            <div className="text-[11px] text-muted">今日练习</div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-ink">{todayRecord.resourcesRead}</div>
            <div className="text-[11px] text-muted">今日阅读</div>
          </div>
        </div>
      </div>

      {/* 新解锁成就通知 */}
      {newAchievements.length > 0 && (
        <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50/50 animate-[fadeIn_0.5s_ease-out]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">🎉</span>
            <span className="text-sm font-medium text-ink">恭喜解锁新成就！</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {newAchievements.map((a) => (
              <span key={a.id} className="text-sm px-3 py-1.5 rounded-full bg-amber-100 text-amber-800">
                {a.icon} {a.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-surface p-5 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 group cursor-default"
          >
            <div className="flex items-start justify-between mb-3">
              <span className="text-2xl group-hover:scale-110 transition-transform duration-200">{stat.icon}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-50 text-green-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">活跃</span>
            </div>
            <div className="text-2xl font-bold text-ink">{stat.value}</div>
            <div className="text-[13px] text-muted mt-0.5">{stat.label}</div>
            <div className="text-[11px] text-muted mt-1">{stat.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Knowledge mastery */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium text-ink mb-4">知识掌握度</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {knowledgeAreas.map((area) => {
              const mastery = getMastery(area.key)
              return (
                <div key={area.key}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[12px] text-muted">{area.label}</span>
                    <span className="text-[11px] font-medium" style={{ color: mastery >= 0.6 ? '#059669' : mastery >= 0.3 ? '#C77D43' : '#EF4444' }}>
                      {Math.round(mastery * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-cream rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.max(mastery * 100, 2)}%`,
                        backgroundColor: mastery >= 0.6 ? '#059669' : mastery >= 0.3 ? '#C77D43' : '#EF4444',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>

          {/* 知识掌握度变化趋势（需≥2条快照才显示） */}
          {snapshots.length >= 2 && (
            <div className="mt-5 pt-4 border-t border-border/50">
              <h3 className="text-[12px] text-muted mb-3">掌握度变化趋势</h3>
              <KnowledgeTrendChart snapshots={snapshots} />
            </div>
          )}

          {profile && Object.keys(profile.knowledge_base || {}).length === 0 && (
            <p className="text-center text-[13px] text-muted mt-4">
              开始对话学习，AI 将自动评估你的知识掌握度
            </p>
          )}
        </div>

        {/* Quick actions */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium text-ink mb-4">快捷操作</h2>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/classroom')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-cream transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-lg">🎓</span>
              <div>
                <div className="text-[13px] font-medium text-ink">AI 课堂</div>
                <div className="text-[11px] text-muted">沉浸式课堂学习</div>
              </div>
            </button>
            <button
              onClick={() => navigate('/flashcards')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-cream transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-lg">🃏</span>
              <div>
                <div className="text-[13px] font-medium text-ink">概念闪卡</div>
                <div className="text-[11px] text-muted">间隔重复 · 巩固记忆</div>
              </div>
            </button>
            <button
              onClick={() => navigate('/chat')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-cream transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-lg">💬</span>
              <div>
                <div className="text-[13px] font-medium text-ink">对话学习</div>
                <div className="text-[11px] text-muted">与 AI 对话，构建画像</div>
              </div>
            </button>
            <button
              onClick={() => navigate('/resources')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-cream transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">📖</span>
              <div>
                <div className="text-[13px] font-medium text-ink">生成资源</div>
                <div className="text-[11px] text-muted">多智能体协作生成</div>
              </div>
            </button>
            <button
              onClick={() => navigate('/quiz')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-cream transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-lg">✏️</span>
              <div>
                <div className="text-[13px] font-medium text-ink">在线练习</div>
                <div className="text-[11px] text-muted">章节练习 + 自动批改</div>
              </div>
            </button>
            <button
              onClick={() => navigate('/wrong-answer-book')}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-cream transition-colors text-left"
            >
              <span className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-lg">📕</span>
              <div>
                <div className="text-[13px] font-medium text-ink">错题本</div>
                <div className="text-[11px] text-muted">复习巩固薄弱点</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 薄弱知识点 */}
      {profile?.weak_points && profile.weak_points.length > 0 && (
        <div className="mb-8">
          <div className="rounded-xl border border-red-200 bg-red-50/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">📌</span>
              <h2 className="text-sm font-medium text-ink">薄弱知识点</h2>
              <span className="text-[11px] text-muted">（练习错误率 &gt; 50% 的章节）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.weak_points.map((wp: string) => (
                <span key={wp} className="text-xs px-2.5 py-1 rounded-full bg-red-100 text-red-700 border border-red-200">
                  {wp}
                </span>
              ))}
            </div>
            <p className="text-[12px] text-muted mt-2">
              多做这些章节的练习，AI 将自动更新薄弱点状态
            </p>
          </div>
        </div>
      )}

      {/* H44 待复习提醒 */}
      {dueReviews.length > 0 && (
        <div className="mb-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50/30 p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm">🔔</span>
              <h2 className="text-sm font-medium text-ink">待复习提醒</h2>
              <span className="text-[11px] text-muted">（间隔重复，巩固记忆）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {dueReviews.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    markReviewed(item.id, 3);
                    setDueReviews(getDueReviews());
                    navigate('/quiz');
                  }}
                  className="text-xs px-3 py-1.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors"
                  title={`已复习 ${item.reviewCount} 次，间隔 ${item.interval} 天`}
                >
                  {item.topic}（{item.reviewCount > 0 ? `第${item.reviewCount + 1}次复习` : '首次复习'}）
                </button>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-2">
              点击开始复习，系统会根据掌握度自动调整下次复习时间
            </p>
          </div>
        </div>
      )}

      {/* 今日学习计划 */}
      {dailyPlan && dailyPlan.tasks.length > 0 && (
        <div className="mb-8">
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm">📋</span>
                <h2 className="text-sm font-medium text-ink">今日学习计划</h2>
                <span className="text-[11px] text-muted">
                  共 {dailyPlan.tasks.reduce((s: number, t: { minutes: number }) => s + t.minutes, 0)} 分钟
                </span>
              </div>
              {dueFlashcards > 0 && (
                <button
                  onClick={() => navigate('/flashcards')}
                  className="text-[12px] px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition-colors"
                >
                  🃏 待复习闪卡 {dueFlashcards} 张
                </button>
              )}
            </div>
            <div className="space-y-2">
              {dailyPlan.tasks.map((task: { type: string; label: string; minutes: number; done: boolean }, i: number) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/60 border border-indigo-100">
                  <span className="text-sm">
                    {task.type === 'review' ? '📖' : task.type === 'learn' ? '📗' : task.type === 'practice' ? '✏️' : task.type === 'assess' ? '📊' : '💭'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] text-ink truncate">{task.label}</div>
                  </div>
                  <span className="text-[11px] text-muted flex-shrink-0">{task.minutes}min</span>
                  {task.done && <span className="text-green-500 text-xs">✅</span>}
                </div>
              ))}
            </div>
            <button
              onClick={() => navigate('/learning-journey')}
              className="w-full mt-3 py-2 text-[12px] text-indigo-600 hover:text-indigo-800 transition-colors border border-indigo-200 rounded-lg hover:bg-white/50"
            >
              开始今日学习 →
            </button>
          </div>
        </div>
      )}

      {/* Recent activity & Path preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent activity */}
        <div className="lg:col-span-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-medium text-ink mb-4">最近动态</h2>
          {recentItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🚀</div>
              <p className="text-sm text-muted">还没有学习记录</p>
              <p className="text-[13px] text-muted mt-1">开始对话或生成资源，你的活动将显示在这里</p>
            </div>
          ) : (
            <div className="space-y-0">
              {recentItems.map((item, i) => (
                <div
                  key={i}
                  onClick={() => navigate(item.link)}
                  className="flex items-center gap-4 py-3 border-b border-border/50 last:border-0 cursor-pointer hover:bg-cream/50 -mx-5 px-5 rounded-lg transition-colors"
                >
                  <span className="text-lg flex-shrink-0">
                    {item.type === 'resource' ? '📄' : item.type === 'chat' ? '💬' : item.type === 'assessment' ? '📊' : '🎯'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] text-ink truncate">{item.title}</p>
                    <p className="text-[11px] text-muted">{item.time}</p>
                  </div>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D4D0CB" strokeWidth="1.5">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Learning path preview */}
        <div className="rounded-xl border border-border bg-surface p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-medium text-ink">学习路径</h2>
            <button
              onClick={() => navigate('/learning-path')}
              className="text-[12px] text-muted hover:text-ink transition-colors"
            >
              查看全部 →
            </button>
          </div>
          {pathNodeCount > 0 ? (
            <div>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E8E4DF" strokeWidth="3" />
                    <circle
                      cx="18" cy="18" r="15.5" fill="none"
                      stroke="#2D4A3E" strokeWidth="3"
                      strokeDasharray={`${pathProgress * 100} ${100 - pathProgress * 100}`}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-lg font-semibold text-ink">{Math.round(pathProgress * 100)}%</span>
                  </div>
                </div>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-ink font-medium">学习进度</p>
                <p className="text-[12px] text-muted mt-1">{Math.round(pathNodeCount * pathProgress)}/{pathNodeCount} 章</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-3xl mb-3">🗺️</div>
              <p className="text-sm text-muted">尚未生成路径</p>
              <button
                onClick={() => navigate('/learning-path')}
                className="mt-3 px-4 py-2 bg-ink text-warm-white text-[13px] rounded-md hover:bg-ink-light transition-colors"
              >
                立即生成
              </button>
            </div>
          )}
        </div>
      </div>
      {/* H43 成就徽章 */}
      <div className="mt-8">
        <h2 className="text-sm font-medium text-ink mb-4">成就徽章</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const unlocked = getUnlockedAchievements().includes(a.id);
            return (
              <div key={a.id} className={`p-3 rounded-lg border text-center transition-all ${unlocked ? 'border-amber-200 bg-amber-50/50' : 'border-border bg-cream/30 opacity-50'}`}>
                <div className="text-2xl mb-1">{unlocked ? a.icon : '🔒'}</div>
                <div className="text-[12px] font-medium text-ink">{a.name}</div>
                <div className="text-[10px] text-muted mt-0.5">{a.description}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  )
}

function formatRelativeTime(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHour = Math.floor(diffMs / 3600000)
  const diffDay = Math.floor(diffMs / 86400000)

  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  if (diffHour < 24) return `${diffHour} 小时前`
  if (diffDay < 7) return `${diffDay} 天前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

const KNOWLEDGE_COLORS = ['#2D4A3E', '#C77D43', '#0F766E', '#8B5CF6', '#D97706', '#3B82F6'];

function KnowledgeTrendChart({ snapshots }: { snapshots: ProfileSnapshot[] }) {
  const W = 400, H = 120;
  const padL = 8, padR = 8, padT = 8, padB = 20;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  // 收集所有出现过的知识点
  const allKeys = [...new Set(snapshots.flatMap(s => Object.keys(s.knowledge_base)))].slice(0, 6);
  if (allKeys.length === 0) return null;

  const xScale = (i: number) => padL + (snapshots.length === 1 ? chartW / 2 : (i / (snapshots.length - 1)) * chartW);
  const yScale = (v: number) => padT + chartH - v * chartH;

  const fmtDay = (s: string) => { try { const d = new Date(s + 'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()}`; } catch { return s.slice(5); } };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
      {/* 参考线 */}
      {[0.25, 0.5, 0.75].map(v => (
        <line key={v} x1={padL} y1={yScale(v)} x2={W - padR} y2={yScale(v)} stroke="#E8E4DF" strokeWidth="0.5" />
      ))}

      {/* 各知识点折线 */}
      {allKeys.map((key, ki) => {
        const points = snapshots.map((s, i) => `${xScale(i)},${yScale(s.knowledge_base[key] || 0)}`).join(' ');
        return (
          <g key={key}>
            <polyline points={points} fill="none" stroke={KNOWLEDGE_COLORS[ki % KNOWLEDGE_COLORS.length]} strokeWidth="1.5" strokeLinejoin="round" />
            {/* 末尾数值标签 */}
            {(() => {
              const lastVal = snapshots[snapshots.length - 1].knowledge_base[key] || 0;
              const lx = xScale(snapshots.length - 1);
              const ly = yScale(lastVal);
              return ki === 0 ? (
                <text x={lx + 4} y={ly} fontSize="9" fill={KNOWLEDGE_COLORS[0]} dominantBaseline="middle">{Math.round(lastVal * 100)}%</text>
              ) : null;
            })()}
          </g>
        );
      })}

      {/* X 轴日期 */}
      {snapshots.map((s, i) => (i === 0 || i === snapshots.length - 1 || snapshots.length <= 7 || i % Math.ceil(snapshots.length / 5) === 0) && (
        <text key={i} x={xScale(i)} y={H - 4} textAnchor="middle" fontSize="9" fill="#8B8580">{fmtDay(s.date)}</text>
      ))}

      {/* 图例（单行） */}
      {allKeys.map((key, ki) => (
        <g key={key} transform={`translate(${padL + ki * 65}, ${H - 2})`}>
          <circle cx="0" cy="-8" r="3" fill={KNOWLEDGE_COLORS[ki % KNOWLEDGE_COLORS.length]} />
          <text x="6" y="-5" fontSize="8" fill="#8B8580">{key.length > 6 ? key.slice(0, 6) + '…' : key}</text>
        </g>
      ))}
    </svg>
  );
}
